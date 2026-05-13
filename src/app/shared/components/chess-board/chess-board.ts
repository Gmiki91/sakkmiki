import { AfterViewInit, Component, ElementRef, ViewChild, input, effect,output } from '@angular/core';
import { Chessground } from '@lichess-org/chessground';
import { Api } from '@lichess-org/chessground/api';
import { Config } from '@lichess-org/chessground/config';
import { DEFAULT_BRUSHES } from '../../utils/brushes';
@Component({
  selector: 'app-chess-board',
  imports: [],
  templateUrl: './chess-board.html',
  styleUrl: './chess-board.scss'
})
export class ChessBoard implements AfterViewInit {
  @ViewChild('board') boardElement!: ElementRef;
  handleDrop = output<DragEvent>()
  mushroomMode = input<boolean|undefined>(false);
  config = input<Config>();
  api!: Api;

  constructor() {
    effect(() => {
      const config = this.config();
      if (this.api && config) {
        const existingShapes = this.api.state.drawable.shapes;
        this.api.set({
          ...config,
          drawable: {
            ...config.drawable,
            shapes: config.drawable?.shapes ?? existingShapes,
          },
        });
      }
    });
  }

ngAfterViewInit(): void {
  this.api = Chessground(this.boardElement.nativeElement, {
    ...this.config(),
    animation: {
      enabled: true,
      duration: 250,
    },
    drawable: {
      ...this.config()?.drawable,
      brushes: DEFAULT_BRUSHES,
    },
  });
}
}