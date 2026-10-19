import { Injectable, signal } from '@angular/core';

/**
 * Demo mode: the sidebar shows only the items marked `demo`, and the site's
 * home URL opens the AI Assisted RoPA Creation page. On by default; not
 * remembered, so every page load starts in demo mode.
 */
@Injectable({ providedIn: 'root' })
export class DemoMode {
  readonly on = signal(true);
}

/** Where the home URL ("/") goes in demo mode. */
export const DEMO_HOME = 'ai-assisted-ropa';
export const DEFAULT_HOME = 'processing-activities';
