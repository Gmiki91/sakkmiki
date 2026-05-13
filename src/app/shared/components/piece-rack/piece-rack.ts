import { Component,input } from '@angular/core';
import { Role } from '@lichess-org/chessground/types';

@Component({
  selector: 'app-piece-rack',
  imports: [],
  templateUrl: './piece-rack.html',
  styleUrl: './piece-rack.scss',
})
export class PieceRack {
  color = input<'black'|'white'>('white');

  onDragStart(event: DragEvent, role: Role) {
    event.dataTransfer?.setData('role', role);
    event.dataTransfer?.setData('color', this.color());
    const el = event.target as HTMLElement;
    event.dataTransfer?.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
  }
}
