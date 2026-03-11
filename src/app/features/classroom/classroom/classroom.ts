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
  ChangeDetectionStrategy,
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
    StudentTimer,
  ],
  templateUrl: './classroom.html',
  styleUrl: './classroom.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Classroom implements OnInit, OnDestroy, AfterViewInit {
  @ViewChildren('studentBoard') studentBoards!: QueryList<ChessBoard>;
  @ViewChildren(StudentTimer) timers!: QueryList<StudentTimer>;
  exerciseService = inject(ExerciseService);
  realtimeService = inject(RealtimeService);
  demoExercise = signal<Exercise | null>(null);
  loadedList = signal<Exercise[]>([]);
  listTitle = signal<string>('');
  isLoadingList = signal(false);
  mushroomCollectingStudents = signal<string[]>([]);
  private lastExIndex: Record<string, number> = {};

  // Track which board elements already have listeners to avoid duplicates
  private listenedElements = new Set<HTMLElement>();

  // For challenge
  pendingPair = signal<string | null>(null);

  exerciseTitle = signal('No exercises loaded');

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
    this.listTitle.set(list.title);
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
      if (prev !== student.exIndex) {
        // new exercise — reset timer
        this.lastExIndex[student.name] = student.exIndex;
        this.resetTimer(student.name);
        const ex = this.loadedList()[student.exIndex];
        this.exerciseTitle.set(
          ex?.title ? `${this.listTitle()}/${ex?.title}` : 'No exercise loaded',
        );
        this.updateMushroomcollecting(ex?.exerciseType === 'mushroom', student.name);
      }
    });
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
    const pair = this.getPair(targetName);
    // if its a challenge board
    if (pair) {
      this.realtimeService.sendDroppedExercise(pair.white, exercise);
      this.realtimeService.sendDroppedExercise(pair.black, exercise);
    } else {
      this.realtimeService.sendDroppedExercise(targetName, exercise);
      this.resetTimer(targetName);
      this.exerciseTitle.set(exercise.title);
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
    // fallback for initial state before any move
    return { fen: STARTING_FEN };
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
    this.timers.find((t) =>t.name() === name)?.reset();
  }

  private updateMushroomcollecting(bool: boolean, name: string) {
    if (bool) this.mushroomCollectingStudents.update((arr) => [...arr, name]);
    else this.mushroomCollectingStudents.update((arr) => arr.filter((value) => value !== name));
  }
}
