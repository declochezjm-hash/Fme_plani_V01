import { Routes } from '@angular/router';

export const COPILOT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./copilot.page').then((m) => m.CopilotPage),
  },
];
