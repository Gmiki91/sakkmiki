import { Component, inject, signal, computed, effect, viewChild, output } from '@angular/core';
import { Chess, Move } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { SoundService } from '../../../core/services/sound.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { ChallengePair } from '../../../shared/models/challenge-pair.model';
import { getValidMoves, isPawnPromotion, loadChess, pieceValue, STARTING_FEN } from '../../../shared/utils/chess.utils';
import { Promotion } from "../../../shared/components/promotion/promotion";
import { PromotionService } from '../../../core/services/promotion.service';
import { CapturedPiece } from '../../../shared/models/captured-piece.model';

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

  capture = output<CapturedPiece>();
  promotion = output<CapturedPiece>();
  clearCapturedRack = output<void>();

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
  private localScore = signal(0);

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
    effect(() => {
      const pair = this.myPair();
      if (!pair) return;
      loadChess(this.challengeChess, pair.exercise.fen);
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set(undefined);
      this.localScore.set(0);
      this.chessBoard()?.api?.set({ lastMove: [] });
      this.clearCapturedRack.emit();
    });

    effect(() => {
      const fen = this.challengeFen();
      this.classroomStore.currentStudentFen.set(fen);
      this.classroomStore.broadcastStudentFen(this.classroomStore.studentName(), fen);
    });

    // Incoming move from opponent
    effect(() => {
      const event = this.classroomStore.challengeMove();
      if (!event) return;
      const pair = this.myPair();
      if (!pair || event.white !== pair.white || event.black !== pair.black) return;
      if(event.move.captured){
        const delta = pieceValue(event.move.captured) * (event.move.color === 'w' ? 1 : -1);
        this.localScore.update(s => s + delta);
        this.capture.emit({piece:event.move.captured,color:event.move.color,scoreDelta: delta});
      }
      if(event.move.promotion){
        const delta = (pieceValue(event.move.promotion) - 1) * (event.move.color === 'w' ? 1 : -1);
        this.localScore.update(s => s + delta);
        this.promotion.emit({piece:event.move.promotion,color:event.move.color,scoreDelta: delta});
      }
      if (event.over) {
        this.challengeChess.move({ from:event.move.from,to:event.move.to, promotion: event.move.promotion });
        this.soundService.play('lost');
        this.challengeChess.setTurn(event.move.color)
      } else {
        loadChess(this.challengeChess, event.fen);
      }
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set([event.move.from as Key, event.move.to as Key]);
    });

    // Incoming arrows from teacher
    effect(() => {
      const target = this.classroomStore.sharedArrows()?.name;
      const arrows = this.classroomStore.sharedArrows()?.arrows ?? [];
      if (target === 'all' || target === this.myPair()?.black || target === this.myPair()?.white) {
        this.chessBoard()?.api?.set({ drawable: { shapes: arrows } });
      }
    });
  }

  async handleChallengeMove(orig: Key, dest: Key): Promise<void> {
    const pair = this.myPair();
    if (!pair) return;
    const piece = this.challengeChess.get(orig as any)!;
    if (isPawnPromotion(dest,piece)) {
      const role = await this.promotionService.requestPromotion(orig,dest);
      this.executeMove(orig,dest,pair,role);
      return;
    } else {
      this.executeMove(orig, dest, pair);
    }
  }

  onMouseUp(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    setTimeout(() => {
      const shapes = this.chessBoard()?.api?.state.drawable.shapes ?? [];
      this.classroomStore.sendMiniboardArrows(shapes);
    }, 0);
  }


  private executeMove(orig: Key, dest: Key, pair: ChallengePair, promotion?: 'q' | 'r' | 'n' | 'b'): void {
    try {
      const move = this.challengeChess.move({ from: orig, to: dest, promotion });
      if (!move) return;
      if(move.captured){
        const delta = pieceValue(move.captured) * (move.color === 'w' ? 1 : -1);
        this.localScore.update(s => s + delta);
        this.capture.emit({piece:move.captured,color:move.color,scoreDelta: delta});
      }
      if(move.promotion){
        const delta = (pieceValue(move.promotion) - 1) * (move.color === 'w' ? 1 : -1);
        this.localScore.update(s => s + delta);
        this.promotion.emit({piece:move.promotion,color:move.color,scoreDelta: delta});
      }

      if (this.backrankPawnWins(dest)) {
        this.classroomStore.sendChallengeMove(pair.white, pair.black, this.challengeChess.fen(), move, true);
        this.soundService.playRandomCheering();
        return;
      }
      this.challengeFen.set(this.challengeChess.fen());
      this.challengeLastMove.set([orig, dest]);
      this.soundService.play(move.captured ? 'take' : 'move');
      const win = this.checkWinConditions(move);
      this.classroomStore.sendChallengeMove(pair.white, pair.black, this.challengeChess.fen(), move, win);
      if (win) this.soundService.playRandomCheering();
      if (promotion) this.chessBoard()?.api?.set({ fen: this.challengeChess.fen() });
    } catch {
      this.chessBoard()?.api?.set({ fen: this.challengeChess.fen() });
    }
  }

  private checkWinConditions(move: Move): boolean {
    const pair = this.myPair();
    if (!pair) return false;
    const exercise = pair.exercise;
    const normalizedSan = move.san.replace('x','').replace('+','').replace('#','').replace(/=[QRBN]/,'');
    const conditions = this.myColor() === 'white' ? exercise?.whiteWinConditions : exercise?.blackWinConditions;
    const captureAllWin = conditions?.includes('capture_all') &&
      this.challengeChess.board().flat().filter(Boolean)
        .every(p => p!.color === (this.myColor() === 'white' ? 'w' : 'b'));
    const mate = this.challengeChess.isCheckmate()
    const threshold = pair.scoreDiffWin;
    const scoreDiffWin = !!threshold && threshold > 0 && (
      (this.myColor() === 'white' && this.localScore() >= threshold) ||
      (this.myColor() === 'black' && this.localScore() <= -threshold)
    );
    return !!(captureAllWin || conditions?.includes(normalizedSan)||mate||scoreDiffWin);
  }

  private backrankPawnWins(dest: Key): boolean {
    const exercise = this.myPair()?.exercise;
    const conditions = this.myColor() === 'white' ? exercise?.whiteWinConditions : exercise?.blackWinConditions;
    return !!conditions?.includes(dest);
  }
}
