import { Component, ViewChild, signal, inject,  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Color } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { boardConfig, getValidMoves } from '../../../shared/utils/chess.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { Config } from '@lichess-org/chessground/config';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { ExerciseService } from '../../exercises/services/exercise.service';
import {MatTooltipModule} from '@angular/material/tooltip';
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
  exerciseService = inject(ExerciseService);
  exerciseList = this.exerciseService.exerciseLists()[0];
  exIndex = signal<number>(0);
  status = signal<string>('White to move');
  fen = signal<string>('');
  private chess = new Chess();
  boardConfig= signal<Partial<Config>>({
      fen: this.exerciseList.exercises[this.exIndex()]?.fen || this.chess.fen(),
      orientation: 'white',
      coordinates: false,
      movable: {
        free: false,
        color: 'white',
        dests: getValidMoves(this.chess),
        events: {
          after: (orig, dest) => this.handleMove( orig, dest),
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
    });
  
  

  nextExercise(){
    this.exIndex.update(n=>n+1);
    this.loadFen();
  }
  previousExercise(){
this.exIndex.update(n=>n-1);
this.loadFen();
  }
  // Get valid moves for all pieces
  

  handleMove(orig: Key, dest: Key ) {
    try {
      // Try to make the move in chess.js
      const move = this.chess.move({from:orig, to:dest});
      if (move) {
        this.chessBoard.api?.set(boardConfig(this.chess));
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
        check: this.chess.isCheck()||this.chess.isCheckmate()
      },
      movable: {
        color: this.chess.turn() === 'w' ? 'white' : 'black',
        dests: getValidMoves(this.chess),
      },
    });
    this.updateStatus();
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
}
