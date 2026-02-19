import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { Chessground } from '@lichess-org/chessground';
import { Api } from '@lichess-org/chessground/api';

@Component({
  selector: 'app-chess-board',
  imports: [],
  templateUrl: './chess-board.html',
  styleUrl: './chess-board.scss',
})
export class ChessBoard implements AfterViewInit {
  @ViewChild('board') boardElement!: ElementRef;
  api?: Api;

  ngAfterViewInit() {
    this.api = Chessground(this.boardElement.nativeElement);
  }
}
