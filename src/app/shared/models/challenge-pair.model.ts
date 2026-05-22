import { Exercise } from './exercise.model';

export type ChallengePair = {
  white: string;
  black: string;
  exercise: Exercise;
  scoreDiffWin?: number;
};