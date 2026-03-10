export type CommonMistake = {
  move: string;
  hint: string;
}

export type ExerciseType = 'regular' | 'mushroom' | 'challenge';

export type ExerciseInput = {
  title: string;
  fen: string;
  exerciseType: ExerciseType;
  solutions?: string[][];
  commonMistakes?: CommonMistake[];
  defaultHint?: string;
  whiteWinConditions?: string[];
  blackWinConditions?: string[];
}

export type Exercise = ExerciseInput & {
  id: string;
}