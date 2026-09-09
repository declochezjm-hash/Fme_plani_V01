import { Routes } from '@angular/router';

export const EDITOR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./editor.page').then((m) => m.EditorPage),
  },
];
