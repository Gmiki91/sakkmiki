import { Component, ViewChild } from '@angular/core';
import { ChessBoard } from '../../chess-board/chess-board';
import { Color, Key, Role } from '@lichess-org/chessground/types';
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
    this.configureBoard();
    const board = this.chessBoard.boardElement.nativeElement;
    this.addDragListener(board);
    this.addDropListener(board);
  }

  handleMove(orig: Key, dest: Key) {}
  
  onDragStart(event: DragEvent, role: Role, color: Color) {
    event.dataTransfer?.setData('role', role);
    event.dataTransfer?.setData('color', color);
  }

  private onDrop(event: DragEvent) {
    const x = event.clientX;
    const y = event.clientY;
    const square = this.chessBoard.api?.getKeyAtDomPos([x, y]);
    const role = event.dataTransfer?.getData('role') as Role;
    const color = event.dataTransfer?.getData('color') as Color;
    if (role && color && square) {
      this.chessBoard.api?.setPieces(new Map([[square, { role, color }]]));
    }
  }

  private configureBoard() {
    const boardConfig: Config = {
      fen: this.chess.fen(),
      orientation: 'white',
      coordinates: true,
      movable: {
        free: true,
        events: {
          after: (orig, dest) => this.handleMove(orig, dest),
        },
      },
      draggable: {
        enabled: true,
        deleteOnDropOff: true,
      },
      highlight: {
        lastMove: false,
      },
    };
    this.chessBoard.api?.set(boardConfig);
  }

  private addDragListener(el: HTMLElement) {
    el.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
    });
  }

  private addDropListener(el: HTMLElement) {
    el.addEventListener('drop', (e: DragEvent) => {
      this.onDrop(e);
    });
  }
}
