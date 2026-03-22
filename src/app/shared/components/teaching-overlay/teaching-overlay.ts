import { Component, input, computed } from '@angular/core';
import { squareToCoord } from '../../utils/board-geometry';

@Component({
  selector: 'app-teaching-overlay',
  templateUrl: './teaching-overlay.html',
  styleUrl: './teaching-overlay.scss',
})
export class TeachingOverlay {
  conceptId = input.required<string>();
  squares = input<string[]>([]);
  orientation = input<'white' | 'black'>('white');

  squareCoord = computed(() => {
    const sq = this.squares()[0];
    if (!sq) return null;
    return squareToCoord(sq, this.orientation());
  });
}