import { Injectable, signal, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DrawShape } from '@lichess-org/chessground/draw';
import { SupabaseService } from './supabase.service';
import { ChallengePair } from '../../shared/models/challenge-pair.model';
import { Exercise } from '../../shared/models/exercise.model';

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
  | { type: 'shared_arrows'; shapes: DrawShape[]; target: 'all' | string }
  | { type: 'miniboard_arrows'; shapes: DrawShape[]; studentName: string }
  | { type: 'list_loaded'; exercises: Exercise[] }
  | { type: 'dropped_exercise'; studentName: string; exercise: Exercise }
  | { type: 'sync_challenge_pair'; pair: ChallengePair }
  | { type: 'challenge_remove'; pair: ChallengePair }
  | { type: 'challenge_move'; white: string; black: string; fen: string; from: string; to: string,over?:boolean };

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private supabase = inject(SupabaseService);
  private channel!: RealtimeChannel;
  studentName = signal('');

  onStudentsUpdate: ((students: StudentPresence[]) => void) | null = null;

  // --- Signals ---
  students = signal<StudentPresence[]>([]);
  mode = signal<ClassroomMode>('normal');
  teacherFen = signal<string>('');
  sharedArrows = signal<DrawShape[]>([]);
  miniboardArrows = signal<{ name: string; shapes: DrawShape[] } | null>(null);
  loadedExercises = signal<Exercise[]>([]);
  droppedExercise = signal<Exercise | null>(null);
  isJoined = signal<boolean>(false);
  challengePairs = signal<ChallengePair[]>([]);
  challengeMove = signal<{
    white: string;
    black: string;
    fen: string;
    from: string;
    to: string;
    over?:boolean;
  } | null>(null);

  // ----------------------------------------------------------------
  // Teacher
  // ----------------------------------------------------------------

  joinAsTeacher(): void {
    this.channel = this.supabase.client
      .channel('classroom')
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.handleBroadcast(payload);
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

  sendSharedArrows(shapes: DrawShape[], target: 'all' | string = 'all'): void {
    this.broadcast({ type: 'shared_arrows', shapes, target });
  }

  sendListToAll(exercises: Exercise[]): void {
    this.broadcast({ type: 'list_loaded', exercises });
  }
  sendDroppedExercise(studentName: string, exercise: Exercise): void {
    this.broadcast({ type: 'dropped_exercise', studentName, exercise });
  }
  // clearDroppedExercise(): void {
  //   this.droppedExercise.set(null);
  // }

  // ----------------------------------------------------------------
  // Student
  // ----------------------------------------------------------------

  joinAsStudent(name: string, onJoined: () => void, onError: () => void): void {
    this.studentName.set(name);
    this.channel = this.supabase.client
      .channel('classroom')
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.handleStudentBroadcast(payload);
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
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          onError();
        }
      });
  }

  async updatePresence(state: Omit<StudentPresence, 'name'>): Promise<void> {
    await this.channel.track({
      name: this.studentName(),
      ...state,
    });
  }

  sendMiniboardArrows(shapes: DrawShape[]): void {
    this.broadcast({ type: 'miniboard_arrows', shapes, studentName: this.studentName() });
  }

  // ----------------------------------------------------------------
  // Challenge
  // ----------------------------------------------------------------
  syncChallengePair(pair: ChallengePair): void {
    this.broadcast({ type: 'sync_challenge_pair', pair });
  }

  sendChallengeMove(white: string, black: string, fen: string, from: string, to: string,over?:boolean): void {
    this.broadcast({ type: 'challenge_move', white, black, fen, from, to ,over});
  }
  sendChallengeRemove(pair: ChallengePair): void {
    this.broadcast({ type: 'challenge_remove', pair });
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

  private handleStudentBroadcast(event: BroadcastEvent): void {
    switch (event.type) {
      case 'gather':
        this.sharedArrows.set([]);
        this.miniboardArrows.set(null);
        this.mode.set('gathered');
        break;
      case 'disperse':
        this.sharedArrows.set([]);
        this.miniboardArrows.set(null);
        this.mode.set('normal');
        break;
      case 'teacher_fen':
        this.teacherFen.set(event.fen);
        break;
      case 'shared_arrows':
        if (event.target === 'all' || event.target === this.studentName()) {
          this.sharedArrows.set(event.shapes);
        }
        break;
      case 'list_loaded':
        this.loadedExercises.set(event.exercises);
        this.droppedExercise.set(null);
        break;
      case 'dropped_exercise':
        if (event.studentName === this.studentName()) {
          this.droppedExercise.set(event.exercise);
        }
        break;
      default:
        this.handleBroadcast(event);
    }
  }

  private handleBroadcast(event: BroadcastEvent) {
    switch (event.type) {
      case 'shared_arrows':
        this.sharedArrows.set(event.shapes);
        break;
      case 'miniboard_arrows':
        this.miniboardArrows.set({ name: event.studentName, shapes: event.shapes });
        break;
      case 'sync_challenge_pair':
        const { pair } = event;
        if (pair.white === this.studentName() || pair.black === this.studentName()) {
          this.challengePairs.update((pairs) => [...pairs, pair]);
        }
        break;
      case 'challenge_remove':
        this.challengePairs.update((pairs) =>
          pairs.filter((p) => p.white !== event.pair.white || p.black !== event.pair.black),
        );
        break;
      case 'challenge_move':
        this.challengeMove.set({
          white: event.white,
          black: event.black,
          fen: event.fen,
          from: event.from,
          to: event.to,
          over:event.over
        });
        break;
    }
  }
}
