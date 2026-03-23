import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ClassroomStore } from '../services/classroom-store.service';

export const studentGuard: CanActivateFn = () => {
  const router = inject(Router);
  const classroomStore = inject(ClassroomStore);

  if (!classroomStore.isJoined()) { // means they inserted /student in the url but didnt give themselves a name
    router.navigate(['/join']);
    return false;
  }
  return true;
};