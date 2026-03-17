import {
  Component,
  ViewChild,
  inject,
  computed,
  linkedSignal,
  WritableSignal,
  effect,
  AfterViewInit,
  signal,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import {
  getKingSquare,
  getValidMoves,
  loadChess,
  STARTING_FEN,
} from '../../../shared/utils/chess.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Config } from '@lichess-org/chessground/config';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RealtimeService } from '../../../core/services/realtime.service';
import { ChallengePair } from '../../../shared/models/challenge-pair.model';
import { BrushPicker } from '../../../shared/components/brush-picker/brush-picker';
import { PieceOverlay } from '../../../shared/components/piece-overlay/piece-overlay';
import { SoundService } from '../../../core/services/sound.service';
import { StampOverlay } from '../../../shared/components/stamp-overlay/stamp-overlay';
import { Exercise } from '../../../shared/models/exercise.model';
import { StampSvg } from '../../../shared/components/stamp-svg/stamp-svg';
import { StampType } from '../../../shared/models/stamp.model';

@Component({
  selector: 'app-student-view',
  templateUrl: './student-view.html',
  styleUrls: ['./student-view.scss'],
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    ChessBoard,
    BrushPicker,
    PieceOverlay,
    StampOverlay,
    StampSvg,
  ],
})
export class StudentView implements AfterViewInit, OnDestroy {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;
  @ViewChild('pieceOverlay') pieceOverlay!: PieceOverlay;
  @ViewChild('stampOverlay') stampOverlay!: StampOverlay;
  @ViewChild('brushPicker') brushPicker!: BrushPicker;
  realtimeService = inject(RealtimeService);
  soundService = inject(SoundService);

  // --- Exercise state ---
  stampCollection = signal<StampType[]>([]);
  mushroomCollection = signal<number>(0);
  loadedList = this.realtimeService.loadedExercises;

  exIndex = linkedSignal({
    source: () => this.loadedList(),
    computation: () => 0, // reset to 0 when a new list is loaded.
  });

