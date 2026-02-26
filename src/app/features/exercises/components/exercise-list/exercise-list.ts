import { Component, inject,input } from '@angular/core';
import {MatListModule} from '@angular/material/list';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {  MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { ExerciseService } from '../../services/exercise.service';
import { ExerciseList as List } from '../../models/exercise-list.model';
import { Exercise } from '../../models/exercise.model';

@Component({
  selector: 'app-exercise-list',
  imports: [MatListModule,FormsModule,MatButton,MatInputModule],
  templateUrl: './exercise-list.html',
  styleUrl: './exercise-list.scss',
})
export class ExerciseList {
  exerciseService= inject(ExerciseService);
  list = input.required<List>();
  router = inject(Router);

  //opens board creator 
  addExercise(listId:string){
      this.router.navigate([`/exercises/create/${listId}`]);
  }

  selectExercise(exercise:Exercise){
    this.exerciseService.setSelectedExercise(exercise);
    this.router.navigate([`/exercises/edit/${exercise.id}`]);
  }
}
