import { DrawShape } from '@lichess-org/chessground/draw';
import { Key } from "@lichess-org/chessground/types";

export type HintStep = {
  type: 'arrow' | 'overlay' | 'text';
  arrows?: DrawShape[];   // captured from chessground drawable
  conceptId?: string;     // overlay: id from TEACHING_CONCEPTS
  square?: string;        // overlay: target square
  text?: string;
  delayAfter: number;     // ms before next step shows
};

export type MoveHint = {
  move: string;           // SAN: 'Nf3', 'a4', 'O-O'
  steps: HintStep[];
};

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
  moveHints?: MoveHint[];
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
  numberOfMushrooms?:number
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
