import { Component, input,computed, signal } from '@angular/core';
import { PieceOverlayData, OverlayExpression } from '../../models/piece-overlay.model';
import { squareToCoord } from '../../utils/board-geometry';

@Component({
  selector: 'app-piece-overlay',
  templateUrl: './piece-overlay.html',
  styleUrl: './piece-overlay.scss',
})
export class PieceOverlay {
  orientation = input<'white' | 'black'>('white');
  overlay = signal<PieceOverlayData>(null);
  position = computed(() => {
    const data = this.overlay();
    if (!data) return null;
    return squareToCoord(data.square, this.orientation());
  });

  show(expression: OverlayExpression, square: string) {
    this.overlay.set({ expression, square });
  }

  hide() {
    this.overlay.set(null);
  }
}