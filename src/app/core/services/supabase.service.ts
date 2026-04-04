import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Exercise, ExerciseInput, LichessPuzzle } from '../../shared/models/exercise.model';
import { ExerciseListInput } from '../../shared/models/exercise-list.model';
import { Classroom } from '../../shared/models/classroom.model';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // ----------------------------------------------------------------
  // Classrooms
  // ----------------------------------------------------------------

  async getClassrooms(): Promise<Classroom[]> {
    const { data, error } = await this.client
      .from('classrooms')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => this.fromDbClassroom(r));
  }

  async getClassroomById(id: string): Promise<Classroom | null> {
    const { data, error } = await this.client
      .from('classrooms')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return this.fromDbClassroom(data);
  }

  async createClassroom(name: string, teacherId:string): Promise<Classroom> {
    const { data, error } = await this.client
      .from('classrooms')
      .insert({ name, teacher_id: teacherId })
      .select()
      .single();
    if (error) throw error;
    return this.fromDbClassroom(data);
  }

  async deleteClassroom(id: string): Promise<void> {
    const { error } = await this.client.from('classrooms').delete().eq('id', id);
    if (error) throw error;
  }

  async touchClassroom(id: string): Promise<void> {
    const { error } = await this.client
      .from('classrooms')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }

  // ----------------------------------------------------------------
  // Exercise lists
  // ----------------------------------------------------------------

  async saveExerciseList(list: ExerciseListInput) {
    const { data, error } = await this.client
      .from('exercise_lists')
      .insert({ title: list.title, type: list.type })
      .select();
    if (error) throw error;
    return data[0];
  }

  async deleteExerciseList(id: string) {
    const { error } = await this.client.from('exercise_lists').delete().eq('id', id);
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
    const { error } = await this.client.from('exercises').delete().eq('id', exerciseId);
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

  async reorderExercises(listId: string, orderedExerciseIds: string[]): Promise<void> {
    const updates = orderedExerciseIds.map((exerciseId, index) => ({
      list_id: listId,
      exercise_id: exerciseId,
      position: index + 1,
    }));
    const { error } = await this.client
      .from('exercise_list_items')
      .upsert(updates, { onConflict: 'list_id,exercise_id' });
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
      type: list.type,
      exercises: list.exercise_list_items
        .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
        .map((item: { exercises: any }) => this.fromDbExercise(item.exercises)),
    }));
  }

  // ----------------------------------------------------------------
  // Lichess puzzle catalog
  // ----------------------------------------------------------------

  async searchLichessPuzzles(opts: {
    themes?: string[];
    minRating?: number;
    maxRating?: number;
    limit?: number;
    offset?: number;
  }): Promise<{ puzzles: LichessPuzzle[]; count: number }> {
    let query = this.client.from('lichess_puzzles').select('*', { count: 'exact' });

    if (opts.themes?.length)
      query = query.overlaps('themes', opts.themes);
    if (opts.minRating !== undefined)
      query = query.gte('rating', opts.minRating);
    if (opts.maxRating !== undefined)
      query = query.lte('rating', opts.maxRating);

    query = query
      .order('rating', { ascending: true })
      .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 20) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    return { puzzles: (data ?? []).map(this.fromDbLichess), count: count ?? 0 };
  }

  // ----------------------------------------------------------------
  // Private mappers
  // ----------------------------------------------------------------

  private fromDbClassroom(raw: any): Classroom {
    return {
      id: raw.id,
      name: raw.name,
      teacherId: raw.teacher_id,
      lastActiveAt: raw.last_active_at,
      createdAt: raw.created_at,
    };
  }

  private fromDbExercise(raw: any): Exercise {
    return {
      id: raw.id,
      title: raw.title,
      fen: raw.fen,
      exerciseType: raw.exercise_type,
      solutions: raw.solutions,
      commonMistakes: raw.common_mistakes,
      defaultHint: raw.default_hint,
      whiteWinConditions: raw.white_win_conditions,
      blackWinConditions: raw.black_win_conditions,
      lastMove: raw.last_move,
      source: raw.source ?? 'custom',
      themes: raw.themes ?? [],
      elo: raw.elo ?? undefined,
      lichessId: raw.lichess_id ?? undefined,
    };
  }

  private toDbExercise(exercise: ExerciseInput) {
    return {
      title: exercise.title,
      fen: exercise.fen,
      exercise_type: exercise.exerciseType,
      solutions: exercise.solutions,
      common_mistakes: exercise.commonMistakes,
      default_hint: exercise.defaultHint,
      white_win_conditions: exercise.whiteWinConditions,
      black_win_conditions: exercise.blackWinConditions,
      last_move: exercise.lastMove,
      source: exercise.source ?? 'custom',
      themes: exercise.themes ?? [],
      elo: exercise.elo ?? null,
      lichess_id: exercise.lichessId ?? null,
    };
  }

  private fromDbLichess(raw: any): LichessPuzzle {
    return {
      id: raw.id,
      fen: raw.fen,
      solutions: raw.solutions,
      lastMove: raw.last_move,
      elo: raw.rating,
      themes: raw.themes ?? [],
    };
  }
}