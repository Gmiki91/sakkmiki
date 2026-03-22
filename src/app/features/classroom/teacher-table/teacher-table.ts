import {
  Component,
  ViewChild,
  AfterViewInit,
  inject,
  input,
  signal,
  output,
  effect,
} from '@angular/core';
import { Config } from '@lichess-org/chessground/config';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { RealtimeService } from '../../../core/services/realtime.service';
import { EMPTY_BOARD_FEN, STARTING_FEN } from '../../../shared/utils/chess.utils';
import { Exercise } from '../../../shared/models/exercise.model';
import { DrawingService } from '../../../core/services/drawing.service';
import { DrawingCanvas } from '../../../shared/components/drawing-canvas/drawing-canvas';
import { TeachingOverlayService } from '../../../core/services/teaching-overlay.service';
import { TEACHING_CONCEPTS, TeachingConcept } from '../../../shared/models/teaching-concept.model';
import { clientToSquare } from '../../../shared/utils/board-geometry';
import { TeachingOverlay } from '../../../shared/components/teaching-overlay/teaching-overlay';

@Component({
  selector: 'app-teacher-table',
  imports: [ChessBoard,DrawingCanvas,TeachingOverlay, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './teacher-table.html',
  styleUrl: './teacher-table.scss',
})
export class TeacherTable implements AfterViewInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  onGather = output<void>();
  onDisperse = output<void>();
  realtimeService = inject(RealtimeService);
  drawingService = inject(DrawingService);
  overlayService = inject(TeachingOverlayService);
  selectedExercise = input<Exercise | null>(null);
  isGathered = input<boolean>(false);
  readonly concepts: TeachingConcept[] = TEACHING_CONCEPTS;
  
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

  constructor() {
    effect(() => {
      const ex = this.selectedExercise();
      if (ex && this.chessBoard?.api) {
        this.chessBoard.api.set({ fen: ex.fen, lastMove: [] });
        if (this.realtimeService.mode() === 'gathered') {
          this.realtimeService.sendTeacherFen(ex.fen);
          this.drawingService.clearAllOnFenChange();
        }
      }
    });

    // apply shared arrows
    effect(() => {
      const shapes = this.realtimeService.sharedArrows();
      if (this.realtimeService.mode() === 'gathered') {
        this.chessBoard?.api?.set({ drawable: { shapes } });
      }
    });
    // Redraw chessground when board size changes between normal and gathered
    effect(() => {
      const gathered = this.isGathered();
      setTimeout(() => this.chessBoard?.api?.redrawAll(), 0);
    });
  }

  ngAfterViewInit(): void {
    const el = this.chessBoard.boardElement.nativeElement as HTMLElement;
    el.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return; // only left or right mouse button (dunno what middle mouse do)
      if (this.realtimeService.mode() === 'gathered') {
        setTimeout(() => {
          const shapes = this.chessBoard.api?.state.drawable.shapes ?? [];
          this.realtimeService.sendSharedArrows(shapes);
        }, 0);
      }
    });
  }
  onInterceptorClick(event: MouseEvent): void {
    const boardEl = this.chessBoard.boardElement.nativeElement as HTMLElement;
    const square = clientToSquare(event.clientX, event.clientY, boardEl, 'white');
    this.overlayService.onSquareClicked(square);
  }

  handleMove() {
    this.realtimeService.sendTeacherFen(this.chessBoard.api.getFen());
    this.drawingService.clearAllOnFenChange();
  }

  gather(): void {
    this.realtimeService.sendTeacherFen(this.chessBoard.api.getFen());
    this.drawingService.clearAllOnFenChange();
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
    const fen = STARTING_FEN;
    this.chessBoard.api?.set({ fen, lastMove: [] });
    this.realtimeService.sendTeacherFen(fen);
    this.drawingService.clearAllOnFenChange();
  }

  clearBoard(): void {
    const fen = EMPTY_BOARD_FEN;
    this.chessBoard.api?.set({ fen, lastMove: [] });
    this.realtimeService.sendTeacherFen(fen);
    this.drawingService.clearAllOnFenChange();
  }
}
