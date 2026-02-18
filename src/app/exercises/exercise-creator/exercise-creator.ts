import { Component, ViewChild } from '@angular/core';
import { ChessBoard } from '../../chess-board/chess-board';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { Chess } from 'chess.js';

@Component({
  selector: 'app-exercise-creator',
  imports: [ChessBoard],
  templateUrl: './exercise-creator.html',
  styleUrl: './exercise-creator.scss',
})
export class ExerciseCreator {
@ViewChild('chessBoard') chessBoard!: ChessBoard;
  private chess = new Chess();
    ngAfterViewInit(): void {
      const boardConfig: Config = {
        fen: this.chess.fen(),
        orientation: 'white',
        coordinates: true,
        movable: {
          free: true,
          events: {
            after: (orig, dest) => this.handleMove(orig,dest),
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
      this.chessBoard.set(boardConfig);
    }
  handleMove(orig: Key,dest: Key){

}
}
