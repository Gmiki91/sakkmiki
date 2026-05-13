import {
  Component, viewChild,  inject,
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
import { InviteDialog } from '../invite-dialog/invite-dialog';
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
import { WhiteBoard } from "../../../shared/components/white-board/white-board";
import {MatExpansionModule} from '@angular/material/expansion';
import { PuzzleRushSetup } from '../puzzle-rush-setup/puzzle-rush-setup';
import { PuzzleRushRacer } from '../puzzle-rush-racer/puzzle-rush-racer';
import { PieceRack } from "../../../shared/components/piece-rack/piece-rack";
import { Color, Role } from '@lichess-org/chessground/types';
@Component({
  selector: 'app-teacher-desk',
  imports: [
    ChessBoard, DrawingCanvas, TeachingOverlay, ExerciseList,
    MatButtonModule, MatIconModule, MatTooltipModule, MatExpansionModule,
    WhiteBoard, PuzzleRushRacer,
    PieceRack
],
  templateUrl: './teacher-desk.html',
  styleUrl: './teacher-desk.scss',
})
export class TeacherDesk {
  chessBoard = viewChild(ChessBoard);

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

  spectatorNames = computed(() =>
    this.store.spectators().map(s => s.displayName).join(', ')
  );

  boardConfig : Config = {
    orientation: 'white',
    coordinates: false,
    movable: { free: true, events: { after: () => this.handleMove() } },
    draggable: { enabled: true, deleteOnDropOff: true },
    drawable: { enabled: true, shapes: [] },
    highlight: { lastMove: false },
    events:{change:()=>this.handleMove()}
  };

  constructor() {
    // Load exercise onto board when selected from list 
    effect(() => {
      const ex = this.demoExercise();
      if (ex && this.chessBoard()?.api) {
        this.chessBoard()?.api.set({ fen: ex.fen, lastMove: [] });
        if (this.isGathered()) {
          this.store.sendTeacherFen(ex.fen);
          if(ex.mushroomType)this.store.sendMushroomType(ex.mushroomType);
          else this.store.sendMushroomType('');
          this.drawingService.clearAllOnFenChange();
        }
      }
    });

    // Apply shared arrows in gathered mode
    effect(() => {
      const arrows = this.store.sharedArrows()?.arrows ?? [];
      if (this.isGathered()) this.chessBoard()?.api?.set({ drawable: { shapes:arrows } });
    });

    // Redraw board when gathered/normal toggles (board resizes via CSS)
    effect(() => {
      this.isGathered(); // track
      setTimeout(() => this.chessBoard()?.api?.redrawAll(), 0);
    });
  }

  onBoardMouseUp(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return; // spectators don't send anything
        setTimeout(() => {
          const shapes = this.chessBoard()?.api?.state.drawable.shapes ?? [];
          this.store.sendSharedArrows(shapes);
        }, 0);
  }

  handleMove(): void {
    if(this.chessBoard()?.api!==undefined){
    this.store.sendTeacherFen(this.chessBoard()!.api.getFen());
    this.drawingService.clearAllOnFenChange();
    }
  }

  onInterceptorClick(event: MouseEvent): void {
    const boardEl = this.chessBoard()?.boardElement.nativeElement as HTMLElement;
    const square = clientToSquare(event.clientX, event.clientY, boardEl, 'white');
    this.overlayService.onSquareClicked(square);
  }

  gather(): void {
    if(this.chessBoard()?.api!==undefined) this.store.sendTeacherFen(this.chessBoard()!.api.getFen());
    this.drawingService.clearAllOnFenChange();
    this.store.gather();
  }

  disperse(): void {
    this.store.disperse();
  }

  resetBoard(): void {
    const fen = this.demoExercise()? this.demoExercise()!.fen : STARTING_FEN;
    this.chessBoard()?.api?.set({ fen, lastMove: [] });
    this.store.sendTeacherFen(fen);
    this.drawingService.clearAllOnFenChange();
  }

  clearBoard(): void {
    this.chessBoard()?.api?.set({ fen: EMPTY_BOARD_FEN, lastMove: [] });
    this.store.sendTeacherFen(EMPTY_BOARD_FEN);
    this.drawingService.clearAllOnFenChange();
    this.demoExercise.set(null);
  }

  
  toggleAutoRedo(): void {
    this.store.sendAutoRedo(!this.store.autoRedo());
  }

  toggleAutoProgress(): void {
    this.store.sendAutoProgress(!this.store.autoProgress());
  }

  startSimul(): void { this.store.startSimul(); }
  stopSimul(): void { this.store.stopSimul(); }

  openPuzzleRushSetup(): void {
    this.dialog.open(PuzzleRushSetup, {
      width: '480px',
      data: { studentNames: this.store.students().map(s => s.name) },
    }).afterClosed().subscribe((result: any) => {
      if (!result) return;
      this.store.sendPuzzleRushStart(result.list.id, result.duration, result.timeBonus, result.timePenalty, result.studentColors, result.list.exercises);
    });
  }


  loadListToAll(list: List,e:MouseEvent): void {
    e.stopPropagation();
    this.store.loadListToAll(list);
  }

  openPicker(): void {
    this.dialog.open(ExerciseListPicker, {
      width: '500px',
      height:'80vh',
      data: { multiSelect: true, alreadySelected: this.loadedLists() } satisfies ExerciseListPickerData,
    })
    .afterClosed()
    .subscribe((selections: List[] | null) => {
      if (!selections?.length) return;
      this.loadedLists.update((curr) => [...curr, ...selections]);
    });
  }

  openInviteDialog(): void {
    this.dialog.open(InviteDialog, {
      width: '420px',
      data: { classroomId: this.store.classroomId() },
    });
  }

  removeList(list: List): void {
    this.loadedLists.update((lists) => lists.filter((l) => l.id !== list.id));
  }

  onListDragStart(list: List, event: DragEvent): void {
    event.dataTransfer?.setData('type', 'list');
    event.dataTransfer?.setData('exercises', JSON.stringify(list.exercises));
    event.dataTransfer?.setData('list-title', list.title);
  }
  isConceptActive(conceptId: string): boolean {
    return this.overlayService.activeConcepts().some(c => c.id === conceptId);
  }

  // Dropping pieces
  onDrop(event: DragEvent) {
   const square = this.chessBoard()?.api?.getKeyAtDomPos([event.clientX, event.clientY]);
   const role = event.dataTransfer?.getData('role') as Role;
   const color = event.dataTransfer?.getData('color') as Color;
   if (role && color && square) {
     this.chessBoard()?.api?.setPieces(new Map([[square, { role, color }]]));
     this.store.sendTeacherFen(this.chessBoard()!.api.getFen());
   }
  }
  
}