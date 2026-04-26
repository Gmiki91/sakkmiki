import { Chess } from 'chess.js';
import { getKingSquare, getPlayerOrientation, isPawnPromotion } from './chess.utils';

describe('chess.utils', () => {

  describe('getPlayerOrientation', () => {
    it('always returns white for mushroom type', () => {
      const ex = { exerciseType: 'mushroom', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1' } as any;
      expect(getPlayerOrientation(ex)).toBe('white');
    });

    it('returns black when lastMove color is white (black responds)', () => {
      const ex = { exerciseType: 'puzzle', fen: '...', lastMove: { from: 'e2', to: 'e4', color: 'white' } } as any;
      expect(getPlayerOrientation(ex)).toBe('black');
    });

    it('returns white when lastMove color is black (white responds)', () => {
      const ex = { exerciseType: 'puzzle', fen: '...', lastMove: { from: 'e7', to: 'e5', color: 'black' } } as any;
      expect(getPlayerOrientation(ex)).toBe('white');
    });

    it('returns white when no lastMove and fen says white to move', () => {
      const ex = { exerciseType: 'puzzle', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' } as any;
      expect(getPlayerOrientation(ex)).toBe('white');
    });

    it('returns black when no lastMove and fen says black to move', () => {
      const ex = { exerciseType: 'puzzle', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' } as any;
      expect(getPlayerOrientation(ex)).toBe('black');
    });
  });

  describe('isPawnPromotion', () => {
    it('returns true for white pawn reaching rank 8', () => {
      expect(isPawnPromotion('e8', { type: 'p', color: 'w' })).toBe(true);
    });

    it('returns true for black pawn reaching rank 1', () => {
      expect(isPawnPromotion('d1', { type: 'p', color: 'b' })).toBe(true);
    });

    it('returns false for white pawn on rank 7', () => {
      expect(isPawnPromotion('e7', { type: 'p', color: 'w' })).toBe(false);
    });

    it('returns false for black pawn on rank 2', () => {
      expect(isPawnPromotion('d2', { type: 'p', color: 'b' })).toBe(false);
    });

    it('returns false for a non-pawn piece on rank 8', () => {
      expect(isPawnPromotion('e8', { type: 'n', color: 'w' })).toBe(false);
    });
  });

  describe('getKingSquare', () => {
    it('returns e1 for white king in starting position', () => {
      const chess = new Chess();
      expect(getKingSquare(chess)).toBe('e1');
    });

    it('returns e8 for black king after 1.e4', () => {
      const chess = new Chess();
      chess.move('e4');
      expect(getKingSquare(chess)).toBe('e8');
    });

    it('returns the king square for whoevers turn it is', () => {
      const chess = new Chess();
      // after e1-e2, it is black's turn → returns e8
      chess.load('rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1');
      chess.move({ from: 'e1', to: 'e2' });
      expect(getKingSquare(chess)).toBe('e8'); // black to move
        
      // set up white to move after king has moved
      chess.load('rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 1');
      expect(getKingSquare(chess)).toBe('e1'); // white to move, king still on e1
    });

    it('returns null when king not on board', () => {
      const chess = new Chess();
      chess.load('8/8/8/8/8/8/8/8 w - - 0 1', { skipValidation: true } as any);
      expect(getKingSquare(chess)).toBeNull();
    });
  });

});