import { Component, computed, inject, signal, model } from '@angular/core';
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
export class ExercisesLayout {
  exerciseService = inject(ExerciseService);
  isListCreationActive = signal<boolean>(false);
  title = model<string>('');
  exerciseType = model<ExerciseType>('puzzle');
  router = inject(Router);
  selectedListId = signal<string | null>(null);

  draggedExerciseId = signal<string | null>(null);
  dropTargetId = signal<string | null>(null);
  dropPosition = signal<'above' | 'below'>('below');

  selectedList = computed(
    () => this.exerciseService.exerciseLists().find((l) => l.id === this.selectedListId()) ?? null,
  );

  addExercise(listId: string) {
    this.router.navigate([`/exercises/create/${listId}`]);
  }

  importFromLichess(listId: string) {
    this.router.navigate([`/exercises/lichess/${listId}`]);
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

  // --- Exercise reordering ---
  onExerciseDragStart(exercise: Exercise, event: DragEvent): void {
    this.draggedExerciseId.set(exercise.id);
    event.dataTransfer?.setData('text/plain', exercise.id); // required for Firefox
  }

  onExerciseDragOver(exercise: Exercise, event: DragEvent): void {
    event.preventDefault();
    this.dropTargetId.set(exercise.id);
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dropPosition.set(event.clientY < rect.top + rect.height / 2 ? 'above' : 'below');
  }

  onExerciseDragLeave(): void {
    this.dropTargetId.set(null);
  }

  onExerciseDrop(targetExercise: Exercise, event: DragEvent): void {
    event.preventDefault();
    const draggedId = this.draggedExerciseId();
    this.dropTargetId.set(null);
    this.draggedExerciseId.set(null);

    const list = this.selectedList();
    if (!list || !draggedId || draggedId === targetExercise.id) return;

    const exercises = [...list.exercises];
    const fromIndex = exercises.findIndex((e) => e.id === draggedId);
    const toIndex = exercises.findIndex((e) => e.id === targetExercise.id);
    if (fromIndex === -1 || toIndex === -1) return;

    exercises.splice(fromIndex, 1);
    const insertAt = this.dropPosition() === 'above' ? toIndex : toIndex + 1;
    // splice index shifts by -1 if we removed from before the target
    const adjustedIndex = fromIndex < toIndex ? insertAt - 1 : insertAt;
    exercises.splice(adjustedIndex, 0, list.exercises[fromIndex]);

    this.exerciseService.reorderExercises(list.id, exercises);
  }

  onExerciseDragEnd(): void {
    this.draggedExerciseId.set(null);
    this.dropTargetId.set(null);
  }
}
