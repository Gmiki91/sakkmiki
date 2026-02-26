import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ExerciseService } from '../../features/exercises/services/exercise.service';

export const validExerciseGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
  const service = inject(ExerciseService);
  const exerciseId = route.params['exerciseId'];
  
  if (service.selectedExercise().id!==exerciseId) {
    router.navigate(['/exercises']);
    return false;
  }
  return true;
};
