import { Injectable, signal, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DrawShape } from '@lichess-org/chessground/draw';
import { RealtimeTransport, BroadcastEvent, StudentPresence } from './realtime-transport.service';
import { ChallengePair } from '../../shared/models/challenge-pair.model';
import { Exercise } from '../../shared/models/exercise.model';
import { ExerciseList as List } from '../../shared/models/exercise-list.model';
import { STARTING_FEN } from '../../shared/utils/chess.utils';
import { Point } from '../../shared/models/drawing.model';

export type { StudentPresence };
export type ClassroomMode = 'normal' | 'gathered';

@Injectable({ providedIn: 'root' })
export class ClassroomStore {
  private transport = inject(RealtimeTransport);

  // ----------------------------------------------------------------
  // State signals
  // ----------------------------------------------------------------

  readonly studentName = signal('');
  readonly isJoined = signal(false);

  // Shared
  readonly mode = signal<ClassroomMode>('normal');
  readonly autoRedo = signal(true);
  readonly autoProgress = signal(true);
  readonly challengePairs = signal<ChallengePair[]>([]);
  readonly challengeMove = signal<{
    white: string; black: string; fen: string; from: string; to: string; over?: boolean;
  } | null>(null);
  readonly loadedList = signal<Exercise[]>([]);

  // Teacher-side
  readonly students = signal<StudentPresence[]>([]);
  readonly sharedArrows = signal<DrawShape[]>([]);
  readonly miniboardArrows = signal<{ name: string; shapes: DrawShape[] } | null>(null);
  readonly incomingDrawingPoints = signal<{
    studentName: string; strokeId: string; color: string; points: Point[];
  } | null>(null);
  readonly incomingDrawingCommit = signal<{ strokeId: string } | null>(null);
  readonly incomingDrawingColor = signal<{ studentName: string; color: string } | null>(null);
  readonly incomingDrawingClear = signal<{ studentName: string } | null>(null);
  readonly incomingTeachingOverlay = signal<{ conceptId: string; squares: string[] } | null>(null);

  // Student-side
  readonly teacherFen = signal('');
  readonly loadedExercises = signal<Exercise[]>([]);
  readonly droppedExercise = signal<Exercise | null>(null);
  readonly resume = signal<string | null>(null);
  readonly stamp = signal<string | null>(null);
  readonly lock = signal<string | null>(null);
  readonly unlock = signal<string | null>(null);

  // Callback for classroom component to react to presence sync
  onStudentsUpdate: ((students: StudentPresence[]) => void) | null = null;

  constructor() {
    this.transport.events$
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.handleEvent(event));

