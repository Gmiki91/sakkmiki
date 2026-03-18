import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  QueryList,
  ViewChildren,
  effect,
  signal,
  AfterViewInit
} from '@angular/core';
import { TeacherTable } from '../teacher-table/teacher-table';
import { Exercise } from '../../../shared/models/exercise.model';
import { ExerciseList as List } from '../../../shared/models/exercise-list.model';
import { ExerciseList } from '../../../shared/components/exercise-list/exercise-list';
import { ExerciseService } from '../../../core/services/exercise.service';
import { RealtimeService, StudentPresence } from '../../../core/services/realtime.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { Config } from '@lichess-org/chessground/config';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChallengePair } from '../../../shared/models/challenge-pair.model';
import { MatIcon } from '@angular/material/icon';
import { Key } from '@lichess-org/chessground/types';
import { StudentTimer } from '../timer';
import { STARTING_FEN } from '../../../shared/utils/chess.utils';
import { MatTooltip } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ExerciseListPicker, ExerciseListPickerData } from '../../../shared/components/exercise-list-picker/exercise-list-picker';

type ConfigParam = {
  fen: string;
  from?: string;
  to?: string;
};

@Component({
  selector: 'app-classroom',
  imports: [
    TeacherTable,
    ExerciseList,
    ChessBoard,
    MatCardModule,
    MatButtonModule,
    MatIcon,
    MatProgressSpinnerModule,
    MatTooltip,
    StudentTimer,
  ],
  templateUrl: './classroom.html',
  styleUrl: './classroom.scss',
})
export class Classroom implements OnInit, OnDestroy, AfterViewInit {
  @ViewChildren('studentBoard') studentBoards!: QueryList<ChessBoard>;
  @ViewChildren(StudentTimer) timers!: QueryList<StudentTimer>;
  exerciseService = inject(ExerciseService);
  realtimeService = inject(RealtimeService);
  demoExercise = signal<Exercise | null>(null);
  loadedList = signal<Exercise[]>([]);
  loadedLists = signal<List[]>([]);
  listTitleForAll = signal<string>('');
  isLoadingList = signal(false);
  exerciseTitles = signal<Record<string, string>>({});
  mushroomCollectingStudents = signal<string[]>([]);
  teacherLockedStudents = signal<Set<string>>(new Set());
  private lastExIndex: Record<string, number> = {};
  readonly dialog = inject(MatDialog);
  // Track which board elements already have listeners to avoid duplicates
  private listenedElements = new Set<HTMLElement>();
  // For challenge
  pendingPair = signal<string | null>(null);

  constructor() {
    // Apply arrows to the correct miniboard when miniboardArrows updates:
    effect(() => {
      const update = this.realtimeService.miniboardArrows();
      if (!update) return;
      const index = this.realtimeService.students().findIndex((s) => s.name === update.name);
      if (index === -1) return;
      const board = this.studentBoards.get(index);
      board?.api?.set({ drawable: { shapes: update.shapes } });
    });
  }

  ngOnInit(): void {
    this.exerciseService.loadExerciseLists();
    this.realtimeService.joinAsTeacher();
    this.realtimeService.onStudentsUpdate = (students) => {
      this.onPresenceSync(students);
    };
  }

  ngOnDestroy(): void {
    this.realtimeService.leave();
    this.realtimeService.onStudentsUpdate = null;
  }

  ngAfterViewInit(): void {
    this.studentBoards.changes.subscribe(() => {
      // Remove stale element references that are no longer in the DOM
      this.listenedElements.forEach((el) => {
        if (!document.contains(el)) this.listenedElements.delete(el);
      });
      this.attachStudentBoardListeners();
    });
    // also run once for any boards already present
    this.attachStudentBoardListeners();
  }

  loadExerciseToDemo(ex: Exercise) {
    this.demoExercise.set(ex);
  }

  loadListToAll(list: List) {
    this.isLoadingList.set(true);
    this.loadedList.set(list.exercises);
    this.listTitleForAll.set(list.title);
    this.updateExerciseTitle(list.exercises[0], '', list.title, true);
    this.realtimeService.sendListToAll(list.exercises);
    // reset all student timers
    this.realtimeService.students().forEach((s) => this.resetTimer(s.name));
  }

