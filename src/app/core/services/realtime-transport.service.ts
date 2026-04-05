import { Injectable, inject, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DrawShape } from '@lichess-org/chessground/draw';
import { SupabaseService } from './supabase.service';
import { ChallengePair } from '../../shared/models/challenge-pair.model';
import { Exercise } from '../../shared/models/exercise.model';
import { Point, StampAnnotation } from '../../shared/models/drawing.model';

export type StudentPresence = {
  role: 'student';
  name: string;
  fen: string;
  status: string;
  feedback: string;
  exIndex: number;
  locked: boolean;
  awaitingStamp: boolean;
};

export type SpectatorPresence = {
  role: 'spectator';
  displayName: string;
};

export type BroadcastEvent =
  | { type: 'gather' }
  | { type: 'disperse' }
  | { type: 'teacher_fen'; fen: string }
  | { type: 'shared_arrows'; shapes: DrawShape[]; target: 'all' | string }
  | { type: 'miniboard_arrows'; shapes: DrawShape[]; studentName: string }
  | { type: 'list_loaded'; exercises: Exercise[] }
  | { type: 'list_assigned'; studentName: string; exercises: Exercise[] }
  | { type: 'dropped_exercise'; studentName: string; exercise: Exercise }
  | { type: 'sync_challenge_pair'; pair: ChallengePair }
  | { type: 'challenge_remove'; pair: ChallengePair }
  | { type: 'challenge_rematch'; pair: ChallengePair }
  | { type: 'challenge_move'; white: string; black: string; fen: string; from: string; to: string; over?: boolean }
  | { type: 'resume'; studentName: string }
  | { type: 'stamp'; studentName: string }
  | { type: 'set_auto_redo'; value: boolean; studentName?: string }
  | { type: 'set_auto_progress'; value: boolean; studentName?: string }
  | { type: 'lock'; studentName: string }
  | { type: 'unlock'; studentName: string }
  | { type: 'student_fen'; studentName: string; fen: string }
  | { type: 'drawing_points'; studentName: string; strokeId: string; color: string; points: Point[] }
  | { type: 'drawing_commit'; strokeId: string }
  | { type: 'drawing_color'; studentName: string; color: string }
  | { type: 'drawing_clear'; studentName: string }
  | { type: 'drawing_clear_all' }
  | { type: 'teaching_overlay_trigger'; conceptId: string; squares: string[] }
  | { type: 'teaching_overlay_clear' }
  | { type: 'stamp_annotation'; studentName: string; annotation: StampAnnotation }
  | { type: 'stamp_annotation_clear'; studentName: string }
  | { type: 'stamp_annotation_clear_all' }
  | { type: 'simul_start' }
  | { type: 'simul_end' }
  | { type: 'simul_teacher_move'; studentName: string; fen: string; from: string; to: string }
  | { type: 'simul_student_move'; studentName: string; fen: string; from: string; to: string }

@Injectable({ providedIn: 'root' })
export class RealtimeTransport implements OnDestroy {
  private supabase = inject(SupabaseService);
  private channel!: RealtimeChannel;
  private lastPresence: StudentPresence | null = null;
  private presenceHeartbeat?: ReturnType<typeof setInterval>;
  private cleaningUp = false;

  readonly events$ = new Subject<BroadcastEvent>();
  readonly presenceSync$ = new Subject<StudentPresence[]>();
  readonly spectatorSync$ = new Subject<SpectatorPresence[]>();

  // ----------------------------------------------------------------
  // Connection
  // ----------------------------------------------------------------

  joinAsTeacher(channelId: string): void {
    this.cleanup();
    this.channel = this.supabase.realtimeClient
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.events$.next(payload);
      })
      .on('presence', { event: 'sync' }, () => this.handlePresence())
      .subscribe();
  }

  joinAsSpectator(channelId: string, displayName: string): void {
    this.cleanup();
    this.channel = this.supabase.realtimeClient
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.events$.next(payload);
      })
      .on('presence', { event: 'sync' }, () => this.handlePresence())
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel.track({ role: 'spectator', displayName });
        }
      });
  }

  joinAsStudent(
    name: string,
    channelId: string,
    initialPresence: StudentPresence,
    onJoined: () => void,
    onError: () => void,
    retries = 0,
  ): void {
    this.cleanup();
    this.channel = this.supabase.realtimeClient
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.events$.next(payload);
      })
      .subscribe(async (status) => {
        if (this.cleaningUp) return;
        if (status === 'SUBSCRIBED') {
          if (!this.lastPresence) {
            await this.channel.track(initialPresence);
            this.lastPresence = initialPresence;
            this.startHeartbeat();
            onJoined();
          } else {
            await this.channel.track(this.lastPresence);
          }
        } else if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (this.lastPresence && retries < 3) {
            setTimeout(() => {
              this.supabase.realtimeClient.removeChannel(this.channel);
              this.joinAsStudent(name, channelId, initialPresence, onJoined, onError, retries + 1);
            }, 2000);
          } else {
            onError();
          }
        }
      });
  }

  async updatePresence(state: StudentPresence): Promise<void> {
    this.lastPresence = state;
    await this.channel.track(state);
  }

  send(event: BroadcastEvent): void {
    this.channel.send({ type: 'broadcast', event: 'classroom', payload: event });
  }

 cleanup(): void {
    this.cleaningUp = true;
    this.stopHeartbeat();
    this.lastPresence = null;
    if (this.channel) this.supabase.realtimeClient.removeChannel(this.channel);
    this.cleaningUp = false
  }

  ngOnDestroy(): void {
    this.cleanup();
    this.events$.complete();
    this.presenceSync$.complete();
    this.spectatorSync$.complete();
  }

  // ----------------------------------------------------------------
  // Private
  // ----------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.presenceHeartbeat = setInterval(async () => {
      if (this.lastPresence) await this.channel.track(this.lastPresence);
    }, 20_000);
  }

  private stopHeartbeat(): void {
    if (this.presenceHeartbeat) {
      clearInterval(this.presenceHeartbeat);
      this.presenceHeartbeat = undefined;
    }
  }

  private handlePresence(){
    const state = this.channel.presenceState<any>();
    const all = Object.values(state).flat() as any[];
    const students: StudentPresence[] = all
      .filter(p => p.role === 'student')
      .map(p => ({
        role: 'student' as const,
        name: p.name, fen: p.fen, status: p.status, feedback: p.feedback,
        exIndex: p.exIndex, locked: p.locked, awaitingStamp: p.awaitingStamp,
      }));
    const spectators: SpectatorPresence[] = all
      .filter(p => p.role === 'spectator')
      .map(p => ({ role: 'spectator' as const, displayName: p.displayName }));
    this.spectatorSync$.next(spectators);
    this.presenceSync$.next(students); 
  }
}