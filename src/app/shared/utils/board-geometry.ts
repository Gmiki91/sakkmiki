export function squareToCoord(
  square: string,
  orientation: 'white' | 'black',
): { x: number; y: number } {
  const file = 'abcdefgh'.indexOf(square[0]);
  const rank = parseInt(square[1]) - 1;
  return {
    x: orientation === 'white' ? file : 7 - file,
    y: orientation === 'white' ? 7 - rank : rank,
  };
}

export function clientToSquare(
  clientX: number,
  clientY: number,
  boardEl: HTMLElement,
  orientation: 'white' | 'black' = 'white',
): string {
  const rect = boardEl.getBoundingClientRect();
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  const file = Math.max(0, Math.min(7, Math.floor(relX * 8)));
  const rank = Math.max(0, Math.min(7, Math.floor(relY * 8)));
  const fileChar = orientation === 'white' ? 'abcdefgh'[file] : 'abcdefgh'[7 - file];
  const rankNum = orientation === 'white' ? 8 - rank : rank + 1;
  return `${fileChar}${rankNum}`;
}