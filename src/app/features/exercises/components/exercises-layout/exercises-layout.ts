import { Component, inject, signal, model, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ExerciseList } from '../exercise-list/exercise-list';
import { ExerciseService } from '../../services/exercise.service';
import { ExerciseListInput } from '../../models/exercise-list.model';
import { MatFormField, MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { Exercise } from '../../models/exercise.model';
@Component({
  selector: 'app-exercises-layout',
  imports: [
    ExerciseList,
    RouterOutlet,
    MatFormField,
    MatInputModule,
    FormsModule,
    MatProgressSpinnerModule,
    MatButtonModule,
  ],
  templateUrl: './exercises-layout.html',
  styleUrl: './exercises-layout.scss',
})
export class ExercisesLayout implements OnInit {
  exerciseService = inject(ExerciseService);
  isListCreationActive = signal<boolean>(false);
  title = model<string>('');
  router = inject(Router);
  ngOnInit() {
    this.exerciseService.loadExerciseLists();
  }
  addExercise(listId: string) {
    this.router.navigate([`/exercises/create/${listId}`]);
  }
  selectExercise(exercise: Exercise) {
    this.router.navigate([`/exercises/edit/${exercise.id}`]);
  }
  addList() {
    if (this.isListCreationActive()) {
      const list: ExerciseListInput = { title: this.title() };
      this.exerciseService.addExerciseList(list);
      this.isListCreationActive.set(false);
    } else {
      this.isListCreationActive.set(true);
    }
  }
}
