import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-promotion',
  imports: [],
  templateUrl: './promotion.html',
  styleUrl: './promotion.scss',
})
export class Promotion {
  color = input<'white' | 'black'>('white');
  promote = output<'q' | 'r' | 'n' | 'b'>();
}
