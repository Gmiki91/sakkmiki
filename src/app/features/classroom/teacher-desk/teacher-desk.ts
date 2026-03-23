import {
  Component, ViewChild, AfterViewInit, inject,
  signal, effect, computed,
} from '@angular/core';
import { Config } from '@lichess-org/chessground/config';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { DrawingCanvas } from '../../../shared/components/drawing-canvas/drawing-canvas';
import { TeachingOverlay } from '../../../shared/components/teaching-overlay/teaching-overlay';
import { ExerciseList } from '../../../shared/components/exercise-list/exercise-list';
import { ExerciseListPicker, ExerciseListPickerData } from '../../../shared/components/exercise-list-picker/exercise-list-picker';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { DrawingService } from '../../../core/services/drawing.service';
import { TeachingOverlayService } from '../../../core/services/teaching-overlay.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { EMPTY_BOARD_FEN, STARTING_FEN } from '../../../shared/utils/chess.utils';
import { clientToSquare } from '../../../shared/utils/board-geometry';
import { TEACHING_CONCEPTS, TeachingConcept } from '../../../shared/models/teaching-concept.model';
import { Exercise } from '../../../shared/models/exercise.model';
import { ExerciseList as List } from '../../../shared/models/exercise-list.model';
import { DEFAULT_BRUSH_COLOR } from '../../../shared/utils/brushes';

@Component({
  selector: 'app-teacher-desk',
  imports: [
    ChessBoard, DrawingCanvas, TeachingOverlay, ExerciseList,
    MatButtonModule, MatIconModule, MatTooltipModule,
  ],
  templateUrl: './teacher-desk.html',
  styleUrl: './teacher-desk.scss',
})
export class TeacherDesk implements AfterViewInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;

  store = inject(ClassroomStore);
  drawingService = inject(DrawingService);
  overlayService = inject(TeachingOverlayService);
  exerciseService = inject(ExerciseService);
  dialog = inject(MatDialog);

  readonly concepts: TeachingConcept[] = TEACHING_CONCEPTS;
  readonly defaultBrush = DEFAULT_BRUSH_COLOR;

  demoExercise = signal<Exercise | null>(null);
  loadedLists = signal<List[]>([]);

  isGathered = computed(() => this.store.mode() === 'gathered');

  boardConfig = signal<Config>({
    orientation: 'white',
    coordinates: false,
    movable: { free: true, events: { after: () => this.handleMove() } },
    draggable: { enabled: true, deleteOnDropOff: true },
    drawable: { enabled: true },
    highlight: { lastMove: true },
  });

  constructor() {
    // Load exercise onto board when selected from list
    effect(() => {
      const ex = this.demoExercise();
      if (ex && this.chessBoard?.api) {
        this.chessBoard.api.set({ fen: ex.fen, lastMove: [] });
        if (this.isGathered()) {
          this.store.sendTeacherFen(ex.fen);
          this.drawingService.clearAllOnFenChange();
        }
      }
    });

    // Apply shared arrows in gathered mode
    effect(() => {
      const shapes = this.store.sharedArrows();
      if (this.isGathered()) this.chessBoard?.api?.set({ drawable: { shapes } });
    });

    // Redraw board when gathered/normal toggles (board resizes via CSS)
    effect(() => {
      this.isGathered(); // track
      setTimeout(() => this.chessBoard?.api?.redrawAll(), 0);
    });
  }

  ngAfterViewInit(): void {
    const el = this.chessBoard.boardElement.nativeElement as HTMLElement;
    // send shared arrows in gathered mode (left mouse-clear, right mouse-draw)
    el.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      if (this.isGathered()) {
        setTimeout(() => {
          const shapes = this.chessBoard.api?.state.drawable.shapes ?? [];
          this.store.sendSharedArrows(shapes);
        }, 0);
      }
    });
  }

  handleMove(): void {
    this.store.sendTeacherFen(this.chessBoard.api.getFen());
    this.drawingService.clearAllOnFenChange();
  }

  onInterceptorClick(event: MouseEvent): void {
    const boardEl = this.chessBoard.boardElement.nativeElement as HTMLElement;
    const square = clientToSquare(event.clientX, event.clientY, boardEl, 'white');
    this.overlayService.onSquareClicked(square);
  }

  gather(): void {
    this.store.sendTeacherFen(this.chessBoard.api.getFen());
    this.drawingService.clearAllOnFenChange();
    this.store.gather();
  }

  disperse(): void {
    this.store.disperse();
  }

  resetBoard(): void {
    this.chessBoard.api?.set({ fen: STARTING_FEN, lastMove: [] });
    this.store.sendTeacherFen(STARTING_FEN);
    this.drawingService.clearAllOnFenChange();
  }

  clearBoard(): void {
    this.chessBoard.api?.set({ fen: EMPTY_BOARD_FEN, lastMove: [] });
    this.store.sendTeacherFen(EMPTY_BOARD_FEN);
    this.drawingService.clearAllOnFenChange();
  }

  
  toggleAutoRedo(): void {
    this.store.sendAutoRedo(!this.store.autoRedo());
  }

  toggleAutoProgress(): void {
    this.store.sendAutoProgress(!this.store.autoProgress());
  }


  loadListToAll(list: List): void {
    this.store.loadListToAll(list);
  }

  openPicker(): void {
    this.dialog.open(ExerciseListPicker, {
      width: '360px',
      data: { multiSelect: true, alreadySelected: this.loadedLists() } satisfies ExerciseListPickerData,
    })
    .afterClosed()
    .subscribe((selections: List[] | null) => {
      if (!selections?.length) return;
      this.loadedLists.update((curr) => [...curr, ...selections]);
    });
  }

  removeList(list: List): void {
    this.loadedLists.update((lists) => lists.filter((l) => l.id !== list.id));
  }
}
