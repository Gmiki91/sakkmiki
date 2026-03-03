import { Injectable, signal, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DrawShape } from '@lichess-org/chessground/draw';
import { Move } from 'chess.js';
import { SupabaseService } from './supabase.service';

export type StudentPresence = {
  name: string;
  fen: string;
  status: string;
  feedback: string;
  exIndex: number;
};

export type ClassroomMode = 'normal' | 'gathered';

type BroadcastEvent =
  | { type: 'gather' }
  | { type: 'disperse' }
  | { type: 'teacher_fen'; fen: string }
  | { type: 'shapes'; shapes: DrawShape[]; target: 'all' | string }
  | { type: 'student_shapes'; shapes: DrawShape[]; studentName: string }
  | { type: 'list_loaded'; exercises: unknown[] };

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private supabase = inject(SupabaseService);
  private channel!: RealtimeChannel;
  private studentName = '';

  onStudentsUpdate: ((students: StudentPresence[]) => void) | null = null;

  // --- Signals ---
  students = signal<StudentPresence[]>([]);
  mode = signal<ClassroomMode>('normal');
  teacherFen = signal<string>('');
  teacherShapes = signal<DrawShape[]>([]);
  loadedExercises = signal<unknown[]>([]);
  isJoined = signal<boolean>(false);
  studentShapes = signal<{ name: string; shapes: DrawShape[] } | null>(null);

  // ----------------------------------------------------------------
  // Teacher
  // ----------------------------------------------------------------

  joinAsTeacher(): void {
    this.channel = this.supabase.client
      .channel('classroom')
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        if (payload.type === 'gather') this.mode.set('gathered');
        if (payload.type === 'disperse') this.mode.set('normal');
        if (payload.type === 'student_shapes') {
          this.studentShapes.set({ name: payload.studentName, shapes: payload.shapes });
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState<StudentPresence>();
        const list = Object.values(state)
          .flat()
          .map((p) => ({
            name: p.name,
            fen: p.fen,
            status: p.status,
            feedback: p.feedback,
            exIndex: p.exIndex,
          }));
        this.students.set(list);
        this.onStudentsUpdate?.(list);
      })
      .subscribe();
  }

  gather(): void {
    this.broadcast({ type: 'gather' });
  }

  disperse(): void {
    this.broadcast({ type: 'disperse' });
  }

  sendTeacherFen(fen: string): void {
    this.broadcast({ type: 'teacher_fen', fen });
  }

  sendShapes(shapes: DrawShape[], target: 'all' | string = 'all'): void {
    this.broadcast({ type: 'shapes', shapes, target });
  }

  sendListToAll(exercises: unknown[]): void {
    this.broadcast({ type: 'list_loaded', exercises });
  }

  // ----------------------------------------------------------------
  // Student
  // ----------------------------------------------------------------

  joinAsStudent(name: string, onJoined: () => void): void {
    this.studentName = name;
    this.channel = this.supabase.client
      .channel('classroom')
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.handleBroadcast(payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isJoined.set(true);
          await this.trackPresence({
            name,
            fen: '',
            status: '',
            feedback: '',
            exIndex: 0,
          });
          onJoined();
        }
      });
  }

  async updatePresence(state: Omit<StudentPresence, 'name'>): Promise<void> {
    await this.channel.track({
      name: this.studentName,
      ...state,
    });
  }

  sendStudentShapes(shapes: DrawShape[]): void {
    this.broadcast({ type: 'student_shapes', shapes, studentName: this.studentName });
  }

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------

  leave(): void {
    if (this.channel) {
      this.isJoined.set(false);
      this.supabase.client.removeChannel(this.channel);
    }
  }

  // ----------------------------------------------------------------
  // Private
  // ----------------------------------------------------------------

  private broadcast(event: BroadcastEvent): void {
    this.channel.send({
      type: 'broadcast',
      event: 'classroom',
      payload: event,
    });
  }

  private async trackPresence(state: StudentPresence): Promise<void> {
    await this.channel.track(state);
  }

  private handleBroadcast(event: BroadcastEvent): void {
    switch (event.type) {
      case 'gather':
        this.teacherShapes.set([]);
        this.studentShapes.set({name:this.studentName,shapes:[]})
        this.mode.set('gathered');
        break;
      case 'disperse':
          this.teacherShapes.set([]);
        this.mode.set('normal');
        break;
      case 'teacher_fen':
        this.teacherFen.set(event.fen);
        break;
      case 'shapes':
        if (event.target === 'all' || event.target === this.studentName) {
          this.teacherShapes.set(event.shapes);
        }
        break;
      case 'list_loaded':
        this.loadedExercises.set(event.exercises);
        break;
    }
  }
}