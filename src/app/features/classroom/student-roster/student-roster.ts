import { Component, inject, input, QueryList, ViewChildren, signal, computed, effect, untracked } from '@angular/core';
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
import { Chess } from 'chess.js';
import { Promotion, PromotionPiece } from "../../../shared/components/promotion/promotion";
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PromotionService } from '../../../core/services/promotion.service';

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

  isLoadingList = signal(false);
  pendingPair = signal<string | null>(null);

  duelStudents = signal<Set<string>>(new Set());
  duelColors = signal<Record<string, 'w' | 'b'>>({});
  duelOriginalFens = signal<Record<string, string>>({});

  // Simul
  simulChessMap = new Map<string, Chess>();
  simulConfigs = signal<Record<string, Config>>({});

  // Duel
  duelChessMap = new Map<string, Chess>();
  duelConfigs = signal<Record<string, Config>>({});

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

  constructor() {
    // resync student state on (re)connect
    this.store.resync$.pipe(takeUntilDestroyed()).subscribe(studentName => {
    const pair = this.getPair(studentName);
      if (pair) {
        const { fen, from, to } = this.getChallengeFen(pair);
        if (fen) this.store.sendChallengeMove(pair.white, pair.black, fen, from ?? '', to ?? '');
        return;
      }
    
      const duelChess = this.duelChessMap.get(studentName);
      if (duelChess && this.duelColors()[studentName] !== undefined) {
        const teacherColor = this.duelColors()[studentName];
        this.store.sendDuelStart(studentName, duelChess.fen(), teacherColor === 'w' ? 'b' : 'w');
        this.store.sendDuelTeacherMove(studentName, duelChess.fen(), '', '', false);
        return;
      }

      const simulChess = this.simulChessMap.get(studentName);
      if (simulChess && this.store.mode() === 'simul') {
        this.store.sendSimulTeacherMove(studentName, simulChess.fen(), '', '', false);
        return;
      }
     
      if (this.store.mode() === 'normal') {
        this.store.requestFen(studentName);
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

    // Simul: sync chess instances with student list
    effect(() => {
      const students = this.store.students();
      if (this.store.mode() !== 'simul') {
        if (this.simulChessMap.size > 0) { this.simulChessMap.clear(); this.simulConfigs.set({}); }
        return;
      }
      const currentNames = new Set(students.map(s => s.name));
      let changed = false;
      const newConfigs = untracked(() => ({ ...this.simulConfigs() }));
      students.forEach(student => {
        if (!this.simulChessMap.has(student.name)) {
          const chess = student.fen ? new Chess(student.fen,{skipValidation:true}) : new Chess();
          this.simulChessMap.set(student.name, chess);
          newConfigs[student.name] = this.buildSimulConfig(student.name, chess);
          changed = true;
        }
      });
      for (const name of this.simulChessMap.keys()) {
        if (!currentNames.has(name)) { this.simulChessMap.delete(name); delete newConfigs[name]; changed = true; }
      }
      if (changed) this.simulConfigs.set(newConfigs);
    });

    // Simul: receive student move, update teacher miniboard
    effect(() => {
      const move = this.store.incomingSimulStudentMove();
      if (!move) return;
      this.store.incomingSimulStudentMove.set(null);
      const chess = this.simulChessMap.get(move.studentName);
      if (!chess) return;
      loadChess(chess, move.fen);
      this.simulConfigs.update(c => ({
        ...c,
        [move.studentName]: this.buildSimulConfig(move.studentName, chess, move.from, move.to),
      }));
    });

    // Duel: receive student move, update teacher miniboard
    effect(() => {
      const move = this.store.incomingDuelStudentMove();
      if (!move) return;
      this.store.incomingDuelStudentMove.set(null);
      const chess = this.duelChessMap.get(move.studentName);
      if (!chess) return;
      loadChess(chess, move.fen);
      this.duelConfigs.update(c => ({
        ...c,
        [move.studentName]: this.buildDuelConfig(move.studentName, chess, move.from, move.to),
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

  simulBoardConfigFor(studentName: string): Config {
    return this.simulConfigs()[studentName] ?? { fen: STARTING_FEN, orientation: 'white', movable: { free: false } ,coordinates: false,};
  }

  duelBoardConfigFor(studentName: string): Config {
    return this.duelConfigs()[studentName] ?? { fen: STARTING_FEN, orientation: 'white', movable: { free: false }, coordinates: false };
  }

  isAwaitingTeacher(studentName: string): boolean {
    return this.simulConfigs()[studentName]?.turnColor === 'white';
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

  handleLock(studentName: string): void {
    const student = this.store.students().find(s => s.name === studentName);
    if (student?.locked) {
      this.store.sendUnlock(studentName);
      this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, locked: false } : x));
    } else {
      this.store.sendLock(studentName);
      this.store.students.update(s => s.map(x => x.name === studentName ? { ...x, locked: true } : x));
    }
  }

  handleReset(studentName:string):void{
    this.store.sendReset(studentName);
  }

  kick(studentName:string):void{
    this.store.kickStudent(studentName);
    this.store.students.update(s => s.filter(x =>  x.name !==studentName));
  }

  toggleStudentAutoRedo(name: string): void { this.store.sendAutoRedo(!this.effectiveAutoRedo()(name), name); }
  toggleStudentAutoProgress(name: string): void { this.store.sendAutoProgress(!this.effectiveAutoProgress()(name), name); }

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
      this.store.sendDuelEnd(studentName);
    } else {
      const student = this.store.students().find(s => s.name === studentName);
      const fen = student?.fen ?? STARTING_FEN;
      const chess = new Chess(fen, { skipValidation: true });
      this.duelChessMap.set(studentName, chess);
      this.duelColors.update(c => ({ ...c, [studentName]: 'w' }));
      this.duelOriginalFens.update(f => ({ ...f, [studentName]: fen }));
      this.duelConfigs.update(c => ({ ...c, [studentName]: this.buildDuelConfig(studentName, chess) }));
      this.duelStudents.update(s => { s.add(studentName); return new Set(s); });
      this.store.sendDuelStart(studentName, chess.fen(), 'b');
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
    this.store.sendDuelStart(studentName, chess.fen(), newColor === 'w' ? 'b' : 'w');
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
      this.snackBar.open("Can't assign a list to a two player game", '', { duration: 2000 });
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
      this.store.challengeMove.set(null);
      this.store.sendDroppedExercise(pair.white, exercise);
      this.store.sendDroppedExercise(pair.black, exercise);
    } else {
      this.store.sendDroppedExercise(targetName, exercise);
      this.resetTimer(targetName);
    }
  }

  handleChallengeCreation(targetName: string): void {
    const source = this.pendingPair();
    if (!source || source === targetName) { this.pendingPair.set(null); return; }
    const pair: ChallengePair = { white: source, black: targetName };
    this.store.challengePairs.update(pairs => [...pairs, pair]);
    this.store.syncChallengePair(pair);
    this.pendingPair.set(null);
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
    const swapped: ChallengePair = { white: pair.black, black: pair.white };
    this.store.challengePairs.update(pairs =>
      pairs.map(p => (p.white === pair.white && p.black === pair.black ? swapped : p)));
    this.store.sendChallengeRematch(swapped);
  }

  getChallengeFen(pair: ChallengePair): { fen: string; from?: string; to?: string } {
    const move = this.store.challengeMove();
    if (move && move.white === pair.white && move.black === pair.black)
      return { fen: move.fen, from: move.from, to: move.to };
    const whiteFen = this.store.students().find(s => s.name === pair.white)?.fen;
    return whiteFen ? { fen: whiteFen } : { fen: STARTING_FEN };
  }

  // ── Timers ───────────────────────────────────────────────────────

  freezeTimers(): void { this.timers.forEach(t => t.stop()); }
  resumeTimers(): void { this.timers.forEach(t => t.start()); }

  // ── Private ──────────────────────────────────────────────────────

  private buildSimulConfig(studentName: string, chess: Chess, orig?: string, dest?: string): Config {
    const canMove = chess.turn() === 'w';
    return {
      fen: chess.fen(),
      orientation: 'white',
      turnColor: canMove ? 'white' : 'black',
      movable: {
        free: false,
        color: canMove ? 'white' : undefined,
        dests: canMove ? getValidMoves(chess) : new Map(),
        events: { after: (o: Key, d: Key) => this.onSimulTeacherMove(studentName, o, d) },
      },
      draggable: { enabled: canMove, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: orig && dest ? [orig as Key, dest as Key] : undefined,
    };
  }

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

  private async onSimulTeacherMove(studentName: string, orig: Key, dest: Key):Promise<void> {
    const chess = this.simulChessMap.get(studentName);
    if (!chess || chess.turn() !== 'w') return;
    const piece = chess.get(orig as any)!;
    if (isPawnPromotion(dest, piece)){
      this.promotionAgainst.set(studentName);
      const role = await this.promotionService.requestPromotion(orig, dest);
      this.promotionAgainst.set('');
      this.executeMove(orig, dest,studentName, role);
      return;
    } 
     this.executeMove(orig, dest,studentName);
  }

  private executeMove(orig:Key, dest:Key,studentName:string, promotion?:PromotionPiece):void{
    const chess = this.simulChessMap.get(studentName);
    if (!chess || chess.turn() !== 'w') return;
    try {
      const move = chess.move({ from: orig, to: dest,promotion });
      if (!move) return;
      this.simulConfigs.update(c => ({ ...c, [studentName]: this.buildSimulConfig(studentName, chess) }));
      this.store.sendSimulTeacherMove(studentName, chess.fen(), orig, dest,!!move.captured);
    } catch {
      this.simulConfigs.update(c => ({ ...c, [studentName]: this.buildSimulConfig(studentName, chess) }));
    }
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
      const move = chess.move({ from: orig, to: dest, promotion });
      if (!move) return;
      this.duelConfigs.update(c => ({ ...c, [studentName]: this.buildDuelConfig(studentName, chess) }));
      this.store.sendDuelTeacherMove(studentName, chess.fen(), orig, dest, !!move.captured);
    } catch {
      this.duelConfigs.update(c => ({ ...c, [studentName]: this.buildDuelConfig(studentName, chess) }));
    }
  }

  private resetTimer(name: string): void {
    this.timers.find(t => t.name() === name)?.reset();
  }
}
