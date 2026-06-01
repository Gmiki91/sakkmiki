import { inject, Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { DrawShape } from '@lichess-org/chessground/draw';
import { ChallengePair } from '../../shared/models/challenge-pair.model';
import { Point, StampAnnotation } from '../../shared/models/drawing.model';
import { Exercise } from '../../shared/models/exercise.model';
import { TeachingConceptListItem } from '../../shared/models/teaching-concept.model';
import { StudentState } from './classroom-store.service';
import { Move } from 'chess.js';

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
  | { type: 'challenge_move'; white: string; black: string; fen: string; move:Move; over?: boolean }
  | { type: 'resume'; studentName: string }
  | { type: 'stamp'; studentName: string }
  | { type: 'reset'; studentName: string }
  | { type: 'set_auto_redo'; value: boolean; studentName?: string }
  | { type: 'set_auto_progress'; value: boolean; studentName?: string }
  | { type: 'lock'; value:boolean,studentName: string }
  | { type: 'kick'; studentName: string }
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
  | { type: 'white_board_text', text:string}
  | { type: 'curtain'; closed: boolean }
  | { type: 'duel_teacher_move'; studentName: string; fen: string; move:Move }
  | { type: 'duel_student_move'; studentName: string; fen: string; move:Move }
  | { type: 'duel_start'; studentName: string; fen: string; studentColor: 'w' | 'b'; exercise: Exercise; scoreDiffWin?: number; timerMinutes?: number }
  | { type: 'duel_end'; studentName: string }
  | { type: 'puzzle_rush_start'; listId: string; duration: number; timeBonus: number; timePenalty: number; studentColors: Record<string, string>; exercises: Exercise[] }
  | { type: 'puzzle_rush_end' }
  | { type: 'puzzle_rush_progress'; studentName: string; score: number; wrongMoves: number; currentIndex: number; totalPuzzles: number }

@Injectable({ providedIn: 'root' })
export class RealtimeTransport implements OnDestroy {
  private supabase = inject(SupabaseService);
  private channel: any = null;
  private connectionId = 0;
  private lastStudentNames: string[] = [];
  private offlineGracePeriods = new Map<string, any>(); // Track pending offline timers per student
  private graceStudentNames = new Set<string>(); // Students in grace period (included in presence sync)
  private permanentlyOffline = new Set<string>(); // Students marked offline after grace period expires

  readonly events$ = new Subject<BroadcastEvent>();
  readonly presenceSync$ = new Subject<StudentPresence[]>();
  readonly spectatorSync$ = new Subject<SpectatorPresence[]>();

  // =====================================================
  // PUBLIC
  // =====================================================

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

  // Reactivate a permanently offline student (called when they send a broadcast event)
  reactivateStudent(name: string): void {
    if (this.permanentlyOffline.has(name)) {
      this.permanentlyOffline.delete(name);
      console.log(`[RealtimeTransport] Student ${name} reactivated from permanently offline`);
      this.handlePresence();
    }
  }

  async leave(): Promise<void> {
    await this.cleanup();
  }

  ngOnDestroy(): void {
    // Cleanup all grace period timers
    for (const timer of this.offlineGracePeriods.values()) {
      clearTimeout(timer);
    }
    this.offlineGracePeriods.clear();
    this.graceStudentNames.clear();
    this.permanentlyOffline.clear();
    void this.cleanup();
    this.events$.complete();
    this.presenceSync$.complete();
    this.spectatorSync$.complete();
  }

  // =====================================================
  // CONNECT
  // =====================================================

  async joinAsTeacher(channelId: string): Promise<void> {
    await this.cleanup();

    const id = ++this.connectionId;

    this.channel = this.supabase.client
      .channel(channelId)
      .on('broadcast', { event: 'classroom' }, ({ payload }: any) => {
        if (id !== this.connectionId) return;
        this.events$.next(payload);
      })
      .on('presence', { event: 'join' }, () => {
        if (id !== this.connectionId) return;
        this.handlePresence();
      })
      .on('presence', { event: 'leave' }, () => {
        if (id !== this.connectionId) return;
        this.handlePresence();
      });

    this.channel.subscribe(async (status: string) => {
      if (id !== this.connectionId) return;

      if (status === 'SUBSCRIBED') {
        await this.channel.track({ role: 'teacher' });
        this.handlePresence(); // Initial sync on first subscription
      }
    });
  }

  async joinAsStudent(
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
        onJoined();
      }
    });
  }

  async joinAsSpectator(
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
      .on('presence', { event: 'join' }, () => {
        if (id !== this.connectionId) return;
        this.handlePresence();
      })
      .on('presence', { event: 'leave' }, () => {
        if (id !== this.connectionId) return;
        this.handlePresence();
      });

    this.channel.subscribe(async (status: string) => {
      if (id !== this.connectionId) return;

      if (status === 'SUBSCRIBED') {
        await this.channel.track({ role: 'spectator', displayName });
        this.handlePresence(); // Initial sync on first subscription
      }
    });
  }

  // =====================================================
  // CLEANUP
  // =====================================================

  private async cleanup(): Promise<void> {
    // Clear all grace period timers
    for (const timer of this.offlineGracePeriods.values()) {
      clearTimeout(timer);
    }
    this.offlineGracePeriods.clear();
    this.graceStudentNames.clear();

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
    if (!state) return;

    const all = Object.values(state).flat() as any[];
    const onlineStudents = new Set(all
      .filter(p => p.role === 'student')
      .map(p => p.name));

    // Active students = currently online, minus permanently offline
    const activeStudents = new Set(
      [...onlineStudents].filter(name => !this.permanentlyOffline.has(name))
    );

    // Start grace periods for previously-online students who went offline.
    // Do NOT cancel existing grace periods on reconnect — let the timer expire naturally.
    // At expiration, we check if the student is actually online.
    for (const name of this.lastStudentNames) {
      if (!activeStudents.has(name) && !this.offlineGracePeriods.has(name) && !this.permanentlyOffline.has(name)) {
        const timer = setTimeout(() => {
          this.offlineGracePeriods.delete(name);
          this.graceStudentNames.delete(name);

          // Check if the student reconnected during the grace period
          const currentState = this.channel?.presenceState();
          if (currentState) {
            const allNow = Object.values(currentState).flat() as any[];
            const isOnline = allNow.some(p => p.role === 'student' && p.name === name);
            if (isOnline) {
              console.log(`[RealtimeTransport] Student ${name} grace period expired, stayed online`);
              this.emitPresenceSync();
              return;
            }
          }

          this.permanentlyOffline.add(name);
          console.log(`[RealtimeTransport] Student ${name} offline grace period expired, marked permanently offline`);
          this.emitPresenceSync();
        }, 15000);
        this.offlineGracePeriods.set(name, timer);
        this.graceStudentNames.add(name);
        console.log(`[RealtimeTransport] Student ${name} went offline, started 15s grace period`);
      }
    }

    this.emitPresenceSync();
  }

  private emitPresenceSync(): void {
    if (!this.channel) return;

    const state = this.channel.presenceState();
    if (!state) return;

    const all = Object.values(state).flat() as any[];
    const trackedStudentNames = new Set(
      all.filter(p => p.role === 'student').map(p => p.name)
    );

    // Build student list: currently tracked students + grace period students, minus permanently offline
    const visibleNames = new Set<string>();
    for (const name of trackedStudentNames) {
      if (!this.permanentlyOffline.has(name)) visibleNames.add(name);
    }
    for (const name of this.graceStudentNames) {
      if (!this.permanentlyOffline.has(name)) visibleNames.add(name);
    }

    const students: StudentPresence[] = [...visibleNames].map(name => ({
      role: 'student',
      name
    }));

    const spectators: SpectatorPresence[] = all
      .filter(p => p.role === 'spectator')
      .map(p => ({
        role: 'spectator',
        displayName: p.displayName
      }));

    // Check if list actually changed (avoid in-place sort mutation)
    const currentNames = [...visibleNames].sort().join(',');
    const lastNames = [...this.lastStudentNames].sort().join(',');

    if (currentNames !== lastNames) {
      console.log('[RealtimeTransport] presenceState CHANGED', JSON.stringify(students.map(s => s.name)));
      this.lastStudentNames = [...visibleNames];
      this.presenceSync$.next(students);
      this.spectatorSync$.next(spectators);
    }
  }
}