import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const classroomGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const classroomId = route.params['classroomId'];
  if (!auth.currentUser()) {
    router.navigate(['/join', classroomId]);
    return false;
  }
  return true;
};