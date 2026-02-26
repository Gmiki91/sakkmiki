import { Injectable, signal, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Exercise, ExerciseInput } from '../models/exercise.model';
import { ExerciseList, ExerciseListInput } from '../models/exercise-list.model';
const DEFAULT_EXERCISE: Exercise = {
  id: 'lolno',
  fen: '3k4/8/8/8/8/8/4R3/4K3 w - - 0 1',
  title: 'Exercise template',
  solutions: [],
  defaultHint: '',
};

@Injectable({ providedIn: 'root' })
export class ExerciseService {
  supabase = inject(SupabaseService);
  selectedExercise = signal<Exercise>(DEFAULT_EXERCISE);
  exerciseLists = signal<ExerciseList[]>([]);
  isLoading = signal<boolean>(false);
  private snackbar = inject(MatSnackBar);

  async loadExerciseLists() {
    await this.withLoading(async () => {
      const lists = await this.supabase.getExerciseLists();
      this.exerciseLists.set(lists);
    });
  }

  async addExerciseList(list: ExerciseListInput) {
    await this.withLoading(async () => {
      const newList = await this.supabase.saveExerciseList(list.title);
      this.exerciseLists.update((lists) => [...lists, { ...newList, exercises: [] }]);
    });
  }

  async addExercise(listId: string, exercise: ExerciseInput): Promise<Exercise | null> {
    return await this.withLoading(async () => {
      const newEx = await this.supabase.saveExercise(exercise);
      const position =
        this.exerciseLists().find((list) => list.id === listId)!.exercises.length + 1;
      // add exercise to the exercise_list_items join table
      await this.supabase.addExerciseToList(newEx.id, listId, position);
      this.exerciseLists.update((lists) =>
        lists.map((list) =>
          list.id === listId ? { ...list, exercises: [...list.exercises, newEx] } : list,
        ),
      );
      // this.setSelectedExercise(newEx);
      return newEx;
    });
  }
  async updateExercise(exercise: Exercise) {
    await this.withLoading(async () => {
      const updated = await this.supabase.updateExercise(exercise);
      this.exerciseLists.update((lists) =>
        lists.map((list) => ({
          ...list,
          exercises: list.exercises.map((ex) => (ex.id === exercise.id ? updated : ex)),
        })),
      );
      this.snackbar.open('Exercise updated', '', {
        duration: 3000,
      });
    });
  }

  setSelectedExercise(exercise: Exercise) {
    this.selectedExercise.set(exercise);
  }
  getSelectedExercise() {
    return this.selectedExercise;
  }

  getListById(id: string): boolean {
    return !!this.exerciseLists().find((list) => list.id === id);
  }

  private async withLoading<T>(fn: () => Promise<T>): Promise<T | null> {
    this.isLoading.set(true);
    try {
      return await fn();
    } catch (e) {
      this.snackbar.open(e instanceof Error ? e.message : 'Something went wrong', 'Dismiss', {
        duration: 4000,
      });
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }
}
