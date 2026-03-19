import { Component, inject, ViewChild, signal, OnInit, WritableSignal, model } from '@angular/core';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { Config } from '@lichess-org/chessground/config';
import { Key } from '@lichess-org/chessground/types';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { ExerciseService } from '../../../core/services/exercise.service';
import { Exercise } from '../../../shared/models/exercise.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import {  MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-challenge-creator',
  imports: [ChessBoard, MatButtonModule, MatCheckboxModule, MatIconModule,MatTooltipModule],
  templateUrl: './challenge-creator.html',
  styleUrl: './challenge-creator.scss',
})
export class ChallengeCreator implements OnInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;

  exerciseService = inject(ExerciseService);
  private route = inject(ActivatedRoute);
  private snackbar = inject(MatSnackBar);

  exercise!: WritableSignal<Exercise>;

  whiteCaptureAll = model(false);
  blackCaptureAll = model(false);
  whiteWinMoves = signal<string[]>([]);
  blackWinMoves = signal<string[]>([]);
  recording = signal<'white' | 'black' | null>(null);

  private startFen = '';

  boardConfig = signal<Config>({
    orientation: 'white',
    coordinates: false,
    movable: { free: true },
    draggable: { enabled: true, deleteOnDropOff: true },
    highlight: { lastMove: false },
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const exerciseId = params.get('exerciseId');
      const found = this.exerciseService
        .exerciseLists()
        .flatMap((list) => list.exercises)
        .find((ex) => ex.id === exerciseId);
      if (!found) return;

      this.exercise = signal(found);
      this.startFen = found.fen;
      const white = found.whiteWinConditions ?? [];
      const black = found.blackWinConditions ?? [];
      this.whiteCaptureAll.set(white.includes('capture_all'));
      this.blackCaptureAll.set(black.includes('capture_all'));
      this.whiteWinMoves.set(white.filter((c) => c !== 'capture_all'));
      this.blackWinMoves.set(black.filter((c) => c !== 'capture_all'));

      this.boardConfig.set({ fen: found.fen, highlight: { lastMove: false } });
    });
  }

  startRecording(side: 'white' | 'black'): void {
    this.recording.set(side);
    this.chessBoard.api?.set({
      fen: this.startFen,
      highlight: { lastMove: false },
      movable: {
        events: {
          after: (orig: Key, dest: Key) => this.handleRecordingMove(dest),
        },
      },
    });
  }

  stopRecording(): void {
    this.recording.set(null);
    this.chessBoard.api?.set({
      ...{ fen: this.startFen },
      movable: {
        events: { after: undefined },
      },
    });
  }

  removeWhiteMove(i: number): void {
    this.whiteWinMoves.update((prev) => prev.filter((_, idx) => idx !== i));
  }

  removeBlackMove(i: number): void {
    this.blackWinMoves.update((prev) => prev.filter((_, idx) => idx !== i));
  }

  save(): void {
    const whiteWinConditions: string[] = [];
    const blackWinConditions: string[] = [];

    if (this.whiteCaptureAll()) whiteWinConditions.push('capture_all');
    whiteWinConditions.push(...this.whiteWinMoves());

    if (this.blackCaptureAll()) blackWinConditions.push('capture_all');
    blackWinConditions.push(...this.blackWinMoves());
    this.exerciseService.updateExercise({
      ...this.exercise(),
      fen: this.startFen,
      whiteWinConditions,
      blackWinConditions,
    });
  }

  private handleRecordingMove(dest: Key): void {
    const pieces = this.chessBoard.api.state.pieces;
    const piece = pieces.get(dest);
    if (!piece) return;

    const ROLE_ABBR: Record<string, string> = {
      rook: 'R',
      knight: 'N',
      bishop: 'B',
      queen: 'Q',
      king: 'K',
      pawn: '',
    };
    const notation = `${ROLE_ABBR[piece.role]}${dest}`; // e.g. "Nh8", "e8"

    const side = this.recording();
    if (side === 'white') {
      if (piece.color === 'black')
        this.snackbar.open(`That's a black piece`, '', { duration: 1500 });
      else
        //dont add if duplicated
        this.whiteWinMoves.update((prev) => (prev.includes(notation) ? prev : [...prev, notation]));
    } else if (side === 'black') {
      if (piece.color === 'white')
        this.snackbar.open(`That's a white piece`, '', { duration: 1500 });
      else
        this.blackWinMoves.update((prev) => (prev.includes(notation) ? prev : [...prev, notation]));
    }
  }
}
