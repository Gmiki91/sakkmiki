import { Injectable, inject, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DrawShape } from '@lichess-org/chessground/draw';
import { SupabaseService } from './supabase.service';
import { ChallengePair } from '../../shared/models/challenge-pair.model';
import { Exercise } from '../../shared/models/exercise.model';
import { Point, StampAnnotation } from '../../shared/models/drawing.model';
import { TeachingConceptListItem } from '../../shared/models/teaching-concept.model';

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
  | { type: 'mushroom_type'; mType: string }
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
  | { type: 'teaching_overlay_update'; concepts: TeachingConceptListItem[] }
  | { type: 'stamp_annotation'; studentName: string; annotation: StampAnnotation }
  | { type: 'stamp_annotation_clear'; studentName: string }
  | { type: 'stamp_annotation_clear_all' }
  | { type: 'simul_start' }
  | { type: 'simul_end' }
  | { type: 'simul_teacher_move'; studentName: string; fen: string; from: string; to: string }
  | { type: 'simul_student_move'; studentName: string; fen: string; from: string; to: string }
  | { type: 'white_board_text', text:string}

@Injectable({ providedIn: 'root' })
export class RealtimeTransport implements OnDestroy {
  private supabase = inject(SupabaseService);
  private channel!: RealtimeChannel;
  private lastPresence: StudentPresence | null = null;
  private cleaningUp = false;
  private reconnectTimer: any;

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
      .subscribe(status=>{
        if(status==='SUBSCRIBED'){
          this.handlePresence(); // read presence state to check if students already joined
        }
      });
  }

  joinAsSpectator(channelId: string, displayName: string): void {
    this.cleanup();
    this.channel = this.supabase.realtimeClient
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.events$.next(payload);
      })
      .on('presence', { event: 'sync' }, () => this.handlePresence())
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          this.handlePresence(); // read presence state to check if students already joined
          await this.channel.track({ role: 'spectator', displayName });
        }
      });
  }

  joinAsStudent(
    channelId: string,
    initialPresence: StudentPresence,
    onJoined: () => void,
  ): void {
    this.cleanup();
    this.channel = this.supabase.realtimeClient
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: { payload: BroadcastEvent }) => {
        this.events$.next(payload);
      })
      .subscribe(async (status) => {
        console.log("status: ",status);
        if (this.cleaningUp) return;
        if (status === 'SUBSCRIBED') {
          const presence = this.lastPresence ?? initialPresence;
          await this.channel.track(presence);
          // force a local read (important)
          setTimeout(() => {
            this.channel.presenceState();
          }, 0);
          this.lastPresence = presence;
          onJoined();
        }
          if (status === 'CLOSED') {
            
    // start recovery timer
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        console.log('FORCE RECONNECT');

        const preservedPresence = this.lastPresence;
        this.cleanup();
        this.joinAsStudent(channelId, preservedPresence ?? initialPresence, onJoined);

      }, 5000); // wait 5s for auto-reconnect
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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