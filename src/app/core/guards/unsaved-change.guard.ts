import { CanDeactivateFn } from '@angular/router';
import { ExerciseCreator } from '../../features/exercises/exercise-creator/exercise-creator';

export const unsavedChangesGuard: CanDeactivateFn<ExerciseCreator> = (component) => {
  if (!component.isDirty()) return true;
  return confirm('You have unsaved changes. Leave anyway?');
};
