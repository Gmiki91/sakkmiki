import { Component, inject, ViewChild, signal, computed } from '@angular/core';
import { ChessBoard } from '../../../../shared/components/chess-board/chess-board';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { Chess } from 'chess.js';
import { ExerciseService } from '../../services/exercise.service';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { boardConfig, getValidMoves } from '../../../../shared/utils/chess.utils';
@Component({
  selector: 'app-exercise-creator',
  imports: [ChessBoard, MatRadioModule, MatButtonModule, MatCheckboxModule, FormsModule, MatIcon],
  templateUrl: './exercise-creator.html',
  styleUrl: './exercise-creator.scss',
})
export class ExerciseCreator {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  exerciseService = inject(ExerciseService);
  exercise = this.exerciseService.getSelectedExercise();
  isRecording = signal(false);

  recording = signal<string[]>([]);
  recordingText = computed(() => this.recording().join(', '));
  defaultHint = '';
  private chess = new Chess(this.exercise().fen);

  boardConfig = signal<Config>({
    fen: this.exercise().fen,
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

  private saveRecording(){
    if (this.recording().length > 0) {
      this.exercise.update((ex) => ({
        ...ex,
        solutions: [...ex.solutions, this.recording()]
      }));
    }
  }
}
