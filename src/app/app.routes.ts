import { Routes } from '@angular/router';
import { validListGuard } from './core/guards/valid-list.guard';
import { validExerciseGuard } from './core/guards/valid-exercise.guard';
import { studentGuard } from './core/guards/student.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-change.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/lobby/lobby').then((m) => m.Lobby) },
  { 
  path: 'join/:name', 
  loadComponent: () =>
    import('./features/classroom/join-screen/join-screen').then((m) => m.JoinScreen),
},
  {
    path: 'join',
    loadComponent: () =>
      import('./features/classroom/join-screen/join-screen').then((m) => m.JoinScreen),
  },
  {
    path: 'classroom',
    loadComponent: () =>
      import('./features/classroom/classroom/classroom').then((m) => m.Classroom),
  },
  {
    path: 'student',
    loadComponent: () =>
      import('./features/classroom/student-view/student-view').then((m) => m.StudentView),
    canActivate: [studentGuard],
  },
  {
  path: 'puzzle-rush',
  loadComponent: () =>
    import('./features/puzzle-rush/puzzle-rush').then(m => m.PuzzleRush),
},
  {
    path: 'exercises',
    loadComponent: () =>
      import('./features/exercises/exercises-layout/exercises-layout').then(
        (m) => m.ExercisesLayout,
      ),

    children: [
      {
        path: 'create/:listId',
        loadComponent: () =>
          import('./features/exercises/board-creator/board-creator').then((m) => m.BoardCreator),
        canActivate: [validListGuard],
      },
      {
        path: 'edit/:exerciseId',
        loadComponent: () =>
          import('./features/exercises/exercise-creator/exercise-creator').then(
            (m) => m.ExerciseCreator,
          ),
        canActivate: [validExerciseGuard],
        canDeactivate: [unsavedChangesGuard]
      },
      {
        path: 'challenge/:exerciseId',
        loadComponent:()=>
          import('./features/exercises/challenge-creator/challenge-creator').then(m=>m.ChallengeCreator),
        canActivate: [validExerciseGuard],
        canDeactivate: [unsavedChangesGuard]
      },
    ],
  },
];
