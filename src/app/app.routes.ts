import { Routes } from '@angular/router';
import { authGuard, guestGuard, passwordChangeChildGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [passwordChangeChildGuard],
    loadComponent: () =>
      import('./core/layout/app-layout.component').then((m) => m.AppLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'editor',
        pathMatch: 'full',
      },
      {
        path: 'copilot',
        loadChildren: () => import('./features/copilot/copilot.routes').then((m) => m.COPILOT_ROUTES),
      },
      {
        path: 'editor',
        loadChildren: () => import('./features/editor/editor.routes').then((m) => m.EDITOR_ROUTES),
      },
      {
        path: 'my-organization',
        redirectTo: 'my-profile',
        pathMatch: 'full',
      },
      {
        path: 'my-profile',
        loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'editor',
  },
];
