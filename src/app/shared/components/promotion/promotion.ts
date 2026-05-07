import { Component, input, output } from '@angular/core';
export type PromotionPiece = 'q' | 'r' | 'n' | 'b';
@Component({
  selector: 'app-promotion',
  imports: [],
  templateUrl: './promotion.html',
  styleUrl: './promotion.scss',
})
export class Promotion {
  color = input<'white' | 'black'>('white');
  promote = output<PromotionPiece>();
}