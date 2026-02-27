import { Exercise } from './exercise.model';

export type ExerciseListInput = {
  title: string;
  
}

export type ExerciseList = ExerciseListInput & {
  id: string;
  exercises: Exercise[];
}