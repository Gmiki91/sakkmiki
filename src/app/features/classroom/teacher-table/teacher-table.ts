import { Component, ViewChild, AfterViewInit, inject, signal } from '@angular/core';
import { Chess } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { RealtimeService } from '../../../core/services/realtime.service';
import { boardConfig } from '../../../shared/utils/chess.utils';

@Component({
  selector: 'app-teacher-table',
  imports: [ChessBoard, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './teacher-table.html',
  styleUrl: './teacher-table.scss',
})
export class TeacherTable implements AfterViewInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;

  realtimeService = inject(RealtimeService);
  private chess = new Chess();

  boardConfig = signal<Config>({
    orientation: 'white',
    coordinates: false,
    movable: {
      free: true,
      events: {
        after: (orig, dest) => this.handleMove(orig, dest),
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

  handleMove(orig: Key, dest: Key) {
    try {
      const move = this.chess.move({ from: orig, to: dest });
      if (move) {
        this.realtimeService.sendTeacherMove(move);
        this.chessBoard.api?.set(boardConfig(this.chess));
      }
    } catch (e) {
      this.chessBoard.api?.set({ fen: this.chess.fen() });
    }
  }

  gather(): void {
    this.realtimeService.sendTeacherFen(this.chess.fen());
    this.realtimeService.gather();
    this.realtimeService.mode.set('gathered');
  }

  disperse(): void {
    this.realtimeService.disperse();
    this.realtimeService.mode.set('normal');
  }

  resetBoard(): void {
    this.chess = new Chess();
    const fen = this.chess.fen();
    this.chessBoard.api?.set({ fen });
    this.realtimeService.sendTeacherFen(fen);
  }

  clearBoard(): void {
    const fen = '8/8/8/8/8/8/8/8 w - - 0 1';
    this.chess.load(fen);
    this.chessBoard.api?.set({ fen });
    this.realtimeService.sendTeacherFen(fen);
  }
}
