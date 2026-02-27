import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ExerciseService } from '../services/exercise.service';

export const validListGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const service = inject(ExerciseService);
  const listId = route.params['listId'];

  if (!service.getListById(listId)) {
    router.navigate(['/exercises']);
    return false;
  }
  return true;
};
