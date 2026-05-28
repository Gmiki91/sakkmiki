import { Component, inject, input, QueryList, ViewChildren, signal, computed, effect } from '@angular/core';
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
import { STARTING_FEN, getValidMoves, isPawnPromotion, loadChess } from '../../../shared/utils/chess.utils';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Chess, Move } from 'chess.js';
import { Promotion, PromotionPiece } from "../../../shared/components/promotion/promotion";
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PromotionService } from '../../../core/services/promotion.service';
import { GameSetupDialog, GameSetupResult } from '../../../shared/components/game-setup-dialog/game-setup-dialog';

@Component({
  selector: 'app-student-roster',
  imports: [ChessBoard, StudentTimer, MatCardModule, MatButtonModule, MatIcon, MatProgressSpinnerModule, MatTooltip, Promotion],
  templateUrl: './student-roster.html',
  styleUrl: './student-roster.scss',
})
export class StudentRoster {
  @ViewChildren('studentBoard') studentBoards!: QueryList<ChessBoard>;
  @ViewChildren(StudentTimer) timers!: QueryList<StudentTimer>;

  readonly = input(false);

  store = inject(ClassroomStore);
  drawingService = inject(DrawingService);
  promotionService = inject(PromotionService);
  snackBar = inject(MatSnackBar);
  dialog = inject(MatDialog);

  isLoadingList = signal(false);
  pendingPair = signal<string | null>(null);

  duelStudents = signal<Set<string>>(new Set());
  duelColors = signal<Record<string, 'w' | 'b'>>({});
  duelOriginalFens = signal<Record<string, string>>({});
  duelChessMap = new Map<string, Chess>();
  duelConfigs = signal<Record<string, Config>>({});
  duelExercises = signal<Record<string, Exercise>>({});

  promotionAgainst = signal<string>('');

  exerciseTitles = computed(() => {
    const globalList = this.store.loadedList();
    const dropped = this.store.droppedExercises();
    const assigned = this.store.assignedLists();
    const result: Record<string, string> = {};
    for (const student of this.store.students()) {
      const droppedEx = dropped[student.name];
      if (droppedEx) {
        result[student.name] = droppedEx.title;
      } else {
        const list = assigned[student.name] ?? globalList;
        const ex = list[student.exIndex];
        result[student.name] = ex ? ex.title : 'No exercise loaded';
      }
    }
    return result;
  });

  private lastExIndex: Record<string, number> = {};

  constructor() {
    // resync student state on student (re)connect
    this.store.resync$.pipe(takeUntilDestroyed()).subscribe(studentName => {
      const pair = this.getPair(studentName);
      if (pair) {
       const challengeState = this.getChallengeFen(pair);
        if (challengeState.fen) {
          const fakeMove = { from: challengeState.from ?? '', to: challengeState.to ?? '' } as Move;
          this.store.sendChallengeMove(pair.white, pair.black, challengeState.fen, fakeMove);
        }
        return;
      }
    
      const duelChess = this.duelChessMap.get(studentName);
      if (duelChess && this.duelColors()[studentName] !== undefined) {
        const teacherColor = this.duelColors()[studentName];
        const ex = this.duelExercises()[studentName] ?? {
          id: '', title: '', fen: duelChess.fen(), exerciseType: 'challenge' as const,
          position: 0, listId: '', instruction: '',
        };
        this.store.sendDuelStart(studentName, duelChess.fen(), teacherColor === 'w' ? 'b' : 'w', ex);
        this.store.sendDuelTeacherMove(studentName, duelChess.fen(), {} as Move);
        return;
      }
    });

    // Push incoming arrows into a specific student's miniboard
    effect(() => {
      const update = this.store.miniboardArrows();
      if (!update) return;
      const index = this.store.students().findIndex(s => s.name === update.name);
      if (index === -1) return;
      this.studentBoards?.get(index)?.api?.set({ drawable: { shapes: update.shapes } });
    });

    // Reset timer and arrows when student advances to a new exercise
    effect(() => {
      const students = this.store.students();
      students.forEach(student => {
        const prev = this.lastExIndex[student.name];
        if (prev === undefined) { this.lastExIndex[student.name] = student.exIndex; return; }
        if (prev !== student.exIndex) {
          this.lastExIndex[student.name] = student.exIndex;
          this.resetTimer(student.name);
          this.store.miniboardArrows.set({ name: student.name, shapes: [] });
        }
      });
    });

    // Duel: receive student move, update teacher miniboard
    this.store.incomingDuelStudentMove$.pipe(takeUntilDestroyed()).subscribe(event=>{
      const chess = this.duelChessMap.get(event.studentName);
      if (!chess) return;
      loadChess(chess, event.fen);
      this.duelConfigs.update(c => ({
        ...c,
        [event.studentName]: this.buildDuelConfig(event.studentName, chess, event.move.from, event.move.to),
      }));
    });
  }

