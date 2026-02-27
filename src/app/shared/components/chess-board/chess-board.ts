import { AfterViewInit, Component, ElementRef, ViewChild, input, effect } from '@angular/core';
import { Chessground } from '@lichess-org/chessground';
import { Api } from '@lichess-org/chessground/api';
import { Config } from '@lichess-org/chessground/config';

@Component({
  selector: 'app-chess-board',
  imports: [],
  templateUrl: './chess-board.html',
  styleUrl: './chess-board.scss',
})
export class ChessBoard implements AfterViewInit {
  @ViewChild('board') boardElement!: ElementRef;
  config = input<Config>();
  api!: Api;

  constructor() {
    effect(() => {
      const config = this.config();
      if (this.api && config) {
        this.api.set(config);
      }
    });
  }

  ngAfterViewInit(): void {
    this.api = Chessground(this.boardElement.nativeElement, {
      ...this.config(),
      animation: {
        enabled: true,
        duration: 400,
      },
    });
  }
}
