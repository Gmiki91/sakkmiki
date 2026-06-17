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
import { Move } from 'chess.js';


export type { SpectatorPresence };
export type ClassroomMode = 'normal' | 'gathered';
export type StudentState = {
  name: string;
  online: boolean;
  lastSeen: number;
  exIndex: number;
  locked: boolean;
  awaitingRedo: boolean;
  awaitingStamp: boolean;
  autoRedo:boolean;
  autoProgress:boolean;
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
  readonly challengePairs = signal<ChallengePair[]>([]);
  readonly challengeMove = signal<{
    white: string; black: string; fen: string; move:Move; over?: boolean;
  } | null>(null);
  readonly loadedList = signal<Exercise[]>([]);
  readonly loadedListTitle = signal<string>('');
  readonly droppedExercises = signal<Record<string, Exercise>>({});
  readonly sharedArrows = signal<{name:string, arrows:DrawShape[]}|null>(null);
  readonly curtainClosed = signal(false);

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
  readonly lastTeacherFen = signal<string>(STARTING_FEN);

  // Duel
  readonly incomingDuelTeacherMove$ = new Subject<{ studentName: string; fen: string; move:Move }>();
  readonly incomingDuelStudentMove$ = new Subject<{ studentName: string; fen: string; move:Move  }>();
  readonly isDuelActive = signal(false);
  readonly duelColor = signal<'w' | 'b'>('b');
  readonly duelConfig = signal<{ exercise: Exercise; scoreDiffWin?: number; timerMinutes?: number } | null>(null);

  // Puzzle rush
  readonly isPuzzleRushActive = signal(false);
  readonly puzzleRushDuration = signal(180);
  readonly puzzleRushTimeBonus = signal(3);
  readonly puzzleRushTimePenalty = signal(10);
  readonly puzzleRushStudentColors = signal<Record<string, string>>({});
  readonly puzzleRushProgress = signal<Record<string, { score: number; wrongMoves: number; currentIndex: number; totalPuzzles: number }>>({});
  readonly puzzleRushListId = signal('');
  readonly puzzleRushExercises = signal<Exercise[]>([]);

  // Student-side
  readonly currentStudentFen = signal<string>(STARTING_FEN);
  readonly autoRedo = signal(true);
  readonly autoProgress = signal(true);
  readonly teacherFen = signal(STARTING_FEN);
  readonly loadedExercises = signal<Exercise[]>([]);
  readonly assignedExercises = signal<Exercise[]>([]);
  readonly droppedExercise = signal<Exercise | null>(null);
  readonly resync$ = new Subject<string>();
  readonly reset$ = new Subject<string>();
  readonly resume$ = new Subject<string>();
  readonly stamp$ = new Subject<string>();
  readonly lock$ = new Subject<boolean>();
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
      console.log('[ClassroomStore] presenceSync$', JSON.stringify(presenceStudents.map(s => s.name)), 'hasNewJoiner:', hasNewJoiner);
      this.students.update(current => {
        console.log('[ClassroomStore] students before update:', current.length, current.map(s => s.name));
        const map = new Map(current.map(s => [s.name, s]));
        const presenceSet = new Set(presenceStudents.map(p => p.name));

        for (const p of presenceStudents) {
          const existing = map.get(p.name);   
          map.set(p.name, {
            ...(existing ?? { name: p.name, exIndex: 0, locked: false, awaitingRedo: false, awaitingStamp: false,autoProgress:true,autoRedo:true }),
            online: true,
            lastSeen: Date.now()
          });
        }

        for (const [name, student] of map) {
          if (!presenceSet.has(name)) {
            map.set(name, { ...student, online: false });
          }
        }

        const result = [...map.values()];
        console.log('[ClassroomStore] students after update:', result.length, result.map(s => `${s.name}:${s.online?'ON':'OFF'}`));
        return result;
      });
      if (hasNewJoiner) this.transport.send({ type: 'request_student_states' });
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

  private resyncEphemeralState(studentName: string): void {
    // Only broadcast non-default state — teacher reconnect resets signals to defaults,
    // and broadcasting empty/default values would overwrite students' valid state.
    if (this.curtainClosed()) this.transport.send({ type: 'curtain', closed: true });
    if (this.mushroomType()) this.transport.send({ type: 'mushroom_type', mType: this.mushroomType()! });

    if (this.mode() === 'gathered') {
      this.transport.send({ type: 'gather' });
      this.transport.send({ type: 'teacher_fen', fen: this.lastTeacherFen() });
    }

    // Exercise list — always use list_assigned to target only this specific student
    // This prevents existing students from receiving list_loaded and resetting their progress
    const assigned = this.assignedLists()[studentName];
    const exercises = assigned?.length ? assigned : this.loadedList();
    if (exercises.length > 0) {
      this.transport.send({ type: 'list_assigned', studentName, exercises });
    }

    // Per-student dropped exercise
    const dropped = this.droppedExercises()[studentName];
    if (dropped) {
      this.transport.send({ type: 'dropped_exercise', studentName, exercise: dropped });
    }

    // Only broadcast existing pairs — empty array would clear all students' pairs
    if (this.challengePairs().length > 0) {
      this.transport.send({ type: 'sync_all_challenge_pairs', pairs: this.challengePairs() });
    }
    
    // Whiteboard
    if (this.whiteBoardText()) {
      this.transport.send({ type: 'white_board_text', text: this.whiteBoardText() });
    }
  }

  // when student is thrown back to "main board", have an unconfigured board
  private resetFen():void{
    this.droppedExercise.set(null); this.assignedExercises.set([]); this.loadedExercises.set([]);
  }

  // ----------------------------------------------------------------
  // Send methods (teacher)
  // ----------------------------------------------------------------

  gather(): void {
    this.mode.set('gathered');
    this.transport.send({ type: 'gather' });
  }
  disperse(): void {
    this.mode.set('normal');
    this.sharedArrows.set(null);
    this.transport.send({ type: 'disperse' });
  }
  sendTeacherFen(fen: string): void {
    this.lastTeacherFen.set(fen);
    this.transport.send({ type: 'teacher_fen', fen });
  }
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
  sendLock(value: boolean,studentName: string): void { this.transport.send({ type: 'lock',value, studentName }); }
  sendAutoRedo(value: boolean, studentName: string): void {this.transport.send({ type: 'set_auto_redo', value, studentName });}
  sendAutoProgress(value: boolean, studentName: string): void {this.transport.send({ type: 'set_auto_progress', value, studentName });}
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
    this.miniboardArrows.set(null);
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

  sendPuzzleRushStart(listId: string, duration: number, timeBonus: number, timePenalty: number, studentColors: Record<string, string>, exercises: Exercise[]): void {
    this.isPuzzleRushActive.set(true);
    this.puzzleRushListId.set(listId);
    this.puzzleRushDuration.set(duration);
    this.puzzleRushTimeBonus.set(timeBonus);
    this.puzzleRushTimePenalty.set(timePenalty);
    this.puzzleRushStudentColors.set(studentColors);
    this.puzzleRushExercises.set(exercises);
    this.transport.send({ type: 'puzzle_rush_start', listId, duration, timeBonus, timePenalty, studentColors, exercises });
  }
  sendPuzzleRushEnd(): void {
    this.isPuzzleRushActive.set(false);
    this.puzzleRushProgress.set({});
    this.transport.send({ type: 'puzzle_rush_end' });
  }
  sendPuzzleRushProgress(score: number, wrongMoves: number, currentIndex: number, totalPuzzles: number): void {
    this.puzzleRushProgress.update(p => ({ ...p, [this.studentName()]: { score, wrongMoves, currentIndex, totalPuzzles } }));
    this.transport.send({ type: 'puzzle_rush_progress', studentName: this.studentName(), score, wrongMoves, currentIndex, totalPuzzles });
  }
  kickStudent(studentName:string){
    this.transport.send({type:'kick',studentName})
  }

  // ----------------------------------------------------------------
  // Duel
  // ----------------------------------------------------------------

  sendDuelStart(studentName: string, fen: string, studentColor: 'w' | 'b', exercise: Exercise, scoreDiffWin?: number, timerMinutes?: number): void {
    this.duelConfig.set({ exercise, scoreDiffWin, timerMinutes });
    this.transport.send({ type: 'duel_start', studentName, fen, studentColor, exercise, scoreDiffWin, timerMinutes });
  }
  sendDuelEnd(studentName: string): void {
    this.transport.send({ type: 'duel_end', studentName });
  }
  sendDuelTeacherMove(studentName: string, fen: string, move:Move): void {
    this.transport.send({ type: 'duel_teacher_move', studentName, fen, move });
  }
  sendDuelStudentMove(fen: string,  move:Move): void {
    this.transport.send({ type: 'duel_student_move', studentName: this.studentName(), fen,  move });
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
  sendChallengeMove(white: string, black: string, fen: string, move:Move, over?: boolean): void {
    this.transport.send({ type: 'challenge_move', white, black, fen, move, over });
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
      this.supabase.client.removeChannel(this.lobbyChannel).catch(() => {});
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
        // Reactivate student if they were marked permanently offline
        this.transport.reactivateStudent(event.studentState.name);
        this.students.update(list =>{
          const state = event.studentState;
          return list.map(s => s.name === state.name
            ? { ...s, 
              exIndex: state.exIndex, 
              locked: state.locked, 
              awaitingRedo: state.awaitingRedo, 
              awaitingStamp: state.awaitingStamp,
              autoProgress:state.autoProgress,
              autoRedo:state.autoRedo 
            }
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
      case 'duel_student_move': this.incomingDuelStudentMove$.next(event); break;
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
        this.sharedArrows.set(null); this.miniboardArrows.set(null); this.mode.set('normal');
        this.resetFen();
        break;
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
        if (event.studentName === myName){
          this.droppedExercise.set(event.exercise);
          this.challengeMove.set(null);
          }
        break;
      case 'reset':
        if (event.studentName === myName) this.reset$.next(event.studentName); break;
      case 'resume':
        if (event.studentName === myName) this.resume$.next(event.studentName); break;
      case 'stamp':
        if (event.studentName === myName) this.stamp$.next(event.studentName); break;
      case 'kick':
        if( event.studentName === myName)this.kick$.next(event.studentName); break;
      case 'set_auto_redo':
        if (event.studentName === myName) this.autoRedo.set(event.value);
        break;
      case 'set_auto_progress':
        if (event.studentName === myName) this.autoProgress.set(event.value);
        break;
      case 'lock':
        if (event.studentName === myName) this.lock$.next(event.value); break;
      case 'sync_challenge_pair': {
        const { pair } = event;
        if (pair.white === myName || pair.black === myName){
          this.challengePairs.update((pairs) => {
            const idx = pairs.findIndex(p => p.white === pair.white && p.black === pair.black);
            if (idx !== -1) {
              const updated = [...pairs];
              updated[idx] = pair;
              return updated;
            }
            return [...pairs, pair];
          });
          this.challengeMove.set(null)
        }
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
          pairs.filter((p) => p.white !== event.pair.white || p.black !== event.pair.black));
        this.challengeMove.set(null);
        if (event.pair.white === myName || event.pair.black === myName) this.resetFen();
        break;
      case 'drawing_clear': this.incomingDrawingClear.set({ studentName: event.studentName }); break;
      case 'drawing_clear_all': this.incomingDrawingClear.set({ studentName: 'all' }); break;
      case 'teaching_overlay_update':
        this.incomingTeachingOverlay.set(event.concepts); break;
      case 'stamp_annotation_clear':
        this.incomingStampAnnotationClear.set({ studentName: event.studentName }); break;
      case 'stamp_annotation_clear_all':
        this.incomingStampAnnotationClear.set({ studentName: 'all' }); break;
      case 'duel_teacher_move':
        this.incomingDuelTeacherMove$.next({ studentName: event.studentName, fen: event.fen, move: event.move});
        break;
      case 'white_board_text': this.whiteBoardText.set(event.text);break;
      case 'curtain': this.curtainClosed.set(event.closed); break;
      case 'duel_start':
        if (event.studentName === this.studentName()) {
          this.isDuelActive.set(true);
          this.duelColor.set(event.studentColor);
          this.currentStudentFen.set(event.fen);
          this.duelConfig.set({ exercise: event.exercise, scoreDiffWin: event.scoreDiffWin, timerMinutes: event.timerMinutes });
        }
        break;
      case 'duel_end':
        if (event.studentName === this.studentName()) {
          this.isDuelActive.set(false);
          this.duelConfig.set(null);
          this.resetFen();
        }
        break;
      case 'puzzle_rush_start':
        this.isPuzzleRushActive.set(true);
        this.puzzleRushDuration.set(event.duration);
        this.puzzleRushTimeBonus.set(event.timeBonus);
        this.puzzleRushTimePenalty.set(event.timePenalty);
        this.puzzleRushStudentColors.set(event.studentColors);
        this.puzzleRushExercises.set(event.exercises);
        break;
      case 'puzzle_rush_end':
        this.isPuzzleRushActive.set(false);
        break;
    }
  }

  private handleSharedEvents(event: BroadcastEvent): void {
    switch (event.type) {
      case 'shared_arrows': this.sharedArrows.set({arrows:event.shapes,name:event.target}); break;
      case 'challenge_move':
        this.challengeMove.set({
          white: event.white, black: event.black, fen: event.fen,
          move: event.move, over: event.over,
        }); break;
      case 'challenge_rematch':
        if(event.pair.black===this.studentName()||event.pair.white===this.studentName()){
          this.challengePairs.update((pairs) =>
            pairs.map((p) =>
              (p.white === event.pair.white && p.black === event.pair.black) ||
              (p.white === event.pair.black && p.black === event.pair.white)
                ? event.pair : p));
        }
        this.challengeMove.set(null); break;
      case 'puzzle_rush_progress':
        this.puzzleRushProgress.update(p => ({ ...p, [event.studentName]: { score: event.score, wrongMoves: event.wrongMoves, currentIndex: event.currentIndex, totalPuzzles: event.totalPuzzles } }));
        break;
    }
  }
}