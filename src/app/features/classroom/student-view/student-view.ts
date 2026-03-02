import {
  Component,
  ViewChild,
  signal,
  inject,
  computed,
  linkedSignal,
  WritableSignal,
  effect,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { boardConfig, getValidMoves } from '../../../shared/utils/chess.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Config } from '@lichess-org/chessground/config';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ClassroomService } from '../classroom.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { Exercise } from '../../../shared/models/exercise.model';

@Component({
  selector: 'app-student-view',
  templateUrl: './student-view.html',
  styleUrls: ['./student-view.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    ChessBoard,
  ],
})
export class StudentView implements AfterViewInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;

  classroomService = inject(ClassroomService);
  realtimeService = inject(RealtimeService);

  // --- Exercise state ---
  exIndex = linkedSignal({
    source: () => this.classroomService.loadedList(),
    computation: () => 0,
  });

  currentExercise = computed(() => this.classroomService.loadedList()[this.exIndex()] ?? null);

  moveHistory = signal<string[]>([]);

  status: WritableSignal<string> = linkedSignal({
    source: () => this.currentExercise(),
    computation: (exercise) => {
      if (!exercise) return '';
      const chess = new Chess(exercise.fen);
      return chess.turn() === 'w' ? 'White to move' : 'Black to move';
    },
  });

  feedback = signal('');

  playerColor = computed(() => {
    const exercise = this.currentExercise();
    if (!exercise) return 'white';
    const chess = new Chess(exercise.fen);
    return chess.turn() === 'w' ? 'white' : 'black';
  });

  private chess = new Chess();

  // --- Gather/disperse: snapshot of exercise state ---
  private frozenExIndex: number | null = null;
  private frozenFen: string | null = null;
  private frozenMoveHistory: string[] | null = null;

  // --- Board config ---
  boardConfig = computed<Config | null>(() => {
    const mode = this.realtimeService.mode();

    if (mode === 'gathered') {
      const fen = this.realtimeService.teacherFen();
      if (!fen) return null;
      return {
        fen,
        orientation: 'white',
        coordinates: false,
        movable: { free: false, color: undefined }, // read-only
        draggable: { enabled: false },
        highlight: { lastMove: true, check: false },
        drawable: {
          enabled: false,
          visible: true,
          shapes: this.realtimeService.teacherShapes(),
        },
      };
    }

    // Normal mode — own exercise
    const exercise = this.currentExercise();
    if (!exercise)
      return {
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        orientation: 'white',
        coordinates: false,
        movable: { free: true, color: 'white' },
        draggable: { enabled: true },
      };

    return {
      fen: exercise.fen,
      orientation: 'white',
      coordinates: false,
      turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
      movable: {
        free: false,
        color: this.chess.turn() === 'w' ? 'white' : 'black',
        dests: getValidMoves(this.chess),
        events: {
          after: (orig, dest) => this.handleMove(orig, dest),
        },
      },
      draggable: { enabled: true, showGhost: true },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true },
    };
  });

  constructor() {
    // Reset chess state when exercise changes
    effect(() => {
      const exercise = this.currentExercise();
      if (exercise) {
        this.chess = new Chess(exercise.fen);
        this.moveHistory.set([]);
        this.feedback.set('');
      }
    });

    // Push presence on any state change
    effect(() => {
      const exercise = this.currentExercise();
      const fen = exercise ? this.chess.fen() : '';
      this.realtimeService.updatePresence({
        fen,
        status: this.status(),
        feedback: this.feedback(),
        exIndex: this.exIndex(),
      });
    });

    // React to mode changes
    effect(() => {
      const mode = this.realtimeService.mode();
      if (mode === 'gathered') {
        this.onGather();
      } else {
        this.onDisperse();
      }
    });

    // React to teacher fen and shapes together (both only relevant when gathered)
    effect(() => {
      const fen = this.realtimeService.teacherFen();
      const shapes = this.realtimeService.teacherShapes();
      if (this.realtimeService.mode() === 'gathered' && fen) {
        this.chessBoard?.api?.set({ fen, drawable: { shapes } });
      } else {
        this.chessBoard?.api?.set({ drawable: { shapes } });
      }
    });

    // Incoming exercise list from teacher
    effect(() => {
      const exercises = this.realtimeService.loadedExercises();
      if (exercises.length > 0) {
        this.classroomService.loadedList.set(exercises as Exercise[]);
      }
    });
  }

  ngAfterViewInit(): void {
    const el = this.chessBoard.boardElement.nativeElement as HTMLElement;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      setTimeout(() => {
        const shapes = this.chessBoard.api?.state.drawable.shapes ?? [];
        this.realtimeService.sendStudentShapes(shapes);
      }, 0);
    });
  }
  // --- Move handling ---
  handleMove(orig: Key, dest: Key) {
    try {
      const move = this.chess.move({ from: orig, to: dest });
      if (move) {
        this.analyze(move);
        this.updateStatus();
        this.realtimeService.updatePresence({
          fen: this.chess.fen(),
          status: this.status(),
          feedback: this.feedback(),
          exIndex: this.exIndex(),
        });
      }
    } catch (e) {
      console.error('Invalid move:', e);
      this.chessBoard.api?.set({ fen: this.chess.fen() });
    }
  }

  analyze(move: Move) {
    const ex = this.currentExercise();
    if (!ex) return;

    const newHistory = [...this.moveHistory(), move.san];
    const mistakes = ex.commonMistakes ?? [];
    const solution = ex.solutions.find((line) => newHistory.every((m, i) => line[i] === m));

    if (solution) {
      this.moveHistory.set(newHistory);
      const isSolved = ex.solutions.some((line) => line.length === newHistory.length);
      if (isSolved) {
        this.feedback.set('Solved! ✓');
        setTimeout(() => this.nextExercise(), 2000);
      } else {
        const nextIndex = newHistory.length;
        const computerMove = this.chess.move(solution[nextIndex]);
        const updatedHistory = [...newHistory, solution[nextIndex]];
        this.updateBoard([computerMove.from as Key, computerMove.to as Key]);
        this.moveHistory.set([...newHistory, solution[nextIndex]]);
        const isSolvedAfterComputer = ex.solutions.some(
          (line) => line.length === updatedHistory.length,
        );
        if (isSolvedAfterComputer) {
          this.feedback.set('Solved! ✓');
          setTimeout(() => this.nextExercise(), 2000);
        } else {
          this.feedback.set('Good move!');
        }
      }
    } else {
      this.chess.undo();
      this.updateBoard();
      const mistake = mistakes.find((m) => m.move === move.lan);
      if (mistake) {
        this.feedback.set(mistake.hint);
      } else {
        this.feedback.set(ex.defaultHint ?? 'Wrong move, try again');
      }
    }
  }

  updateStatus() {
    if (this.chess.isCheckmate()) {
      this.status.set('Checkmate! ' + (this.chess.turn() === 'w' ? 'Black' : 'White') + ' wins!');
    } else if (this.chess.isDraw()) {
      this.status.set('Draw!');
    } else if (this.chess.isCheck()) {
      this.status.set('Check! ' + (this.chess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    } else {
      this.status.set((this.chess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    }
  }

  nextExercise() {
    const size = this.classroomService.loadedList().length - 1;
    if (this.exIndex() < size) {
      this.exIndex.update((n) => n + 1);
      this.moveHistory.set([]);
      this.feedback.set('');
    } else {
      this.status.set('All done! 🎉');
    }
  }

  // --- Gather / Disperse ---
  private onGather() {
    // Freeze current exercise state
    this.frozenExIndex = this.exIndex();
    this.frozenFen = this.chess.fen();
    this.frozenMoveHistory = this.moveHistory();
  }

  private onDisperse() {
    // Restore frozen state if we were gathered
    if (this.frozenFen === null) return;
    this.chess.load(this.frozenFen);
    this.moveHistory.set(this.frozenMoveHistory ?? []);
    this.frozenFen = null;
    this.frozenMoveHistory = null;
  }

  private updateBoard(lastMove?: [Key, Key]) {
    const config = boardConfig(this.chess);
    this.chessBoard.api?.set({
      ...config,
      movable: { ...config.movable, color: this.playerColor() },
      lastMove,
    });
  }
}