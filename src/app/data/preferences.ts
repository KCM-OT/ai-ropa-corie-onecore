import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'ja', label: '日本語' },
] as const;

const KEY = 'ropa-onecore.preferences';

interface Stored {
  language: string;
  theme: Theme;
}

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Stored>;
    return {
      language: LANGUAGES.some((l) => l.value === raw.language) ? raw.language! : 'en',
      theme: raw.theme === 'dark' || raw.theme === 'system' ? raw.theme : 'light',
    };
  } catch {
    return { language: 'en', theme: 'light' };
  }
}

// The user's Settings page choices, kept in localStorage. The theme is applied by
// setting OneCore's data-mode="dark" on <html>; "system" follows the OS. The
// language is only remembered: the prototype has no translations.
@Injectable({ providedIn: 'root' })
export class Preferences {
  readonly #root = inject(DOCUMENT).documentElement;
  readonly #systemDark = matchMedia('(prefers-color-scheme: dark)');
  readonly #osDark = signal(this.#systemDark.matches);

  readonly language = signal(load().language);
  readonly theme = signal<Theme>(load().theme);

  constructor() {
    this.#systemDark.addEventListener('change', (e) => this.#osDark.set(e.matches));
    effect(() => {
      const theme = this.theme();
      const dark = theme === 'dark' || (theme === 'system' && this.#osDark());
      if (dark) this.#root.setAttribute('data-mode', 'dark');
      else this.#root.removeAttribute('data-mode');
      this.#root.style.colorScheme = dark ? 'dark' : 'light';
    });
    effect(() => {
      const stored: Stored = { language: this.language(), theme: this.theme() };
      try {
        localStorage.setItem(KEY, JSON.stringify(stored));
      } catch {
        // Private windows can refuse storage; the choice still applies for this visit.
      }
    });
  }
}
