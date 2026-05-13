import { inject, Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { DrawShape } from '@lichess-org/chessground/draw';
import { ChallengePair } from '../../shared/models/challenge-pair.model';
import { Point, StampAnnotation } from '../../shared/models/drawing.model';
import { Exercise } from '../../shared/models/exercise.model';
import { TeachingConceptListItem } from '../../shared/models/teaching-concept.model';
import { StudentState } from './classroom-store.service';


interface StudentPresence {
  role: 'student';
  name: string;
}

export type SpectatorPresence ={
  role: 'spectator'; 
  displayName: string;
}


export type BroadcastEvent =
  | { type: 'request_student_states' }
  | { type: 'student_state'; studentState:StudentState}
  | { type: 'gather' }
  | { type: 'disperse' }
  | { type: 'teacher_fen'; fen: string }
  | { type: 'mushroom_type'; mType: string }
  | { type: 'shared_arrows'; shapes: DrawShape[]; target: 'all' | string }
  | { type: 'miniboard_arrows'; shapes: DrawShape[]; studentName: string }
  | { type: 'list_loaded'; exercises: Exercise[] }
  | { type: 'list_assigned'; studentName: string; exercises: Exercise[] }
  | { type: 'dropped_exercise'; studentName: string; exercise: Exercise }
  | { type: 'sync_challenge_pair'; pair: ChallengePair }
  | { type: 'sync_all_challenge_pairs'; pairs: ChallengePair[] }
  | { type: 'challenge_remove'; pair: ChallengePair }
  | { type: 'challenge_rematch'; pair: ChallengePair }
  | { type: 'challenge_move'; white: string; black: string; fen: string; from: string; to: string; over?: boolean }
  | { type: 'resume'; studentName: string }
  | { type: 'stamp'; studentName: string }
  | { type: 'reset'; studentName: string }
  | { type: 'set_auto_redo'; value: boolean; studentName?: string }
  | { type: 'set_auto_progress'; value: boolean; studentName?: string }
  | { type: 'lock'; studentName: string }
  | { type: 'unlock'; studentName: string }
  | { type: 'kick'; studentName: string }
  | { type: 'student_fen'; studentName: string; fen: string }
  | { type: 'request_fen'; target:string }
  | { type: 'drawing_points'; studentName: string; strokeId: string; color: string; points: Point[] }
  | { type: 'drawing_commit'; strokeId: string }
  | { type: 'drawing_color'; studentName: string; color: string }
  | { type: 'drawing_clear'; studentName: string }
  | { type: 'drawing_clear_all' }
  | { type: 'teaching_overlay_update'; concepts: TeachingConceptListItem[] }
  | { type: 'stamp_annotation'; studentName: string; annotation: StampAnnotation }
  | { type: 'stamp_annotation_clear'; studentName: string }
  | { type: 'stamp_annotation_clear_all' }
  | { type: 'simul_start' }
  | { type: 'simul_end' }
  | { type: 'simul_teacher_move'; studentName: string; fen: string; from: string; to: string,capture:boolean }
  | { type: 'simul_student_move'; studentName: string; fen: string; from: string; to: string }
  | { type: 'white_board_text', text:string}
  | { type: 'curtain'; closed: boolean }
  | { type: 'student_ready'; name: string }
  | { type: 'duel_start'; studentName: string; fen: string; studentColor: 'w' | 'b' }
  | { type: 'duel_end'; studentName: string }
  | { type: 'puzzle_rush_start'; listId: string; duration: number; timeBonus: number; timePenalty: number; studentColors: Record<string, string>; exercises: Exercise[] }
  | { type: 'puzzle_rush_end' }
  | { type: 'puzzle_rush_progress'; studentName: string; score: number; wrongMoves: number; currentIndex: number; totalPuzzles: number }

@Injectable({ providedIn: 'root' })
export class RealtimeTransport implements OnDestroy {
  private supabase = inject(SupabaseService);
  private channel: any = null;
  private reconnectTimer: any = null;
  private connectionId = 0;
  private destroyed = false;

  private lastJoin:
    | {
        mode: 'teacher';
        channelId: string;
      }
    | {
        mode: 'student';
        channelId: string;
        name: string;
        onJoined: () => void;
      }
    | {
        mode: 'spectator';
        channelId: string;
        displayName: string;
      }
    | null = null;

  readonly events$ = new Subject<BroadcastEvent>();
  readonly presenceSync$ = new Subject<StudentPresence[]>();
  readonly spectatorSync$ = new Subject<SpectatorPresence[]>();

  // =====================================================
  // PUBLIC
  // =====================================================

  joinAsTeacher(channelId: string): void {
    this.lastJoin = { mode: 'teacher', channelId };
    void this.connectTeacher(channelId);
  }




  joinAsStudent(
    channelId: string,
    name: string,
    onJoined: () => void
  ): void {
    this.lastJoin = { mode: 'student', channelId, name, onJoined };
    void this.connectStudent(channelId, name, onJoined);
  }

  joinAsSpectator(channelId: string, displayName: string): void {
    this.lastJoin = { mode: 'spectator', channelId, displayName };
    void this.connectSpectator(channelId, displayName);
  }

  async send(event: BroadcastEvent): Promise<void> {
    if (!this.channel) return;

    const result = await this.channel.send({
      type: 'broadcast',
      event: 'classroom',
      payload: event
    });

    if (result !== 'ok') {
      console.warn('Broadcast failed:', result);
    }
  }

  async leave(): Promise<void> {
    this.lastJoin = null;
    await this.cleanup();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    void this.cleanup();
    this.events$.complete();
    this.presenceSync$.complete();
    this.spectatorSync$.complete();
  }

  // =====================================================
  // CONNECT
  // =====================================================

  private async connectTeacher(channelId: string): Promise<void> {
    await this.cleanup();

    const id = ++this.connectionId;

    this.channel = this.supabase.client
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: any) => {
        if (id !== this.connectionId) return;
        this.events$.next(payload);
      })
      .on('presence', { event: 'sync' }, () => {
        if (id !== this.connectionId) return;
        this.handlePresence();
      });

    this.channel.subscribe(async (status: string) => {
      if (id !== this.connectionId) return;

      if (status === 'SUBSCRIBED') {
        await this.channel.track({ role: 'teacher' });
        this.handlePresence();
      }

      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        this.scheduleReconnect(id);
      }
    });
  }

  private async connectStudent(
    channelId: string,
    name: string,
    onJoined: () => void
  ): Promise<void> {
    await this.cleanup();

    const id = ++this.connectionId;

    this.channel = this.supabase.client
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: any) => {
        if (id !== this.connectionId) return;
        this.events$.next(payload);
      });

    this.channel.subscribe(async (status: string) => {
      if (id !== this.connectionId) return;

      if (status === 'SUBSCRIBED') {
        await this.channel.track({
          role: 'student',
          name
        });

        await this.send({
          type: 'student_ready',
          name
        });

        onJoined();
      }

      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        this.scheduleReconnect(id);
      }
    });
  }

  private async connectSpectator(
    channelId: string,
    displayName: string
  ): Promise<void> {
    await this.cleanup();

    const id = ++this.connectionId;

    this.channel = this.supabase.client
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: any) => {
        if (id !== this.connectionId) return;
        this.events$.next(payload);
      })
      .on('presence', { event: 'sync' }, () => {
        if (id !== this.connectionId) return;
        this.handlePresence();
      });

    this.channel.subscribe(async (status: string) => {
      if (id !== this.connectionId) return;

      if (status === 'SUBSCRIBED') {
        await this.channel.track({ role: 'spectator', displayName });
      }

      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        this.scheduleReconnect(id);
      }
    });
  }

  // =====================================================
  // RECONNECT
  // ======================================================

  private scheduleReconnect(id: number): void {
    if (this.reconnectTimer || this.destroyed) return;
    if (id !== this.connectionId) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (!this.lastJoin) return;

      if (this.lastJoin.mode === 'teacher') {
        void this.connectTeacher(this.lastJoin.channelId);
      } else if (this.lastJoin.mode === 'student') {
        void this.connectStudent(
          this.lastJoin.channelId,
          this.lastJoin.name,
          this.lastJoin.onJoined
        );
      } else if (this.lastJoin.mode === 'spectator') {
        void this.connectSpectator(
          this.lastJoin.channelId,
          this.lastJoin.displayName
        );
      }
    }, 3000);
  }

  // =====================================================
  // CLEANUP
  // =====================================================

  private async cleanup(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.channel) {
      const old = this.channel;
      this.channel = null;
      await this.supabase.client.removeChannel(old);
    }
  }

  // =====================================================
  // PRESENCE
  // =====================================================

  private handlePresence(): void {
    if (!this.channel) return;

    const state = this.channel.presenceState();
    const all = Object.values(state).flat() as any[];

    const students: StudentPresence[] = all
      .filter(p => p.role === 'student')
      .map(p => ({
        role: 'student',
        name: p.name
      }));

    const spectators: SpectatorPresence[] = all
      .filter(p => p.role === 'spectator')
      .map(p => ({
        role: 'spectator',
        displayName: p.displayName
      }));

    this.presenceSync$.next(students);
    this.spectatorSync$.next(spectators);
  }
}