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
import {
  boardConfig,
  getValidMoves,
  loadChess,
  STARTING_FEN,
} from '../../../shared/utils/chess.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Config } from '@lichess-org/chessground/config';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RealtimeService } from '../../../core/services/realtime.service';

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
  realtimeService = inject(RealtimeService);


  loadedList = this.realtimeService.loadedExercises;
  exIndex = linkedSignal({
    source: () => this.loadedList(),
    computation: () => 0, // reset to 0 when a new list is loaded.
  });

  // droppedExercise takes precedence
  currentExercise = computed(
    () => this.realtimeService.droppedExercise() ?? this.loadedList()[this.exIndex()] ?? null,
  );
  moveHistory: WritableSignal<string[]> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => [],
  });

  status: WritableSignal<string> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => (this.exerciseChess.turn() === 'w' ? 'White to move' : 'Black to move'),
  });

  feedback: WritableSignal<string> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => '',
  });

  playerColor = computed(() => (this.exerciseChess.turn() === 'w' ? 'white' : 'black'));

  private exerciseChess = new Chess();
  // --- Gather/disperse: snapshot of exercise state ---
  private isGathered = false;
  private frozenFen: string | null = null;
  private frozenMoveHistory: string[] | null = null;

  // --- Challenge props---
  myPair = computed(
    () =>
      this.realtimeService
        .challengePairs()
        .find(
          (p) =>
            p.white === this.realtimeService.studentName() ||
            p.black === this.realtimeService.studentName(),
        ) ?? null,
  );

  myColor = computed(() =>
    this.myPair()?.white === this.realtimeService.studentName() ? 'white' : 'black',
  );

  private challengeChess = new Chess();

  // --- Board config ---
  boardConfig = computed<Config | null>(() => {
    const mode = this.realtimeService.mode();
    const exercise = this.currentExercise();
    if (mode === 'gathered') {
      const fen = this.realtimeService.teacherFen();
      if (!fen) return null;
      return {
        fen,
        orientation: 'white',
        movable: { free: false, color: undefined }, // read-only
        draggable: { enabled: false },
        highlight: { lastMove: true, check: false },
        drawable: {
          enabled: true,
          visible: true,
          shapes: this.realtimeService.sharedArrows(),
        },
      };
    }

    // Challenge mode
    if (this.myPair()) {
      return {
        fen: this.challengeChess.fen(),
        orientation: this.myColor(),
        turnColor: this.challengeChess.turn() === 'w' ? 'white' : 'black',
        coordinates:true,
        movable: {
          free: false,
          color: this.myColor(),
          dests: getValidMoves(this.challengeChess),
          events: {
            after: (orig, dest) => this.handleChallengeMove(orig, dest),
          },
        },
        draggable: { enabled: true, showGhost: true },
        highlight: { lastMove: true, check: true },
        drawable: { enabled: true, visible: true ,  shapes: this.realtimeService.sharedArrows()},
      };
    }

    // Exercise mode
    if (exercise){
    return {
      fen: exercise.fen,
      orientation: 'white',
      coordinates: true,
      turnColor: this.exerciseChess.turn() === 'w' ? 'white' : 'black',
      movable: {
        free: false,
        color: this.exerciseChess.turn() === 'w' ? 'white' : 'black',
        dests: getValidMoves(this.exerciseChess),
        events: {
          after: (orig, dest) => this.handleMove(orig, dest),
        },
      },
      draggable: { enabled: true, showGhost: true },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true, shapes: this.realtimeService.sharedArrows() },
    };
  }
    return null;
  });

  constructor() {
    // Reset chess state when exercise changes
    effect(() => {
      const exercise = this.currentExercise();
      if (!exercise) return;
      if(exercise.exerciseType==='challenge'){
        loadChess(this.challengeChess,exercise.fen);
      }else{
        loadChess(this.exerciseChess,exercise.fen);
      }
      this.chessBoard?.api?.set({ lastMove: [] });
    });

    // Push presence on any state change
    effect(() => {
      const exercise = this.currentExercise();
      if(!exercise)return;
      const type = exercise.exerciseType;
      let fen;
      if(type==='challenge'){
        fen = exercise ? this.challengeChess.fen() : STARTING_FEN;

      }else{
        fen = exercise ? this.exerciseChess.fen() : STARTING_FEN;
      }
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

    // React to teacher fen change while gathered 
    effect(() => {
      const fen = this.realtimeService.teacherFen();
      if (this.realtimeService.mode() === 'gathered' && fen) {
        this.chessBoard?.api?.set({ fen});
      }
    });

    // --- Challenge effects ---
    // React to incoming challenge moves
    effect(() => {
      const move = this.realtimeService.challengeMove();
      if (!move) return;
      const pair = this.myPair();
      if (!pair) return;
      if (move.white === pair.white && move.black === pair.black) {
        loadChess(this.challengeChess,move.fen);
        this.chessBoard?.api?.set({
          fen: move.fen,
          lastMove: [move.from as Key, move.to as Key],
          turnColor: this.challengeChess.turn() === 'w' ? 'white' : 'black',
          check:this.challengeChess.isCheck(),
          movable: {
            free: false,
            color: this.myColor(),
            dests: getValidMoves(this.challengeChess),
          },
        });
      }
    });

    // reset board when pair is assigned
    effect(() => {
      const pair = this.myPair();
      if (pair) {
        this.challengeChess = new Chess(); // reset to starting position
        this.chessBoard?.api?.set({ lastMove: [] });
      }
    });
  }

  ngAfterViewInit(): void {
    const el = this.chessBoard.boardElement.nativeElement as HTMLElement;
    // left mouse click would remove all arrows, not allowed for students
    el.addEventListener(
      'pointerdown',
      (e: MouseEvent) => {
        if (e.button === 0 && this.realtimeService.mode() === 'gathered') {
          e.preventDefault();
        }
      },
      true,
    );

    // arrows
    el.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return; // middle mouse do what?
      setTimeout(() => {
        const shapes = this.chessBoard.api?.state.drawable.shapes ?? [];
        if (this.realtimeService.mode() === 'gathered') {
          if (e.button !== 0) this.realtimeService.sendSharedArrows(shapes);
        } else {
          this.realtimeService.sendMiniboardArrows(shapes);
        }
      }, 0);
    });
  }
  // --- Move handling ---
  handleChallengeMove(orig: Key, dest: Key) {
    const pair = this.myPair();
    if (!pair) return;
    try {
      const move = this.challengeChess.move({ from: orig, to: dest });
      if (move) {
        this.realtimeService.sendChallengeMove(
          pair.white,
          pair.black,
          this.challengeChess.fen(),
          orig,
          dest,
        );
        this.realtimeService.updatePresence({
          fen: this.challengeChess.fen(),
          status: this.challengeChess.turn() === 'w' ? 'White to move' : 'Black to move',
          feedback: '',
          exIndex: this.exIndex(),
        });
      }
    } catch (e) {
      console.error('Invalid move:', e);
      this.chessBoard.api?.set({ fen: this.challengeChess.fen() });
    }
  }

  handleMove(orig: Key, dest: Key) {
    try {
      const move = this.exerciseChess.move({ from: orig, to: dest });
      if (move) {
        this.analyze(move);
        if (this.currentExercise().exerciseType !== 'mushroom') {
          this.updateStatus();
        }
        this.realtimeService.updatePresence({
          fen: this.exerciseChess.fen(),
          status: this.status(),
          feedback: this.feedback(),
          exIndex: this.exIndex(),
        });
      }
    } catch (e) {
      console.error('Invalid move:', e);
      this.chessBoard.api?.set({ fen: this.exerciseChess.fen() });
    }
  }

  analyze(move: Move) {
    const ex = this.currentExercise();
    if (!ex) return;

    const newHistory = [...this.moveHistory(), move.san];
    const mistakes = ex.commonMistakes ?? [];
    const solution = ex.solutions?.find((line) => newHistory.every((m, i) => line[i] === m));
    if (solution) {
      this.moveHistory.set(newHistory);
      const isSolved = ex.solutions?.some((line) => line.length === newHistory.length);
      if (isSolved) {
        this.feedback.set('Solved! ✓');
        setTimeout(() =>{
          //leave droppedExercise set so currentExercise doesn't recompute and defaults to the loadedListExercise
          if (!this.realtimeService.droppedExercise())this.nextExercise();
        } , 1500);
      } else {
        //gombaszedés, same color always
        if (ex.exerciseType==='mushroom') {
          this.exerciseChess.setTurn('w');
          this.updateBoard();
          this.feedback.set('Good move!');
        } else {
          const nextIndex = newHistory.length;
          const computerMove = this.exerciseChess.move(solution[nextIndex]);
          const updatedHistory = [...newHistory, solution[nextIndex]];
          this.updateBoard([computerMove.from as Key, computerMove.to as Key]);
          this.moveHistory.set([...newHistory, solution[nextIndex]]);
          const isSolvedAfterComputer = ex.solutions?.some(
            (line) => line.length === updatedHistory.length,
          );
          if (isSolvedAfterComputer) {
            this.feedback.set('Solved! ✓');
            setTimeout(() => this.nextExercise(), 2000);
          } else {
            this.feedback.set('Good move!');
          }
        }
      }
    } else {
      this.exerciseChess.undo();
      if (ex.exerciseType==='mushroom') {
        this.exerciseChess.setTurn('w');
      }
      this.updateBoard();
      const mistake = mistakes.find((m) => m.move === move.san);
      if (mistake) {
        this.feedback.set(mistake.hint);
      } else {
        this.feedback.set(ex.defaultHint ?? 'Wrong move, try again');
      }
    }
  }

  updateStatus() {
    if (this.exerciseChess.isCheckmate()) {
      this.status.set('Checkmate! ' + (this.exerciseChess.turn() === 'w' ? 'Black' : 'White') + ' wins!');
    } else if (this.exerciseChess.isDraw()) {
      this.status.set('Draw!');
    } else if (this.exerciseChess.isCheck()) {
      this.status.set('Check! ' + (this.exerciseChess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    } else {
      this.status.set((this.exerciseChess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    }
  }

  nextExercise() {
    const size = this.loadedList().length - 1;
    if (this.exIndex() < size) {
      this.exIndex.update((n) => n + 1);
    } else {
      this.status.set('All done!');
    }
  }

  private onGather() {
    this.isGathered = true;
    this.frozenFen = this.exerciseChess.fen();
    this.frozenMoveHistory = [...this.moveHistory()];
    this.chessBoard?.api?.set({ lastMove: [], drawable: { shapes: [] } });
  }

  private onDisperse() {
    // Restore frozen state if we were gathered
    if (!this.isGathered) return;
    this.isGathered = false;
    loadChess(this.exerciseChess,this.frozenFen!)
    this.moveHistory.set(this.frozenMoveHistory ?? []);
    this.frozenFen = null;
    this.frozenMoveHistory = null;
    setTimeout(() => {
      this.chessBoard?.api?.set({
        fen: this.exerciseChess.fen(),
        lastMove: [],
        drawable: { enabled: true, shapes: [] },
        movable: {
          free: false,
          color: this.playerColor(),
          dests: getValidMoves(this.exerciseChess),
        },
        turnColor: this.exerciseChess.turn() === 'w' ? 'white' : 'black',
      });
    }, 0);
  }

  private updateBoard(lastMove?: [Key, Key]) {
    const config = boardConfig(this.exerciseChess);
    this.chessBoard.api?.set({
      ...config,
      movable: { ...config.movable, color: this.playerColor() },
      lastMove,
    });
  }
}
