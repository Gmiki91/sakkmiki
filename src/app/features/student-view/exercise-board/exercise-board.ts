import {
  Component, inject,input, signal, computed, effect, viewChild, linkedSignal, WritableSignal,
} from '@angular/core';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { DrawingService } from '../../../core/services/drawing.service';
import { SoundService } from '../../../core/services/sound.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { PieceOverlay } from '../../../shared/components/piece-overlay/piece-overlay';
import { StampOverlay } from '../../../shared/components/stamp-overlay/stamp-overlay';
import { DrawingCanvas } from '../../../shared/components/drawing-canvas/drawing-canvas';
import { DrawingToolbar } from '../../../shared/components/drawing-toolbar/drawing-toolbar';
import { TeachingOverlay } from '../../../shared/components/teaching-overlay/teaching-overlay';
import { StampSvg } from '../../../shared/components/stamp-svg/stamp-svg';
import { StampType } from '../../../shared/models/stamp.model';
import { StampIcon, DrawingTool, Point } from '../../../shared/models/drawing.model';
import { Exercise } from '../../../shared/models/exercise.model';
import { DEFAULT_BRUSH_COLOR } from '../../../shared/utils/brushes';
import { TEACHING_CONCEPTS } from '../../../shared/models/teaching-concept.model';
import {
  getKingSquare, getPlayerOrientation, getValidMoves, loadChess, STARTING_FEN,
} from '../../../shared/utils/chess.utils';

@Component({
  selector: 'app-exercise-board',
  imports: [ChessBoard, PieceOverlay, StampOverlay, DrawingCanvas, DrawingToolbar, TeachingOverlay, StampSvg],
  templateUrl: './exercise-board.html',
  styleUrl: './exercise-board.scss',
})
export class ExerciseBoard {
  private chessBoard = viewChild<ChessBoard>('chessBoard');
  private pieceOverlay = viewChild<PieceOverlay>('pieceOverlay');
  private stampOverlay = viewChild<StampOverlay>('stampOverlay');

  classroomStore = inject(ClassroomStore);
  drawingService = inject(DrawingService);
  private soundService = inject(SoundService);

  hidden = input(false);

  // ── Public signals — read by StudentView for presence sync ──────
  exIndex!: WritableSignal<number>;
  isLocked!: WritableSignal<boolean>;
  isWaitingForStamp!: WritableSignal<boolean>;
  status!: WritableSignal<string>;
  feedback!: WritableSignal<string>;
  exerciseFen = signal<string>(STARTING_FEN);

  // ── Drawing ─────────────────────────────────────────────────────
  selectedColor = signal(DEFAULT_BRUSH_COLOR);
  activeTool = signal<DrawingTool>('pen');
  activeStampIcon = signal<StampIcon>('star');

  // ── Collections ─────────────────────────────────────────────────
  stampCollection = signal<StampType[]>([]);
  mushroomCollection = signal<Record<string, number>>({
    '🍄':0,'🍫':0,'🍬':0,'🍦':0,'🍔':0,'🥤':0,'🍩':0,'🎃':0,'♥️':0,'🎁':0,'🎈':0,'⭐':0,
  });
  mushroomCollectionValues = computed(() => Object.values(this.mushroomCollection()).some(c => c > 0));
  mushroomCollectionKeys = computed(() => Object.keys(this.mushroomCollection()));

  // ── Derived state ───────────────────────────────────────────────
  loadedList = computed(() =>
    this.classroomStore.assignedExercises().length
      ? this.classroomStore.assignedExercises()
      : this.classroomStore.loadedExercises()
  );

  currentExercise = computed(
    () => this.classroomStore.droppedExercise() ?? this.loadedList()[this.exIndex()] ?? null,
  );

  isGathered = computed(() => this.classroomStore.mode() === 'gathered');

  mushroomType = computed(() => {
    if (this.isGathered()) return this.classroomStore.mushroomType() || '🍄';
    return this.currentExercise()?.mushroomType || '🍄';
  });

  isMushroomMode = computed(() => {
    if (this.isGathered()) return !!this.classroomStore.mushroomType();
    return this.currentExercise()?.exerciseType === 'mushroom';
  });

  boardOrientation = computed<'white' | 'black'>(() => {
    if (this.isGathered()) return 'white';
    const ex = this.currentExercise();
    return ex ? getPlayerOrientation(ex) : 'white';
  });

