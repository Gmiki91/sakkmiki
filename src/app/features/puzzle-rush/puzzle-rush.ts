import {
  Component, inject, signal, model, OnInit, ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { PuzzleRushBoard } from '../../shared/components/puzzle-rush-board/puzzle-rush-board';
import {
  ExerciseListPicker,
  ExerciseListPickerData,
} from '../../shared/components/exercise-list-picker/exercise-list-picker';
import { ExerciseList } from '../../shared/models/exercise-list.model';
import { ExerciseService } from '../../core/services/exercise.service';

type Phase = 'idle' | 'running' | 'finished';

@Component({
  selector: 'app-puzzle-rush',
  imports: [MatButtonModule, MatIconModule, MatInputModule, MatCardModule, FormsModule, PuzzleRushBoard],
  templateUrl: './puzzle-rush.html',
  styleUrl: './puzzle-rush.scss',
})
export class PuzzleRush implements OnInit {
  @ViewChild(PuzzleRushBoard) puzzleRushBoard!: PuzzleRushBoard;

  exerciseService = inject(ExerciseService);
  dialog = inject(MatDialog);

  duration = model(180);
  timeBonus = model(3);
  timePenalty = model(10);

  phase = signal<Phase>('idle');
  selectedList = signal<ExerciseList | null>(null);

  ngOnInit(): void {
    this.exerciseService.loadExerciseLists();
  }

  openListPicker(): void {
    this.dialog
      .open(ExerciseListPicker, {
        width: '360px',
        data: {
          multiSelect: false,
          alreadySelected: this.selectedList() ? [this.selectedList()!] : [],
          puzzleRush: true,
        } satisfies ExerciseListPickerData,
      })
      .afterClosed()
      .subscribe((selections: ExerciseList[] | null) => {
        if (!selections?.length) return;
        this.selectedList.set(selections[0]);
      });
  }

  start(): void {
    if (!this.selectedList()) return;
    this.phase.set('running');
    setTimeout(() => this.puzzleRushBoard?.start());
  }

  onFinished(): void {
    this.phase.set('finished');
  }

  restart(): void {
    this.phase.set('idle');
  }
}
