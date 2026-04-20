import {
  Component, inject, signal, computed, effect, viewChild, linkedSignal,
  untracked
} from '@angular/core';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { SoundService } from '../../../core/services/sound.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { PieceOverlay } from '../../../shared/components/piece-overlay/piece-overlay';
import { StampOverlay } from '../../../shared/components/stamp-overlay/stamp-overlay';
import { StampSvg } from '../../../shared/components/stamp-svg/stamp-svg';
import { StampType } from '../../../shared/models/stamp.model';
import { Exercise } from '../../../shared/models/exercise.model';
import { getKingSquare, getPlayerOrientation, getValidMoves, loadChess, STARTING_FEN } from '../../../shared/utils/chess.utils';

@Component({
  selector: 'app-exercise-board',
  imports: [ChessBoard, PieceOverlay, StampOverlay, StampSvg],
  templateUrl: './exercise-board.html',
  styleUrl: './exercise-board.scss',
})
export class ExerciseBoard {
  private chessBoard = viewChild<ChessBoard>('chessBoard');
  private pieceOverlay = viewChild<PieceOverlay>('pieceOverlay');
  private stampOverlay = viewChild<StampOverlay>('stampOverlay');

  classroomStore = inject(ClassroomStore);
  private soundService = inject(SoundService);

  
 

  // ── Collections ──────────────────────────────────────────────────
  stampCollection = signal<StampType[]>([]);
  mushroomCollection = signal<Record<string, number>>({
    '🍄':0,'🍫':0,'🍬':0,'🍦':0,'🍔':0,'🥤':0,'🍩':0,'🎃':0,'♥️':0,'🎁':0,'🎈':0,'⭐':0,
  });
  mushroomCollectionValues = computed(() => Object.values(this.mushroomCollection()).some(c => c > 0));
  mushroomCollectionKeys = computed(() => Object.keys(this.mushroomCollection()));

  loadedList = computed(() =>
    this.classroomStore.assignedExercises().length
      ? this.classroomStore.assignedExercises()
      : this.classroomStore.loadedExercises()
  );

  currentExercise = computed(
    () => this.classroomStore.droppedExercise() ?? this.loadedList()[this.exIndex()] ?? null,
  );

  isLocked = linkedSignal({ source: () => this.currentExercise(), computation: () => false });
  feedback = linkedSignal({ source: () => this.currentExercise(), computation: () => '' });
  private exIndex= linkedSignal({ source: () => this.loadedList(), computation: () => 0 });
  private isWaitingForStamp = linkedSignal({ source: () => this.currentExercise(), computation: () => false });
  private isWaitingForRedo = linkedSignal({ source: () => this.currentExercise(), computation: () => false });
  private status = linkedSignal<Exercise, string>({
      source: () => this.currentExercise(),
      computation: () => this.exerciseChess.turn() === 'w' ? 'White to move' : 'Black to move',
    });
  private exerciseFen = signal<string>(STARTING_FEN);
  private moveHistory = linkedSignal<Exercise,string[]>({ source: () => this.currentExercise(), computation: () => [] });

  private exerciseChess = new Chess();
  private exerciseLastMove = signal<[Key, Key] | undefined>(undefined);

  boardConfig = computed<Config | null>(() => {
    const ex = this.currentExercise();
    if (!ex) return null;
    return {
      fen: this.exerciseFen(),
      orientation: getPlayerOrientation(ex),
      turnColor: this.exerciseChess.turn() === 'w' ? 'white' : 'black',
      movable: {
        free: false,
        color: this.isLocked() ? undefined : (this.exerciseChess.turn() === 'w' ? 'white' : 'black'),
        dests: getValidMoves(this.exerciseChess),
        showDests: ex.exerciseType === 'puzzle',
        events: { after: (orig, dest) => this.handleMove(orig, dest) },
      },
      check: this.exerciseChess.isCheck(),
      draggable: { enabled: true, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.exerciseLastMove(),
      drawable: { enabled: true, visible: true },
    };
  });

  constructor() {
    // presence sync - 
    effect(() => {
      const exIndex = this.exIndex();
      const awaitingStamp = this.isWaitingForStamp();
      const awaitingRedo = this.isWaitingForRedo();
      const locked = untracked(()=>this.isLocked())
      this.classroomStore.updatePresence({  exIndex,locked, awaitingRedo, awaitingStamp });
    });

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

    // Shared arrows from teacher
    effect(() => {
      const target = this.classroomStore.sharedArrows()?.name;
      const arrows = this.classroomStore.sharedArrows()?.arrows ?? [];
      if (target === 'all' || target === this.classroomStore.studentName()) {
        this.chessBoard()?.api?.set({ drawable: { shapes: arrows } });
      }
    });

    // Broadcast FEN to teacher miniboard
    effect(() => {
      this.classroomStore.broadcastStudentFen(this.classroomStore.studentName(), this.exerciseFen());
    });

    // Teacher commands
    effect(() => {
      const resume = this.classroomStore.resume();
      if (!resume) return;
      this.classroomStore.resume.set(null);
      this.feedback.set('');
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

  onMouseUp(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    setTimeout(() => {
      const shapes = this.chessBoard()?.api?.state.drawable.shapes ?? [];
      this.classroomStore.sendMiniboardArrows(shapes);
    }, 0);
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
        this.isWaitingForRedo.set(true);
        this.isLocked.set(true);
        setTimeout(() => { this.handleMistake(ex); this.feedback.set(''); }, 10000);
      } else {
        this.isWaitingForRedo.set(true);
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
    this.isWaitingForRedo.set(false);
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
}
