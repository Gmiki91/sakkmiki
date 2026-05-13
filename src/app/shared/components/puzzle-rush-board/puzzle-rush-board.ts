import {
  Component, input, output, signal, computed, ViewChild, OnDestroy, inject, effect,
} from '@angular/core';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { ChessBoard } from '../chess-board/chess-board';
import { Exercise } from '../../models/exercise.model';
import { SoundService } from '../../../core/services/sound.service';
import { PromotionService } from '../../../core/services/promotion.service';
import { getPlayerOrientation, getValidMoves, isPawnPromotion, loadChess, STARTING_FEN } from '../../utils/chess.utils';
import { Promotion, PromotionPiece } from '../promotion/promotion';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-puzzle-rush-board',
  imports: [ChessBoard, Promotion, MatIconModule, MatButtonModule],
  templateUrl: './puzzle-rush-board.html',
  styleUrl: './puzzle-rush-board.scss',
})
export class PuzzleRushBoard implements OnDestroy {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;

  private soundService = inject(SoundService);
  promotionService = inject(PromotionService);

  exercises = input<Exercise[]>([]);
  duration = input(180);
  timeBonus = input(3);
  timePenalty = input(10);
  autoStart = input(false);
  hideRestart = input(false);

  scoreChange = output<{ score: number; wrongMoves: number; currentIndex: number; totalPuzzles: number }>();
  fenChange = output<string>();
  finished = output<{ score: number; wrongMoves: number; accuracy: number }>();

  phase = signal<'idle' | 'running' | 'finished'>('idle');
  score = signal(0);
  wrongMoves = signal(0);
  timeLeft = signal(0);
  flashState = signal<'correct' | 'incorrect' | null>(null);

  currentPuzzle = signal<Exercise | null>(null);
  currentFen = signal<string>(STARTING_FEN);
  moveHistory = signal<string[]>([]);
  lastMove = signal<[Key, Key] | []>([]);

  private puzzleQueue: Exercise[] = [];
  private currentIndex = 0;
  private totalPuzzles = 0;
  private chess = new Chess();
  private timerInterval?: ReturnType<typeof setInterval>;

  accuracy = computed(() => {
    const total = this.score() + this.wrongMoves();
    if (total === 0) return 100;
    return Math.round((this.score() / total) * 100);
  });

