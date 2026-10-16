import { Injectable, signal } from '@angular/core';
import type { RopaDraft } from './types';

// AI drafts awaiting approval. Prototype-only: kept in this browser's
// localStorage, so each viewer sees only their own drafts. A real build would
// post the draft to the Data Mapping API, where it lands in Pending inventory.

const KEY = 'ai-ropa-onecore-drafts-v1';

// Draft IDs start above the mock inventory's IDs so they never collide.
const FIRST_DRAFT_ID = 10001;

function load(): RopaDraft[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RopaDraft[]) : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class DraftsStore {
  readonly #drafts = signal<RopaDraft[]>(load());

  /** Drafts, newest first. */
  readonly drafts = this.#drafts.asReadonly();

  constructor() {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) this.#drafts.set(load());
    });
  }

  add(draft: Omit<RopaDraft, 'id' | 'submittedAt'>): RopaDraft {
    const current = this.#drafts();
    const id = current.reduce((max, d) => Math.max(max, d.id), FIRST_DRAFT_ID - 1) + 1;
    const saved: RopaDraft = { ...draft, id, submittedAt: new Date().toISOString() };
    this.#write([saved, ...current]);
    return saved;
  }

  remove(id: number): void {
    this.#write(this.#drafts().filter((d) => d.id !== id));
  }

  #write(next: RopaDraft[]): void {
    this.#drafts.set(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage blocked (private mode etc.): keep the in-memory copy for this session.
    }
  }
}
