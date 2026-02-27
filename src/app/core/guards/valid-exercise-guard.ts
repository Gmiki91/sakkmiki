import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ExerciseService } from '../../features/exercises/services/exercise.service';

export const validExerciseGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const service = inject(ExerciseService);
  const exerciseId = route.params['exerciseId'];

  const exists = service.exerciseLists()
    .flatMap(list => list.exercises)
    .find(ex => ex.id === exerciseId);

  if (!exists) {
    router.navigate(['/exercises']);
    return false;
  }
  return true;
};
