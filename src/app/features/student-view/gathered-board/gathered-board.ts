import { Component, inject, signal, effect,computed, viewChild } from '@angular/core';
import { Config } from '@lichess-org/chessground/config';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { DrawingService } from '../../../core/services/drawing.service';
import { SoundService } from '../../../core/services/sound.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { DrawingCanvas } from '../../../shared/components/drawing-canvas/drawing-canvas';
import { DrawingToolbar } from '../../../shared/components/drawing-toolbar/drawing-toolbar';
import { TeachingOverlay } from '../../../shared/components/teaching-overlay/teaching-overlay';
import { TEACHING_CONCEPTS } from '../../../shared/models/teaching-concept.model';
import { StampIcon, DrawingTool, Point } from '../../../shared/models/drawing.model';
import { DEFAULT_BRUSH_COLOR } from '../../../shared/utils/brushes';
import { WhiteBoard } from '../../../shared/components/white-board/white-board';

@Component({
  selector: 'app-gathered-board',
  imports: [ChessBoard, DrawingCanvas, DrawingToolbar, TeachingOverlay, WhiteBoard],
  templateUrl: './gathered-board.html',
  styleUrl: './gathered-board.scss',
})
export class GatheredBoard {
  private chessBoard = viewChild<ChessBoard>('chessBoard');

  classroomStore = inject(ClassroomStore);
  drawingService = inject(DrawingService);
  private soundService = inject(SoundService);

  selectedColor = signal(DEFAULT_BRUSH_COLOR);
  activeTool = signal<DrawingTool>('pen');
  activeStampIcon = signal<StampIcon>('star');
  
  private teachingConceptSize = 0;

boardConfig = computed<Config>(() => ({
  fen: this.classroomStore.teacherFen(),
  orientation: 'white',
  movable: { free: false, color: undefined },
  draggable: { enabled: false },
  highlight: { lastMove: true },
  drawable: { enabled: true, visible: true },
}));

  constructor() {
    effect(() => {
      const arrows = this.classroomStore.sharedArrows()?.arrows ?? [];
      this.chessBoard()?.api?.set({ drawable: { shapes: arrows } });
    });

    effect(() => {
      const el = this.chessBoard()?.boardElement?.nativeElement as HTMLElement;
      if (!el) return;
      el.addEventListener('pointerdown', (e: MouseEvent) => {
        if (e.button === 0) e.preventDefault();
      }, { capture: true });
    });

    effect(() => {
      const concepts = this.classroomStore.incomingTeachingOverlay();
      if (!concepts?.length) { this.teachingConceptSize = 0; return; }
      if (concepts.length > this.teachingConceptSize) {
        const concept = TEACHING_CONCEPTS.find(c => c.id === concepts.at(-1)!.id);
        if (concept?.sound) this.soundService.play(concept.sound);
      }
      this.teachingConceptSize = concepts.length;
    });
  }

  onMouseUp(e: MouseEvent): void {
    if (e.button !== 2) return;
    setTimeout(() => {
      const shapes = this.chessBoard()?.api?.state.drawable.shapes ?? [];
      this.classroomStore.sendSharedArrows(shapes);
    }, 0);
  }

  onBoardClick(event: MouseEvent): void {
    if (this.activeTool() !== 'stamp') return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.drawingService.addLocalAnnotation(
      this.activeStampIcon(), event.clientX - rect.left, event.clientY - rect.top, this.selectedColor(),
    );
  }

  onPointAdded(e: { strokeId: string; point: Point }): void {
    this.drawingService.addLocalPoint(e.strokeId, e.point, this.selectedColor());
  }

  onStrokeCommitted(strokeId: string): void { this.drawingService.commitLocalStroke(strokeId); }

  onColorSelected(color: string): void {
    this.selectedColor.set(color);
    this.drawingService.broadcastColor(color);
  }
}