  // ── Private chess state ─────────────────────────────────────────
  private exerciseChess = new Chess();
  private moveHistory!: WritableSignal<string[]>;
  private exerciseLastMove = signal<[Key, Key] | undefined>(undefined);
  private wasGathered = false;
  private frozenFen: string | null = null;
  private frozenMoveHistory: string[] | null = null;
  private teachingConceptSize = 0;
  private curtainInitialized = false;
  private myPair = computed(() =>
    this.classroomStore.challengePairs().find(
      p => p.white === this.classroomStore.studentName() ||
           p.black === this.classroomStore.studentName()
    ) ?? null
  );

  // ── Board configs ───────────────────────────────────────────────
  private gatheredConfig = computed<Config>(() => ({
    fen: this.classroomStore.teacherFen(),
    orientation: 'white',
    movable: { free: false, color: undefined },
    draggable: { enabled: false },
    highlight: { lastMove: true, check: false },
    drawable: { enabled: true, visible: true },
  }));

  private exerciseConfig = computed<Config>(() => ({
    fen: this.exerciseFen(),
    orientation: this.boardOrientation(),
    turnColor: this.exerciseChess.turn() === 'w' ? 'white' : 'black',
    movable: {
      free: false,
      color: this.isLocked() ? undefined : (this.exerciseChess.turn() === 'w' ? 'white' : 'black'),
      dests: getValidMoves(this.exerciseChess),
      showDests: this.currentExercise()?.exerciseType === 'puzzle',
      events: { after: (orig, dest) => this.handleMove(orig, dest) },
    },
    check: this.exerciseChess.isCheck(),
    draggable: { enabled: true, showGhost: true },
    highlight: { lastMove: true, check: true },
    lastMove: this.exerciseLastMove(),
    drawable: { enabled: true, visible: true },
  }));

  boardConfig = computed<Config | null>(() => {
    if (this.isGathered()) return this.gatheredConfig();
    return this.currentExercise() ? this.exerciseConfig() : null;
  });

  constructor() {
    this.exIndex = linkedSignal({ source: () => this.loadedList(), computation: () => 0 });
    this.isLocked = linkedSignal({ source: () => this.currentExercise(), computation: () => false });
    this.isWaitingForStamp = linkedSignal({ source: () => this.currentExercise(), computation: () => false });
    this.status = linkedSignal({
      source: () => this.currentExercise(),
      computation: () => this.exerciseChess.turn() === 'w' ? 'White to move' : 'Black to move',
    });
    this.feedback = linkedSignal({ source: () => this.currentExercise(), computation: () => '' });
    this.moveHistory = linkedSignal({ source: () => this.currentExercise(), computation: () => [] });

    this.setupExerciseEffects();
    this.setupTeacherCommandEffects();
    this.setupMiscEffects();

    // Attach capture-phase listener once board is available
    effect(() => {
      const el = this.chessBoard()?.boardElement?.nativeElement as HTMLElement;
      if (!el) return;
      el.addEventListener('pointerdown', (e: MouseEvent) => {
        if (e.button === 0 && this.isGathered()) e.preventDefault();
      }, { capture: true });
    });
  }

  // ── Template event handlers ─────────────────────────────────────

  onMouseUp(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    setTimeout(() => {
      const shapes = this.chessBoard()?.api?.state.drawable.shapes ?? [];
      if (this.isGathered()) {
        if (e.button !== 0) this.classroomStore.sendSharedArrows(shapes);
      } else {
        this.classroomStore.sendMiniboardArrows(shapes);
      }
    }, 0);
  }

  onBoardClick(event: MouseEvent): void {
    if (!this.isGathered() || this.activeTool() !== 'stamp') return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.drawingService.addLocalAnnotation(
      this.activeStampIcon(), event.clientX - rect.left, event.clientY - rect.top, this.selectedColor(),
    );
  }

  onPointAdded(event: { strokeId: string; point: Point }): void {
    this.drawingService.addLocalPoint(event.strokeId, event.point, this.selectedColor());
  }

  onStrokeCommitted(strokeId: string): void {
    this.drawingService.commitLocalStroke(strokeId);
  }

  onColorSelected(color: string): void {
    this.selectedColor.set(color);
    this.drawingService.broadcastColor(color);
  }

  handleMove(orig: Key, dest: Key): void {
    try {
      const move = this.exerciseChess.move({ from: orig, to: dest });
      if (move) {
        this.exerciseFen.set(this.exerciseChess.fen());
        this.pieceOverlay()?.hide();
        this.analyze(move);
      }
    } catch {
      this.chessBoard()?.api?.set({ fen: this.exerciseChess.fen() });
    }
  }

