import { Component, inject, QueryList, ViewChildren, AfterViewInit, signal, computed, effect } from '@angular/core';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { DrawingService } from '../../../core/services/drawing.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { StudentTimer } from '../timer';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltip } from '@angular/material/tooltip';
import { Config } from '@lichess-org/chessground/config';
import { Key } from '@lichess-org/chessground/types';
import { ChallengePair } from '../../../shared/models/challenge-pair.model';
import { Exercise } from '../../../shared/models/exercise.model';
import { STARTING_FEN } from '../../../shared/utils/chess.utils';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-student-roster',
  imports: [ChessBoard, StudentTimer, MatCardModule, MatButtonModule, MatIcon, MatProgressSpinnerModule, MatTooltip],
  templateUrl: './student-roster.html',
  styleUrl: './student-roster.scss',
})
export class StudentRoster implements AfterViewInit {
  @ViewChildren('studentBoard') studentBoards!: QueryList<ChessBoard>;
  @ViewChildren(StudentTimer) timers!: QueryList<StudentTimer>;

  store = inject(ClassroomStore);
  drawingService = inject(DrawingService);
  snackBar = inject(MatSnackBar);

  isLoadingList = signal(false);
  teacherLockedStudents = signal<Set<string>>(new Set());
  pendingPair = signal<string | null>(null);

  exerciseTitles = computed(() => {
    const globalList = this.store.loadedList();
    const listTitle = this.store.loadedListTitle();
    const dropped = this.store.droppedExercises();
    const assigned = this.store.assignedLists();
    const result: Record<string, string> = {};
    for (const student of this.store.students()) {
      const droppedEx = dropped[student.name];
      if (droppedEx) {
        result[student.name] = droppedEx.title;
      } else {
        const assignedList = assigned[student.name];
        const list = assignedList ?? globalList;
        const ex = list[student.exIndex];
        result[student.name] = ex ? `${ex.title}` : 'No exercise loaded';
      }
    }
    return result;
  });

  // Effective per-student values — override from store if set, otherwise fall back to global.
  // Recomputed automatically whenever overrides or global changes.
  effectiveAutoRedo = computed(() => {
    const overrides = this.store.autoRedoOverrides();
    const global = this.store.autoRedo();
    return (name: string) => overrides[name] ?? global;
  });

  effectiveAutoProgress = computed(() => {
    const overrides = this.store.autoProgressOverrides();
    const global = this.store.autoProgress();
    return (name: string) => overrides[name] ?? global;
  });

  private lastExIndex: Record<string, number> = {};
  private listenedElements = new Set<HTMLElement>();

  constructor() {
    effect(() => {
      const update = this.store.miniboardArrows();
      if (!update) return;
      const index = this.store.students().findIndex((s) => s.name === update.name);
      if (index === -1) return;
      if (this.studentBoards)
        this.studentBoards.get(index)?.api?.set({ drawable: { shapes: update.shapes } });
    });

    // Reset timer when a student moves to a new exercise
    effect(() => {
      const students = this.store.students();
      students.forEach((student) => {
        const prev = this.lastExIndex[student.name];
        if (prev === undefined) { this.lastExIndex[student.name] = student.exIndex; return; }
        if (prev !== student.exIndex) {
          this.lastExIndex[student.name] = student.exIndex;
          this.resetTimer(student.name);
        }
      });
    });
  }

  ngAfterViewInit(): void {
    this.studentBoards.changes.subscribe(() => {
      this.listenedElements.forEach((el) => {
        if (!document.contains(el)) this.listenedElements.delete(el);
      });
      this.attachBoardListeners();
    });
    this.attachBoardListeners();
  }