  boardConfigFor(cParam: ConfigParam): Config {
    const { fen, to, from } = cParam;
    return {
      fen,
      orientation: 'white',
      coordinates: false,
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      lastMove: from && to ? ([from, to] as Key[]) : [],
      highlight: { lastMove: true, check: true },
      drawable: {
        enabled: true,
        visible: true,
      },
    };
  }

  onPresenceSync(students: StudentPresence[]): void {
    this.isLoadingList.set(false);
    students.forEach((student) => {
      const prev = this.lastExIndex[student.name];
      const isFirstSeen = prev === undefined;
      if (isFirstSeen) {
        // Just record the index, don't reset timer —
        // the timer component initializes itself when rendered
        this.lastExIndex[student.name] = student.exIndex;
        return;
      }
      if (prev !== student.exIndex) {
        // new exercise — reset timer
        this.lastExIndex[student.name] = student.exIndex;
        this.resetTimer(student.name);
        const ex = this.loadedList()[student.exIndex];
        this.updateExerciseTitle(ex, student.name, this.listTitleForAll());
        this.updateMushroomcollecting(ex?.exerciseType === 'mushroom', student.name);
      }
    });
  }
  handleResume(studentName: string) {
    this.realtimeService.sendResume(studentName);
    // Update miniboard locally immediately
    this.realtimeService.students.update((students) =>
      students.map((s) => (s.name === studentName ? { ...s, locked: false } : s)),
    );
  }

  handleStamp(studentName: string) {
    this.realtimeService.sendStamp(studentName);
    // Update miniboard locally immediately
    this.realtimeService.students.update((students) =>
      students.map((s) =>
        s.name === studentName ? { ...s, locked: false, awaitingStamp: false } : s,
      ),
    );
  }

  toggleAutoRedo(): void {
    this.realtimeService.sendAutoRedo(!this.realtimeService.autoRedo());
  }

  toggleAutoProgress(): void {
    this.realtimeService.sendAutoProgress(!this.realtimeService.autoProgress());
  }

  freezeTimers() {
    // freeze all student timers
    this.timers.forEach((timer) => timer.stop());
  }

  resumeTimers() {
    // resume all student timers
    this.timers.forEach((timer) => timer.start());
  }

  onDrop(targetName: string, event: DragEvent): void {
    const type = event.dataTransfer?.getData('type');
    if (type === 'exercise') {
      this.handleExerciseDrop(targetName, event);
    } else {
      this.handleChallengeDrop(targetName);
    }
  }
  handleExerciseDrop(targetName: string, event: DragEvent) {
    const exercise = JSON.parse(event.dataTransfer?.getData('exercise') ?? '{}') as Exercise;
    const listTitle = JSON.parse(event.dataTransfer?.getData('exercise-title') ?? '{}') as string;
    const pair = this.getPair(targetName);
    // if its a challenge board
    if (pair) {
      this.realtimeService.sendDroppedExercise(pair.white, exercise);
      this.realtimeService.sendDroppedExercise(pair.black, exercise);
    } else {
      this.realtimeService.sendDroppedExercise(targetName, exercise);
      this.resetTimer(targetName);
      this.updateExerciseTitle(exercise, targetName, listTitle);
      this.updateMushroomcollecting(exercise.exerciseType === 'mushroom', targetName);
    }
  }

  // Challenge methods
  handleChallengeDrop(targetName: string) {
    const source = this.pendingPair();
    if (!source || source === targetName) {
      this.pendingPair.set(null);
      return;
    }
    const pair: ChallengePair = { white: source, black: targetName };
    const currentPairs = this.realtimeService.challengePairs();
    this.realtimeService.challengePairs.set([...currentPairs, pair]);
    this.realtimeService.syncChallengePair(pair);
    this.pendingPair.set(null);
  }

  onDragStart(studentName: string): void {
    this.pendingPair.set(studentName);
  }

  getPair(studentName: string): ChallengePair | null {
    return (
      this.realtimeService
        .challengePairs()
        .find((p) => p.white === studentName || p.black === studentName) ?? null
    );
  }

