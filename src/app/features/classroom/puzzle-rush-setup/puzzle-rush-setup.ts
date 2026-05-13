import { Component, inject, signal, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { ExerciseList } from '../../../shared/models/exercise-list.model';
import { ExerciseService } from '../../../core/services/exercise.service';

const CAR_COLORS = ['#e91e63', '#2196f3', '#4caf50', '#ff9800', '#7d168f', '#00bcd4', '#fc3ffc', '#3f51b5', '#ff5722', '#607d8b'];

export type PuzzleRushSetupData = {
  studentNames: string[];
};

@Component({
  selector: 'app-puzzle-rush-setup',
  imports: [MatButtonModule, MatInputModule, MatCardModule, MatIconModule, MatDialogModule, MatTooltipModule, FormsModule],
  templateUrl: './puzzle-rush-setup.html',
  styleUrl: './puzzle-rush-setup.scss',
})
export class PuzzleRushSetup {
  private dialogRef = inject(MatDialogRef<PuzzleRushSetup>);
  data = inject<{ studentNames: string[] }>(MAT_DIALOG_DATA);
  exerciseService = inject(ExerciseService);

  duration = 180;
  timeBonus = 3;
  timePenalty = 10;
  selectedList = signal<ExerciseList | null>(null);
  studentColors = signal<Record<string, string>>({});

  readonly carColors = CAR_COLORS;

  isReady = computed(() => !!this.selectedList());

  selectList(list: ExerciseList): void {
    this.selectedList.set(list);
  }

  getStudentColor(name: string): string {
    return this.studentColors()[name] ?? CAR_COLORS[this.data.studentNames.indexOf(name) % CAR_COLORS.length];
  }

  setStudentColor(name: string, color: string): void {
    this.studentColors.update(c => ({ ...c, [name]: color }));
  }

  start(): void {
    if (!this.selectedList()) return;
    const colors = { ...this.studentColors() };
    for (const name of this.data.studentNames) {
      if (!colors[name]) {
        colors[name] = CAR_COLORS[this.data.studentNames.indexOf(name) % CAR_COLORS.length];
      }
    }
    this.dialogRef.close({
      list: this.selectedList()!,
      duration: this.duration,
      timeBonus: this.timeBonus,
      timePenalty: this.timePenalty,
      studentColors: colors,
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
