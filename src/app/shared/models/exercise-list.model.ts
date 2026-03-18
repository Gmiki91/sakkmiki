import { Exercise, ExerciseType } from './exercise.model';

export type ExerciseListInput = {
  title: string;
  type:ExerciseType;
}

export type ExerciseList = ExerciseListInput & {
  id: string;
  exercises: Exercise[];
}