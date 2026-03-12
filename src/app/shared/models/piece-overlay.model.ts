export type OverlayExpression = 'alarmed' | 'checkmate';

export type PieceOverlayData = {
  square: string;
  expression: OverlayExpression;
} | null;