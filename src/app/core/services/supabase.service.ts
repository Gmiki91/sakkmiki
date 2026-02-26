import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Exercise, ExerciseInput } from '../../features/exercises/models/exercise.model';
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  async saveExerciseList(title:string){
    const { data, error } = await this.supabase
    .from('exercise_lists')
    .insert({title})
    .select();

    if(error)throw error;
    return data[0];
  }

  async saveExercise(exercise: ExerciseInput):Promise<Exercise> {
  const { data, error } = await this.supabase
    .from('exercises')
    .insert({
      title: exercise.title,
      fen: exercise.fen,
      solutions: exercise.solutions,
      common_mistakes: exercise.commonMistakes,
      default_hint: exercise.defaultHint
    })
    .select();
  
  if (error) throw error;
  return data[0];
}

async updateExercise(exercise:Exercise){
  console.log(exercise)
   const { data, error } = await this.supabase
    .from('exercises')
    .update({
      solutions: exercise.solutions,
      common_mistakes: exercise.commonMistakes,
      default_hint: exercise.defaultHint
    })
    .eq('id', exercise.id)
    .select();
  
  if (error) throw error;
  console.log(data);
  console.log(error)
  return data[0];
}

async addExerciseToList(exerciseId: string, listId: string, position: number) {
  const { error } = await this.supabase
    .from('exercise_list_items')
    .insert({ exercise_id: exerciseId, list_id: listId, position });
  
  if (error) throw error;
}

  
  async getExercises() {
    const { data, error } = await this.supabase
      .from('exercises')
      .select('*');
    
    if (error) throw error;
    return data;
  }

  async getExerciseLists() {
  const { data, error } = await this.supabase
    .from('exercise_lists')
    .select(`
      *,
      exercise_list_items (
        position,
        exercises (*)
      )
    `);

  if (error) throw error;

  return data.map(list => ({
    id: list.id,
    title: list.title,
    exercises: list.exercise_list_items
      .sort((a:{position: number}, b: {position: number}) => a.position - b.position)
      .map((item: {exercises: Exercise}) => item.exercises)
  }));
}
}
