import {
  AfterViewInit,
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
import { ExerciseInput, ExerciseType, LastMove } from '../../../shared/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import {
  BARE_STARTING_FEN,
  EMPTY_BOARD_FEN,
} from '../../../shared/utils/chess.utils';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
@Component({
  selector: 'app-board-creator',
  imports: [
    ChessBoard,
    FormsModule,
    MatRadioModule,
    MatCheckboxModule,
    MatInputModule,
    MatButton,
    MatIcon,
  ],
  templateUrl: './board-creator.html',
  styleUrl: './board-creator.scss',
})
export class BoardCreator implements AfterViewInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  exerciseService = inject(ExerciseService);
  title = model('');
  whiteCastlingKingSide = model(true);
  whiteCastlingQueenSide = model(true);
  blackCastlingKingSide = model(true);
  blackCastlingQueenSide = model(true);
  turnOrder = model<'w' | 'b'>('w');
  currentFen = model<string>(BARE_STARTING_FEN);
  exerciseType = computed<ExerciseType>(() => {
    //inferred from the exerciseList
    const listId = this.activatedRoute.snapshot.paramMap.get('listId');
    const list = this.exerciseService.exerciseLists().find((l) => l.id === listId);
    return list?.type ?? 'puzzle';
  });

  // opponents last move for puzzle
  lastMove = signal<LastMove | null>(null);
  isRecordingLastMove = signal(false);

  mushroomType = model<string>('🍄');
  mushroomTypes = ['🍄','🍫','🍬','🍦', '🍔', '🥤', '🍩' ,'🎃', '♥️', '🎁', '🎈', '⭐', '🌼','🍀','🌻','⚽'];

  private chess = new Chess();
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private activatedRoute = inject(ActivatedRoute);

  boardConfig = computed<Config>(() => ({
    fen: this.currentFen(),
    coordinates: false,
    movable: {
      free: true,
    },
    draggable: {
      enabled: true,
      deleteOnDropOff: true,
    },
    highlight: {
      lastMove: false,
    },
  }));

  ngAfterViewInit(): void {
    const board = this.chessBoard.boardElement.nativeElement;
    this.addDragListener(board);
    this.addDropListener(board);
    this.chessBoard.api.set({
      events: {
        change: () => this.boardChange(), // to update when dragging off pieces
      },
      movable: {
        events: {
          after: (orig: Key, dest: Key) => this.handleMove(orig, dest),
        },
      },
    });
  }

  setFen(value: string) {
    this.currentFen.set(value.split(' ')[0] ?? '');
  }

  onDragStart(event: DragEvent, role: Role, color: Color) {
    event.dataTransfer?.setData('role', role);
    event.dataTransfer?.setData('color', color);

    // set the drag image to just the element being dragged
    const el = event.target as HTMLElement;
    event.dataTransfer?.setDragImage(el, el.offsetWidth / 2, el.offsetHeight / 2);
  }

  resetBoard() {
    this.lastMove.set(null);
    const fen = `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR`;
    this.currentFen.set(fen);
  }
  clearBoard() {
    this.lastMove.set(null);
    this.currentFen.set(EMPTY_BOARD_FEN);
  }

  async save() {
    const fen = this.currentFen().split(' ')[0] + this.fenAppendix();
    const exerciseType = this.exerciseType();
    const listId = this.activatedRoute.snapshot.paramMap.get('listId');
    if (!listId) return;
    const position = this.exerciseService.exerciseLists().find((l) => l.id === listId)?.exercises.length
    try {
      if (exerciseType === 'puzzle') {
        this.chess.load(fen);
      }
      const exercise: ExerciseInput = {
        title: this.title(),
        fen,
        exerciseType,
        listId,
        position: position || 1,
        lastMove: this.lastMove() ?? undefined,
        mushroomType:this.mushroomType(),

      };

      const ex = await this.exerciseService.addExercise(listId,exercise);
      if (!ex) return;
      if (ex.exerciseType === 'challenge') {
        this.router.navigate([`/exercises/challenge/${ex.id}`]);
      } else {
        this.router.navigate([`/exercises/edit/${ex.id}`]);
      }
    } catch (e) {
      this.snackbar.open((e as Error).message, '', { duration: 2000 });
    }
  }

  handleMove(orig: Key, dest: Key) {
    if (this.isRecordingLastMove()) {
      try {
     this.move(orig,dest);
      } catch (e) {
        try{
        // retry with opposite color
        this.turnOrder.update(value=>value==='b'?'w':'b')
        this.move(orig,dest);
        }catch (err){
          // it was probably an invalid move, reset original turnOrder
          this.turnOrder.update(value=>value==='b'?'w':'b')
          this.snackbar.open((err as Error).message, '', { duration: 2000 });
          this.chessBoard.api.set({ fen: this.currentFen() });
        }
        
      }finally{
        this.isRecordingLastMove.set(false);
      }
    }
  }
  private move(from: Key, to: Key){
      this.chess.load(this.currentFen() + this.fenAppendix());
        this.chess.move({ from, to });
        const color = this.chessBoard.api.state.pieces.get(to)!.color;
        this.lastMove.set({ from, to, color });
        this.turnOrder.set(color === 'white' ? 'b' : 'w');
  }
  private boardChange() {
    if (!this.isRecordingLastMove()) {
      // If user set last move, but then touches the board, the last move gets removed
      this.lastMove.set(null);
      this.currentFen.set(this.chessBoard.api.getFen());
    }
  }

  private onDrop(event: DragEvent) {
    const x = event.clientX;
    const y = event.clientY;
    const square = this.chessBoard.api?.getKeyAtDomPos([x, y]);
    const role = event.dataTransfer?.getData('role') as Role;
    const color = event.dataTransfer?.getData('color') as Color;
    if (role && color && square) {
      this.chessBoard.api?.setPieces(new Map([[square, { role, color }]]));
      this.boardChange();
    }
  }

  private addDragListener(el: HTMLElement) {
    el.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
    });
  }

  private addDropListener(el: HTMLElement) {
    el.addEventListener('drop', (e: DragEvent) => {
      this.onDrop(e);
    });
  }

  private fenAppendix(): string {
    const turn = this.lastMove()
      ? this.lastMove()!.color === 'white'
        ? 'w'
        : 'b'
      : this.turnOrder();
    const castling =
      (this.whiteCastlingKingSide() ? 'K' : '') +
        (this.whiteCastlingQueenSide() ? 'Q' : '') +
        (this.blackCastlingKingSide() ? 'k' : '') +
        (this.blackCastlingQueenSide() ? 'q' : '') || '-';
    return ` ${turn} ${castling} - 0 1`;
  }
}
