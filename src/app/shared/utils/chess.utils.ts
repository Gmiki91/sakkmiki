import { Config } from '@lichess-org/chessground/config';
import { Key } from '@lichess-org/chessground/types';
import { Chess, SQUARES } from 'chess.js';
export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
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
export const boardConfig=(chess:Chess,highlightLastMove:boolean=true):Config=>{
    return {fen: chess.fen(),
      turnColor: chess.turn() === 'w' ? 'white' : 'black',
      movable: {
        color: chess.turn() === 'w' ? 'white' : 'black',
        dests: getValidMoves(chess),
      },
      highlight: {
        lastMove: highlightLastMove,
        check:true
      },
    }
}