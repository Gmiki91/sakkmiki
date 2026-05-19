import { Component, inject, signal, computed, effect, viewChild } from '@angular/core';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { SoundService } from '../../../core/services/sound.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { ChallengePair } from '../../../shared/models/challenge-pair.model';
import { getValidMoves, isPawnPromotion, loadChess, STARTING_FEN } from '../../../shared/utils/chess.utils';
import { Promotion } from "../../../shared/components/promotion/promotion";
import { PromotionService } from '../../../core/services/promotion.service';

@Component({
  selector: 'app-challenge-board',
  imports: [ChessBoard, Promotion],
  templateUrl: './challenge-board.html',
  styleUrl: './challenge-board.scss',
})
export class ChallengeBoard {
  private chessBoard = viewChild<ChessBoard>('chessBoard');
  private classroomStore = inject(ClassroomStore);
  private soundService = inject(SoundService);
  promotionService = inject(PromotionService);

  myPair = computed(() =>
    this.classroomStore.challengePairs().find(
      p => p.white === this.classroomStore.studentName() ||
           p.black === this.classroomStore.studentName()
    ) ?? null
  );

  myColor = computed<'white' | 'black'>(() =>
    this.myPair()?.white === this.classroomStore.studentName() ? 'white' : 'black'
  );

  private challengeFen = signal<string>(STARTING_FEN);

  private challengeLastMove = signal<[Key, Key] | undefined>(undefined);
  private challengeChess = new Chess();

  boardConfig = computed<Config>(() => ({
    fen: this.challengeFen(),
    orientation: this.myColor(),
    turnColor: this.challengeChess.turn() === 'w' ? 'white' : 'black',
    movable: {
      free: false,
      color: this.myColor(),
      dests: getValidMoves(this.challengeChess),
      events: { after: (orig, dest) => this.handleChallengeMove(orig, dest) },
      showDests: true,
    },
    check: this.challengeChess.isCheck(),
    draggable: { enabled: true, showGhost: true },
    highlight: { lastMove: true, check: true },
    lastMove: this.challengeLastMove(),
    drawable: { enabled: true, visible: true },
  }));

  constructor() {
      this.soundService.play('openingBell');
    // Reset board when pair is assigned or rematch occurs
    effect(() => {
      const pair = this.myPair();
      if (!pair) return;
      const exercise = this.classroomStore.droppedExercise()
        ?? this.classroomStore.assignedExercises()[0]
        ?? this.classroomStore.loadedExercises()[0]
        ?? null;
      if (exercise?.fen) loadChess(this.challengeChess, exercise.fen);
      else this.challengeChess = new Chess();
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set(undefined);
      this.chessBoard()?.api?.set({ lastMove: [] });
    });

    effect(() => {
      const fen = this.challengeFen();
      this.classroomStore.currentStudentFen.set(fen);
      this.classroomStore.broadcastStudentFen(this.classroomStore.studentName(), fen);
    });

    // Incoming move from opponent
    effect(() => {
      const move = this.classroomStore.challengeMove();
      if (!move) return;
      const pair = this.myPair();
      if (!pair || move.white !== pair.white || move.black !== pair.black) return;
      if (move.over) {
        this.challengeChess.move({ ...move, promotion: 'q' });
        this.soundService.play('lost');
      } else {
        loadChess(this.challengeChess, move.fen);
      }
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set([move.from as Key, move.to as Key]);
    });
  }

  async handleChallengeMove(orig: Key, dest: Key): Promise<void> {
    const pair = this.myPair();
    if (!pair) return;
    const piece = this.challengeChess.get(orig as any)!;
    if (isPawnPromotion(dest,piece)) {
      if (this.backrankPawnWins(dest)) {
        this.classroomStore.sendChallengeMove(pair.white, pair.black, this.challengeChess.fen(), orig, dest, true);
        this.soundService.playRandomCheering();
      } else {
        const role = await this.promotionService.requestPromotion(orig,dest);
        this.executeMove(orig,dest,pair,role);
        return;
      }
    } else {
      this.executeMove(orig, dest, pair);
    }
  }



  private executeMove(orig: Key, dest: Key, pair: ChallengePair, promotion?: 'q' | 'r' | 'n' | 'b'): void {
    try {
      const move = this.challengeChess.move({ from: orig, to: dest, promotion });
      if (!move) return;
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set([orig, dest]);
      this.soundService.play(move.captured ? 'take' : 'move');
      const win = this.checkWinConditions(move);
      this.classroomStore.sendChallengeMove(pair.white, pair.black, this.challengeChess.fen(), orig, dest, win);
      if (win) this.soundService.playRandomCheering();
      if (promotion) this.chessBoard()?.api?.set({ fen: this.challengeChess.fen() });
    } catch {
      this.chessBoard()?.api?.set({ fen: this.challengeChess.fen() });
    }
  }

  private checkWinConditions(move: Move): boolean {
    const exercise = this.classroomStore.droppedExercise()
      ?? this.classroomStore.assignedExercises()[0]
      ?? this.classroomStore.loadedExercises()[0]
      ?? null;
    const normalizedSan = move.san.replace('x','').replace('+','').replace('#','').replace(/=[QRBN]/,'');
    const conditions = this.myColor() === 'white' ? exercise?.whiteWinConditions : exercise?.blackWinConditions;
    const captureAllWin = conditions?.includes('capture_all') &&
      this.challengeChess.board().flat().filter(Boolean)
        .every(p => p!.color === (this.myColor() === 'white' ? 'w' : 'b'));
    const mate = this.challengeChess.isCheckmate()
    return !!(captureAllWin || conditions?.includes(normalizedSan)||mate);
  }

  private backrankPawnWins(dest: Key): boolean {
    const exercise = this.classroomStore.droppedExercise()
      ?? this.classroomStore.assignedExercises()[0]
      ?? this.classroomStore.loadedExercises()[0]
      ?? null;
    const conditions = this.myColor() === 'white' ? exercise?.whiteWinConditions : exercise?.blackWinConditions;
    return !!conditions?.includes(dest);
  }
}
