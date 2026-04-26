import { squareToCoord, clientToSquare } from './board-geometry';

describe('board-geometry', () => {

  describe('squareToCoord', () => {
    it('a1 white orientation → bottom-left (x=0, y=7)', () => {
      expect(squareToCoord('a1', 'white')).toEqual({ x: 0, y: 7 });
    });

    it('h8 white orientation → top-right (x=7, y=0)', () => {
      expect(squareToCoord('h8', 'white')).toEqual({ x: 7, y: 0 });
    });

    it('a1 black orientation → top-right mirror (x=7, y=0)', () => {
      expect(squareToCoord('a1', 'black')).toEqual({ x: 7, y: 0 });
    });

    it('h8 black orientation → bottom-left mirror (x=0, y=7)', () => {
      expect(squareToCoord('h8', 'black')).toEqual({ x: 0, y: 7 });
    });

    it('e4 white orientation → x=4, y=4', () => {
      expect(squareToCoord('e4', 'white')).toEqual({ x: 4, y: 4 });
    });

    it('e4 black orientation → x=3, y=3', () => {
      expect(squareToCoord('e4', 'black')).toEqual({ x: 3, y: 3 });
    });
  });

  describe('clientToSquare', () => {
    function makeBoardEl(left: number, top: number, size: number): HTMLElement {
      return {
        getBoundingClientRect: () => ({ left, top, width: size, height: size })
      } as any;
    }

    it('top-left corner → a8 in white orientation', () => {
      const el = makeBoardEl(0, 0, 800);
      // click at (1, 1) — just inside top-left
      expect(clientToSquare(1, 1, el, 'white')).toBe('a8');
    });

    it('bottom-right corner → h1 in white orientation', () => {
      const el = makeBoardEl(0, 0, 800);
      expect(clientToSquare(799, 799, el, 'white')).toBe('h1');
    });

    it('top-left corner → h1 in black orientation', () => {
      const el = makeBoardEl(0, 0, 800);
      expect(clientToSquare(1, 1, el, 'black')).toBe('h1');
    });

    it('center of e4 square → e4 in white orientation', () => {
      // file e = index 4, center = 4.5 squares from left → x = 450
      // rank 4 from bottom = 4th row from top → y = 4.5/8 * 800 = 450
      const el = makeBoardEl(0, 0, 800);
      expect(clientToSquare(450, 450, el, 'white')).toBe('e4');
    });

    it('clamps to board edges when click is outside', () => {
      const el = makeBoardEl(100, 100, 800);
      // clicking before the board
      const result = clientToSquare(0, 0, el, 'white');
      expect(result).toBe('a8'); // clamped to top-left
    });
  });

});