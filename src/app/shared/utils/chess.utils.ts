import { Config } from '@lichess-org/chessground/config';
import { Key } from '@lichess-org/chessground/types';
import { Chess, Piece, SQUARES } from 'chess.js';
import { Exercise } from '../models/exercise.model';
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const BARE_STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
export const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';
export const getValidMoves = (chess: Chess): Map<Key, Key[]> => {
  const dests = new Map<Key, Key[]>();
  for (const square of SQUARES) {
    const moves = chess.moves({ square: square, verbose: true });
    if (moves.length > 0) {
      dests.set(
        square,
        moves.map((m) => m.to),
      );
    }
  }
  return dests;
};
/**
 *
 * @param chess - has the current game state
 * @param highlightLastMove - when board gets a reset, highlighting the last move is unneccessary. Defaults to true.
 * @returns
 */
export const boardConfig = (chess: Chess, highlightLastMove: boolean = true): Config => {
  return {
    fen: chess.fen(),
    turnColor: chess.turn() === 'w' ? 'white' : 'black',
    movable: {
      color: chess.turn() === 'w' ? 'white' : 'black',
      dests: getValidMoves(chess),
    },
    highlight: {
      lastMove: highlightLastMove,
      check: true,
    },
  };
};

export const loadChess = (chess:Chess,fen: string):void => {
  chess.load(fen, { skipValidation: true});
};
export const getKingSquare = (chess: Chess): string | null => {
  const turn = chess.turn();
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece?.type === 'k' && piece.color === turn) {
        return 'abcdefgh'[f] + (8 - r);
      }
    }
  }
  return null;
};

export const getPlayerOrientation=(exercise: Exercise): 'white' | 'black' => {
  if (exercise.exerciseType === 'mushroom') return 'white';
  if (exercise.lastMove) {
    return exercise.lastMove.color === 'white' ? 'black' : 'white';
  }
  return exercise.fen.split(' ')[1] === 'w' ? 'white' : 'black';
}
export const isPawnPromotion=(dest: Key, piece:Piece): boolean=> {
  return piece?.type === 'p' && ((piece.color === 'w' && dest[1] === '8') || (piece.color === 'b' && dest[1] === '1'));
}