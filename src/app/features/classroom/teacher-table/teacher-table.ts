import { Component, ViewChild, AfterViewInit, inject, signal, output } from '@angular/core';
import { Config } from '@lichess-org/chessground/config';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { RealtimeService } from '../../../core/services/realtime.service';
import { EMPTY_BOARD_FEN, STARTING_FEN } from '../../../shared/utils/chess.utils';

@Component({
  selector: 'app-teacher-table',
  imports: [ChessBoard, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './teacher-table.html',
  styleUrl: './teacher-table.scss',
})
export class TeacherTable implements AfterViewInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  onGather = output<void>();
  onDisperse = output<void>();
  realtimeService = inject(RealtimeService);

  boardConfig = signal<Config>({
    orientation: 'white',
    coordinates: false,
    movable: {
      free: true,
      events: {
        after: () => this.handleMove(),
      },
    },
    draggable: {
      enabled: true,
      deleteOnDropOff: true,
    },
    drawable: {
      enabled: true,
    },
    highlight: {
      lastMove: true,
    },
  });

  ngAfterViewInit(): void {
    const el = this.chessBoard.boardElement.nativeElement as HTMLElement;
    el.addEventListener('mouseup', (e: MouseEvent) => {
     if (e.button !== 0 && e.button !== 2) return; // only left or right mouse button (dunno what middle mouse do)
      if (this.realtimeService.mode() === 'gathered') {
        setTimeout(() => {
          const shapes = this.chessBoard.api?.state.drawable.shapes ?? [];
          this.realtimeService.sendShapes(shapes);
        },0);
      }
    });
  }

  handleMove() {
    this.realtimeService.sendTeacherFen(this.chessBoard.api.getFen());
  }

  gather(): void {
    this.realtimeService.sendTeacherFen(this.chessBoard.api.getFen());
    this.realtimeService.gather();
    this.realtimeService.mode.set('gathered');
    this.onGather.emit();
  }

  disperse(): void {
    this.realtimeService.disperse();
    this.realtimeService.mode.set('normal');
     this.onDisperse.emit();
  }

  resetBoard(): void {
    const fen = STARTING_FEN
    this.chessBoard.api?.set({ fen,lastMove:[] });
    this.realtimeService.sendTeacherFen(fen);
  }

  clearBoard(): void {
    const fen = EMPTY_BOARD_FEN;
    this.chessBoard.api?.set({ fen,lastMove:[] });
    this.realtimeService.sendTeacherFen(fen);
  }
}
