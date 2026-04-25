import { Routes } from '@angular/router';
import { validListGuard } from './core/guards/valid-list.guard';
import { validExerciseGuard } from './core/guards/valid-exercise.guard';
import { studentGuard } from './core/guards/student.guard';
import { classroomGuard } from './core/guards/classroom.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-change.guard';
import { authGuard, redirectIfAuthenticatedGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/lobby/lobby').then((m) => m.Lobby) },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
    canActivate: [redirectIfAuthenticatedGuard],
  },
  {
    // Teacher/spectator view — guard redirects unauthenticated users to /join/:classroomId
    path: 'classroom/:classroomId',
    loadComponent: () =>
      import('./features/classroom/classroom/classroom').then((m) => m.Classroom),
    canActivate: [classroomGuard],
  },
  {
    // Join with pre-filled name (invite link)
    path: 'join/:classroomId/:name',
    loadComponent: () =>
      import('./features/classroom/join-screen/join-screen').then((m) => m.JoinScreen),
  },
  {
    // Join by choosing own name
    path: 'join/:classroomId',
    loadComponent: () =>
      import('./features/classroom/join-screen/join-screen').then((m) => m.JoinScreen),
  },
  {
    path: 'student/:classroomId',
    loadComponent: () =>
      import('./features/student-view/student-view/student-view').then((m) => m.StudentView),
    canActivate: [studentGuard]
  },
  {
    path: 'bye',
    loadComponent: () => import('./features/student-view/bye-page/bye-page').then((m) =>m.ByePage ),
  },
  {
    path: 'puzzle-rush',
    loadComponent: () => import('./features/puzzle-rush/puzzle-rush').then(m => m.PuzzleRush),
  },
  {
    path: 'exercises',
    loadComponent: () =>
      import('./features/exercises/exercises-layout/exercises-layout').then((m) => m.ExercisesLayout),
    canActivate: [authGuard],
    children: [
      {
        path: 'lichess/:listId',
        loadComponent: () =>
          import('./features/exercises/lichess-browser/lichess-browser').then(m => m.LichessBrowser),
        canActivate: [validListGuard],
      },
      {
        path: 'create/:listId',
        loadComponent: () =>
          import('./features/exercises/board-creator/board-creator').then((m) => m.BoardCreator),
        canActivate: [validListGuard],
      },
      {
        path: 'edit-board/:exerciseId',
        loadComponent: () =>
          import('./features/exercises/board-creator/board-creator').then((m) => m.BoardCreator),
        canActivate: [validExerciseGuard],
      },
      {
        path: 'edit/:exerciseId',
        loadComponent: () =>
          import('./features/exercises/exercise-creator/exercise-creator').then((m) => m.ExerciseCreator),
        canActivate: [validExerciseGuard],
        canDeactivate: [unsavedChangesGuard]
      },
      {
        path: 'challenge/:exerciseId',
        loadComponent: () =>
          import('./features/exercises/challenge-creator/challenge-creator').then(m => m.ChallengeCreator),
        canActivate: [validExerciseGuard],
        canDeactivate: [unsavedChangesGuard]
      },
    ],
  },
  { path: '**', redirectTo: '' }
];