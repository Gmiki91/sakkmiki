import { Component, inject, signal, computed } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { Config } from '@lichess-org/chessground/config';
import { ExerciseService } from '../../../core/services/exercise.service';
import { Exercise } from '../../../shared/models/exercise.model';
import { ChessBoard } from '../chess-board/chess-board';
import { STARTING_FEN } from '../../utils/chess.utils';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export type GameSetupMode = 'challenge' | 'duel';
export type GameSetupData = {
  mode: GameSetupMode;
  white?: string;
  black?: string;
  studentName?: string;
  exercise?: Exercise;
};

export type GameSetupResult = {
  exercise: Exercise;
  scoreDiffWin: number;
  timerMinutes: number;
} | null;

@Component({
  selector: 'app-game-setup-dialog',
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule,
    MatChipsModule,
    FormsModule,
    ChessBoard,
  ],
  templateUrl: './game-setup-dialog.html',
  styleUrl: './game-setup-dialog.scss',
})
export class GameSetupDialog {
  private dialogRef = inject(MatDialogRef<GameSetupDialog>);
  private dialogData = inject<GameSetupData>(MAT_DIALOG_DATA);
  private exerciseService = inject(ExerciseService);

  mode = this.dialogData.mode;
  title = computed(() => {
    if (this.mode === 'challenge') return `${this.dialogData.white} vs ${this.dialogData.black}`;
    return `Teacher vs ${this.dialogData.studentName}`;
  });

  allExercises = computed(() =>
    this.exerciseService
      .exerciseLists()
      .flatMap((l) => l.exercises)
      .sort((a,b)=>a.title>b.title?1:-1)
      .filter((e) => e.exerciseType === 'challenge'),
  );

  searchQuery = signal('');
  selectedExercise = signal<Exercise | null>(this.dialogData.exercise ?? null);
  scoreDiffWin = signal(0);
  timerMinutes = signal(0);

  dialogReady = signal(false);
  previewConfig = computed<Config>(() => {
    const ex = this.selectedExercise();
    return {
      fen: ex?.fen ?? STARTING_FEN,
      orientation: 'white',
      coordinates: false,
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      highlight: { lastMove: false, check: true },
    };
  });

  filteredExercises = computed(() => {
    let list = this.allExercises();
    const q = this.searchQuery().toLowerCase().trim();
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q));
    return list;
  });

  constructor(){
    //without this, the size of the board does not adhere to the values set by me 
    this.dialogRef.afterOpened().pipe(takeUntilDestroyed()).subscribe(()=>this.dialogReady.set(true));
  }

  selectExercise(ex: Exercise): void {
    this.selectedExercise.set(ex);
  }

  confirm(): void {
    const ex = this.selectedExercise();
    if (!ex) return;
    this.dialogRef.close({
      exercise: ex,
      scoreDiffWin: this.scoreDiffWin() || 0,
      timerMinutes: this.timerMinutes() || 0,
    } satisfies GameSetupResult);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
