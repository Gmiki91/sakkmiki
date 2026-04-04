import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthService);

  if (!auth.isTeacher()) {
    router.navigate(['/login']);
    return false;
  }
  return true;
};

export const redirectIfAuthenticatedGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthService);

  if (auth.isTeacher()) {
    router.navigate(['/']);
    return false;
  }
  return true;
};