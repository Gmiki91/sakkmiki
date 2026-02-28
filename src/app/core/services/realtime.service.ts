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
  timer: number;
};

export type ClassroomMode = 'normal' | 'gathered';

type BroadcastEvent =
  | { type: 'gather' }
  | { type: 'disperse' }
  | { type: 'teacher_move'; move: Move }
  | { type: 'teacher_fen'; fen: string }
  | { type: 'shapes'; shapes: DrawShape[] }
  | { type: 'list_loaded'; exercises: unknown[] };

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private supabase = inject(SupabaseService);
  private channel!: RealtimeChannel;
  private studentName = '';

  // --- Signals ---
  students = signal<StudentPresence[]>([]);
  mode = signal<ClassroomMode>('normal');
  teacherFen = signal<string>('');
  teacherShapes = signal<DrawShape[]>([]);
  loadedExercises = signal<unknown[]>([]);

  // ----------------------------------------------------------------
  // Teacher
  // ----------------------------------------------------------------

  joinAsTeacher(): void {
    this.channel = this.supabase.client
      .channel('classroom')
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel.presenceState<StudentPresence>();
        const list = Object.values(state)
          .flat()
          .map((p) => ({
            name: p.name,
            fen: p.fen,
            status: p.status,
            feedback: p.feedback,
            timer: p.timer,
          }));
        this.students.set(list);
      })
      .subscribe();
  }

  gather(): void {
    this.broadcast({ type: 'gather' });
  }

  disperse(): void {
    this.broadcast({ type: 'disperse' });
  }

  sendTeacherMove(move: Move): void {
    this.broadcast({ type: 'teacher_move', move });
  }

  sendTeacherFen(fen: string): void {
    this.broadcast({ type: 'teacher_fen', fen });
  }

  sendShapes(shapes: DrawShape[]): void {
    this.broadcast({ type: 'shapes', shapes });
  }

  sendListToAll(exercises: unknown[]): void {
    this.broadcast({ type: 'list_loaded', exercises });
  }

  // ----------------------------------------------------------------
  // Student
  // ----------------------------------------------------------------

  joinAsStudent(name: string): void {
    this.studentName = name;
    this.channel = this.supabase.client
      .channel('classroom')
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.handleBroadcast(payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.trackPresence({
            name,
            fen: '',
            status: '',
            feedback: '',
            timer: 0,
          });
        }
      });
  }

  async updatePresence(state: Omit<StudentPresence, 'name'>): Promise<void> {
    await this.channel.track({
      name: this.studentName,
      ...state,
    });
  }

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------

  leave(): void {
    if (this.channel) {
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
        this.mode.set('gathered');
        break;
      case 'disperse':
        this.mode.set('normal');
        break;
      case 'teacher_move':
        this.teacherFen.set(event.move.after);
        break;
      case 'teacher_fen':
        this.teacherFen.set(event.fen);
        break;
      case 'shapes':
        this.teacherShapes.set(event.shapes);
        break;
      case 'list_loaded':
        this.loadedExercises.set(event.exercises);
        break;
    }
  }
}