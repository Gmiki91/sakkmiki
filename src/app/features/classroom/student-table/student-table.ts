import {
  Component,
  ViewChild,
  signal,
  inject,
  computed,
  linkedSignal,
  WritableSignal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Color, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { boardConfig, getValidMoves } from '../../../shared/utils/chess.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Config } from '@lichess-org/chessground/config';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ClassroomService } from '../classroom.service';
@Component({
  selector: 'app-student-table',
  templateUrl: './student-table.html',
  styleUrls: ['./student-table.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    ChessBoard,
  ],
})
export class StudentTable {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  classroomService = inject(ClassroomService);
  // exerciseList = this.classroomService.loadedList();
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
  // fen = signal<string>('');
  playerColor = computed(() => {
    const exercise = this.currentExercise();
    if (!exercise) return 'white';
    const chess = new Chess(exercise.fen);
    return chess.turn() === 'w' ? 'white' : 'black';
  });

  timer = signal(0);
  intervalHandler = 0;
  private chess = new Chess();

  boardConfig = computed<Config | null>(() => {
    const exercise = this.currentExercise();
    let fen;
    if (!exercise) {
      fen = this.chess.fen();
    } else {
      fen = exercise.fen;
      this.chess = new Chess(exercise.fen);
    }
    return {
      fen,
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
      draggable: {
        enabled: true,
        showGhost: true,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
    };
  });

  constructor() {
    effect(() => {
      this.currentExercise();
      this.startTimer();
    });
  }   

  nextExercise() {
    const size = this.classroomService.loadedList().length - 1;
    const func = size > this.exIndex() ? (n: number) => n + 1 : () => 0;
    this.exIndex.update(func);
  }
  previousExercise() {
    const size = this.classroomService.loadedList().length - 1;
    const func = 0 < this.exIndex() ? (n: number) => n - 1 : () => size;
    this.exIndex.update(func);
  }
  // Get valid moves for all pieces
  handleMove(orig: Key, dest: Key) {
    try {
      // Try to make the move in chess.js
      const move = this.chess.move({ from: orig, to: dest });
      if (move) {
        this.analyze(move);
        this.updateStatus();
      }
    } catch (e) {
      // Invalid move - revert
      console.error('Invalid move:', e);
      this.chessBoard.api?.set({
        fen: this.chess.fen(),
      });
    }
  }
  analyze(move: Move) {
    const ex = this.currentExercise();
    const newHistory = [...this.moveHistory(), move.san]; // or move.san
    const solutions = ex.solutions;
    const mistakes = ex.commonMistakes ?? [];

    // check if current history matches the start of any solution line
    // const isCorrect = solutions.some((line) => newHistory.every((m, i) => line[i] === m));
    const solution = solutions.find((line) => newHistory.every((m, i) => line[i] === m));

    if (solution) {
      this.moveHistory.set(newHistory);
      // check if any solution is fully completed
      const isSolved = solutions.some((line) => line.length === newHistory.length);
      if (isSolved) {
        this.feedback.set('Solved! ✓');
      } else {
        this.feedback.set('Good move!');
        //computer play
        const nextIndex = newHistory.length;
        const computerMove = this.chess.move(solution[nextIndex]);
        this.updateBoard([computerMove.from as Key, computerMove.to as Key]);
        this.moveHistory.set([...newHistory, solution[nextIndex]]);
      }
    } else {
      // undo the move
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
      this.checkKing(this.chess.turn());
      this.status.update(
        () => 'Checkmate! ' + (this.chess.turn() === 'w' ? 'Black' : 'White') + ' wins!',
      );
    } else if (this.chess.isDraw()) {
      this.status.update(() => 'Draw!');
    } else if (this.chess.isCheck()) {
      this.checkKing(this.chess.turn());
      this.status.update(
        () => 'Check! ' + (this.chess.turn() === 'w' ? 'White' : 'Black') + ' to move',
      );
    } else {
      this.status.update(() => (this.chess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    }
  }

  checkKing(color: Color) {
    this.chessBoard.api?.set({ check: color === 'w' ? 'white' : 'black' });
  }

  undo() {
    this.chess.undo();
    this.chessBoard.api?.set({
      fen: this.chess.fen(),
      turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
      highlight: {
        lastMove: false,
        check: this.chess.isCheck() || this.chess.isCheckmate(),
      },
      movable: {
        color: this.chess.turn() === 'w' ? 'white' : 'black',
        dests: getValidMoves(this.chess),
      },
    });
    this.updateStatus();
  }

  startTimer() {
     clearInterval(this.intervalHandler);
  this.timer.set(0);
    this.intervalHandler = setInterval(() => {
      this.timer.update((s) => s + 1);
    }, 1000);
  }

  loadFen() {
    // this.chessBoard.api.set({ fen:this.exerciseList()[this.exIndex()]?.fen });
    // console.log(this.exerciseList()[this.exIndex()]?.fen)
    // const fen = this.exerciseList()[this.exIndex()]?.fen //this.fen||'';
    // console.log(fen)
    // try {
    //   this.chess.load(fen);
    //   this.chessBoard.api.set({ fen:fen });
    //   this.updateStatus();
    //   this.updateBoard();
    // } catch (error) {
    //   alert('Invalid FEN!');
    // }
  }

  // flipBoard() {
  //   this.api?.toggleOrientation();
  // }

  // clearBoard() {
  //   this.api?.set({
  //     fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  //   });
  // }

  /**
   *
   * @param lastMove for moves that should be highlighted
   */
  private updateBoard(lastMove?: [Key, Key]) {
    console.log(lastMove);
    const config = boardConfig(this.chess);
    this.chessBoard.api?.set({
      ...config,
      movable: { ...config.movable, color: this.playerColor() },
      lastMove,
    });
  }
}
