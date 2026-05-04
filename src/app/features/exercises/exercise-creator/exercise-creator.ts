import {
  Component,
  inject,
  ViewChild,
  signal,
  computed,
  model,
  OnInit,
  WritableSignal,
} from '@angular/core';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { Chess, Color } from 'chess.js';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { MatIcon } from '@angular/material/icon';
import { boardConfig, getValidMoves, loadChess } from '../../../shared/utils/chess.utils';
import { CommonMistake, Exercise } from '../../../shared/models/exercise.model';
import { ActivatedRoute, Router } from '@angular/router';
import { ExerciseService } from '../../../core/services/exercise.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {MatFormFieldModule} from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { validateSolution } from '../../../shared/utils/validation';
@Component({
  selector: 'app-exercise-creator',
  imports: [
    ChessBoard,
    MatRadioModule,
    MatButtonModule,
    MatCheckboxModule,
    FormsModule,
    MatFormFieldModule,
    MatInput,
    MatIcon,
    MatTooltipModule,
  ],
  templateUrl: './exercise-creator.html',
  styleUrl: './exercise-creator.scss',
})
export class ExerciseCreator implements OnInit {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  exerciseService = inject(ExerciseService);
  isRecording = signal(false);

  solutions = signal<string[]>([]);
  private originalSolutions = signal<string[][]>([]);
  recordingText = computed(() => this.solutions().join(', '));
  exercise!: WritableSignal<Exercise>;
  private originalDefaultHint = signal<string|undefined>('');
  defaultHint = model<string|undefined>('Biztos? 🤔');
  boardConfig = signal<Config | undefined>(undefined);
  playerColor: Color = 'w';
  saveState = signal<'idle' | 'saving' | 'saved'>('idle');

  private chess: Chess = new Chess();
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  // check whether there are unsaved solutions or hints
  isDirty = computed(
    () =>
      JSON.stringify(this.exercise().solutions ?? []) !== JSON.stringify(this.originalSolutions()) ||
    this.originalDefaultHint() !== this.defaultHint()
  );

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      // reset state on every navigation
      this.isRecording.set(false);
      this.solutions.set([]);

      const exerciseId = params.get('exerciseId');
      const found = this.exerciseService
        .exerciseLists()
        .flatMap((list) => list.exercises)
        .find((ex) => ex.id === exerciseId);

      if (!found) return;
      this.exercise = signal(found);
      this.defaultHint.set(found.defaultHint);
      this.originalDefaultHint.set(found.defaultHint);
      this.originalSolutions.set([...(found.solutions ?? [])]);
      loadChess(this.chess, found.fen);

      if (found.lastMove) {
        this.playerColor = this.chess.turn() === 'b' ? 'w' : 'b';
      } else {
        this.playerColor = this.chess.turn();
      }
      this.boardConfig = signal({
        fen: found.fen,
        orientation: this.playerColor === 'w' ? 'white' : 'black',
        coordinates: false,
        turnColor: found.lastMove?.color,
        lastMove: found.lastMove ? [found.lastMove.to, found.lastMove.from] : [],
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

      if (found.lastMove) {
        this.playLastMove(found);
      }
    });
  }

  handleMove(orig: Key, dest: Key) {
    try {
      const move = this.chess.move({ from: orig, to: dest });
      if (move) {
        this.chessBoard.api?.set(boardConfig(this.chess));
        if (this.isRecording()) {
          this.solutions.update((moves) => [...moves, move.san]);
        }
      }
    } catch (e) {
      // Invalid move - revert
      this.snackbar.open('Invalid move!', '', { duration: 2000 });
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
      solutions: ex.solutions?.filter((_, index) => index !== i),
    }));
  }

  loadStep(solutionIndex: number, stepIndex: number) {
    if (this.isRecording()) {
      this.isRecording.set(false);
    }
    loadChess(this.chess, this.exercise().fen);
    const steps = this.exercise().solutions![solutionIndex];
    for (let index = 0; index <= stepIndex; index++) {
      this.chess.move(steps[index]);
    }
    this.chessBoard.api?.set(boardConfig(this.chess, false));
  }

  addHint(hint:CommonMistake) {
    this.exercise.update(e=>({
      ...e,
      commonMistakes:[...(e.commonMistakes ?? []), hint]
    }));
  }

  returnToBoard():void{
    this.router.navigate([`/exercises/edit-board/${this.exercise().id}`]); 
  }


  async save() {
    this.saveState.set('saving');
    this.saveRecording();
    this.exercise.update(e=>({...e,defaultHint:this.defaultHint()}));
    this.originalDefaultHint.set(this.defaultHint());
    await this.exerciseService.updateExercise(this.exercise());
    this.originalSolutions.set([...(this.exercise()?.solutions ?? [])]);
    this.saveState.set('saved');
    setTimeout(() => this.saveState.set('idle'), 2000);
  }

  private playLastMove(ex: Exercise) {
    setTimeout(() => {
      const { from, to } = ex.lastMove!;
      this.chess.move({ from, to });
      this.playerColor = this.chess.turn();
      this.boardConfig.update((c) => ({
        ...c,
        fen: this.chess.fen(),
        lastMove: [from as Key, to as Key],
      }));
    }, 250);
  }

  private resetBoard() {
    this.solutions.set([]);
    loadChess(this.chess, this.exercise().fen);
    // replay last move if exists so recording starts from the correct position
    if (this.exercise().lastMove) {
      const { from, to } = this.exercise().lastMove!;
      this.chess.move({ from, to });
    }
    this.chessBoard.api?.set(boardConfig(this.chess, false));
  }

  private saveRecording() {
    if (this.solutions().length > 0) {
      const error = validateSolution(this.solutions(),this.exercise().solutions ?? []);
      if (error) {
        this.snackbar.open(error, '', { duration: 3000 });
        return;
      }
      this.exercise.update((ex) => ({
        ...ex,
        solutions: [...(ex.solutions ?? []), this.solutions()],
      }));
    }
  }
}
