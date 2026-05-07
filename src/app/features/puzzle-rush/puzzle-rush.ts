import {
  Component,
  inject,
  signal,
  computed,
  ViewChild,
  model,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { ChessBoard } from '../../shared/components/chess-board/chess-board';
import {
  ExerciseListPicker,
  ExerciseListPickerData,
} from '../../shared/components/exercise-list-picker/exercise-list-picker';
import { ExerciseList } from '../../shared/models/exercise-list.model';
import { Exercise } from '../../shared/models/exercise.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { SoundService } from '../../core/services/sound.service';
import { getPlayerOrientation, getValidMoves, isPawnPromotion, loadChess, STARTING_FEN } from '../../shared/utils/chess.utils';
import { Promotion, PromotionPiece } from '../../shared/components/promotion/promotion';
import { PromotionService } from '../../core/services/promotion.service';

type Phase = 'idle' | 'running' | 'finished';

@Component({
  selector: 'app-puzzle-rush',
  imports: [MatButtonModule, MatIconModule, MatInputModule, MatCardModule, FormsModule, ChessBoard,Promotion],
  templateUrl: './puzzle-rush.html',
  styleUrl: './puzzle-rush.scss',
})
export class PuzzleRush implements OnInit, OnDestroy {
  @ViewChild('chessBoard') chessBoard!: ChessBoard;

  exerciseService = inject(ExerciseService);
  soundService = inject(SoundService);
  promotionService = inject(PromotionService);
  dialog = inject(MatDialog);

  // Settings
  duration = model(180);
  timeBonus = model(3);
  timePenalty = model(10);

  // State
  phase = signal<Phase>('idle');
  score = signal(0);
  wrongMoves = signal(0);
  timeLeft = signal(180);
  flashState = signal<'correct' | 'incorrect' | null>(null);

  selectedList = signal<ExerciseList | null>(null);
  currentPuzzle = signal<Exercise | null>(null);
  currentFen = signal<string>(STARTING_FEN);
  moveHistory = signal<string[]>([]);
  lastMove = signal<[Key, Key] | []>([]); // for computer move highlight

  private puzzleQueue: Exercise[] = [];
  private currentIndex = 0;
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
        events: {
          after: (orig, dest) => this.handleMove(orig, dest),
        },
      },
      draggable: { enabled: true, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.lastMove(),
    };
  });

  ngOnInit(): void {
    this.exerciseService.loadExerciseLists();
  }

  ngOnDestroy(): void {
    clearInterval(this.timerInterval);
  }

  openListPicker(): void {
    this.dialog
      .open(ExerciseListPicker, {
        width: '360px',
        data: {
          multiSelect: false,
          alreadySelected: this.selectedList() ? [this.selectedList()!] : [],
          puzzleRush:true
        } satisfies ExerciseListPickerData,
      })
      .afterClosed()
      .subscribe((selections: ExerciseList[] | null) => {
        if (!selections?.length) return;
        this.selectedList.set(selections[0]);
      });
  }

  start(): void {
    if (!this.selectedList()) return;
    this.puzzleQueue = [...this.selectedList()!.exercises].sort(() => Math.random() - 0.5);
    this.currentIndex = 0;
    this.score.set(0);
    this.wrongMoves.set(0);
    this.timeLeft.set(this.duration());
    this.phase.set('running');
    this.loadPuzzle(this.currentIndex);
    this.startTimer();
  }

  restart(): void {
    clearInterval(this.timerInterval);
    this.phase.set('idle');
    this.currentPuzzle.set(null);
    this.moveHistory.set([]);
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
    this.executeMove(orig,dest);
  }

  private executeMove(orig: Key, dest: Key,role?:PromotionPiece): void {
    try {
      const move = this.chess.move({ from: orig, to: dest,promotion:role });
      if (!move) return;
      this.analyze(move);
    } catch {
      loadChess(this.chess, this.currentPuzzle()!.fen); // revert chess state
      this.currentFen.set(this.chess.fen());            // signal drives the board
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
        // correct move but not done yet, play computer response
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
      if (this.timeLeft() <= 0) {
        this.finish();
      }
    }, 1000);
  }

  private finish(): void {
    clearInterval(this.timerInterval);
    this.phase.set('finished');
    this.currentPuzzle.set(null);
  }
}
