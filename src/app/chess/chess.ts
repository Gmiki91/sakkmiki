import { Component, AfterViewInit, ViewChild, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chess, SQUARES, Color } from 'chess.js';
import { Chessground } from '@lichess-org/chessground';
import { Key } from '@lichess-org/chessground/types';
import type { Api } from '@lichess-org/chessground/api';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-chess',
  templateUrl: './chess.html',
  styleUrls: ['./chess.scss'],
  imports: [ 
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
  ],
})
export class ChessComponent implements AfterViewInit {
  @ViewChild('chessboard') boardElement!: ElementRef;
  private api?: Api;
  private chess = new Chess();
  status = signal<string>('White to move');
  fen = signal<string>('');

  ngAfterViewInit() {
    this.api = Chessground(this.boardElement.nativeElement, {
      fen: this.chess.fen(),
      orientation: 'white',
      coordinates: true,
      movable: {
        free: false,
        color: 'white',
        dests: this.getValidMoves(),
        events: {
          after: (orig, dest) => this.onMove(orig, dest),
        },
      },
      draggable: {
        enabled: true,
        showGhost: true,
      },
      highlight: {
        lastMove: true,
        check: true,
      }
    });
  }

  // Get valid moves for all pieces
  getValidMoves() {
    const dests = new Map();
    for (const square of SQUARES) {
      const moves = this.chess.moves({ square: square, verbose: true });
      if (moves.length > 0) {
        dests.set(
          square,
          moves.map((m) => m.to),
        );
      }
    }
    return dests;
  }

  onMove(orig: Key, dest: Key) {
    try {
      // Try to make the move in chess.js
      const move = this.chess.move({ from: orig, to: dest });
      if (move) {
        this.updateBoard();
        this.updateStatus();
      }
    } catch (e) {
      // Invalid move - revert
      console.error('Invalid move:', e);
      this.api?.set({
        fen: this.chess.fen(),
      });
    }
  }

  updateStatus() {
    if (this.chess.isCheckmate()) {
      this.checkKing(this.chess.turn())
      this.status.update(
        () => 'Checkmate! ' + (this.chess.turn() === 'w' ? 'Black' : 'White') + ' wins!',
      );
    } else if (this.chess.isDraw()) {
      this.status.update(() => 'Draw!');
    } else if (this.chess.isCheck()) {
      this.checkKing(this.chess.turn())
      this.status.update(
        () => 'Check! ' + (this.chess.turn() === 'w' ? 'White' : 'Black') + ' to move',
      );
    } else {
      this.status.update(() => (this.chess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    }
  }

  updateBoard(){
    this.api?.set({
          fen: this.chess.fen(),
          turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
          movable: {
            color: this.chess.turn() === 'w' ? 'white' : 'black',
            dests: this.getValidMoves(),
          },
        });
  }

  checkKing(color:Color){
    this.api?.set({check:color==='w' ? 'white':'black'})
  }

  reset() {
    this.chess.reset();
    this.api?.set({
      fen: this.chess.fen(),
      turnColor: 'white',
      movable: {
        color: 'white',
        dests: this.getValidMoves(),
      },
    });
    this.status.update(() => 'White to move');
  }

  undo() {
    this.chess.undo();
    this.api?.set({
      fen: this.chess.fen(),
      turnColor: this.chess.turn() === 'w' ? 'white' : 'black',
      movable: {
        color: this.chess.turn() === 'w' ? 'white' : 'black',
        dests: this.getValidMoves(),
      },
    });
    this.updateStatus();
  }

  loadFen() {
    const fen = this.fen();
    try {
      this.chess.load(fen);
      this.api?.set({ fen });
      this.updateStatus();
      this.updateBoard();
    } catch (error) {
      alert('Invalid FEN!');
    }
  }

  // flipBoard() {
  //   this.api?.toggleOrientation();
  // }

  // clearBoard() {
  //   this.api?.set({
  //     fen: '8/8/8/8/8/8/8/8 w - - 0 1',
  //   });
  // }
}