  // ── Board event handlers (template bindings) ─────────────────────

  onBoardMouseUp(e: MouseEvent, studentName: string): void {
    if (this.readonly()) return;
    if (e.button !== 0 && e.button !== 2) return;
    setTimeout(() => {
      const index = this.store.students().findIndex(s => s.name === studentName);
      const shapes = this.studentBoards.get(index)?.api?.state.drawable.shapes ?? [];
      this.store.sendSharedArrows(shapes, studentName);
      const pair = this.getPair(studentName);
      if (pair) {
        const partner = pair.white === studentName ? pair.black : pair.white;
        this.store.sendSharedArrows(shapes, partner);
      }
    }, 0);
  }

  // ── Config builders ──────────────────────────────────────────────

  boardConfigFor(fen?: string, from?: string, to?: string): Config {
    return {
      fen: fen || STARTING_FEN,
      orientation: 'white',
      coordinates: false,
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      lastMove: from && to ? ([from, to] as Key[]) : [],
      highlight: { lastMove: true, check: true },
      drawable: { enabled: !this.readonly(), visible: true },
    };
  }

  duelBoardConfigFor(studentName: string): Config {
    return this.duelConfigs()[studentName] ?? { fen: STARTING_FEN, orientation: 'white', movable: { free: false }, coordinates: false };
  }
  isAwaitingTeacher(studentName: string): boolean {
    if (!this.duelColors()[studentName])return false;
    const studentColor = this.duelColors()[studentName] ==='b' ? 'black' : 'white';
    return this.duelConfigs()[studentName]?.turnColor === studentColor;
  }

  // ── Teacher actions ──────────────────────────────────────────────

