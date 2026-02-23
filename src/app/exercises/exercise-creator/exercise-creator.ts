import { Component, inject, ViewChild, signal, model } from '@angular/core';
import { ChessBoard } from '../../chess-board/chess-board';
import { Color, Key, Role } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { Chess } from 'chess.js';
import { ExerciseService } from '../exercise.service';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
@Component({
  selector: 'app-exercise-creator',
  imports: [ChessBoard, MatRadioModule, MatCheckboxModule, FormsModule],
  templateUrl: './exercise-creator.html',
  styleUrl: './exercise-creator.scss',
})
export class ExerciseCreator {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  exerciseService = inject(ExerciseService);
  whiteCastlingKingSide = model(true);
  whiteCastlingQueenSide = model(true);
  blackCastlingKingSide = model(true);
  blackCastlingQueenSide = model(true);
  turnOrder = model<'w' | 'b'>('w');
  private chess = new Chess();

  boardConfig = signal<Config>({
    fen: this.chess.fen(),
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
    highlight: {
      lastMove: false,
    },
  });

  ngAfterViewInit(): void {
    const board = this.chessBoard.boardElement.nativeElement;
    this.addDragListener(board);
    this.addDropListener(board);
  }

  handleMove(orig: Key, dest: Key) {}

  onDragStart(event: DragEvent, role: Role, color: Color) {
    event.dataTransfer?.setData('role', role);
    event.dataTransfer?.setData('color', color);
  }

  save() {
    this.exerciseService.addExercise(this.buildFen());
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

  private buildFen(): string {
    const castling =
      (this.whiteCastlingKingSide() ? 'K' : '') +
        (this.whiteCastlingQueenSide() ? 'Q' : '') +
        (this.blackCastlingKingSide() ? 'k' : '') +
        (this.blackCastlingQueenSide() ? 'q' : '') || '-';
    return this.chessBoard.api.getFen() + ` ${this.turnOrder()} ${castling} - 0 1`;
  }
}
