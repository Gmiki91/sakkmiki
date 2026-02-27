import { Injectable,signal } from '@angular/core';
import { Exercise } from '../../shared/models/exercise.model';

@Injectable({
  providedIn: 'root',
})
export class ClassroomService {
  loadedList=signal<Exercise[]>([])
  loadedExercise=signal<Exercise>({}as Exercise);
}