  nextExercise(): void {
    this.pieceOverlay()?.hide();
    this.exerciseLastMove.set(undefined);
    const size = this.loadedList().length - 1;
    if (this.exIndex() < size) {
      this.exIndex.update(n => n + 1);
    } else {
      this.status.set('All done!');
      this.feedback.set('Minden feladatot megoldottál!');
      this.isWaitingForStamp.set(true);
    }
  }

  // ── Private: effects ────────────────────────────────────────────

  private setupExerciseEffects(): void {
    // Reset board when exercise changes
    effect(() => {
      const exercise = this.currentExercise();
      if (!exercise) return;
      this.pieceOverlay()?.hide();
      this.exerciseLastMove.set(undefined);
      loadChess(this.exerciseChess, exercise.fen);
      this.exerciseFen.set(this.exerciseChess.fen());
      if (exercise.lastMove) {
        const { from, to } = exercise.lastMove;
        this.exerciseChess.move({ from, to });
        this.exerciseFen.set(this.exerciseChess.fen());
        this.exerciseLastMove.set([from as Key, to as Key]);
        setTimeout(() => {
          this.chessBoard()?.api?.set({ fen: exercise.fen });
          this.chessBoard()?.api?.move(from, to);
        }, 250);
      }
      this.updateStatus();
      this.chessBoard()?.api?.set({ lastMove: [] });
    });

    // Gather/disperse
    effect(() => {
      const isGatheredNow = this.classroomStore.mode() === 'gathered';
      if (isGatheredNow && !this.wasGathered) this.onGather();
      else if (!isGatheredNow && this.wasGathered) this.onDisperse();
      this.wasGathered = isGatheredNow;
    });

    // Shared arrows
    effect(() => {
      const target = this.classroomStore.sharedArrows()?.name;
      const arrows = this.classroomStore.sharedArrows()?.arrows ?? [];
      if (target === 'all' || target === this.classroomStore.studentName()) {
        this.chessBoard()?.api?.set({ drawable: { shapes: arrows } });
      }
    });

    // Broadcast FEN to teacher miniboard
    effect(() => {
      const fen = this.exerciseFen();
      if (this.classroomStore.mode() === 'gathered') return;
      if (this.myPair()) return;
      this.classroomStore.broadcastStudentFen(this.classroomStore.studentName(), fen);
    });
  }

  private setupTeacherCommandEffects(): void {
    effect(() => {
      const resume = this.classroomStore.resume();
      if (!resume) return;
      this.classroomStore.resume.set(null);
      const ex = this.currentExercise();
      if (ex) this.handleMistake(ex);
    });

    effect(() => {
      const stamp = this.classroomStore.stamp();
      if (!stamp) return;
      this.classroomStore.stamp.set(null);
      this.progressWithStamp();
    });

    effect(() => {
      const lock = this.classroomStore.lock();
      if (!lock) return;
      this.classroomStore.lock.set(null);
      this.isLocked.set(true);
    });

    effect(() => {
      const unlock = this.classroomStore.unlock();
      if (!unlock) return;
      this.classroomStore.unlock.set(null);
      this.isLocked.set(false);
    });
  }

  private setupMiscEffects(): void {
    // Teaching overlay sound
    effect(() => {
      const concepts = this.classroomStore.incomingTeachingOverlay();
      if (!concepts?.length) { this.teachingConceptSize = 0; return; }
      if (concepts.length > this.teachingConceptSize) {
        const concept = TEACHING_CONCEPTS.find(c => c.id === concepts.at(-1)!.id);
        if (concept?.sound) this.soundService.play(concept.sound);
      }
      this.teachingConceptSize = concepts.length;
    });

    // Curtain sound
    effect(() => {
      const curtain = this.classroomStore.curtainClosed();
      if(this.hidden())return // hidden means its challenge mode, no curtain
      if (!this.curtainInitialized) { this.curtainInitialized = true; return; }
      this.soundService.play('curtain');
    });
  }

  // ── Private: logic ───────────────────────────────────────────────