    this.transport.presenceSync$
      .pipe(takeUntilDestroyed())
      .subscribe((students) => {
        this.students.set(students);
        this.onStudentsUpdate?.(students);
      });
  }

  // ----------------------------------------------------------------
  // Connection
  // ----------------------------------------------------------------

  joinAsTeacher(): void {
    this.transport.joinAsTeacher();
  }

  joinAsStudent(name: string, onJoined: () => void, onError: () => void): void {
    this.studentName.set(name);
    this.isJoined.set(false);
    this.transport.joinAsStudent(
      name,
      { name, fen: STARTING_FEN, status: '', feedback: '', exIndex: 0, locked: false, awaitingStamp: false },
      () => { this.isJoined.set(true); onJoined(); },
      onError,
    );
  }

  async updatePresence(state: Omit<StudentPresence, 'name'>): Promise<void> {
    await this.transport.updatePresence({ name: this.studentName(), ...state });
  }

  leave(): void {
    this.transport.leave();
    this.isJoined.set(false);
  }

  // ----------------------------------------------------------------
  // Send methods (teacher)
  // ----------------------------------------------------------------

  gather(): void { this.transport.send({ type: 'gather' }); }
  disperse(): void { this.transport.send({ type: 'disperse' }); }
  sendTeacherFen(fen: string): void { this.transport.send({ type: 'teacher_fen', fen }); }
  sendSharedArrows(shapes: DrawShape[], target: 'all' | string = 'all'): void {
    this.transport.send({ type: 'shared_arrows', shapes, target });
  }
  sendDroppedExercise(studentName: string, exercise: Exercise): void {
    this.transport.send({ type: 'dropped_exercise', studentName, exercise });
  }
  sendResume(studentName: string): void { this.transport.send({ type: 'resume', studentName }); }
  sendStamp(studentName: string): void { this.transport.send({ type: 'stamp', studentName }); }
  sendLock(studentName: string): void { this.transport.send({ type: 'lock', studentName }); }
  sendUnlock(studentName: string): void { this.transport.send({ type: 'unlock', studentName }); }
  sendAutoRedo(value: boolean): void { this.autoRedo.set(value); this.transport.send({ type: 'set_auto_redo', value }); }
  sendAutoProgress(value: boolean): void { this.autoProgress.set(value); this.transport.send({ type: 'set_auto_progress', value }); }
  sendTeachingOverlay(conceptId: string, squares: string[]): void {
    this.transport.send({ type: 'teaching_overlay_trigger', conceptId, squares });
  }
  clearTeachingOverlay(): void { this.transport.send({ type: 'teaching_overlay_clear' }); }

  loadListToAll(list: List): void {
    this.loadedList.set(list.exercises);
    this.transport.send({ type: 'list_loaded', exercises: list.exercises });
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
  // Event handling
  // ----------------------------------------------------------------

  private handleEvent(event: BroadcastEvent): void {
    this.handleTeacherEvents(event);
    this.handleStudentEvents(event);
    this.handleSharedEvents(event);
  }

  private handleTeacherEvents(event: BroadcastEvent): void {
    switch (event.type) {
      case 'student_fen':
        this.students.update((list) =>
          list.map((s) => (s.name === event.studentName ? { ...s, fen: event.fen } : s)));
        break;
      case 'shared_arrows': this.sharedArrows.set(event.shapes); break;
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
    }
  }

  private handleStudentEvents(event: BroadcastEvent): void {
    const myName = this.studentName();
    switch (event.type) {
      case 'gather':
        this.sharedArrows.set([]); this.miniboardArrows.set(null); this.mode.set('gathered'); break;
      case 'disperse':
        this.sharedArrows.set([]); this.miniboardArrows.set(null); this.mode.set('normal'); break;
      case 'teacher_fen': this.teacherFen.set(event.fen); break;
      case 'shared_arrows':
        if (event.target === 'all' || event.target === myName) this.sharedArrows.set(event.shapes); break;
      case 'list_loaded':
        this.loadedExercises.set(event.exercises); this.droppedExercise.set(null); break;
      case 'dropped_exercise':
        if (event.studentName === myName) this.droppedExercise.set(event.exercise); break;
      case 'resume':
        if (event.studentName === myName) this.resume.set(event.studentName); break;
      case 'stamp':
        if (event.studentName === myName) this.stamp.set(event.studentName); break;
      case 'set_auto_redo': this.autoRedo.set(event.value); break;
      case 'set_auto_progress': this.autoProgress.set(event.value); break;
      case 'lock':
        if (event.studentName === myName) this.lock.set(event.studentName); break;
      case 'unlock':
        if (event.studentName === myName) this.unlock.set(event.studentName); break;
      case 'sync_challenge_pair': {
        const { pair } = event;
        if (pair.white === myName || pair.black === myName)
          this.challengePairs.update((pairs) => [...pairs, pair]);
        break;
      }
      case 'challenge_remove':
        this.challengePairs.update((pairs) =>
          pairs.filter((p) => p.white !== event.pair.white || p.black !== event.pair.black)); break;
      case 'drawing_clear': this.incomingDrawingClear.set({ studentName: event.studentName }); break;
      case 'drawing_clear_all': this.incomingDrawingClear.set({ studentName: 'all' }); break;
      case 'teaching_overlay_trigger':
        this.incomingTeachingOverlay.set({ conceptId: event.conceptId, squares: event.squares }); break;
      case 'teaching_overlay_clear': this.incomingTeachingOverlay.set(null); break;
    }
  }

  private handleSharedEvents(event: BroadcastEvent): void {
    switch (event.type) {
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
