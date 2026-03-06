import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  QueryList,
  ViewChildren,
  effect,
  signal,
  AfterViewInit,
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
  ],
  templateUrl: './classroom.html',
  styleUrl: './classroom.scss',
})
export class Classroom implements OnInit, OnDestroy, AfterViewInit {
  @ViewChildren('studentBoard') studentBoards!: QueryList<ChessBoard>;
  exerciseService = inject(ExerciseService);
  realtimeService = inject(RealtimeService);
  loadedExercise = signal<Exercise | null>(null);
  loadedList = signal<Exercise[]>([]);
  listTitle = signal<string>('');
  isLoadingList = signal(false);
  // Timer properties
  studentTimers = signal<Record<string, number>>({});
  private timerIntervals: Record<string, ReturnType<typeof setInterval>> = {};
  private lastExIndex: Record<string, number> = {};

  // Track which board elements already have listeners to avoid duplicates
  private listenedElements = new Set<HTMLElement>();

  // For challenge
  pendingPair = signal<string | null>(null);

  constructor() {
    // Apply shapes to the correct miniboard when studentShapes updates:
    effect(() => {
      const update = this.realtimeService.studentShapes();
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
      this.attachStudentBoardListeners();
    });
    // also run once for any boards already present
    this.attachStudentBoardListeners();
  }

  loadExerciseToDemo(ex: Exercise) {
    this.loadedExercise.set(ex);
  }

  loadListToAll(list: List) {
    this.isLoadingList.set(true);
    this.loadedList.set(list.exercises);
    this.listTitle.set(list.title);
    this.realtimeService.sendListToAll(list.exercises);
    // reset all student timers
    this.realtimeService.students().forEach((s) => this.resetTimer(s.name));
    this.lastExIndex = {};
  }

  boardConfigFor(fen: string): Config {
    return {
      fen,
      orientation: 'white',
      coordinates: false,
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      highlight: { lastMove: false, check: false },
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
      if (prev !== student.exIndex) {
        // new exercise — reset timer
        this.lastExIndex[student.name] = student.exIndex;
        this.resetTimer(student.name);
      }
    });
  }

  freezeTimers() {
    // freeze all student timers
    Object.keys(this.timerIntervals).forEach((name) => {
      clearInterval(this.timerIntervals[name]);
      delete this.timerIntervals[name];
    });
  }

  resumeTimers() {
    // resume all student timers
    this.realtimeService.students().forEach((student) => {
      this.timerIntervals[student.name] = setInterval(() => {
        this.studentTimers.update((t) => ({ ...t, [student.name]: (t[student.name] ?? 0) + 1 }));
      }, 1000);
    });
  }

  getExerciseName(exIndex: number): string {
    return this.loadedList()[exIndex]?.title ?? 'No exercise loaded';
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
    this.realtimeService.sendDroppedExercise(targetName, exercise);
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
              this.realtimeService.sendTeacherShapes(shapes, studentName);
            }
          }, 0);
        });
      }
    });
  }

  private resetTimer(name: string): void {
    clearInterval(this.timerIntervals[name]);
    this.studentTimers.update((t) => ({ ...t, [name]: 0 }));
    this.timerIntervals[name] = setInterval(() => {
      this.studentTimers.update((t) => ({ ...t, [name]: (t[name] ?? 0) + 1 }));
    }, 1000);
  }
}