  handleResume(studentName: string): void {
    this.store.sendResume(studentName);
    this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, awaitingRedo: false } : x));
  }

  handleStamp(studentName: string): void {
    this.store.sendStamp(studentName);
    this.store.students.update(s =>
      s.map(x => x.name === studentName ? { ...x, locked: false, awaitingStamp: false } : x));
  }
  toggleLock(studentName: string): void {
    const student = this.store.students().find(s => s.name === studentName); 
    if(student?.locked){ 
      this.store.sendLock(false,studentName); 
      this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, locked: false } : x)); 
    }else{ 
      this.store.sendLock(true,studentName); 
      this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, locked: true } : x)); 
    } 
  } 
  toggleStudentAutoRedo(studentName: string): void {
    const student = this.store.students().find(s => s.name === studentName); 
    if(student?.autoRedo){ 
      this.store.sendAutoRedo(false,studentName); 
      this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, autoRedo: false } : x)); 
    }else{ 
      this.store.sendAutoRedo(true,studentName); 
      this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, autoRedo: true } : x)); 
    } 
  } 
  toggleStudentAutoProgress(studentName: string): void { 
    const student = this.store.students().find(s => s.name === studentName); 
    if(student?.autoProgress){ 
      this.store.sendAutoProgress(false,studentName); 
      this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, autoProgress: false } : x)); 
    }else{ 
      this.store.sendAutoProgress(true,studentName); 
      this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, autoProgress: true } : x)); } 
    }
  handleReset(studentName:string):void{
    this.store.sendReset(studentName);
  }

  kick(studentName:string):void{
    this.store.kickStudent(studentName);
    this.store.students.update(s => s.filter(x =>  x.name !==studentName));
  }


  toggleDuel(studentName: string): void {
    if (this.duelStudents().has(studentName)) {
      this.duelStudents.update(s => { s.delete(studentName); return new Set(s); });
      this.duelColors.update(c => { const { [studentName]: _, ...r } = c; return r; });
      this.duelOriginalFens.update(f => { const { [studentName]: _, ...r } = f; return r; });
      this.duelChessMap.delete(studentName);
      this.duelConfigs.update(c => {
        const { [studentName]: _, ...rest } = c;
        return rest;
      });
      this.duelExercises.update(e => { const { [studentName]: _, ...rest } = e; return rest; });
      this.store.sendDuelEnd(studentName);
    } else {
      const dialogRef = this.dialog.open(GameSetupDialog, {
        data: { mode: 'duel', studentName },
        minWidth: 400,
      });
      dialogRef.afterClosed().subscribe((result: GameSetupResult) => {
        if (!result) return;
        const fen = result.exercise.fen;
        const chess = new Chess(fen, { skipValidation: true });
        this.duelChessMap.set(studentName, chess);
        this.duelExercises.update(e => ({ ...e, [studentName]: result.exercise }));
        this.duelColors.update(c => ({ ...c, [studentName]: 'w' }));
        this.duelOriginalFens.update(f => ({ ...f, [studentName]: fen }));
        this.duelConfigs.update(c => ({ ...c, [studentName]: this.buildDuelConfig(studentName, chess) }));
        this.duelStudents.update(s => { s.add(studentName); return new Set(s); });
        this.store.sendDuelStart(studentName, chess.fen(), 'b', result.exercise, result.scoreDiffWin || undefined, result.timerMinutes || undefined);
      });
    }
  }

  switchDuelSides(studentName: string): void {
    const currentColor = this.duelColors()[studentName];
    const originalFen = this.duelOriginalFens()[studentName];
    if (!currentColor || !originalFen) return;
    const newColor: 'w' | 'b' = currentColor === 'w' ? 'b' : 'w';
    const chess = new Chess(originalFen, { skipValidation: true });
    this.duelChessMap.set(studentName, chess);
    this.duelColors.update(c => ({ ...c, [studentName]: newColor }));
    this.duelConfigs.update(c => ({
      ...c,
      [studentName]: this.buildDuelConfig(studentName, chess),
    }));
    const ex = this.duelExercises()[studentName] ?? {
      id: '', title: '', fen: originalFen, exerciseType: 'challenge' as const,
      position: 0, listId: '', instruction: '',
    };
    this.store.sendDuelStart(studentName, chess.fen(), newColor === 'w' ? 'b' : 'w', ex);
  }

  // ── Drag & drop ──────────────────────────────────────────────────

  onDrop(targetName: string, event: DragEvent): void {
    if (this.readonly()) return;
    const type = event.dataTransfer?.getData('type');
    if (type === 'single') this.handleExerciseDrop(targetName, event);
    else if (type === 'list') this.handleListDrop(targetName, event);
    else this.handleChallengeCreation(targetName);
  }

  handleListDrop(targetName: string, event: DragEvent): void {
    if (this.getPair(targetName)) {
      this.snackBar.open("Can't drop list on a two player game", '', { duration: 2000 });
    } else {
      const exercises = JSON.parse(event.dataTransfer?.getData('exercises') ?? '[]');
      this.store.sendAssignedList(targetName, exercises);
      this.resetTimer(targetName);
    }
  }

  handleExerciseDrop(targetName: string, event: DragEvent): void {
    const exercise = JSON.parse(event.dataTransfer?.getData('exercise') ?? '{}') as Exercise;
    if (this.getPair(targetName)) {
      this.snackBar.open("Can't drop exercise on a two player game", '', { duration: 2000 });
    }else{
      this.store.sendDroppedExercise(targetName, exercise);
      this.resetTimer(targetName);
    }
  }

  handleChallengeCreation(targetName: string): void {
    const source = this.pendingPair();
    if (!source || source === targetName) { this.pendingPair.set(null); return; }
    const dialogRef = this.dialog.open(GameSetupDialog, {
      data: { mode: 'challenge', white: source, black: targetName },
      minWidth: 400,
    });
    dialogRef.afterClosed().subscribe((result: GameSetupResult) => {
      this.pendingPair.set(null);
      if (!result) return;
      const pair: ChallengePair = {
        white: source,
        black: targetName,
        exercise: result.exercise,
        scoreDiffWin: result.scoreDiffWin || undefined,
      };
      this.store.challengeMove.set(null);
      this.store.challengePairs.update(pairs => [...pairs, pair]);
      this.store.syncChallengePair(pair);
    });
  }

  onDragStart(studentName: string): void {
    if (this.readonly()) return;
    this.pendingPair.set(studentName);
  }

  // ── Challenge helpers ────────────────────────────────────────────

  getPair(studentName: string): ChallengePair | null {
    return this.store.challengePairs().find(
      p => p.white === studentName || p.black === studentName) ?? null;
  }

  removePair(pair: ChallengePair): void {
    this.store.challengePairs.update(pairs =>
      pairs.filter(p => p.white !== pair.white || p.black !== pair.black));
    this.store.sendChallengeRemove(pair);
  }

  triggerRematch(pair: ChallengePair): void {
    const swapped: ChallengePair = {
      white: pair.black,
      black: pair.white,
      exercise: pair.exercise,
      scoreDiffWin: pair.scoreDiffWin,
    };
    this.store.challengePairs.update(pairs =>
      pairs.map(p => (p.white === pair.white && p.black === pair.black ? swapped : p)));
    this.store.sendChallengeRematch(swapped);
  }

  getChallengeFen(pair: ChallengePair): { fen: string; from?: string; to?: string } {
    const event = this.store.challengeMove();
    if (event && event.white === pair.white && event.black === pair.black)
      return { fen: event.fen, from: event.move.from, to: event.move.to };
    const whiteFen = this.store.students().find(s => s.name === pair.white)?.fen;
    return whiteFen ? { fen: whiteFen } : { fen: STARTING_FEN };
  }

  // ── Timers ───────────────────────────────────────────────────────

  freezeTimers(): void { this.timers.forEach(t => t.stop()); }
  resumeTimers(): void { this.timers.forEach(t => t.start()); }

  // ── Private ──────────────────────────────────────────────────────

  private buildDuelConfig(studentName: string, chess: Chess, orig?: string, dest?: string): Config {
    const teacherColor = this.duelColors()[studentName] ?? 'w';
    const canMove = chess.turn() === teacherColor;
    return {
      fen: chess.fen(),
      orientation: teacherColor === 'w' ? 'white' : 'black',
      turnColor: teacherColor === 'w' ? (canMove ? 'white' : 'black') : (canMove ? 'black' : 'white'),
      movable: {
        free: false,
        color: canMove ? (teacherColor === 'w' ? 'white' : 'black') : undefined,
        dests: canMove ? getValidMoves(chess) : new Map(),
        events: { after: (o: Key, d: Key) => this.onDuelTeacherMove(studentName, o, d) },
      },
      draggable: { enabled: canMove, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: orig && dest ? [orig as Key, dest as Key] : undefined,
    };
  }

  private async onDuelTeacherMove(studentName: string, orig: Key, dest: Key): Promise<void> {
    const chess = this.duelChessMap.get(studentName);
    const color = this.duelColors()[studentName];
    if (!chess || !color || chess.turn() !== color) return;
    const piece = chess.get(orig as any)!;
    if (isPawnPromotion(dest, piece)) {
      this.promotionAgainst.set(studentName);
      const role = await this.promotionService.requestPromotion(orig, dest);
      this.promotionAgainst.set('');
      this.executeDuelMove(orig, dest, studentName, role);
      return;
    }
    this.executeDuelMove(orig, dest, studentName);
  }

  private executeDuelMove(orig: Key, dest: Key, studentName: string, promotion?: PromotionPiece): void {
    const chess = this.duelChessMap.get(studentName);
    const color = this.duelColors()[studentName];
    if (!chess || !color || chess.turn() !== color) return;
    try {
      const move:Move = chess.move({ from: orig, to: dest, promotion });
      if (!move) return;
      this.duelConfigs.update(c => ({ ...c, [studentName]: this.buildDuelConfig(studentName, chess) }));
      this.store.sendDuelTeacherMove(studentName, chess.fen(), move);
    } catch {
      this.duelConfigs.update(c => ({ ...c, [studentName]: this.buildDuelConfig(studentName, chess) }));
    }
  }

  private resetTimer(name: string): void {
    this.timers.find(t => t.name() === name)?.reset();
  }
}