  // droppedExercise takes precedence
  currentExercise = computed(
    () => this.realtimeService.droppedExercise() ?? this.loadedList()[this.exIndex()] ?? null,
  );
  moveHistory: WritableSignal<string[]> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => [],
  });

  status: WritableSignal<string> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => (this.exerciseChess.turn() === 'w' ? 'White to move' : 'Black to move'),
  });

  feedback: WritableSignal<string> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => '',
  });

   private isLocked: WritableSignal<boolean> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => false,
  });

  private isWaitingForStamp: WritableSignal<boolean> = linkedSignal({
    source: () => this.currentExercise(),
    computation: () => false,
  });

  exerciseFen = signal<string>(STARTING_FEN);
  challengeFen = signal<string>(STARTING_FEN);
  exerciseLastMove = signal<[Key, Key] | undefined>(undefined);
  challengeLastMove = signal<[Key, Key] | undefined>(undefined);


  private exerciseChess = new Chess();

  // --- Gather/disperse: snapshot of exercise state ---
  private isGathered = false;
  private frozenFen: string | null = null;
  private frozenMoveHistory: string[] | null = null;

  // --- Challenge props---
  myPair = computed(
    () =>
      this.realtimeService
        .challengePairs()
        .find(
          (p) =>
            p.white === this.realtimeService.studentName() ||
            p.black === this.realtimeService.studentName(),
        ) ?? null,
  );

  myColor = computed(() =>
    this.myPair()?.white === this.realtimeService.studentName() ? 'white' : 'black',
  );
  pendingPromotion = signal<{ orig: Key; dest: Key; pair: ChallengePair } | null>(null);
  private challengeChess = new Chess();
  
  // --- Board config ---

  private gatheredConfig = computed<Config>(() => ({
    fen: this.realtimeService.teacherFen(),
    orientation: 'white',
    movable: { free: false, color: undefined },
    draggable: { enabled: false },
    highlight: { lastMove: true, check: false },
    drawable: {
      enabled: true,
      visible: true,
      shapes: this.realtimeService.sharedArrows(),
    },
  }));
  private challengeConfig = computed<Config>(() => ({
      fen: this.challengeFen(),
      orientation: this.myColor(),
      turnColor: this.challengeChess.turn() === 'w' ? 'white' : 'black',
      coordinates: true,
      movable: {
        free: false,
        color: this.myColor(),
        dests: getValidMoves(this.challengeChess),
        events: { after: (orig, dest) => this.handleChallengeMove(orig, dest) },
      },
      draggable: { enabled: true, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.challengeLastMove(),
      drawable: { enabled: true, visible: true, shapes: this.realtimeService.sharedArrows() },
    }));

     private exerciseConfig = computed<Config>(() => ({
    fen: this.exerciseFen(),
    orientation: 'white',
    coordinates: true,
    turnColor: this.exerciseChess.turn() === 'w' ? 'white' : 'black',
    movable: {
      free: false,
      color: this.isLocked() ? undefined : (this.exerciseChess.turn() === 'w' ? 'white' : 'black'),
      dests: getValidMoves(this.exerciseChess),
      events: { after: (orig, dest) => this.handleMove(orig, dest) },
    },
    draggable: { enabled: true, showGhost: true },
    highlight: { lastMove: true, check: true },
    lastMove: this.exerciseLastMove(),
    drawable: { enabled: true, visible: true, shapes: this.realtimeService.sharedArrows() },
  }));

  boardConfig = computed<Config | null>(() => {
    if (this.realtimeService.mode() === 'gathered') return this.gatheredConfig();
    if (this.myPair()) return this.challengeConfig();
    return this.currentExercise() ? this.exerciseConfig() : null;
  });

   readonly emoji = signal(this.pickEmoji());


  constructor() {
     this.setupStateEffects();
    this.setupEventHandlers();

  }
  ngOnDestroy(): void {
    this.realtimeService.leave();
  }

  ngAfterViewInit(): void {
    const el = this.chessBoard.boardElement.nativeElement as HTMLElement;
    // left mouse click would remove all arrows, not allowed for students
    el.addEventListener(
      'pointerdown',
      (e: MouseEvent) => {
        if (e.button === 0 && this.realtimeService.mode() === 'gathered') {
          e.preventDefault();
        }
      },
      true,
    );

    // arrows
    el.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return; // middle mouse do what?
      setTimeout(() => {
        const shapes = this.chessBoard.api?.state.drawable.shapes ?? [];
        if (this.realtimeService.mode() === 'gathered') {
          if (e.button !== 0) this.realtimeService.sendSharedArrows(shapes);
        } else {
          this.realtimeService.sendMiniboardArrows(shapes);
        }
      }, 0);
    });
  }
  // --- Move handling ---
  handleChallengeMove(orig: Key, dest: Key) {
    const pair = this.myPair();
    if (!pair) return;
    if (this.isPawnPromotion(orig, dest)) {
      if (this.backrankpawnWins(dest)) {
        this.realtimeService.sendChallengeMove(pair.white,pair.black,this.challengeChess.fen(),orig,dest,true);
        this.youWin();
      } else {
        this.pendingPromotion.set({ orig, dest, pair });
      }
    } else {
      this.executeMove(orig, dest, pair);
    }
  }

  isPawnPromotion(orig: Key, dest: Key) {
    const piece = this.challengeChess.get(orig as any);
    return (
      piece?.type === 'p' &&
      ((piece.color === 'w' && dest[1] === '8') || (piece.color === 'b' && dest[1] === '1'))
    );
  }
  completePromotion(role: 'q' | 'r' | 'n' | 'b') {
    const p = this.pendingPromotion();
    if (!p) return;
    this.pendingPromotion.set(null);
    this.executeMove(p.orig, p.dest, p.pair, role);
  }
  handleMove(orig: Key, dest: Key) {
    try {
      const move = this.exerciseChess.move({ from: orig, to: dest });
      if (move) {
        this.exerciseFen.set(this.exerciseChess.fen());
        this.analyze(move);
      }
    } catch (e) {
      this.chessBoard.api?.set({ fen: this.exerciseChess.fen() });
    }
  }

  executeMove(orig: Key, dest: Key, pair: ChallengePair, promotion?: 'q' | 'r' | 'n' | 'b') {
    try {
      const move = this.challengeChess.move({ from: orig, to: dest, promotion });
      if (move) {
        this.challengeFen.set(this.challengeChess.fen());
        this.challengeLastMove.set([orig, dest]);
        this.playSound(move);
        const win = this.checkWinConditions(move);
        this.realtimeService.sendChallengeMove(pair.white,pair.black,this.challengeChess.fen(),orig,dest,win);
        if (win) this.youWin();
        if (promotion) this.chessBoard.api?.set({ fen: this.challengeChess.fen() });
      }
    } catch (e) {
      this.chessBoard.api?.set({ fen: this.challengeChess.fen() });
    }
  }

  // --- Exercise analysis ---
  analyze(move: Move) {
    const ex = this.currentExercise();
    if (!ex) return;
    const newHistory = [...this.moveHistory(), move.san];
    const solution = ex.solutions?.find((line) => newHistory.every((m, i) => line[i] === m));
    if (solution) {
      this.isLocked.set(false);
      if(ex.exerciseType==='mushroom'){
        this.soundService.playRandomBite();
        this.mushroomCollection.update(n=>n+1);
      }else{
        this.playSound(move);
      }
      this.updateStatus();
      
      this.moveHistory.set(newHistory);
      const isSolved = ex.solutions?.some((line) => line.length === newHistory.length);
      if (isSolved) {
        if (this.realtimeService.autoProgress()) this.progressAuto();
        else {
          this.isWaitingForStamp.set(true);
          this.isLocked.set(true);
        }
      } else {
        this.feedback.set('Good move!');
        //gombaszedés, same color always
        if (ex.exerciseType === 'mushroom') {
          this.exerciseChess.setTurn('w');
          this.exerciseFen.set(this.exerciseChess.fen());
          // this.updateBoard();
        } else {
          const nextIndex = newHistory.length;
          // computer thinking
          setTimeout(() => {
            const computerMove = this.exerciseChess.move(solution[nextIndex]);
            this.playSound(computerMove);
            this.exerciseFen.set(this.exerciseChess.fen());
            // this.updateBoard([computerMove.from as Key, computerMove.to as Key]);
            this.exerciseLastMove.set([computerMove.from as Key, computerMove.to as Key]);
            this.moveHistory.set([...newHistory, solution[nextIndex]]);
            this.pieceOverlay.hide();
          }, 2000);
        }
      }
    } else {
      if(this.realtimeService.autoRedo())
      this.handleMistake(ex,move)
      else
      this.isLocked.set(true);
    }
  }

  updateStatus() {
    if (this.exerciseChess.isCheckmate()) {
      this.status.set(
        'Checkmate! ' + (this.exerciseChess.turn() === 'w' ? 'Black' : 'White') + ' wins!',
      );
      this.pieceOverlay.show('checkmate', getKingSquare(this.exerciseChess)!);
    } else if (this.exerciseChess.isDraw()) {
      this.status.set('Draw!');
    } else if (this.exerciseChess.isCheck()) {
      this.soundService.play('gasp');
      this.status.set(
        'Check! ' + (this.exerciseChess.turn() === 'w' ? 'White' : 'Black') + ' to move',
      );
      this.pieceOverlay.show('alarmed', getKingSquare(this.exerciseChess)!);
    } else {
      this.status.set((this.exerciseChess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    }
  }

  nextExercise() {
    this.pieceOverlay.hide();
    this.exerciseLastMove.set(undefined);
    const size = this.loadedList().length - 1;
    if (this.exIndex() < size) {
      this.exIndex.update((n) => n + 1);
    } else {
      this.status.set('All done!');
    }
  }

  // --- Effect groups ---

  private setupStateEffects(): void {
    // Reset chess position when exercise changes
    effect(() => {
      const exercise = this.currentExercise();
      if (!exercise) return;
      this.pieceOverlay.hide();
      this.exerciseLastMove.set(undefined);
      if (exercise.exerciseType === 'challenge') {
        loadChess(this.challengeChess, exercise.fen);
        this.challengeFen.set(this.challengeChess.fen());
      } else {
        loadChess(this.exerciseChess, exercise.fen);
        this.exerciseFen.set(this.exerciseChess.fen());
      }
      this.updateStatus();
      this.chessBoard?.api?.set({ lastMove: [] });
    });

    // Single presence sync — fires whenever any relevant state changes
    effect(() => {
      const exercise = this.currentExercise();
      if (!exercise) return;
      const fen = exercise.exerciseType === 'challenge' ? this.challengeFen() : this.exerciseFen();
      this.realtimeService.updatePresence({
        fen,
        status: this.status(),
        feedback: this.feedback(),
        exIndex: this.exIndex(),
        locked: this.isLocked(),
        awaitingStamp: this.isWaitingForStamp(),
      });
    });

    // Gather/disperse
    effect(() => {
      const mode = this.realtimeService.mode();
      if (mode === 'gathered') this.onGather();
      else this.onDisperse();
    });

    // Reset challenge board when a pair is assigned
    effect(() => {
      const pair = this.myPair();
      if (pair) {
        this.pieceOverlay.hide();
        this.challengeChess = new Chess();
        this.challengeFen.set(STARTING_FEN);
        this.challengeLastMove.set(undefined);
        this.chessBoard?.api?.set({ lastMove: [] });
      }
    });
  }

  private setupEventHandlers(): void {
    // Teacher resume: undo last move, let student retry
    effect(() => {
      const resume = this.realtimeService.resume();
      if (!resume) return;
      this.realtimeService.resume.set(null);
      this.handleMistake(this.currentExercise());
    });

    // Teacher stamp: award stamp and advance
    effect(() => {
      const stamp = this.realtimeService.stamp();
      if (!stamp) return;
      this.realtimeService.stamp.set(null);
      this.progressWithStamp();
    });

    // Incoming challenge move from opponent
    effect(() => {
      const move = this.realtimeService.challengeMove();
      if (!move) return;
      const pair = this.myPair();
      if (!pair || move.white !== pair.white || move.black !== pair.black) return;
      if (move.over) {
        this.challengeChess.move({ ...move, promotion: 'q' });
      } else {
        loadChess(this.challengeChess, move.fen);
      }
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set([move.from as Key, move.to as Key]);
    });
  }


  private onGather() {
    this.pieceOverlay.hide();
    this.isGathered = true;
    this.frozenFen = this.exerciseChess.fen();
    this.frozenMoveHistory = [...this.moveHistory()];
    this.chessBoard?.api?.set({ lastMove: [], drawable: { shapes: [] } });
  }

  private onDisperse() {
    // Restore frozen state if we were gathered
    if (!this.isGathered) return;
    this.isGathered = false;
    loadChess(this.exerciseChess, this.frozenFen!);
    this.moveHistory.set(this.frozenMoveHistory ?? []);
    this.frozenFen = null;
    this.frozenMoveHistory = null;
    setTimeout(() => {
      this.chessBoard?.api?.set({
        fen: this.exerciseChess.fen(),
        lastMove: [],
        drawable: { enabled: true, shapes: [] },
      });
    }, 0);
  }


  // --- Private helpers ---
  private checkWinConditions(move: Move): boolean {
    // pair: ChallengePair, orig: Key, dest: Key,
    const ex = this.currentExercise();
    const normalizedSan = move.san
      .replace('x', '')
      .replace('+', '')
      .replace('#', '')
      .replace(/=[QRBN]/, '');
    const conditions = this.myColor() === 'white' ? ex?.whiteWinConditions : ex?.blackWinConditions;
    const captureAllWin =
      conditions?.includes('capture_all') &&
      this.challengeChess
        .board()
        .flat()
        .filter(Boolean)
        .every((p) => p!.color === (this.myColor() === 'white' ? 'w' : 'b'));
    const reachSquareWin = conditions?.includes(normalizedSan);
    if (captureAllWin || reachSquareWin) {
      // setTimeout(() => {
      //   const pairSwap = { white: pair.black, black: pair.white };
      //   this.realtimeService.challengePairs.update((pairs) =>
      //     pairs.filter((p) => p.white !== pair.white || p.black !== pair.black),
      //   );
      //   this.realtimeService.challengePairs.update((pairs) => [...pairs, pairSwap]);
      //   // this.realtimeService.sendChallengeRemove(pair);
      //   // this.realtimeService.syncChallengePair(pairSwap);
      //     this.challengeChess.load(this.currentExercise().fen,{skipValidation:this.currentExercise()?.skipFenValidation});
      //   this.feedback.set('');
      // }, 3000);
      return true;
    }
    return false;
  }
  private backrankpawnWins(dest: Key) {
    const ex = this.currentExercise();
    const conditions = this.myColor() === 'white' ? ex?.whiteWinConditions : ex?.blackWinConditions;
    return conditions?.includes(dest);
  }

  private youWin() {
    console.log('you win!');
  }
  private playSound(move: Move) {
    if (move.captured) this.soundService.play('take');
    else this.soundService.play('move');
  }

  private handleMistake(ex: Exercise, move?: Move) {
    this.exerciseChess.undo();
    if (ex.exerciseType === 'mushroom') {
      this.exerciseChess.setTurn('w');
    }
    this.exerciseFen.set(this.exerciseChess.fen());
    this.exerciseLastMove.set(undefined);
    if (move) {
      const mistake = ex.commonMistakes?.find((m) => m.move === move.san);
      if (mistake) {
        this.feedback.set(mistake.hint);
      } else {
        this.feedback.set(ex.defaultHint ?? 'Wrong move, try again');
      }
    }
    this.isLocked.set(false);
  }

  private progressWithStamp() {
    this.feedback.set('Solved! ✓');
    this.soundService.play('stamp');
    this.stampOverlay.stamp();
    const stamp = this.stampOverlay.currentStamp();
    this.isWaitingForStamp.set(false);
    this.isLocked.set(false);
    setTimeout(() => {
      //leave droppedExercise set so currentExercise doesn't recompute and defaults to the loadedListExercise
      this.stampCollection.update((arr) => [...arr, stamp as StampType]);
      if (!this.realtimeService.droppedExercise()) this.nextExercise();
    }, 3000);
  }

  private progressAuto(){
    this.feedback.set('Solved! ✓');
    this.soundService.playRandomCheering();
    setTimeout(() => {
      //leave droppedExercise set so currentExercise doesn't recompute and defaults to the loadedListExercise
      if (!this.realtimeService.droppedExercise()) this.nextExercise();
    }, 3000);
  }

  private pickEmoji(): string {
    const list = ['🐣','🐵','🐶','🐱','🦁','🐯','🐮','🐷','🐭','🐰','🐹','🐻','🐻‍❄️','🐼','🐣','🦉'];
    return list[Math.floor(Math.random() * list.length)];
  }
}