  private analyze(move: Move): void {
    const ex = this.currentExercise();
    if (!ex) return;
    const newHistory = [...this.moveHistory(), move.san];
    const solution = ex.solutions?.find(line => newHistory.every((m, i) => line[i] === m));

    if (solution) {
      this.isLocked.set(false);
      if (ex.exerciseType === 'mushroom') {
        this.soundService.play('success');
        const type = ex.mushroomType as string;
        this.mushroomCollection.update(c => ({ ...c, [type]: (c[type] ?? 0) + 1 }));
      } else {
        this.playSound(move);
      }
      this.updateStatus();
      this.moveHistory.set(newHistory);
      const isSolved = solution.length === newHistory.length;
      if (isSolved) {
        if (this.classroomStore.autoProgress()) this.progressAuto();
        else { this.isWaitingForStamp.set(true); this.isLocked.set(true); }
      } else {
        if (ex.exerciseType === 'mushroom') {
          this.exerciseChess.setTurn('w');
          this.exerciseFen.set(this.exerciseChess.fen());
        } else {
          const nextIndex = newHistory.length;
          setTimeout(() => {
            const computerMove = this.exerciseChess.move(solution[nextIndex]);
            this.playSound(computerMove);
            this.exerciseFen.set(this.exerciseChess.fen());
            this.exerciseLastMove.set([computerMove.from as Key, computerMove.to as Key]);
            this.moveHistory.set([...newHistory, solution[nextIndex]]);
            this.pieceOverlay()?.hide();
          }, 250);
        }
      }
    } else {
      this.soundService.play('error');
      if (this.classroomStore.autoRedo()) {
        const mistake = ex.commonMistakes?.find(m => m.move === move.san);
        this.feedback.set(mistake?.hint ?? ex.defaultHint ?? 'Biztos? 🤔');
        this.isLocked.set(true);
        setTimeout(() => { this.handleMistake(ex); this.feedback.set(''); }, 10000);
      } else {
        this.isLocked.set(true);
      }
    }
  }

  private updateStatus(): void {
    if (this.exerciseChess.isCheckmate()) {
      this.status.set('Checkmate! ' + (this.exerciseChess.turn() === 'w' ? 'Black' : 'White') + ' wins!');
      this.pieceOverlay()?.show('checkmate', getKingSquare(this.exerciseChess)!);
    } else if (this.exerciseChess.isDraw()) {
      this.status.set('Draw!');
    } else if (this.exerciseChess.isCheck()) {
      this.status.set('Check! ' + (this.exerciseChess.turn() === 'w' ? 'White' : 'Black') + ' to move');
      this.pieceOverlay()?.show('alarmed', getKingSquare(this.exerciseChess)!);
    } else {
      this.status.set((this.exerciseChess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    }
  }

  private handleMistake(ex: Exercise): void {
    this.exerciseChess.undo();
    if (ex.exerciseType === 'mushroom') this.exerciseChess.setTurn('w');
    this.exerciseFen.set(this.exerciseChess.fen());
    this.exerciseLastMove.set(undefined);
    this.isLocked.set(false);
  }

  private progressWithStamp(): void {
    this.feedback.set('Ügyes! 🥳');
    this.soundService.play('stamp');
    this.soundService.playRandomCheering();
    this.stampOverlay()?.stamp();
    const stamp = this.stampOverlay()?.currentStamp();
    this.isWaitingForStamp.set(false);
    this.isLocked.set(false);
    setTimeout(() => {
      if (stamp) this.stampCollection.update(arr => [...arr, stamp as StampType]);
      if (!this.classroomStore.droppedExercise()) this.nextExercise();
    }, 3000);
  }

  private progressAuto(): void {
    this.feedback.set('Ügyes! 🥳');
    this.isLocked.set(true);
    setTimeout(() => {
      this.isLocked.set(false);
      if (!this.classroomStore.droppedExercise()) this.nextExercise();
    }, 2000);
  }

  private playSound(move: Move): void {
    this.soundService.play(move.captured ? 'take' : 'move');
  }

  private onGather(): void {
    this.pieceOverlay()?.hide();
    this.frozenFen = this.exerciseChess.fen();
    this.frozenMoveHistory = [...this.moveHistory()];
    this.isLocked.set(false);
    this.chessBoard()?.api?.set({ lastMove: [], drawable: { shapes: [] } });
  }

  private onDisperse(): void {
    this.drawingService.clearLocal();
    loadChess(this.exerciseChess, this.frozenFen!);
    this.moveHistory.set(this.frozenMoveHistory ?? []);
    this.frozenFen = null;
    this.frozenMoveHistory = null;
    setTimeout(() => {
      this.chessBoard()?.api?.set({
        fen: this.exerciseChess.fen(), lastMove: [], drawable: { enabled: true, shapes: [] },
      });
    }, 0);
  }
}