  boardConfigFor(fen: string, from?: string, to?: string): Config {
    return {
      fen,
      orientation: 'white',
      coordinates: false,
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      lastMove: from && to ? ([from, to] as Key[]) : [],
      highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true },
    };
  }

  handleResume(studentName: string): void {
    this.store.sendResume(studentName);
    this.store.students.update((s) => s.map((x) => x.name === studentName ? { ...x, locked: false } : x));
  }

  handleStamp(studentName: string): void {
    this.store.sendStamp(studentName);
    this.store.students.update((s) =>
      s.map((x) => x.name === studentName ? { ...x, locked: false, awaitingStamp: false } : x));
  }

  handleLock(studentName: string): void {
    const student = this.store.students().find((s) => s.name === studentName);
    if (student?.locked) {
      this.teacherLockedStudents.update((set) => { set.delete(studentName); return new Set(set); });
      this.store.sendUnlock(studentName);
      this.store.students.update((s) => s.map((x) => x.name === studentName ? { ...x, locked: false } : x));
    } else {
      this.teacherLockedStudents.update((set) => new Set(set).add(studentName));
      this.store.sendLock(studentName);
      this.store.students.update((s) => s.map((x) => x.name === studentName ? { ...x, locked: true } : x));
    }
  }

  toggleStudentAutoRedo(name: string): void {
    this.store.sendAutoRedo(!this.effectiveAutoRedo()(name), name);
  }

  toggleStudentAutoProgress(name: string): void {
    this.store.sendAutoProgress(!this.effectiveAutoProgress()(name), name);
  }

  onDrop(targetName: string, event: DragEvent): void {
    const type = event.dataTransfer?.getData('type');
    if (type === 'exercise') this.handleExerciseDrop(targetName, event);
    else if (type === 'list') this.handleListDrop(targetName, event);
    else this.handleChallengeDrop(targetName);
  }

  handleListDrop(targetName: string, event: DragEvent): void {
    const pair = this.getPair(targetName);
    if (pair) {
      this.snackBar.open("you can't assign a list to a two player game","",{duration:2000});
    } else {
      const exercises = JSON.parse(event.dataTransfer?.getData('exercises') ?? '[]');
      this.store.sendAssignedList(targetName, exercises);
      this.resetTimer(targetName);
    }
  }

  handleExerciseDrop(targetName: string, event: DragEvent): void {
    const exercise = JSON.parse(event.dataTransfer?.getData('exercise') ?? '{}') as Exercise;
    const pair = this.getPair(targetName);
    if (pair) {
      this.store.sendDroppedExercise(pair.white, exercise);
      this.store.sendDroppedExercise(pair.black, exercise);
    } else {
      this.store.sendDroppedExercise(targetName, exercise);
      this.resetTimer(targetName);
    }
  }

  handleChallengeDrop(targetName: string): void {
    const source = this.pendingPair();
    if (!source || source === targetName) { this.pendingPair.set(null); return; }
    const pair: ChallengePair = { white: source, black: targetName };
    this.store.challengePairs.update((pairs) => [...pairs, pair]);
    this.store.syncChallengePair(pair);
    this.pendingPair.set(null);
  }

  onDragStart(studentName: string): void { this.pendingPair.set(studentName); }

  getPair(studentName: string): ChallengePair | null {
    return this.store.challengePairs().find(
      (p) => p.white === studentName || p.black === studentName) ?? null;
  }

  removePair(pair: ChallengePair): void {
    this.store.challengePairs.update((pairs) =>
      pairs.filter((p) => p.white !== pair.white || p.black !== pair.black));
    this.store.sendChallengeRemove(pair);
  }

  triggerRematch(pair: ChallengePair): void {
    const swapped: ChallengePair = { white: pair.black, black: pair.white };
    this.store.challengePairs.update((pairs) =>
      pairs.map((p) => (p.white === pair.white && p.black === pair.black ? swapped : p)));
    this.store.sendChallengeRematch(swapped);
  }

  getChallengeFen(pair: ChallengePair): { fen: string; from?: string; to?: string } {
    const move = this.store.challengeMove();
    if (move && move.white === pair.white && move.black === pair.black)
      return { fen: move.fen, from: move.from, to: move.to };
    const whiteFen = this.store.students().find((s) => s.name === pair.white)?.fen;
    return whiteFen ? { fen: whiteFen } : { fen: STARTING_FEN };
  }

  freezeTimers(): void { this.timers.forEach((t) => t.stop()); }
  resumeTimers(): void { this.timers.forEach((t) => t.start()); }

  private resetTimer(name: string): void {
    this.timers.find((t) => t.name() === name)?.reset();
  }

  private attachBoardListeners(): void {
    this.studentBoards.forEach((board, index) => {
      const el = board.boardElement?.nativeElement as HTMLElement;
      if (!el || this.listenedElements.has(el)) return;
      this.listenedElements.add(el);
      const studentName = this.store.students()[index]?.name;
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      el.addEventListener('mouseup', (e: MouseEvent) => {
        if (e.button !== 0 && e.button !== 2) return;
        setTimeout(() => {
          const shapes = board.api?.state.drawable.shapes ?? [];
          if (!studentName) return;
          this.store.sendSharedArrows(shapes, studentName);
          const pair = this.getPair(studentName);
          if (pair) {
            const partner = pair.white === studentName ? pair.black : pair.white;
            this.store.sendSharedArrows(shapes, partner);
          }
        }, 0);
      });
    });
  }
}
