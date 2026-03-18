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

  async deleteExerciseList(id:string){
       const { error }= await this.client.from('exercise_lists').delete().eq('id',id);
       if (error) throw error;
  }

  async saveExercise(exercise: ExerciseInput): Promise<Exercise> {
    const { data, error } = await this.client
      .from('exercises')
      .insert(this.toDbExercise(exercise))
      .select();

    if (error) throw error;
    return this.fromDbExercise(data[0]);
  }

  async deleteExercise(exerciseId: string): Promise<void> {
  const { error } = await this.client
    .from('exercises')
    .delete()
    .eq('id', exerciseId);
  if (error) throw error;
}

  async updateExercise(exercise: Exercise) {
    const { data, error } = await this.client
      .from('exercises')
      .update(this.toDbExercise(exercise))
      .eq('id', exercise.id)
      .select();

    if (error) throw error;
    return this.fromDbExercise(data[0]);
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
          return this.fromDbExercise(ex);
        }),
    }));
  }

  private fromDbExercise(raw: any): Exercise {
  return {
    id: raw.id,
    title: raw.title,
    fen: raw.fen,
    exerciseType:raw.exercise_type,
    solutions: raw.solutions,
    commonMistakes: raw.common_mistakes,
    defaultHint: raw.default_hint,
    whiteWinConditions:raw.white_win_conditions,
    blackWinConditions:raw.black_win_conditions
  };
}
private toDbExercise(exercise: ExerciseInput) {
  return {
    title: exercise.title,
    fen: exercise.fen,
    exercise_type:exercise.exerciseType,
    solutions: exercise.solutions,
    common_mistakes: exercise.commonMistakes,
    default_hint: exercise.defaultHint,
    white_win_conditions:exercise.whiteWinConditions,
    black_win_conditions:exercise.blackWinConditions
  };
}
}