  removePair(pair: ChallengePair): void {
    this.realtimeService.challengePairs.update((pairs) =>
      pairs.filter((p) => p.white !== pair.white || p.black !== pair.black),
    );
    this.realtimeService.sendChallengeRemove(pair);
  }

  // alternate between fens on the challengeCard
  getChallengeFen(pair: ChallengePair): { fen: string; from?: string; to?: string } {
    const move = this.realtimeService.challengeMove();
    if (move && move.white === pair.white && move.black === pair.black) {
      return { fen: move.fen, from: move.from, to: move.to };
    }
    // Fall back to white's presence FEN (both players reset to same starting FEN)
    const whiteFen = this.realtimeService.students().find((s) => s.name === pair.white)?.fen;
    if (whiteFen) return { fen: whiteFen };
    return { fen: STARTING_FEN };
  }

  triggerRematch(pair: ChallengePair): void {
    const swapped: ChallengePair = { white: pair.black, black: pair.white };
    this.realtimeService.challengePairs.update((pairs) =>
      pairs.map((p) => (p.white === pair.white && p.black === pair.black ? swapped : p)),
    );
    this.realtimeService.sendChallengeRematch(swapped);
  }

  handleLock(studentName: string) {
    if (this.realtimeService.students().find(s => s.name === studentName)?.locked) {
      this.teacherLockedStudents.update(set => { set.delete(studentName); return new Set(set); });
      this.handleResume(studentName);
    } else {
      this.teacherLockedStudents.update(set => new Set(set).add(studentName));
      this.realtimeService.sendLock(studentName);
      this.realtimeService.students.update(students =>
        students.map(s => s.name === studentName ? { ...s, locked: true } : s)
      );
    }
  }

  openPicker(): void {
   this.dialog.open(ExerciseListPicker, {
     width: '360px',
     data: {
       multiSelect: true,
       alreadySelected: this.loadedLists(),
     } 
   })
   .afterClosed()
   .subscribe((selections: List[] | null) => {
     if (!selections?.length) return;
     this.loadedLists.update(current => [...current, ...selections]);
   });
  }

  removeList(list: List): void {
    this.loadedLists.update(lists => lists.filter(l => l.id !== list.id));
  }

  private attachStudentBoardListeners(): void {
    this.studentBoards.forEach((board, index) => {
      const el = board.boardElement?.nativeElement as HTMLElement;
      if (el && !this.listenedElements.has(el)) {
        this.listenedElements.add(el);
        const studentName = this.realtimeService.students()[index]?.name;
        el.addEventListener('contextmenu', (e) => e.preventDefault());
        el.addEventListener('mouseup', (e: MouseEvent) => {
          if (e.button !== 0 && e.button !== 2) return;
          setTimeout(() => {
            const shapes = board.api?.state.drawable.shapes ?? [];
            if (studentName) {
              this.realtimeService.sendSharedArrows(shapes, studentName);
              // If this student is in a challenge pair, send arrows to the partner too
              const pair = this.getPair(studentName);
              if (pair) {
                const partner = pair.white === studentName ? pair.black : pair.white;
                this.realtimeService.sendSharedArrows(shapes, partner);
              }
            }
          }, 0);
        });
      }
    });
  }

  private resetTimer(name: string): void {
    this.timers.find((t) => t.name() === name)?.reset();
  }

  private updateMushroomcollecting(bool: boolean, name: string) {
    if (bool) this.mushroomCollectingStudents.update((arr) => [...arr, name]);
    else this.mushroomCollectingStudents.update((arr) => arr.filter((value) => value !== name));
  }

  private updateExerciseTitle(
    ex: Exercise,
    studentName: string,
    listTitle: string,
    allSame?: boolean,
  ) {
    const title = ex?.title ? `${listTitle}/${ex?.title}` : 'No exercise loaded';
    if (allSame) {
      const names = this.realtimeService.students().map((s) => s.name);
      this.exerciseTitles.set(Object.fromEntries(names.map((name) => [name, title])));
    } else {
      this.exerciseTitles.update((t) => ({ ...t, [studentName]: title }));
    }
  }
}
