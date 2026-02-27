import { Component,input,output } from '@angular/core';
import {MatListModule} from '@angular/material/list';
import { FormsModule } from '@angular/forms';
import { ExerciseList as List } from '../../models/exercise-list.model';
import { Exercise } from '../../models/exercise.model';

@Component({
  selector: 'app-exercise-list',
  imports: [MatListModule,FormsModule],
  templateUrl: './exercise-list.html',
  styleUrl: './exercise-list.scss',
})
export class ExerciseList {
  list = input.required<List>();
  selectExercise = output<Exercise>()
}
