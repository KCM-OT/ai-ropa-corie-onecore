import { Routes } from '@angular/router';
import { AppShell } from './shell/app-shell';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      // The sidebar is AI-first, so the home URL opens the AI Assisted page.
      { path: '', pathMatch: 'full', redirectTo: 'ai-assisted-ropa' },
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
      {
        path: 'settings',
        title: 'Settings | Data Mapping',
        loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings),
      },
      // Inbox, Projects and any other URL render a "not built yet" placeholder.
      {
        path: '**',
        title: 'Data Mapping',
        loadComponent: () => import('./pages/placeholder').then((m) => m.Placeholder),
      },
    ],
  },
];
