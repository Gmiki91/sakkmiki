import { Injectable, signal, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ExerciseList, ExerciseListInput } from '../../shared/models/exercise-list.model';
import { Exercise, ExerciseInput, LichessPuzzle } from '../../shared/models/exercise.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class ExerciseService {
  supabase = inject(SupabaseService);
  exerciseLists = signal<ExerciseList[]>([]);
  isLoading = signal<boolean>(false);
  private snackbar = inject(MatSnackBar);

  async loadExerciseLists() {
    if (this.exerciseLists().length > 0) return;
    await this.withLoading(async () => {
      const lists = await this.supabase.getExerciseLists();
      this.exerciseLists.set(lists);
    });
  }

  async addExerciseList(list: ExerciseListInput) {
    await this.withLoading(async () => {
      const newList = await this.supabase.saveExerciseList(list);
      this.exerciseLists.update((lists) => [...lists, { ...newList, exercises: [],teacherId:newList.teacher_id }]);
    });
  }
  
  async deleteExerciseList(listId: string) {
    await this.withLoading(async () => {
       await this.supabase.deleteExerciseList(listId);
        this.exerciseLists.update((lists) => lists.filter(list=>list.id!==listId));
        this.snackbar.open('List deleted','',{duration:3000});
    });
  }

  async addExercise(listId:string,exercise: ExerciseInput): Promise<Exercise | null> {
    return await this.withLoading(async () => {
      const newEx = await this.supabase.saveExercise(exercise);
      this.exerciseLists.update((lists) =>
        lists.map((list) =>
          list.id === listId ? { ...list, exercises: [...list.exercises, newEx] } : list,
        ),
      );
      return newEx;
    });
  }
  async addLichessPuzzleToList(listId: string, puzzle: LichessPuzzle): Promise<Exercise | null> {
    const primaryTheme = puzzle.themes[0] ?? 'puzzle';
    const title = `${primaryTheme} (${puzzle.elo})`;
    const position = this.exerciseLists().find((list) => list.id === listId)!.exercises.length + 1;
    const exercise: ExerciseInput = {
      title,
      fen: puzzle.fen,
      exerciseType: 'puzzle',
      solutions: puzzle.solutions,
      lastMove: puzzle.lastMove ?? undefined,
      source: 'lichess',
      themes: puzzle.themes,
      elo: puzzle.elo,
      lichessId: puzzle.id,
      listId,
      position
    };
    return this.addExercise(listId, exercise);
  }

  async deleteExercise(exerciseId: string): Promise<void> {
  await this.withLoading(async () => {
    await this.supabase.deleteExercise(exerciseId);
    this.snackbar.open('Exercise deleted','',{duration:3000});
    this.exerciseLists.update(lists =>
      lists.map(list => ({
        ...list,
        exercises: list.exercises.filter(ex => ex.id !== exerciseId),
      }))
    );
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

  async reorderExercises(listId: string, reorderedExercises: Exercise[]): Promise<void> {
    // Optimistic update — UI responds instantly
    this.exerciseLists.update((lists) =>
      lists.map((list) => list.id === listId ? { ...list, exercises: reorderedExercises } : list)
    );
    // Persist in background — no loading spinner, failure shows snackbar
    try {
      await this.supabase.reorderExercises(reorderedExercises.map((e) => e.id));
    } catch (e) {
      this.snackbar.open(e instanceof Error ? e.message : 'Reorder failed', '', { duration: 2000 });
    }
  }

  getListById(id: string): boolean {
    return !!this.exerciseLists().find((list) => list.id === id);
  }

  private async withLoading<T>(fn: () => Promise<T>): Promise<T | null> {
    this.isLoading.set(true);
    try {
      return await fn();
    } catch (e) {
       if (e instanceof Error && e.name === 'NavigatorLockAcquireTimeoutError') {
        console.warn('Supabase lock timeout:', e.message);
        return null;
      }
      if(e instanceof Error){
        console.warn(e.message)
      }
      this.snackbar.open('Something went wrong', 'Dismiss', {
        duration: 4000,
      });
      return null;
    } finally {
      this.isLoading.set(false);
    }
  }
}
