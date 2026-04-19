import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { Exercise, ExerciseInput, LichessPuzzle } from '../../shared/models/exercise.model';
import { ExerciseListInput } from '../../shared/models/exercise-list.model';
import { Classroom } from '../../shared/models/classroom.model';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient;
  readonly realtimeClient: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
    // Separate client for realtime — WebSocket teardown cannot block HTTP queries
    this.realtimeClient = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: { persistSession: false },
    });
  }

  // ----------------------------------------------------------------
  // Classrooms
  // ----------------------------------------------------------------

  async getClassrooms(): Promise<Classroom[]> {
    const { data, error } = await this.client
      .from('classrooms')
      .select('*, profiles(display_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(r => this.fromDbClassroom(r));
  }

  async getClassroomById(id: string): Promise<Classroom | null> {
    const { data, error } = await this.client
      .from('classrooms')
      .select('*, profiles(display_name)')
      .eq('id', id)
      .single();
    if (error) return null;
    return this.fromDbClassroom(data);
  }

  async createClassroom(name: string, teacherId: string): Promise<Classroom> {
    const { data, error } = await this.client
      .from('classrooms')
      .insert({ name, teacher_id: teacherId })
      .select('*, profiles(display_name)')
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
  // Lobby presence channel
  // ----------------------------------------------------------------

  createLobbyChannel(): RealtimeChannel {
    return this.realtimeClient.channel('lobby');
  }

  // ----------------------------------------------------------------
  // Exercise lists
  // ----------------------------------------------------------------

  async saveExerciseList(list: ExerciseListInput) {
    const { data, error } = await this.client
      .from('exercise_lists')
      .insert({ title: list.title, type: list.type, teacher_id: list.teacherId })
      .select();
    if (error) throw error;
    return data[0];
  }

  async deleteExerciseList(id: string) {
    const { error } = await this.client.from('exercise_lists').delete().eq('id', id);
    if (error) throw error;
  }

  async copyExerciseList(
    sourceExercises: Exercise[],
    newTitle: string,
    newTeacherId: string,
    type: string,
  ): Promise<{ list: any; exercises: Exercise[] }> {
    const { data: listData, error: listError } = await this.client
      .from('exercise_lists')
      .insert({ title: newTitle, type, teacher_id: newTeacherId })
      .select()
      .single();
    if (listError) throw listError;

    if (sourceExercises.length === 0) return { list: listData, exercises: [] };

    const rows = sourceExercises.map((ex, i) =>
      this.toDbExercise({ ...ex, listId: listData.id, position: i + 1 }),
    );
    const { data: exData, error: exError } = await this.client
      .from('exercises')
      .insert(rows)
      .select();
    if (exError) throw exError;

    return {
      list: listData,
      exercises: (exData ?? []).map((r: any) => this.fromDbExercise(r)),
    };
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

  async reorderExercises(orderedExerciseIds: string[]): Promise<void> {
    await Promise.all(
      orderedExerciseIds.map((id, index) =>
        this.client
          .from('exercises')
          .update({ position: index + 1 })
          .eq('id', id),
      ),
    );
  }

  async getExerciseLists() {
    const { data, error } = await this.client
      .from('exercise_lists')
      .select(`*,exercises (*)`)
      .order('position', { referencedTable: 'exercises' });
    if (error) throw error;
    return data.map((list) => ({
      id: list.id,
      title: list.title,
      type: list.type,
      teacherId: list.teacher_id,
      exercises: list.exercises
        .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
        .map((item: { exercises: any }) => this.fromDbExercise(item)),
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

    if (opts.themes?.length) query = query.overlaps('themes', opts.themes);
    if (opts.minRating !== undefined) query = query.gte('rating', opts.minRating);
    if (opts.maxRating !== undefined) query = query.lte('rating', opts.maxRating);

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
      teacherName: raw.profiles?.display_name ?? raw.teacher_id,
      lastActiveAt: raw.last_active_at,
      createdAt: raw.created_at,
    };
  }

  private fromDbExercise(raw: any): Exercise {
    return {
      id: raw.id,
      title: raw.title,
      instruction:raw.instruction,
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
      mushroomType: raw.mushroom_type,
      position: raw.position,
      listId: raw.list_id,
    };
  }

  private toDbExercise(exercise: ExerciseInput) {
    return {
      title: exercise.title,
      fen: exercise.fen,
      instruction:exercise.instruction,
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
      mushroom_type: exercise.mushroomType,
      position: exercise.position,
      list_id: exercise.listId,
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
