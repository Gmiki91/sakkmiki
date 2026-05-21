import { Component, input } from '@angular/core';

@Component({
  selector: 'app-captured-rack',
  imports: [],
  templateUrl: './captured-rack.html',
  styleUrl: './captured-rack.scss',
})
export class CapturedRack {
  pieces = input<string[]>();
  color = input<'b'|'w'>('w');
  score = input<number>(0);
}
