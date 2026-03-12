import { Component, inject, signal, model, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ExerciseList } from '../../../shared/components/exercise-list/exercise-list';
import { ExerciseListInput } from '../../../shared/models/exercise-list.model';
import { MatFormField, MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { Exercise } from '../../../shared/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';
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
export class ExercisesLayout implements OnInit  {
  exerciseService = inject(ExerciseService);
  isListCreationActive = signal<boolean>(false);
  title = model<string>('');
  router = inject(Router);

  ngOnInit(): void {
    this.exerciseService.loadExerciseLists();
  }

  addExercise(listId: string) {
    this.router.navigate([`/exercises/create/${listId}`]);
  }
  selectExercise(exercise: Exercise) {
    const type = exercise.exerciseType==='challenge'? 'challenge' : 'edit'
    this.router.navigate([`/exercises/${type}/${exercise.id}`]);
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
