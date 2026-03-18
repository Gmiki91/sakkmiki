import { Component, inject, signal, model, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import {
  ExerciseListInput,
  ExerciseList as List,
} from '../../../shared/models/exercise-list.model';
import { MatFormField, MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { Exercise } from '../../../shared/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { ExerciseListPicker } from '../../../shared/components/exercise-list-picker/exercise-list-picker';
import { MatIcon } from '@angular/material/icon';
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
    MatIcon
  ],
  templateUrl: './exercises-layout.html',
  styleUrl: './exercises-layout.scss',
})
export class ExercisesLayout implements OnInit {
  exerciseService = inject(ExerciseService);
  isListCreationActive = signal<boolean>(false);
  title = model<string>('');
  router = inject(Router);
  selectedList = signal<List | null>(null);

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
    const isOkDelete: boolean = confirm('Are you sure you?');
    if (!isOkDelete) return
    await this.exerciseService.deleteExercise(id);
    this.selectedList.update((list) =>
      list ? { ...list, exercises: list.exercises.filter((ex) => ex.id !== id) } : null,
    );
    if (this.router.url.includes(id)) {
     this.router.navigate(['/exercises']);
    }
  }
  addList() {
    if (this.isListCreationActive()) {
      const list: ExerciseListInput = { title: this.title() };
      this.exerciseService.addExerciseList(list);
      this.isListCreationActive.set(false);
    } else {
      this.isListCreationActive.set(true);
    }
  }
  async deleteList(listId: string) {
    const isOkDelete: boolean = confirm('Are you sure you?');
    if (isOkDelete) {
      await this.exerciseService.deleteExerciseList(listId);
      this.selectedList.set(null);
    }
  }
  onListSelected(lists: List[]): void {
    this.selectedList.set(lists[0] ?? null);
  }
}
