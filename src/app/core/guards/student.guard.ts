import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ClassroomStore } from '../services/classroom-store.service';
import { SupabaseService } from '../services/supabase.service';

export const studentGuard: CanActivateFn = async(route) => {
  const router = inject(Router);
  const classroomStore = inject(ClassroomStore);
   const supabase = inject(SupabaseService);
  const classroomId = route.params['classroomId'];
  
  const classroom = await supabase.getClassroomById(classroomId);
  if (!classroom) {
    router.navigate(['/']);
    return false;
  }
  if (!classroomStore.isJoined() || classroomStore.classroomId() !== classroomId) { // means they inserted /student in the url but didnt give themselves a name
    router.navigate(['/join',classroomId]);
    return false;
  }
  return true;
};