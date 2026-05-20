import { Component, inject, signal, computed, effect, viewChild } from '@angular/core';
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
  STARTING_FEN,
} from '../../../shared/utils/chess.utils';
import { Promotion, PromotionPiece } from '../../../shared/components/promotion/promotion';
import { PromotionService } from '../../../core/services/promotion.service';

type PeerBoard = { name: string; config: Config };

@Component({
  selector: 'app-simul-board',
  imports: [ChessBoard, Promotion],
  templateUrl: './simul-board.html',
  styleUrl: './simul-board.scss',
})
export class SimulBoard {
  private chessBoard = viewChild<ChessBoard>('chessBoard');
  private classroomStore = inject(ClassroomStore);
  private soundService = inject(SoundService);
  promotionService = inject(PromotionService);

  private fen = signal<string>(STARTING_FEN);

  private simulChess = new Chess();
  private simulLastMove = signal<[Key, Key] | undefined>(undefined);
  peerBoards = signal<PeerBoard[]>([]);

  boardConfig = computed<Config>(() => {
    const color = this.classroomStore.isDuelActive()
      ? this.classroomStore.duelColor()
      : 'b';
    const isMyTurn = this.simulChess.turn() === color;
    const myColor = color === 'w' ? 'white' : 'black';
    return {
      fen: this.fen(),
      orientation: myColor,
      turnColor: isMyTurn ? myColor : (myColor === 'white' ? 'black' : 'white'),
      movable: {
        free: false,
        color: isMyTurn ? myColor : undefined,
        dests: isMyTurn ? getValidMoves(this.simulChess) : new Map(),
        events: { after: (orig: Key, dest: Key) => this.handleSimulMove(orig, dest) },
        showDests: true,
      },
      check: this.simulChess.isCheck(),
      draggable: { enabled: isMyTurn, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.simulLastMove(),
      drawable: { enabled: true, visible: true },
    };
  });

  constructor() {
    this.soundService.play('openingBell');
    // Initialize on simul start
    effect(() => {
      if (this.classroomStore.mode() === 'simul') {
        this.resetFen();
      }
    });

    // Receive teacher's move
    effect(() => {
      const move = this.classroomStore.incomingSimulTeacherMove();
      if (!move) return;
      this.classroomStore.incomingSimulTeacherMove.set(null);
      const myName = this.classroomStore.studentName();
      if (move.studentName !== myName) {
        this.updatePeerBoard(move.studentName, move.fen, move.from, move.to);
        return;
      }
      try {
        loadChess(this.simulChess, move.fen);
        this.fen.set(this.simulChess.fen());
        this.simulLastMove.set([move.from as Key, move.to as Key]);
        this.soundService.play(move.capture ? 'take' : 'move');
      } catch {
        /* ignore */
      }
    });

    // Receive a peer student's move (sidebar update)
    effect(() => {
      const move = this.classroomStore.incomingSimulStudentMove();
      if (!move) return;
      this.classroomStore.incomingSimulStudentMove.set(null);
      if (move.studentName === this.classroomStore.studentName()) return;
      this.updatePeerBoard(move.studentName, move.fen, move.from, move.to);
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


  async handleSimulMove(orig: Key, dest: Key): Promise<void> {
    if (this.simulChess.turn() !== 'b') return;
    const piece = this.simulChess.get(orig as any)!;
    if (isPawnPromotion(dest, piece)) {
      const role = await this.promotionService.requestPromotion(orig,dest);
      this.executeMove(orig,dest,role);
      return;
    }
    this.executeMove(orig, dest);
  }

  private executeMove(orig: Key, dest: Key, promotion?: PromotionPiece): void {
    try {
      const move = this.simulChess.move({ from: orig, to: dest, promotion });
      if (!move) return;
      this.fen.set(this.simulChess.fen());
      this.simulLastMove.set([orig, dest]);
      this.soundService.play(move.captured ? 'take' : 'move');
      if (promotion) this.chessBoard()?.api?.set({ fen: this.simulChess.fen() });
      this.classroomStore.sendSimulStudentMove(this.simulChess.fen(), orig, dest);
    } catch {
      this.fen.set(this.simulChess.fen());
    }
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

  private resetFen(){
    const fen = this.classroomStore.currentStudentFen();
    loadChess(this.simulChess, fen);
    this.fen.set(fen);
    this.simulLastMove.set(undefined);
    this.peerBoards.set([]);
  }
}
