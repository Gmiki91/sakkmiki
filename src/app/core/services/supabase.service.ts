import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Exercise, ExerciseInput } from '../../shared/models/exercise.model';
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  async saveExerciseList(title: string) {
    const { data, error } = await this.client.from('exercise_lists').insert({ title }).select();

    if (error) throw error;
    return data[0];
  }

  async saveExercise(exercise: ExerciseInput): Promise<Exercise> {
    const { data, error } = await this.client
      .from('exercises')
      .insert({
        title: exercise.title,
        fen: exercise.fen,
        solutions: exercise.solutions,
        common_mistakes: exercise.commonMistakes,
        default_hint: exercise.defaultHint,
        skip_fen_validation: exercise.skipFenValidation
      })
      .select();

    if (error) throw error;
    return this.mapExercise(data[0]);
  }

  async updateExercise(exercise: Exercise) {
    const { data, error } = await this.client
      .from('exercises')
      .update({
        solutions: exercise.solutions,
        common_mistakes: exercise.commonMistakes,
        default_hint: exercise.defaultHint,
        skip_fen_validation: exercise.skipFenValidation
      })
      .eq('id', exercise.id)
      .select();

    if (error) throw error;
    return this.mapExercise(data[0]);
  }

  async addExerciseToList(exerciseId: string, listId: string, position: number) {
    const { error } = await this.client
      .from('exercise_list_items')
      .insert({ exercise_id: exerciseId, list_id: listId, position });
    if (error) throw error;
  }

  async getExerciseLists() {
    const { data, error } = await this.client.from('exercise_lists').select(`
      *,
      exercise_list_items (
        position,
        exercises (*)
      )
    `);

    if (error) throw error;

    return data.map((list) => ({
      id: list.id,
      title: list.title,
      exercises: list.exercise_list_items
        .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
        .map((item: { exercises: any }) => {
          const ex = item.exercises;
          return this.mapExercise(ex);
        }),
    }));
  }

  private mapExercise(raw: any): Exercise {
  return {
    id: raw.id,
    title: raw.title,
    fen: raw.fen,
    solutions: raw.solutions,
    commonMistakes: raw.common_mistakes,
    defaultHint: raw.default_hint,
    skipFenValidation: raw.skip_fen_validation,
  };
}
}
