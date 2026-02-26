import { Routes } from '@angular/router';

import { ExercisesLayout } from './features/exercises/components/exercises-layout/exercises-layout';
import { BoardCreator } from './features/exercises/components/board-creator/board-creator';
import { ExerciseCreator } from './features/exercises/components/exercise-creator/exercise-creator';
import { Lobby } from './features/lobby/lobby';
import { validListGuard } from './core/guards/valid-list-guard';
import { validExerciseGuard } from './core/guards/valid-exercise-guard';
import { Classroom } from './features/classroom/classroom/classroom';

export const routes: Routes = [

  { path: '', component: Lobby },
  { path: 'classroom', component: Classroom },
  {
    path: 'exercises',
    component: ExercisesLayout,
    children: [
      { path: 'create/:listId', component: BoardCreator, canActivate:[validListGuard] },
      { path: 'edit/:exerciseId', component: ExerciseCreator, canActivate:[validExerciseGuard] },
    ],
  },
];
