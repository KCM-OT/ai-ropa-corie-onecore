import { computed, Injectable, signal } from '@angular/core';
import type { ChangeSubmission, RecertCheckReport } from './recert-check';

// Recertification outcomes from the owner check-in. Prototype-only: kept in
// this browser's localStorage. A submission waits for a privacy analyst
// (status pending_review); nothing reaches the record until they approve it,
// and the analyst side isn't built yet. A pause records an ownership hand-off
// (SKILL.md step 6): nothing is submitted.

const KEY = 'ai-ropa-onecore-recert-v1';

export interface StoredSubmission {
  submission: ChangeSubmission;
  /** recert_check.py's report (the TypeScript port), for the analyst. */
  check: Omit<RecertCheckReport, never>;
}

export interface RecertPause {
  recordId: string;
  newOwner: string;
  pausedAt: string;
}

interface State {
  submissions: StoredSubmission[];
  pauses: RecertPause[];
}

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<State>) : {};
    return { submissions: s.submissions ?? [], pauses: s.pauses ?? [] };
  } catch {
    return { submissions: [], pauses: [] };
  }
}

@Injectable({ providedIn: 'root' })
export class RecertStore {
  readonly #state = signal<State>(load());

  /** Submissions, newest first. */
  readonly submissions = computed(() => this.#state().submissions);
  readonly pauses = computed(() => this.#state().pauses);

  constructor() {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) this.#state.set(load());
    });
  }

  /** The record's latest open submission (waiting for the analyst). */
  openSubmission(recordId: string): StoredSubmission | undefined {
    return this.submissions().find((s) => s.submission.recordId === recordId && s.submission.status === 'pending_review');
  }

  pause(recordId: string): RecertPause | undefined {
    return this.pauses().find((p) => p.recordId === recordId);
  }

  submit(entry: StoredSubmission): void {
    const s = this.#state();
    this.#write({
      submissions: [entry, ...s.submissions],
      pauses: s.pauses.filter((p) => p.recordId !== entry.submission.recordId),
    });
  }

  addPause(p: RecertPause): void {
    const s = this.#state();
    this.#write({ ...s, pauses: [p, ...s.pauses.filter((x) => x.recordId !== p.recordId)] });
  }

  /** Prototype reset: start this record's check-in again. */
  clear(recordId: string): void {
    const s = this.#state();
    this.#write({
      submissions: s.submissions.filter((x) => x.submission.recordId !== recordId),
      pauses: s.pauses.filter((p) => p.recordId !== recordId),
    });
  }

  #write(next: State): void {
    this.#state.set(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage blocked: keep the in-memory copy for this session.
    }
  }
}
