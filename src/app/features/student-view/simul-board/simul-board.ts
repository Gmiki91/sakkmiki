import { Component, inject, signal, computed, effect } from '@angular/core';
import { Chess } from 'chess.js';
import { Key } from '@lichess-org/chessground/types';
import { Config } from '@lichess-org/chessground/config';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { SoundService } from '../../../core/services/sound.service';
import { ChessBoard } from '../../../shared/components/chess-board/chess-board';
import { getValidMoves, loadChess, STARTING_FEN } from '../../../shared/utils/chess.utils';

type PeerBoard = { name: string; config: Config };

@Component({
  selector: 'app-simul-board',
  imports: [ChessBoard],
  templateUrl: './simul-board.html',
  styleUrl: './simul-board.scss',
})
export class SimulBoard {
  private classroomStore = inject(ClassroomStore);
  private soundService = inject(SoundService);

  // Public — read by StudentView for presence
  simulFen = signal<string>(STARTING_FEN);

  private simulChess = new Chess();
  private simulLastMove = signal<[Key, Key] | undefined>(undefined);
  peerBoards = signal<PeerBoard[]>([]);

  boardConfig = computed<Config>(() => {
    const isBlackTurn = this.simulChess.turn() === 'b';
    return {
      fen: this.simulFen(),
      orientation: 'black',
      turnColor: isBlackTurn ? 'black' : 'white',
      movable: {
        free: false,
        color: isBlackTurn ? 'black' : undefined,
        dests: isBlackTurn ? getValidMoves(this.simulChess) : new Map(),
        events: { after: (orig: Key, dest: Key) => this.handleSimulMove(orig, dest) },
        showDests: true,
      },
      check: this.simulChess.isCheck(),
      draggable: { enabled: isBlackTurn, showGhost: true },
      highlight: { lastMove: true, check: true },
      lastMove: this.simulLastMove(),
      drawable: { enabled: true, visible: true },
    };
  });

  constructor() {
    // Reset on simul start
    effect(() => {
      if (this.classroomStore.mode() !== 'simul') return;
      this.simulChess.reset();
      this.simulFen.set(this.simulChess.fen());
      this.simulLastMove.set(undefined);
      this.peerBoards.set([]);
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
        this.simulFen.set(this.simulChess.fen());
        this.simulLastMove.set([move.from as Key, move.to as Key]);
        this.soundService.play('move');
      } catch { /* ignore */ }
    });

    // Receive a peer student's move (sidebar update)
    effect(() => {
      const move = this.classroomStore.incomingSimulStudentMove();
      if (!move) return;
      this.classroomStore.incomingSimulStudentMove.set(null);
      if (move.studentName === this.classroomStore.studentName()) return;
      this.updatePeerBoard(move.studentName, move.fen, move.from, move.to);
    });
  }

  handleSimulMove(orig: Key, dest: Key): void {
    if (this.simulChess.turn() !== 'b') return;
    try {
      const move = this.simulChess.move({ from: orig, to: dest });
      if (!move) return;
      this.simulFen.set(this.simulChess.fen());
      this.simulLastMove.set([orig, dest]);
      this.soundService.play(move.captured ? 'take' : 'move');
      this.classroomStore.sendSimulStudentMove(this.simulChess.fen(), orig, dest);
    } catch {
      this.simulFen.set(this.simulChess.fen());
    }
  }

  private updatePeerBoard(name: string, fen: string, from: string, to: string): void {
    const chess = new Chess();
    try { loadChess(chess, fen); } catch { return; }
    const config: Config = {
      fen, orientation: 'black', coordinates: false,
      movable: { free: false, color: undefined },
      draggable: { enabled: false },
      lastMove: [from as Key, to as Key],
      highlight: { lastMove: true, check: chess.isCheck() },
    };
    this.peerBoards.update(boards => {
      const entry: PeerBoard = { name, config };
      const exists = boards.find(b => b.name === name);
      return exists ? boards.map(b => b.name === name ? entry : b) : [...boards, entry];
    });
  }
}
