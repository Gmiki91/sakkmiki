import { Component, computed, inject, signal, model, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import {
  ExerciseListInput,
  ExerciseList as List,
} from '../../../shared/models/exercise-list.model';
import { MatFormField, MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { Exercise, ExerciseType } from '../../../shared/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { ExerciseListPicker } from '../../../shared/components/exercise-list-picker/exercise-list-picker';
import { MatIcon } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
@Component({
  selector: 'app-exercises-layout',
  imports: [
    ExerciseListPicker,
    RouterOutlet,
    MatFormField,
    MatInputModule,
    FormsModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIcon,
    MatRadioModule,
    MatTooltipModule,
  ],
  templateUrl: './exercises-layout.html',
  styleUrl: './exercises-layout.scss',
})
export class ExercisesLayout implements OnInit {
  exerciseService = inject(ExerciseService);
  isListCreationActive = signal<boolean>(false);
  title = model<string>('');
  exerciseType = model<ExerciseType>('puzzle');
  router = inject(Router);
  selectedListId = signal<string | null>(null);

  selectedList = computed(
    () => this.exerciseService.exerciseLists().find((l) => l.id === this.selectedListId()) ?? null,
  );

  ngOnInit(): void {
    this.exerciseService.loadExerciseLists();
  }

  addExercise(listId: string) {
    this.router.navigate([`/exercises/create/${listId}`]);
  }
  selectExercise(exercise: Exercise) {
    const type = exercise.exerciseType === 'challenge' ? 'challenge' : 'edit';
    this.router.navigate([`/exercises/${type}/${exercise.id}`]);
  }
  async deleteExercise(id: string) {
    const isOkDelete: boolean = confirm('Are you sure you want to delete this exercise?');
    if (!isOkDelete) return;
    await this.exerciseService.deleteExercise(id);
    if (this.router.url.includes(id)) {
      this.router.navigate(['/exercises']);
    }
  }
  addList() {
    if (this.isListCreationActive()) {
      const list: ExerciseListInput = { title: this.title(), type: this.exerciseType() };
      this.exerciseService.addExerciseList(list);
      this.isListCreationActive.set(false);
    } else {
      this.isListCreationActive.set(true);
    }
  }
  async deleteList(listId: string) {
    const isOkDelete: boolean = confirm('Are you sure you want to delete this list?');
    if (isOkDelete) {
      await this.exerciseService.deleteExerciseList(listId);
      this.selectedListId.set(null);
    }
  }
  onListSelected(lists: List[]): void {
    this.selectedListId.set(lists[0]?.id ?? null);
  }
  backToPanel1(): void {
    this.selectedListId.set(null);
    this.router.navigate(['/exercises']);
  }
}
