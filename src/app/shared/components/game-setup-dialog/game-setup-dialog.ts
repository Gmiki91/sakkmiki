import { Component, inject, signal, computed } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { ExerciseService } from '../../../core/services/exercise.service';
import { Exercise } from '../../../shared/models/exercise.model';

export type GameSetupMode = 'challenge' | 'duel';
export type GameSetupData = {
  mode: GameSetupMode;
  white?: string;
  black?: string;
  studentName?: string;
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
  selectedExercise = signal<Exercise | null>(null);
  scoreDiffWin = signal(0);
  timerMinutes = signal(0);

  filteredExercises = computed(() => {
    let list = this.allExercises();
    const q = this.searchQuery().toLowerCase().trim();
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q));
    return list;
  });
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
