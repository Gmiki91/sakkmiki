export type CommonMistake = {
  move: string;
  hint: string;
}

export type ExerciseInput = {
  title: string;
  fen: string;
  solutions: string[][];
  commonMistakes?: CommonMistake[];
  defaultHint?: string;
  skipFenValidation?:boolean;
}

export type Exercise = ExerciseInput & {
  id: string;
}