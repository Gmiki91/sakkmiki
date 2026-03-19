import { Key } from "@lichess-org/chessground/types";

export type CommonMistake = {
  move: string;
  hint: string;
}
export type LastMove={
  from:Key;
  to:Key;
  color:'white'|'black';
}
export type ExerciseType = 'puzzle' | 'mushroom' | 'challenge';

export type ExerciseInput = {
  title: string;
  fen: string;
  exerciseType: ExerciseType;
  solutions?: string[][];
  commonMistakes?: CommonMistake[];
  defaultHint?: string;
  whiteWinConditions?: string[];
  blackWinConditions?: string[];
  lastMove?: LastMove;
}

export type Exercise = ExerciseInput & {
  id: string;
}