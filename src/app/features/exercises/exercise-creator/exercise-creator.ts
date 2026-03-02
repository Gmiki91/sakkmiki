import {
  Component,
  inject,
  ViewChild,
  signal,
  computed,
  OnInit,
  WritableSignal,
} from '@angular/core';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { Chess } from 'chess.js';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { boardConfig, getValidMoves } from '../../../shared/utils/chess.utils';
import { Exercise } from '../../../shared/models/exercise.model';
import { ActivatedRoute } from '@angular/router';
import { ExerciseService } from '../../../core/services/exercise.service';
import { MatSnackBar } from '@angular/material/snack-bar';
@Component({
  selector: 'app-exercise-creator',
  imports: [ChessBoard, MatRadioModule, MatButtonModule, MatCheckboxModule, FormsModule, MatIcon],
  templateUrl: './exercise-creator.html',
  styleUrl: './exercise-creator.scss',
})
export class ExerciseCreator implements OnInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  exerciseService = inject(ExerciseService);
  isRecording = signal(false);

  recording = signal<string[]>([]);
  recordingText = computed(() => this.recording().join(', '));
  defaultHint = '';
  exercise!: WritableSignal<Exercise>;
  boardConfig = signal<Config | undefined>(undefined);
  private chess!: Chess;
  private route = inject(ActivatedRoute);
  private snackbar = inject(MatSnackBar);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const exerciseId = params.get('exerciseId');
      const found = this.exerciseService
        .exerciseLists()
        .flatMap((list) => list.exercises)
        .find((ex) => ex.id === exerciseId);

      if (!found) return;
      this.exercise = signal(found);
      this.chess = new Chess(found.fen);

      this.boardConfig = signal({
        fen: found.fen,
        orientation: 'white',
        coordinates: false,
        movable: {
          free: false,
          dests: getValidMoves(this.chess),
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
    });
  }

  handleMove(orig: Key, dest: Key) {
    try {
      const move = this.chess.move({ from: orig, to: dest });
      if (move) {
        // Update board
        this.chessBoard.api?.set(boardConfig(this.chess));

        // Record if recording
        if (this.isRecording()) {
          this.recording.update((moves) => [...moves, move.san]);
        }
      }
    } catch (e) {
      // Invalid move - revert
      alert('Invalid move!');
      this.chessBoard.api.set({ fen: this.chess.fen() });
    }
  }

  addSolution() {
    this.saveRecording();
    this.isRecording.set(true);
    this.resetBoard();
  }

  cancelRecording() {
    this.isRecording.set(false);
    this.resetBoard();
  }

  deleteSolution(i: number) {
    this.exercise.update((ex) => ({
      ...ex,
      solutions: ex.solutions.filter((_, index) => index !== i),
    }));
  }

  loadStep(solutionIndex: number, stepIndex: number) {
    if (this.isRecording()) {
      this.isRecording.set(false);
    }
    this.chess.load(this.exercise().fen);
    const steps = this.exercise().solutions[solutionIndex];
    for (let index = 0; index <= stepIndex; index++) {
      this.chess.move(steps[index]);
    }
    this.chessBoard.api?.set(boardConfig(this.chess, false));
  }

  addHint() {}

  save() {
    this.saveRecording();
    this.exerciseService.updateExercise(this.exercise());
  }

  private resetBoard() {
    this.recording.set([]);
    const fen = this.exercise().fen;
    this.chess.load(fen);
    this.chessBoard.api?.set(boardConfig(this.chess, false));
  }

  private saveRecording() {
    if (this.recording().length > 0) {
      const error = this.validateRecording(this.recording());
      if (error) {
        this.snackbar.open(error, '', { duration: 3000 });
        return;
      }
      this.exercise.update((ex) => ({
        ...ex,
        solutions: [...ex.solutions, this.recording()],
      }));
    }
  }

  private validateRecording(newSolution: string[]): string | null {
    for (const existing of this.exercise().solutions) {
      // find how far the two lines are identical
      const commonLength = Math.min(existing.length, newSolution.length);
      let divergesAt = -1;
      for (let i = 0; i < commonLength; i++) {
        if (existing[i] !== newSolution[i]) {
          divergesAt = i;
          break;
        }
      }
      // if divergence happens at an even index (0,2,4...) thats a player move -> ok
      // if divergence happens at an odd index (1,3,5...) thats a computer move -> conflict
      if (divergesAt !== -1 && divergesAt % 2 === 1) {
        return `Conflict at move ${Math.ceil(divergesAt / 2) + 1}: computer already has a different response recorded for this position.`;
      }
    }
    return null;
  }
}
