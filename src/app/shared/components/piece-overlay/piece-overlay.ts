import { Component, input, signal } from '@angular/core';
import { PieceOverlayData, OverlayExpression } from '../../models/piece-overlay.model';

@Component({
  selector: 'app-piece-overlay',
  templateUrl: './piece-overlay.html',
  styleUrl: './piece-overlay.scss',
})
export class PieceOverlay {
  boardSize = 640;
  orientation = input<'white' | 'black'>('white');

  overlay = signal<PieceOverlayData>(null);

  show(expression: OverlayExpression, square: string) {
    this.overlay.set({ expression, square });
  }

  hide() {
    this.overlay.set(null);
  }

  getPosition(square: string): { x: number; y: number } {
    const files = 'abcdefgh';
    const file = files.indexOf(square[0]);
    const rank = parseInt(square[1]) - 1;
    const squareSize = this.boardSize / 8;
    console.log(file,rank)
    const x = this.orientation() === 'white'
      ? file * squareSize
      : (7 - file) * squareSize;

    const y = this.orientation() === 'white'
      ? (7 - rank) * squareSize
      : rank * squareSize;

      console.log("x:"+x, "y:"+y )
    return { x,y};
  }

  get squareSize() {
    return this.boardSize / 8;
  }
}