  boardConfig = computed<Config | null>(() => {
    const puzzle = this.currentPuzzle();
    const fen = this.currentFen();
    if (!puzzle || this.phase() !== 'running') return null;
    return {
      fen,
      orientation: getPlayerOrientation(puzzle),
      turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
      movable: {
        free: false,
        color: this.chess.turn() === 'w' ? 'white' : 'black',
        dests: getValidMoves(this.chess),
        events: { after: (orig, dest) => this.handleMove(orig, dest) },
      },
      draggable: { enabled: true, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.lastMove(),
    };
  });

  constructor() {
    effect(() => {
      if (this.autoStart() && this.phase() === 'idle' && this.exercises().length > 0) {
        this.start();
      }
    });
    effect(() => {
      if (this.phase() === 'running') {
        this.fenChange.emit(this.currentFen());
      }
    });
  }

  start(): void {
    const exs = this.exercises();
    if (!exs.length) return;
    this.puzzleQueue = [...exs].sort(() => Math.random() - 0.5);
    this.currentIndex = 0;
    this.totalPuzzles = exs.length;
    this.score.set(0);
    this.wrongMoves.set(0);
    this.timeLeft.set(this.duration());
    this.phase.set('running');
    this.loadPuzzle(0);
    this.startTimer();
  }

  restart(): void {
    this.stopTimer();
    this.phase.set('idle');
    this.currentPuzzle.set(null);
    this.moveHistory.set([]);
  }

  ngOnDestroy(): void {
    this.stopTimer();
  }

  private emitProgress(): void {
    this.scoreChange.emit({
      score: this.score(),
      wrongMoves: this.wrongMoves(),
      currentIndex: this.currentIndex,
      totalPuzzles: this.totalPuzzles,
    });
  }

  private loadPuzzle(index: number): void {
    if (index >= this.puzzleQueue.length) {
      this.finish();
      return;
    }
    const puzzle = this.puzzleQueue[index];
    this.moveHistory.set([]);
    loadChess(this.chess, puzzle.fen);
    this.currentFen.set(this.chess.fen());
    this.lastMove.set([]);
    this.currentPuzzle.set(puzzle);
    this.emitProgress();
    if (puzzle.lastMove) {
      setTimeout(() => {
        const { from, to } = puzzle.lastMove!;
        this.chess.move({ from, to });
        this.soundService.play('move');
        this.currentFen.set(this.chess.fen());
        this.lastMove.set([from as Key, to as Key]);
      }, 250);
    }
  }

  private async handleMove(orig: Key, dest: Key): Promise<void> {
    const piece = this.chess.get(orig as any)!;
    if (isPawnPromotion(dest, piece)) {
      const role = await this.promotionService.requestPromotion(orig, dest);
      this.executeMove(orig, dest, role);
      return;
    }
    this.executeMove(orig, dest);
  }

  private executeMove(orig: Key, dest: Key, role?: PromotionPiece): void {
    try {
      const move = this.chess.move({ from: orig, to: dest, promotion: role });
      if (!move) return;
      this.analyze(move);
    } catch {
      loadChess(this.chess, this.currentPuzzle()!.fen);
      this.currentFen.set(this.chess.fen());
    }
  }

  private analyze(move: Move): void {
    const puzzle = this.currentPuzzle();
    if (!puzzle) return;
    const newHistory = [...this.moveHistory(), move.san];
    const solution = puzzle.solutions?.find((line) => newHistory.every((m, i) => line[i] === m));

    if (solution) {
      this.moveHistory.set(newHistory);
      const isSolved = solution.length === newHistory.length;
      if (isSolved) {
        this.onCorrect();
      } else {
        const nextIndex = newHistory.length;
        this.soundService.play('move');
        setTimeout(() => {
          const computerMove = this.chess.move(solution[nextIndex]);
          if (computerMove) {
            this.soundService.play('move');
            this.currentFen.set(this.chess.fen());
            this.lastMove.set([computerMove.from as Key, computerMove.to as Key]);
            this.moveHistory.set([...newHistory, solution[nextIndex]]);
          }
        }, 250);
      }
    } else {
      this.onWrong();
    }
  }

  private onCorrect(): void {
    this.score.update((s) => s + 1);
    this.timeLeft.update((t) => Math.min(t + this.timeBonus(), this.duration()));
    this.soundService.play('success');
    this.flash('correct');
    this.emitProgress();
    setTimeout(() => {
      this.currentIndex++;
      this.loadPuzzle(this.currentIndex);
    }, 600);
  }

  private onWrong(): void {
    this.wrongMoves.update((w) => w + 1);
    this.timeLeft.update((t) => Math.max(t - this.timePenalty(), 0));
    this.soundService.play('error');
    this.flash('incorrect');
    this.emitProgress();
    if (this.timeLeft() <= 0) {
      this.finish();
      return;
    }
    setTimeout(() => {
      this.currentIndex++;
      this.loadPuzzle(this.currentIndex);
    }, 600);
  }

  private flash(type: 'correct' | 'incorrect'): void {
    this.flashState.set(type);
    setTimeout(() => this.flashState.set(null), 600);
  }

  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      this.timeLeft.update((t) => t - 1);
      if (this.timeLeft() <= 0) this.finish();
    }, 1000);
  }

  private stopTimer(): void {
    clearInterval(this.timerInterval);
  }

  private finish(): void {
    this.stopTimer();
    this.phase.set('finished');
    this.currentPuzzle.set(null);
    this.emitProgress();
    this.finished.emit({
      score: this.score(),
      wrongMoves: this.wrongMoves(),
      accuracy: this.accuracy(),
    });
  }
}
