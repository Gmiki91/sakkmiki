import { Routes } from '@angular/router';

import { ExercisesLayout } from './features/exercises/exercises-layout/exercises-layout';
import { BoardCreator } from './features/exercises/board-creator/board-creator';
import { ExerciseCreator } from './features/exercises/exercise-creator/exercise-creator';
import { Lobby } from './features/lobby/lobby';
import { validListGuard } from './core/guards/valid-list.guard';
import { validExerciseGuard } from './core/guards/valid-exercise.guard';
import { Classroom } from './features/classroom/classroom/classroom';
import { JoinScreen } from './features/classroom/join-screen/join-screen';
import { StudentView } from './features/classroom/student-view/student-view';
import { studentGuard } from './core/guards/student.guard';

export const routes: Routes = [

  { path: '', component: Lobby },
  { path: 'join', component: JoinScreen },
  { path: 'classroom', component: Classroom },
   { path: 'student', component: StudentView, canActivate: [studentGuard] },
  {
    path: 'exercises',
    component: ExercisesLayout,
    children: [
      { path: 'create/:listId', component: BoardCreator, canActivate:[validListGuard] },
      { path: 'edit/:exerciseId', component: ExerciseCreator, canActivate:[validExerciseGuard] },
    ],
  },
];
