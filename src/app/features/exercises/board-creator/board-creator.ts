import {
  AfterViewInit,
  OnInit,
  Component,
  inject,
  model,
  signal,
  computed,
  ViewChild
} from '@angular/core';
import { Color, Key, Role } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { Chess } from 'chess.js';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { ExerciseInput, ExerciseType, LastMove, Exercise } from '../../../shared/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import {
  BARE_STARTING_FEN,
  EMPTY_BOARD_FEN,
} from '../../../shared/utils/chess.utils';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-board-creator',
  imports: [
    ChessBoard,
    FormsModule,
    MatRadioModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatButton,
    MatIcon,
  ],
  templateUrl: './board-creator.html',
  styleUrl: './board-creator.scss',
})
export class BoardCreator implements OnInit, AfterViewInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;

  exerciseService = inject(ExerciseService);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private activatedRoute = inject(ActivatedRoute);
  private chess = new Chess();

  title = model('');
  instruction = model('');
  whiteCastlingKingSide = model(true);
  whiteCastlingQueenSide = model(true);
  blackCastlingKingSide = model(true);
  blackCastlingQueenSide = model(true);
  turnOrder = model<'w' | 'b'>('w');
  currentFen = model<string>(BARE_STARTING_FEN);
  mushroomType = model<string>('');
  mushroomTypes = ['🍄','🍫','🍬','🍦', '🍔', '🥤', '🍩' ,'🎃', '♥️', '🎁', '🎈', '⭐', '🌼','🍀','🌻','⚽'];

  lastMove = signal<LastMove | null>(null);
  isRecordingLastMove = signal(false);

  // Mode
  isEditMode = signal(false);
  isSaving = signal(false);
  private editExerciseId = signal<string | null>(null);
  exerciseType = signal<ExerciseType>('puzzle');

  boardConfig = computed<Config>(() => ({
    fen: this.currentFen(),
    coordinates: false,
    movable: { free: true },
    draggable: { enabled: true, deleteOnDropOff: true },
    highlight: { lastMove: false },
  }));

  ngOnInit(): void {
    this.activatedRoute.paramMap.subscribe(params=>{
    const exerciseId = params.get('exerciseId');
      if (exerciseId) {
        // Edit mode
        this.isEditMode.set(true);
        this.editExerciseId.set(exerciseId);
        const exercise = this.exerciseService.exerciseLists()
        .flatMap(l => l.exercises)
        .find(e => e.id === exerciseId);
        if (exercise) this.loadExercise(exercise);
      } else {
        // Create mode — infer type from the list
        const listId = this.activatedRoute.snapshot.paramMap.get('listId');
        const list = this.exerciseService.exerciseLists().find(l => l.id === listId);
        this.exerciseType.set(list?.type ?? 'puzzle');
      }
    });
  }

  ngAfterViewInit(): void {
    const board = this.chessBoard.boardElement.nativeElement;
    this.addDragListener(board);
    this.addDropListener(board);
    this.chessBoard.api.set({
      events: { change: () => this.boardChange() },
      movable: { events: { after: (orig: Key, dest: Key) => this.handleMove(orig, dest) } },
    });
  }

  setFen(value: string) {
    this.currentFen.set(value.split(' ')[0] ?? '');
  }

  onDragStart(event: DragEvent, role: Role, color: Color) {
    event.dataTransfer?.setData('role', role);
    event.dataTransfer?.setData('color', color);
    const el = event.target as HTMLElement;
    event.dataTransfer?.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
  }

  resetBoard() {
    this.lastMove.set(null);
    this.currentFen.set(BARE_STARTING_FEN);
  }

  clearBoard() {
    this.lastMove.set(null);
    this.currentFen.set(EMPTY_BOARD_FEN);
  }

  async save(): Promise<void> {
    const fen = this.currentFen().split(' ')[0] + this.fenAppendix();
    let numberOfMushrooms = undefined;
    if(this.mushroomType())numberOfMushrooms = this.countBlackPawns(fen);
    if (this.isEditMode()) {
      const existing = this.exerciseService.exerciseLists()
        .flatMap(l => l.exercises)
        .find(e => e.id === this.editExerciseId()!);
      if (!existing) return;
      this.isSaving.set(true);
      try {
        await this.exerciseService.updateExercise({
          ...existing,
          title: this.title(),
          instruction:this.instruction(),
          fen,
          lastMove: this.lastMove() ?? undefined,
          mushroomType: this.mushroomType() || undefined,
          numberOfMushrooms
        });
      } catch (e) {
        this.snackbar.open((e as Error).message, '', { duration: 2000 });
      } finally {
        this.isSaving.set(false);
      }
      return;
    }

    // Create mode
    const listId = this.activatedRoute.snapshot.paramMap.get('listId');
    if (!listId) return;
    const position = this.exerciseService.exerciseLists().find(l => l.id === listId)?.exercises.length;
    try {
      if (this.exerciseType() === 'puzzle') this.chess.load(fen);
      const exercise: ExerciseInput = {
        title: this.title(),
        instruction:this.instruction(),
        fen,
        exerciseType: this.exerciseType(),
        listId,
        position: position || 1,
        lastMove: this.lastMove() ?? undefined,
        mushroomType: this.mushroomType() || undefined,
        numberOfMushrooms
      };
      const ex = await this.exerciseService.addExercise(listId, exercise);
      if (!ex) return;
      this.navigateNext(ex.id, ex.exerciseType);
    } catch (e) {
      this.snackbar.open((e as Error).message, '', { duration: 2000 });
    }
  }

  goToNextStep(): void {
    const id = this.editExerciseId();
    if (id) this.navigateNext(id, this.exerciseType());
  }


  handleMove(orig: Key, dest: Key) {
    if (this.isRecordingLastMove()) {
      try {
        this.move(orig, dest);
      } catch (e) {
        try {
          this.turnOrder.update(value => value === 'b' ? 'w' : 'b');
          this.move(orig, dest);
        } catch (err) {
          this.turnOrder.update(value => value === 'b' ? 'w' : 'b');
          this.snackbar.open((err as Error).message, '', { duration: 2000 });
          this.chessBoard.api.set({ fen: this.currentFen() });
        }
      } finally {
        this.isRecordingLastMove.set(false);
      }
    }
  }

  // ----------------------------------------------------------------
  // Private
  // ----------------------------------------------------------------

  private navigateNext(exerciseId: string, type: ExerciseType): void {
    switch (type) {
      case 'challenge': this.router.navigate([`/exercises/challenge/${exerciseId}`]); break;
      case 'puzzle':this.router.navigate([`/exercises/edit/${exerciseId}`]); break;
      case 'mushroom':  
      case 'demo':      this.router.navigate(['/exercises']); break;
    }
  }

  private loadExercise(exercise: Exercise): void {
    this.exerciseType.set(exercise.exerciseType);
    this.title.set(exercise.title);
    this.instruction.set(exercise.instruction);
    const fenParts = exercise.fen.split(' ');
    this.currentFen.set(fenParts[0] ?? BARE_STARTING_FEN);
    this.turnOrder.set((fenParts[1] as 'w' | 'b') ?? 'w');
    const castling = fenParts[2] ?? '-';
    this.whiteCastlingKingSide.set(castling.includes('K'));
    this.whiteCastlingQueenSide.set(castling.includes('Q'));
    this.blackCastlingKingSide.set(castling.includes('k'));
    this.blackCastlingQueenSide.set(castling.includes('q'));
    this.lastMove.set(exercise.lastMove ?? null);
    if (exercise.mushroomType) this.mushroomType.set(exercise.mushroomType);
  }

  private move(from: Key, to: Key) {
    this.chess.load(this.currentFen() + this.fenAppendix());
    this.chess.move({ from, to });
    const color = this.chessBoard.api.state.pieces.get(to)!.color;
    this.lastMove.set({ from, to, color });
    this.turnOrder.set(color === 'white' ? 'b' : 'w');
  }

  private boardChange() {
    if (!this.isRecordingLastMove()) {
      this.lastMove.set(null);
      this.currentFen.set(this.chessBoard.api.getFen());
    }
  }

  private onDrop(event: DragEvent) {
    const square = this.chessBoard.api?.getKeyAtDomPos([event.clientX, event.clientY]);
    const role = event.dataTransfer?.getData('role') as Role;
    const color = event.dataTransfer?.getData('color') as Color;
    if (role && color && square) {
      this.chessBoard.api?.setPieces(new Map([[square, { role, color }]]));
      this.boardChange();
    }
  }

  private addDragListener(el: HTMLElement) {
    el.addEventListener('dragover', (e: DragEvent) => e.preventDefault());
  }

  private addDropListener(el: HTMLElement) {
    el.addEventListener('drop', (e: DragEvent) => this.onDrop(e));
  }

  private countBlackPawns(fen:string):number {
    // 1. Get the board layout (everything before the first space)
    const boardLayout = fen.split(' ')[0];

    // 2. Use a Global Regex match to find all 'p' characters.
    // The 'g' flag ensures we find all occurrences, not just the first one.
    // If no pawns are found, match() returns null, so we default to an empty array.
    const matches = boardLayout.match(/p/g) || [];

    return matches.length;
}

  private fenAppendix(): string {
    const turn = this.lastMove()
      ? this.lastMove()!.color === 'white' ? 'w' : 'b'
      : this.turnOrder();
    const castling =
      (this.whiteCastlingKingSide() ? 'K' : '') +
      (this.whiteCastlingQueenSide() ? 'Q' : '') +
      (this.blackCastlingKingSide() ? 'k' : '') +
      (this.blackCastlingQueenSide() ? 'q' : '') || '-';
    return ` ${turn} ${castling} - 0 1`;
  }
}
