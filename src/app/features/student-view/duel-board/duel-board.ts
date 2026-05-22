import { Component, inject, signal, computed, effect, viewChild, output, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Chess } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { SoundService } from '../../../core/services/sound.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import {
  getValidMoves,
  isPawnPromotion,
  loadChess,
  pieceValue,
  STARTING_FEN,
} from '../../../shared/utils/chess.utils';
import { Promotion, PromotionPiece } from '../../../shared/components/promotion/promotion';
import { PromotionService } from '../../../core/services/promotion.service';
import { CapturedPiece } from '../../../shared/models/captured-piece.model';
type PeerBoard = { name: string; config: Config };
@Component({
  selector: 'app-duel-board',
  imports: [ChessBoard, Promotion],
  templateUrl: './duel-board.html',
  styleUrl: './duel-board.scss',
})
export class DuelBoard {
  private chessBoard = viewChild<ChessBoard>('chessBoard');
  private classroomStore = inject(ClassroomStore);
  private soundService = inject(SoundService);
  promotionService = inject(PromotionService);

  capture = output<CapturedPiece>();
  promotion = output<CapturedPiece>();
  clearCapturedRack = output<void>();

  private fen = signal<string>(STARTING_FEN);
  private duelLastMove = signal<[Key, Key] | undefined>(undefined);
  private localScore = signal(0);
  peerBoards = signal<PeerBoard[]>([]);
  
  private duelChess = new Chess();

  boardConfig = computed<Config>(() => {
    const color = this.classroomStore.duelColor();
    const isMyTurn = this.duelChess.turn() === color;
    const myColor = color === 'w' ? 'white' : 'black';
    return {
      fen: this.fen(),
      orientation: myColor,
      turnColor: isMyTurn ? myColor : (myColor === 'white' ? 'black' : 'white'),
      movable: {
        free: false,
        color: isMyTurn ? myColor : undefined,
        dests: isMyTurn ? getValidMoves(this.duelChess) : new Map(),
        events: { after: (orig: Key, dest: Key) => this.handleDuelMove(orig, dest) },
        showDests: true,
      },
      check: this.duelChess.isCheck(),
      draggable: { enabled: isMyTurn, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.duelLastMove(),
      drawable: { enabled: true, visible: true },
    };
  });

  constructor() {
    this.soundService.play('openingBell');
    // Initialize on duel start
    effect(() => {
      if (this.classroomStore.isDuelActive()) {
        this.resetFen();
      }
    });

    // Receive teacher's move
    this.classroomStore.incomingDuelTeacherMove$.pipe(takeUntilDestroyed()).subscribe(event=>{
      if (event.studentName !== this.classroomStore.studentName()) {
        this.updatePeerBoard(event.studentName, event.fen, event.move.from, event.move.to);
        return;
      }
        try {
        loadChess(this.duelChess, event.fen);
        this.fen.set(this.duelChess.fen());
        this.duelLastMove.set([event.move.from as Key, event.move.to as Key]);
        this.soundService.play(event.move.captured ? 'take' : 'move');
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
      } catch {
        /* ignore */
      }
    });

    // Receive a peer student's move (sidebar update)
    this.classroomStore.incomingDuelStudentMove$.pipe(takeUntilDestroyed()).subscribe(event=>{
      if (event.studentName !== this.classroomStore.studentName())
        this.updatePeerBoard(event.studentName, event.fen, event.move.from, event.move.to);
    });

    // If duelColor is changed by teacher, reset fen
    effect(() => {
      this.classroomStore.duelColor();
      this.resetFen();
    });

    // Shared arrows from teacher
    effect(() => {
      const target = this.classroomStore.sharedArrows()?.name;
      const arrows = this.classroomStore.sharedArrows()?.arrows ?? [];
      if (target === 'all' || target === this.classroomStore.studentName()) {
        this.chessBoard()?.api?.set({ drawable: { shapes: arrows } });
      }
    });
  }

  onMouseUp(e: MouseEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    setTimeout(() => {
      const shapes = this.chessBoard()?.api?.state.drawable.shapes ?? [];
      this.classroomStore.sendMiniboardArrows(shapes);
    }, 0);
  }

  async handleDuelMove(orig: Key, dest: Key): Promise<void> {
    const color = this.classroomStore.duelColor();
    if (this.duelChess.turn() !== color) return;
    const piece = this.duelChess.get(orig as any)!;
    if (isPawnPromotion(dest, piece)) {
      const role = await this.promotionService.requestPromotion(orig, dest);
      this.executeMove(orig, dest, role);
      return;
    }
    this.executeMove(orig, dest);
  }

  private executeMove(orig: Key, dest: Key, promotion?: PromotionPiece): void {
    try {
      const move = this.duelChess.move({ from: orig, to: dest, promotion });
      if (!move) return;
      if(move.captured){
        const delta = pieceValue(move.captured) * (move.color === 'w' ? 1 : -1);
        this.localScore.update(s => s + delta);
        this.capture.emit({piece:move.captured,color:move.color,scoreDelta: delta});
      }
      this.fen.set(this.duelChess.fen());
      this.duelLastMove.set([orig, dest]);
      this.soundService.play(move.captured ? 'take' : 'move');
      if (promotion){
        this.chessBoard()?.api?.set({ fen: this.duelChess.fen() });
        const delta = (pieceValue(promotion) - 1) * (move.color === 'w' ? 1 : -1);
        this.localScore.update(s => s + delta);
        this.promotion.emit({piece:promotion,color:move.color,scoreDelta: delta});
      }
      this.classroomStore.sendDuelStudentMove(this.duelChess.fen(), move);
      this.checkScoreDiffWin();
    } catch {
      this.fen.set(this.duelChess.fen());
    }
  }

  private checkScoreDiffWin(): void {
    const config = this.classroomStore.duelConfig();
    if (!config?.scoreDiffWin || config.scoreDiffWin <= 0) return;
    const studentColor = this.classroomStore.duelColor();
    const won = (studentColor === 'w' && this.localScore() >= config.scoreDiffWin) ||
                (studentColor === 'b' && this.localScore() <= -config.scoreDiffWin);
    if (won) this.soundService.playRandomCheering();
  }

  private updatePeerBoard(name: string, fen: string, from: string, to: string): void {
    const chess = new Chess();
    try {
      loadChess(chess, fen);
    } catch {
      return;
    }
    const config: Config = {
      fen,
      orientation: 'black',
      coordinates: false,
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      lastMove: [from as Key, to as Key],
      highlight: { lastMove: true, check: chess.isCheck() },
    };
    this.peerBoards.update((boards) => {
      const entry: PeerBoard = { name, config };
      const exists = boards.find((b) => b.name === name);
      return exists ? boards.map((b) => (b.name === name ? entry : b)) : [...boards, entry];
    });
  }

  private resetFen() {
    const fen = this.classroomStore.currentStudentFen();
    loadChess(this.duelChess, fen);
    this.fen.set(fen);
    this.duelLastMove.set(undefined);
    this.localScore.set(0);
    this.clearCapturedRack.emit();
  }
}
