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
  selectedExId = '';

  onDragStart(exercise: Exercise, event: DragEvent) {
    event.dataTransfer?.setData('type', 'single');
    event.dataTransfer?.setData('exercise', JSON.stringify(exercise));
    event.dataTransfer?.setData('exercise-title', JSON.stringify(this.list().title));
  }
  onSelect(exercise:Exercise){
    this.selectExercise.emit(exercise);
    this.selectedExId === exercise.id ? this.selectedExId = '' : this.selectedExId = exercise.id;
  }
}
