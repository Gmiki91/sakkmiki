import { Component, inject, computed } from '@angular/core';
import { Config } from '@lichess-org/chessground/config';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { DrawingService } from '../../../core/services/drawing.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { DrawingCanvas } from '../../../shared/components/drawing-canvas/drawing-canvas';
import { TeachingOverlay } from '../../../shared/components/teaching-overlay/teaching-overlay';
import { WhiteBoard } from '../../../shared/components/white-board/white-board';

@Component({
  selector: 'app-spectator-view',
  imports: [ChessBoard, DrawingCanvas, TeachingOverlay, WhiteBoard],
  templateUrl: './spectator-view.html',
  styleUrl: './spectator-view.scss',
})
export class SpectatorView {
  store = inject(ClassroomStore);
  drawingService = inject(DrawingService);

  isGathered = computed(() => this.store.mode() === 'gathered');

  boardConfig = computed<Config>(() => ({
    fen: this.store.teacherFen(),
    orientation: 'white',
    coordinates: false,
    movable: { free: false, color: undefined },
    draggable: { enabled: false },
    drawable: { enabled: false },
    highlight: { lastMove: true },
  }));
}
