import { Component, input, output } from '@angular/core';
import { ExerciseList as List } from '../../models/exercise-list.model';
import { Exercise } from '../../models/exercise.model';

@Component({
  selector: 'app-exercise-list',
  imports: [],
  templateUrl: './exercise-list.html',
  styleUrl: './exercise-list.scss',
})
export class ExerciseList {
  list = input.required<List>();
  selectExercise = output<Exercise>();

  onDragStart(exercise: Exercise, event: DragEvent) {
    event.dataTransfer?.setData('type', 'exercise');
    event.dataTransfer?.setData('exercise', JSON.stringify(exercise));
  }
}
