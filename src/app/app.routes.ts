import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { DEFAULT_HOME, DEMO_HOME, DemoMode } from './shell/demo-mode';
import { AppShell } from './shell/app-shell';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      // The home URL opens the AI Assisted page in demo mode, Processing activities otherwise.
      { path: '', pathMatch: 'full', redirectTo: () => (inject(DemoMode).on() ? DEMO_HOME : DEFAULT_HOME) },
      {
        path: 'processing-activities',
        title: 'Processing activities | Data Mapping',
        loadComponent: () =>
          import('./pages/processing-activities/processing-activities').then((m) => m.ProcessingActivities),
      },
      {
        path: 'processing-activities/new',
        title: 'Author with AI | Data Mapping',
        loadComponent: () => import('./pages/author/author').then((m) => m.Author),
      },
      {
        path: 'ai-assisted-ropa',
        title: 'AI Assisted RoPA Creation | Data Mapping',
        loadComponent: () => import('./pages/ai-assisted/ai-assisted').then((m) => m.AiAssisted),
      },
      {
        path: 'pending-inventory',
        title: 'Pending inventory | Data Mapping',
        loadComponent: () =>
          import('./pages/pending-inventory/pending-inventory').then((m) => m.PendingInventory),
      },
      // Every other nav item renders a "not built yet" placeholder.
      {
        path: '**',
        title: 'Data Mapping',
        loadComponent: () => import('./pages/placeholder').then((m) => m.Placeholder),
      },
    ],
  },
];
