import { Injectable, signal, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DrawShape } from '@lichess-org/chessground/draw';
import { SupabaseService } from './supabase.service';
import { ChallengePair } from '../../shared/models/challenge-pair.model';
import { Exercise } from '../../shared/models/exercise.model';
import { STARTING_FEN } from '../../shared/utils/chess.utils';
import { Point } from '../../shared/models/drawing.model';

export type StudentPresence = {
  name: string;
  fen: string;
  status: string;
  feedback: string;
  exIndex: number;
  locked: boolean;
  awaitingStamp: boolean;
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
  | { type: 'challenge_rematch'; pair: ChallengePair }
  | {
      type: 'challenge_move';
      white: string;
      black: string;
      fen: string;
      from: string;
      to: string;
      over?: boolean;
    }
  | { type: 'resume'; studentName: string }
  | { type: 'stamp'; studentName: string }
  | { type: 'set_auto_redo'; value: boolean }
  | { type: 'set_auto_progress'; value: boolean }
  | { type: 'lock'; studentName: string }
  | { type: 'unlock'; studentName: string }
  | { type: 'student_fen'; studentName: string; fen: string }
  | {
      type: 'drawing_points';
      studentName: string;
      strokeId: string;
      color: string;
      points: Point[];
    }
  | { type: 'drawing_commit'; strokeId: string }
  | { type: 'drawing_color'; studentName: string; color: string }
  | { type: 'drawing_clear'; studentName: string }
  | { type: 'drawing_clear_all' }
  | { type: 'teaching_overlay_trigger'; conceptId: string; squares: string[] }
  | { type: 'teaching_overlay_clear' };

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private supabase = inject(SupabaseService);
  private channel!: RealtimeChannel;
  private lastPresence: StudentPresence | null = null; // after network blips, Supabase heartbeat timeout, keep the last studentPresence in sync with classroom miniboard
  private presenceHeartbeat?: ReturnType<typeof setInterval>;
  studentName = signal('');

  onStudentsUpdate: ((students: StudentPresence[]) => void) | null = null;

  // --- Signals ---
  students = signal<StudentPresence[]>([]);
  mode = signal<ClassroomMode>('normal');
  autoRedo = signal<boolean>(true);
  autoProgress = signal<boolean>(true);
  resume = signal<string | null>(null);
  stamp = signal<string | null>(null);
  lock = signal<string | null>(null);
  unlock = signal<string | null>(null);
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
    over?: boolean;
  } | null>(null);

  incomingDrawingPoints = signal<{
    studentName: string;
    strokeId: string;
    color: string;
    points: Point[];
  } | null>(null);
  incomingDrawingCommit = signal<{ strokeId: string } | null>(null);
  incomingDrawingColor = signal<{ studentName: string; color: string } | null>(null);
  incomingDrawingClear = signal<{ studentName: string } | null>(null);
  incomingTeachingOverlay = signal<{ conceptId: string; squares: string[] } | null>(null);

  // ----------------------------------------------------------------
  // Teacher
  // ----------------------------------------------------------------

  joinAsTeacher(): void {
    this.channel = this.supabase.client
      .channel('classroom')
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.handleTeacherEvents(payload);
        this.handleSharedEvents(payload);
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
            locked: p.locked,
            awaitingStamp: p.awaitingStamp,
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
  sendResume(studentName: string) {
    this.broadcast({ type: 'resume', studentName });
  }
  sendStamp(studentName: string) {
    this.broadcast({ type: 'stamp', studentName });
  }
  sendLock(studentName: string) {
    this.broadcast({ type: 'lock', studentName });
  }
  sendUnlock(studentName: string) {
    this.broadcast({ type: 'unlock', studentName });
  }
  sendAutoRedo(value: boolean): void {
    this.autoRedo.set(value);
    this.broadcast({ type: 'set_auto_redo', value });
  }

  sendAutoProgress(value: boolean): void {
    this.autoProgress.set(value);
    this.broadcast({ type: 'set_auto_progress', value });
  }

  sendDrawingPoints(strokeId: string, points: Point[], color: string): void {
    this.broadcast({
      type: 'drawing_points',
      studentName: this.studentName(),
      strokeId,
      points,
      color,
    });
  }

  sendDrawingCommit(strokeId: string): void {
    this.broadcast({ type: 'drawing_commit', strokeId });
  }

  sendDrawingColor(color: string): void {
    this.broadcast({
      type: 'drawing_color',
      studentName: this.studentName(),
      color,
    });
  }

  sendDrawingClear(studentName: string): void {
    this.broadcast({ type: 'drawing_clear', studentName });
  }

  sendDrawingClearAll(): void {
    this.broadcast({ type: 'drawing_clear_all' });
  }

  sendTeachingOverlay(conceptId: string, squares: string[]): void {
    this.broadcast({ type: 'teaching_overlay_trigger', conceptId, squares });
  }

  clearTeachingOverlay(): void {
    this.broadcast({ type: 'teaching_overlay_clear' });
  }

  // ----------------------------------------------------------------
  // Student
  // ----------------------------------------------------------------

  joinAsStudent(name: string, onJoined: () => void, onError: () => void, retries = 0): void {
    this.studentName.set(name);
    this.channel = this.supabase.client
      .channel('classroom')
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.handleStudentEvents(payload);
        this.handleSharedEvents(payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (!this.isJoined()) {
            // First connection — track initial state and navigate
            this.isJoined.set(true);
            await this.trackPresence({
              name,
              fen: STARTING_FEN,
              status: '',
              feedback: '',
              exIndex: 0,
              locked: false,
              awaitingStamp: false,
            });
            this.startPresenceHeartbeat();
            onJoined();
          } else {
            // Reconnection — re-track last known state instead of resetting
            if (this.lastPresence) {
              await this.channel.track(this.lastPresence);
            }
          }
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (this.isJoined() && retries < 3) {
            // mid-session drop — silently retry
            setTimeout(() => {
              this.supabase.client.removeChannel(this.channel);
              this.joinAsStudent(name, onJoined, onError);
            }, 2000);
          } else {
            // either initial join failed, or we've exhausted retries
            onError();
          }
        }
      });
  }

  async updatePresence(state: Omit<StudentPresence, 'name'>): Promise<void> {
    const presence: StudentPresence = { name: this.studentName(), ...state };
    this.lastPresence = presence;
    await this.channel.track(presence);
  }

  sendMiniboardArrows(shapes: DrawShape[]): void {
    this.broadcast({ type: 'miniboard_arrows', shapes, studentName: this.studentName() });
  }
  broadcastStudentFen(studentName: string, fen: string): void {
    this.broadcast({ type: 'student_fen', studentName, fen });
  }

  // ----------------------------------------------------------------
  // Challenge
  // ----------------------------------------------------------------
  syncChallengePair(pair: ChallengePair): void {
    this.broadcast({ type: 'sync_challenge_pair', pair });
  }

  sendChallengeMove(
    white: string,
    black: string,
    fen: string,
    from: string,
    to: string,
    over?: boolean,
  ): void {
    this.broadcast({ type: 'challenge_move', white, black, fen, from, to, over });
  }
  sendChallengeRemove(pair: ChallengePair): void {
    this.broadcast({ type: 'challenge_remove', pair });
  }
  sendChallengeRematch(pair: ChallengePair): void {
    this.broadcast({ type: 'challenge_rematch', pair });
  }

  // ----------------------------------------------------------------
  // Cleanup
  // ----------------------------------------------------------------

  leave(): void {
    if (this.channel) {
      this.stopPresenceHeartbeat();
      this.isJoined.set(false);
      this.lastPresence = null;
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

  private startPresenceHeartbeat(): void {
    this.stopPresenceHeartbeat();
    this.presenceHeartbeat = setInterval(async () => {
      if (this.lastPresence && this.isJoined()) {
        await this.channel.track(this.lastPresence);
      }
    }, 20_000);
  }

  private stopPresenceHeartbeat(): void {
    if (this.presenceHeartbeat) {
      clearInterval(this.presenceHeartbeat);
      this.presenceHeartbeat = undefined;
    }
  }

  private handleTeacherEvents(event: BroadcastEvent): void {
    switch (event.type) {
      case 'student_fen':
        this.students.update((list) =>
          list.map((s) => (s.name === event.studentName ? { ...s, fen: event.fen } : s)),
        );
        break;
      case 'shared_arrows':
        // Teacher receives their own broadcast back via Supabase — keeps local board in sync
        this.sharedArrows.set(event.shapes);
        break;
      case 'miniboard_arrows':
        this.miniboardArrows.set({ name: event.studentName, shapes: event.shapes });
        break;
      case 'drawing_points':
        this.incomingDrawingPoints.set({
          studentName: event.studentName,
          strokeId: event.strokeId,
          color: event.color,
          points: event.points,
        });
        break;
      case 'drawing_commit':
        this.incomingDrawingCommit.set({ strokeId: event.strokeId });
        break;
      case 'drawing_color':
        this.incomingDrawingColor.set({
          studentName: event.studentName,
          color: event.color,
        });
        break;
    }
  }

  private handleStudentEvents(event: BroadcastEvent): void {
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
      case 'resume':
        if (event.studentName === this.studentName()) {
          this.resume.set(event.studentName);
        }
        break;
      case 'stamp':
        if (event.studentName === this.studentName()) {
          this.stamp.set(event.studentName);
        }
        break;
      case 'set_auto_redo':
        this.autoRedo.set(event.value);
        break;
      case 'set_auto_progress':
        this.autoProgress.set(event.value);
        break;
      case 'lock':
        if (event.studentName === this.studentName()) {
          this.lock.set(event.studentName);
        }
        break;
      case 'unlock':
        if (event.studentName === this.studentName()) {
          this.unlock.set(event.studentName);
        }
        break;
      case 'sync_challenge_pair': {
        const { pair } = event;
        if (pair.white === this.studentName() || pair.black === this.studentName()) {
          this.challengePairs.update((pairs) => [...pairs, pair]);
        }
        break;
      }
      case 'challenge_remove':
        this.challengePairs.update((pairs) =>
          pairs.filter((p) => p.white !== event.pair.white || p.black !== event.pair.black),
        );
        break;
      case 'drawing_clear':
        this.incomingDrawingClear.set({ studentName: event.studentName });
        break;
      case 'drawing_clear_all':
        this.incomingDrawingClear.set({ studentName: 'all' });
        break;
    }
  }

  private handleSharedEvents(event: BroadcastEvent): void {
    switch (event.type) {
      case 'challenge_move':
        this.challengeMove.set({
          white: event.white,
          black: event.black,
          fen: event.fen,
          from: event.from,
          to: event.to,
          over: event.over,
        });
        break;
      case 'challenge_rematch':
        this.challengePairs.update((pairs) =>
          pairs.map((p) =>
            (p.white === event.pair.white && p.black === event.pair.black) ||
            (p.white === event.pair.black && p.black === event.pair.white)
              ? event.pair
              : p,
          ),
        );
        this.challengeMove.set(null);
        break;
      case 'teaching_overlay_trigger':
        this.incomingTeachingOverlay.set({ conceptId: event.conceptId, squares: event.squares });
        break;
      case 'teaching_overlay_clear':
        this.incomingTeachingOverlay.set(null);
        break;
    }
  }
}
