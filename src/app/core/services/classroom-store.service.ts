import { Injectable, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { DrawShape } from '@lichess-org/chessground/draw';
import { RealtimeChannel } from '@supabase/supabase-js';
import { RealtimeTransport, BroadcastEvent, SpectatorPresence } from './realtime-transport.service';
import { SupabaseService } from './supabase.service';
import { ChallengePair } from '../../shared/models/challenge-pair.model';
import { Exercise } from '../../shared/models/exercise.model';
import { ExerciseList as List } from '../../shared/models/exercise-list.model';
import { STARTING_FEN } from '../../shared/utils/chess.utils';
import { Point, StampAnnotation } from '../../shared/models/drawing.model';
import { TeachingConceptListItem } from '../../shared/models/teaching-concept.model';
import { Chess } from 'chess.js';

export type { SpectatorPresence };
export type ClassroomMode = 'normal' | 'gathered' | 'simul';
export type StudentState = {
  name: string;
  online: boolean;
  lastSeen: number;
  exIndex: number;
  locked: boolean;
  awaitingRedo: boolean;
  awaitingStamp: boolean;
  fen?: string;
};
@Injectable({ providedIn: 'root' })
export class ClassroomStore {
  private transport = inject(RealtimeTransport);
  private supabase = inject(SupabaseService);

  // ----------------------------------------------------------------
  // State signals
  // ----------------------------------------------------------------

  readonly classroomId = signal('');
  readonly studentName = signal('');
  readonly isJoined = signal(false);
  readonly isSpectator = signal(false);

  // Shared
  readonly mode = signal<ClassroomMode>('normal');
  readonly autoRedo = signal(true);
  readonly autoProgress = signal(true);
  readonly autoRedoOverrides = signal<Record<string, boolean>>({});
  readonly autoProgressOverrides = signal<Record<string, boolean>>({});
  readonly challengePairs = signal<ChallengePair[]>([]);
  readonly challengeMove = signal<{
    white: string; black: string; fen: string; from: string; to: string; over?: boolean;
  } | null>(null);
  readonly loadedList = signal<Exercise[]>([]);
  readonly loadedListTitle = signal<string>('');
  readonly droppedExercises = signal<Record<string, Exercise>>({});
  readonly sharedArrows = signal<{name:string, arrows:DrawShape[]}|null>(null);
  readonly curtainClosed = signal(true);

  // Teacher-side
  readonly requestStudentState = signal(0); 
  readonly students = signal<StudentState[]>([]);
  readonly spectators = signal<SpectatorPresence[]>([]);
  readonly assignedLists = signal<Record<string, Exercise[]>>({});
  readonly miniboardArrows = signal<{ name: string; shapes: DrawShape[] } | null>(null);
  readonly incomingDrawingPoints = signal<{
    studentName: string; strokeId: string; color: string; points: Point[];
  } | null>(null);
  readonly incomingDrawingCommit = signal<{ strokeId: string } | null>(null);
  readonly incomingDrawingColor = signal<{ studentName: string; color: string } | null>(null);
  readonly incomingDrawingClear = signal<{ studentName: string } | null>(null);
  readonly incomingTeachingOverlay = signal<TeachingConceptListItem[] | null>(null);
  readonly incomingStampAnnotation = signal<StampAnnotation | null>(null);
  readonly incomingStampAnnotationClear = signal<{ studentName: string } | null>(null);

  // Simul
  readonly incomingSimulTeacherMove = signal<{ studentName: string; fen: string; from: string; to: string,capture:boolean } | null>(null);
  readonly incomingSimulStudentMove = signal<{ studentName: string; fen: string; from: string; to: string } | null>(null);

  // Student-side
  readonly currentStudentFen = signal<string>(STARTING_FEN);

  readonly teacherFen = signal(STARTING_FEN);
  readonly loadedExercises = signal<Exercise[]>([]);
  readonly assignedExercises = signal<Exercise[]>([]);
  readonly droppedExercise = signal<Exercise | null>(null);
  readonly resync$ = new Subject<string>();
  readonly reset$ = new Subject<string>();
  readonly resume$ = new Subject<string>();
  readonly stamp$ = new Subject<string>();
  readonly lock$ = new Subject<string>();
  readonly unlock$ = new Subject<string>();
  readonly kick$ = new Subject<string>();
  readonly mushroomType = signal<string|null>(null);
  readonly whiteBoardText = signal<string>('');

  private previousStudentNames = new Set<string>();

  // Callback for classroom component to react to presence sync
  onStudentsUpdate: ((students: StudentState[]) => void) | null = null;

  // Lobby presence channel — tracks this user as a participant for the lobby's counts
  private lobbyChannel: RealtimeChannel | null = null;

  constructor() {
    this.transport.events$
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.handleEvent(event));

    this.transport.presenceSync$
      .pipe(takeUntilDestroyed())
      .subscribe((presenceStudents) => {
        const hasNewJoiner = presenceStudents.some(s => !this.previousStudentNames.has(s.name));
        this.previousStudentNames = new Set(presenceStudents.map(s => s.name));
this.students.update(current => {
  const map = new Map(current.map(s => [s.name, s]));

  for (const p of presenceStudents) {
    const existing = map.get(p.name);

    map.set(p.name, {
      ...(existing ??{ name: p.name, exIndex: 0, locked: false, awaitingRedo: false, awaitingStamp: false}),
      online: true,
      lastSeen: Date.now()
    });
  }

  for (const [name, student] of map) {
    if (!presenceStudents.some(p => p.name === name)) {
      map.set(name, { ...student, online: false });
    }
  }

  return [...map.values()];
});
        if (hasNewJoiner) this.resyncEphemeralState();
        this.onStudentsUpdate?.(this.students());
      });

    this.transport.spectatorSync$
      .pipe(takeUntilDestroyed())
      .subscribe((spectators) => this.spectators.set(spectators));
  }

  // ----------------------------------------------------------------
  // Connection
  // ----------------------------------------------------------------

  joinAsTeacher(classroomId: string): void {
    this.classroomId.set(classroomId);
    this.isSpectator.set(false);
    this.transport.joinAsTeacher(classroomId);
    this.trackLobbyPresence(classroomId);
  }

  joinAsSpectator(classroomId: string, displayName: string): void {
    this.classroomId.set(classroomId);
    this.isSpectator.set(true);
    this.transport.joinAsSpectator(classroomId, displayName);
  }

  joinAsStudent(name: string, classroomId: string, onJoined: () => void, onError: () => void): void {
    this.classroomId.set(classroomId);
    this.studentName.set(name);
    this.isJoined.set(false);
    this.isSpectator.set(false);
    this.transport.joinAsStudent(
      classroomId,
      name,
      () => {
        this.isJoined.set(true);
        this.supabase.touchClassroom(classroomId).catch(() => {});
        this.trackLobbyPresence(classroomId);
        // Broadcast current FEN on reconnect
        if (this.currentStudentFen() !== STARTING_FEN) {
          this.broadcastStudentFen(name, this.currentStudentFen());
        }
        onJoined();
      },
    );
  }

  broadcastStudentState(state: Omit<StudentState, 'name' | 'fen'>): void {
    this.transport.send({ type: 'student_state', studentState:{name: this.studentName(),...state} });
}

  leave(): void {
    this.transport.leave();
    this.untrackLobbyPresence();
    this.isJoined.set(false);
    this.isSpectator.set(false);
  }

  private resyncEphemeralState(): void {
    this.transport.send({ type: 'curtain', closed: this.curtainClosed() });
    this.transport.send({ type: 'mushroom_type', mType: this.mushroomType() ?? '' });
    this.transport.send({ type: 'request_student_states' });
    this.transport.send({ type: 'sync_all_challenge_pairs', pairs: this.challengePairs() });
    const mode = this.mode();
    if (mode === 'gathered') this.transport.send({ type: 'gather' });
    else if (mode === 'simul') this.transport.send({ type: 'simul_start' });
    else this.transport.send({ type: 'disperse' }); //normal mode

  }

  // ----------------------------------------------------------------
  // Send methods (teacher)
  // ----------------------------------------------------------------

  requestFen(studentName:string){
    this.transport.send({ type: 'request_fen', target: studentName });
  }
  gather(): void {
    this.mode.set('gathered');
    this.transport.send({ type: 'gather' });
  }
  disperse(): void {
    this.mode.set('normal');
    this.sharedArrows.set(null);
    this.transport.send({ type: 'disperse' });
  }
  sendTeacherFen(fen: string): void { this.transport.send({ type: 'teacher_fen', fen }); }
  sendMushroomType(mType:string):void{this.transport.send({type:'mushroom_type',mType});}
  sendSharedArrows(shapes: DrawShape[], target: 'all' | string = 'all'): void {
    this.transport.send({ type: 'shared_arrows', shapes, target });
  }
  sendDroppedExercise(studentName: string, exercise: Exercise): void {
    this.droppedExercises.update((d) => ({ ...d, [studentName]: exercise }));
    this.transport.send({ type: 'dropped_exercise', studentName, exercise });
  }
  sendReset(studentName: string): void { this.transport.send({ type: 'reset', studentName }); }
  sendResume(studentName: string): void { this.transport.send({ type: 'resume', studentName }); }
  sendStamp(studentName: string): void { this.transport.send({ type: 'stamp', studentName }); }
  sendLock(studentName: string): void { this.transport.send({ type: 'lock', studentName }); }
  sendUnlock(studentName: string): void { this.transport.send({ type: 'unlock', studentName }); }
  sendAutoRedo(value: boolean, studentName?: string): void {
    if (studentName) {
      this.autoRedoOverrides.update((o) => ({ ...o, [studentName]: value }));
    } else {
      this.autoRedo.set(value);
      this.autoRedoOverrides.set({});
    }
    this.transport.send({ type: 'set_auto_redo', value, studentName });
  }
  sendAutoProgress(value: boolean, studentName?: string): void {
    if (studentName) {
      this.autoProgressOverrides.update((o) => ({ ...o, [studentName]: value }));
    } else {
      this.autoProgress.set(value);
      this.autoProgressOverrides.set({});
    }
    this.transport.send({ type: 'set_auto_progress', value, studentName });
  }
  sendTeachingOverlay(concepts:TeachingConceptListItem[]): void {
    this.transport.send({ type: 'teaching_overlay_update', concepts });
  }

  sendAssignedList(studentName: string, exercises: Exercise[]): void {
    this.assignedLists.update((a) => ({ ...a, [studentName]: exercises }));
    this.transport.send({ type: 'list_assigned', studentName, exercises });
  }

  loadListToAll(list: List): void {
    this.loadedList.set(list.exercises);
    this.loadedListTitle.set(list.title);
    this.droppedExercises.set({});
    this.assignedLists.set({});
    this.transport.send({ type: 'list_loaded', exercises: list.exercises });
  }

  sendStampAnnotation(annotation: StampAnnotation): void {
    this.transport.send({ type: 'stamp_annotation', studentName: this.studentName(), annotation });
  }
  sendStampAnnotationClear(studentName: string): void {
    this.transport.send({ type: 'stamp_annotation_clear', studentName });
  }
  sendStampAnnotationClearAll(): void {
    this.transport.send({ type: 'stamp_annotation_clear_all' });
  }
  sendUpdatedText(text:string):void{
    this.transport.send({type:'white_board_text',text})
  }
  sendCurtain(closed: boolean): void {
    this.curtainClosed.set(closed);
    this.transport.send({ type: 'curtain', closed });
  }
  kickStudent(studentName:string){
    this.transport.send({type:'kick',studentName})
  }

  // ----------------------------------------------------------------
  // Simul
  // ----------------------------------------------------------------

  startSimul(): void {
    this.mode.set('simul');
    this.transport.send({ type: 'simul_start' });
  }
  stopSimul(): void {
    this.mode.set('normal');
    this.transport.send({ type: 'simul_end' });
  }
  sendSimulTeacherMove(studentName: string, fen: string, from: string, to: string,capture:boolean): void {
    this.transport.send({ type: 'simul_teacher_move', studentName, fen, from, to,capture });
  }
  sendSimulStudentMove(fen: string, from: string, to: string): void {
    this.transport.send({ type: 'simul_student_move', studentName: this.studentName(), fen, from, to });
  }

  // ----------------------------------------------------------------
  // Send methods (student)
  // ----------------------------------------------------------------

  sendMiniboardArrows(shapes: DrawShape[]): void {
    this.transport.send({ type: 'miniboard_arrows', shapes, studentName: this.studentName() });
  }
  broadcastStudentFen(studentName: string, fen: string): void {
    this.transport.send({ type: 'student_fen', studentName, fen });
  }
  sendDrawingPoints(strokeId: string, points: Point[], color: string): void {
    this.transport.send({ type: 'drawing_points', studentName: this.studentName(), strokeId, points, color });
  }
  sendDrawingCommit(strokeId: string): void { this.transport.send({ type: 'drawing_commit', strokeId }); }
  sendDrawingColor(color: string): void {
    this.transport.send({ type: 'drawing_color', studentName: this.studentName(), color });
  }
  sendDrawingClear(studentName: string): void { this.transport.send({ type: 'drawing_clear', studentName }); }
  sendDrawingClearAll(): void { this.transport.send({ type: 'drawing_clear_all' }); }

  // ----------------------------------------------------------------
  // Challenge
  // ----------------------------------------------------------------

  syncChallengePair(pair: ChallengePair): void { this.transport.send({ type: 'sync_challenge_pair', pair }); }
  sendChallengeMove(white: string, black: string, fen: string, from: string, to: string, over?: boolean): void {
    this.transport.send({ type: 'challenge_move', white, black, fen, from, to, over });
  }
  sendChallengeRemove(pair: ChallengePair): void { this.transport.send({ type: 'challenge_remove', pair }); }
  sendChallengeRematch(pair: ChallengePair): void { this.transport.send({ type: 'challenge_rematch', pair }); }

  // ----------------------------------------------------------------
  // Lobby presence
  // ----------------------------------------------------------------

  private trackLobbyPresence(classroomId: string): void {
    // Reuse existing lobby channel if already subscribed, just re-track
    if (!this.lobbyChannel) {
      this.lobbyChannel = this.supabase.createLobbyChannel()
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await this.lobbyChannel!.track({ classroomId });
          }
        });
    } else {
      this.lobbyChannel.track({ classroomId }).catch(() => {});
    }
  }

  private untrackLobbyPresence(): void {
    if (this.lobbyChannel) {
      this.supabase.realtimeClient.removeChannel(this.lobbyChannel).catch(() => {});
      this.lobbyChannel = null;
    }
  }

  // ----------------------------------------------------------------
  // Event handling
  // ----------------------------------------------------------------

  private handleEvent(event: BroadcastEvent): void {
    this.handleTeacherEvents(event);
    this.handleStudentEvents(event);
    this.handleSharedEvents(event);
  }

  private handleTeacherEvents(event: BroadcastEvent): void {
    switch (event.type) {
      case 'student_state':
        this.students.update(list =>{
          const state = event.studentState;
          return list.map(s => s.name === state.name
            ? { ...s, exIndex: state.exIndex, locked: state.locked, awaitingRedo: state.awaitingRedo, awaitingStamp: state.awaitingStamp }
            : s
          )}
        );
        break;
      case 'student_fen':
        this.students.update((list) =>
          list.map((s) => (s.name === event.studentName ? { ...s, fen: event.fen } : s)));
        break;
      
      case 'miniboard_arrows':
        this.miniboardArrows.set({ name: event.studentName, shapes: event.shapes }); break;
      case 'drawing_points':
        this.incomingDrawingPoints.set({
          studentName: event.studentName, strokeId: event.strokeId,
          color: event.color, points: event.points,
        }); break;
      case 'drawing_commit': this.incomingDrawingCommit.set({ strokeId: event.strokeId }); break;
      case 'drawing_color':
        this.incomingDrawingColor.set({ studentName: event.studentName, color: event.color }); break;
      case 'stamp_annotation': this.incomingStampAnnotation.set(event.annotation); break;
      case 'simul_student_move': this.incomingSimulStudentMove.set(event); break;     
      case 'student_ready': 
        this.resyncEphemeralState();
        this.resync$.next(event.name);
        break;
      
    }
  }

  private handleStudentEvents(event: BroadcastEvent): void {
    const myName = this.studentName();
    switch (event.type) {
      case 'request_student_states':
        this.requestStudentState.update(n => n + 1);
        break;
      case 'gather':
        this.sharedArrows.set(null); this.miniboardArrows.set(null); this.mode.set('gathered'); break;
      case 'disperse':
        this.sharedArrows.set(null); this.miniboardArrows.set(null); this.mode.set('normal'); break;
      case 'teacher_fen': this.teacherFen.set(event.fen); break;
      case 'mushroom_type': this.mushroomType.set(event.mType); break;
      case 'list_loaded':
        this.loadedExercises.set(event.exercises);
        this.assignedExercises.set([]);
        this.droppedExercise.set(null);
        break;
      case 'list_assigned':
        if (event.studentName === myName) {
          this.assignedExercises.set(event.exercises);
          this.droppedExercise.set(null);
        }
        break;
      case 'dropped_exercise':
        if (event.studentName === myName) this.droppedExercise.set(event.exercise); break;
      case 'reset':
        if (event.studentName === myName) this.reset$.next(event.studentName); break;
      case 'resume':
        if (event.studentName === myName) this.resume$.next(event.studentName); break;
      case 'stamp':
        if (event.studentName === myName) this.stamp$.next(event.studentName); break;
      case 'kick':
        if( event.studentName === myName)this.kick$.next(event.studentName); break;
      case 'set_auto_redo':
        if (!event.studentName || event.studentName === myName) this.autoRedo.set(event.value);
        break;
      case 'set_auto_progress':
        if (!event.studentName || event.studentName === myName) this.autoProgress.set(event.value);
        break;
      case 'lock':
        if (event.studentName === myName) this.lock$.next(event.studentName); break;
      case 'unlock':
        if (event.studentName === myName) this.unlock$.next(event.studentName); break;
      case 'sync_challenge_pair': {
        const { pair } = event;
        if (pair.white === myName || pair.black === myName)
          this.challengePairs.update((pairs) => [...pairs, pair]);
        break;
      }
      // ensure a reconnecting student gets their current pair state
      case 'sync_all_challenge_pairs':
        this.challengePairs.set(
          event.pairs.filter(p => p.white === myName || p.black === myName)
        );
        break;
      case 'challenge_remove':
        this.challengePairs.update((pairs) =>
          pairs.filter((p) => p.white !== event.pair.white || p.black !== event.pair.black)); break;
      case 'drawing_clear': this.incomingDrawingClear.set({ studentName: event.studentName }); break;
      case 'drawing_clear_all': this.incomingDrawingClear.set({ studentName: 'all' }); break;
      case 'teaching_overlay_update':
        this.incomingTeachingOverlay.set(event.concepts); break;
      case 'stamp_annotation_clear':
        this.incomingStampAnnotationClear.set({ studentName: event.studentName }); break;
      case 'stamp_annotation_clear_all':
        this.incomingStampAnnotationClear.set({ studentName: 'all' }); break;
      case 'simul_start': this.mode.set('simul'); break;
      case 'simul_end': this.mode.set('normal'); break;
      case 'simul_teacher_move':
        this.incomingSimulTeacherMove.set({ studentName: event.studentName, fen: event.fen, from: event.from, to: event.to,capture:event.capture });
        break;
      case 'white_board_text': this.whiteBoardText.set(event.text);break;
      case 'request_fen':if (event.target === this.studentName()) 
        this.broadcastStudentFen(this.studentName(),this.currentStudentFen());break;
      case 'curtain': this.curtainClosed.set(event.closed); break;
    }
  }

  private handleSharedEvents(event: BroadcastEvent): void {
    switch (event.type) {
      case 'shared_arrows': this.sharedArrows.set({arrows:event.shapes,name:event.target}); break;
      case 'challenge_move':
        this.challengeMove.set({
          white: event.white, black: event.black, fen: event.fen,
          from: event.from, to: event.to, over: event.over,
        }); break;
      case 'challenge_rematch':
        this.challengePairs.update((pairs) =>
          pairs.map((p) =>
            (p.white === event.pair.white && p.black === event.pair.black) ||
            (p.white === event.pair.black && p.black === event.pair.white)
              ? event.pair : p));
        this.challengeMove.set(null); break;
    }
  }
}