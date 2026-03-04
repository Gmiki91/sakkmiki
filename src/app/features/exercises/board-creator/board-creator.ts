import { AfterViewInit, Component, inject, model, signal, ViewChild } from '@angular/core';
import { Color, Role } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { Chess } from 'chess.js';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { ExerciseInput } from '../../../shared/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { EMPTY_BOARD_FEN } from '../../../shared/utils/chess.utils';
@Component({
  selector: 'app-board-creator',
  imports: [ChessBoard, FormsModule, MatRadioModule, MatCheckboxModule, MatInputModule],
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
  skipFenValidation = model(false);
  private chess = new Chess();
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);

  boardConfig = signal<Config>({
    // fen: this.chess.fen(),
    orientation: 'white',
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
    }
  });

  ngAfterViewInit(): void {
    const board = this.chessBoard.boardElement.nativeElement;
    this.addDragListener(board);
    this.addDropListener(board);
  }

  onDragStart(event: DragEvent, role: Role, color: Color) {
    event.dataTransfer?.setData('role', role);
    event.dataTransfer?.setData('color', color);
  }

  resetBoard() {
    const fen = `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR` + this.fenAppendix();
    this.updateFen(fen);
  }
  clearBoard() {
    this.updateFen(EMPTY_BOARD_FEN);
  }

  async save() {
    const fen = this.chessBoard.api.getFen() + this.fenAppendix();
    try {
      if (!this.skipFenValidation()) {
        this.chess.load(fen);
      }
      const exercise: ExerciseInput = {
        title: this.title(),
        fen: fen,
        solutions: [],
        skipFenValidation: this.skipFenValidation(),
      };
      const listId = this.activatedRoute.snapshot.paramMap.get('listId');
      if (!listId) return;
      const ex =  await this.exerciseService.addExercise(listId, exercise);
      if(!ex) return;
      this.router.navigate([`/exercises/edit/${ex.id}`]);
    } catch (e) {
      alert((e as Error).message);
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
    const castling =
      (this.whiteCastlingKingSide() ? 'K' : '') +
        (this.whiteCastlingQueenSide() ? 'Q' : '') +
        (this.blackCastlingKingSide() ? 'k' : '') +
        (this.blackCastlingQueenSide() ? 'q' : '') || '-';
    return ` ${this.turnOrder()} ${castling} - 0 1`;
  }

  private updateFen(fen: string) {
    this.chessBoard.api.set({ fen });
    this.boardConfig.update((value) => ({ ...value, fen }));
  }
}
