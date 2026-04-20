import { Key } from "@lichess-org/chessground/types";

export type CommonMistake = {
  move: string;
  hint: string;
}

export type LastMove = {
  from: Key;
  to: Key;
  color: 'white' | 'black';
}

export type ExerciseType = 'puzzle' | 'mushroom' | 'challenge'|'demo';
export type ExerciseSource = 'custom' | 'lichess';

export type ExerciseInput = {
  title: string;
  fen: string;
  exerciseType: ExerciseType;
  position:number;
  listId:string;
  instruction:string;
  solutions?: string[][];
  commonMistakes?: CommonMistake[];
  defaultHint?: string;
  whiteWinConditions?: string[];
  blackWinConditions?: string[];
  lastMove?: LastMove;
  // Metadata — puzzles only
  source?: ExerciseSource;
  themes?: string[];    // raw Lichess theme strings e.g. 'fork', 'mateIn1'
  elo?: number;         // teacher-set for custom; Lichess rating for imported
  lichessId?: string;   // only when source === 'lichess'
  mushroomType?:string;
}

export type Exercise = ExerciseInput & {
  id: string;
}

// Lichess catalog entry — maps directly from lichess_puzzles table
export type LichessPuzzle = {
  id: string;
  fen: string;
  solutions: string[][];
  lastMove: LastMove | null;
  elo: number;
  themes: string[];
}
