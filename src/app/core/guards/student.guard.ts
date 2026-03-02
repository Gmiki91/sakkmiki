import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RealtimeService } from '../services/realtime.service';

export const studentGuard: CanActivateFn = () => {
  const router = inject(Router);
  const realtimeService = inject(RealtimeService);

  if (!realtimeService.isJoined()) { // means they inserted /student in the url but didnt give themselves a name
    router.navigate(['/join']);
    return false;
  }
  return true;
};