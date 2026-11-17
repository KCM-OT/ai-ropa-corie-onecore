import { computed, Injectable, signal } from '@angular/core';
import type { ChangeSubmission, RecertCheckReport } from './recert-check';
import type { RecertDecision } from './recert-decision';

// Recertification outcomes from the owner check-in. Prototype-only: kept in
// this browser's localStorage. A submission waits for a privacy analyst
// (status pending_review); nothing reaches the record until they approve it
// in the Data Mapping prototype's Recertification review. When they ask for
// changes, their decision comes back here (recert-decision.ts) and marks the
// submission changes_requested. A pause records an ownership hand-off
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
  /** Analysts' requests for changes, newest first. */
  decisions: RecertDecision[];
}

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<State>) : {};
    return { submissions: s.submissions ?? [], pauses: s.pauses ?? [], decisions: s.decisions ?? [] };
  } catch {
    return { submissions: [], pauses: [], decisions: [] };
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

  /**
   * The analyst's request for changes the owner still has to answer: the latest
   * one for the record, unless a newer check-in has been sent since.
   */
  changesRequested(recordId: string): RecertDecision | undefined {
    const d = this.#state().decisions.find((x) => x.recordId === recordId);
    if (!d) return undefined;
    const latest = this.submissions().find((s) => s.submission.recordId === recordId);
    return !latest || latest.submission.id === d.submissionId ? d : undefined;
  }

  /** Keep an analyst's request for changes and mark the submission it answers. A repeat is ignored. */
  addDecision(d: RecertDecision): void {
    const s = this.#state();
    if (s.decisions.some((x) => x.id === d.id)) return;
    this.#write({
      ...s,
      submissions: s.submissions.map((x) =>
        x.submission.id === d.submissionId ? { ...x, submission: { ...x.submission, status: d.status } } : x,
      ),
      decisions: [d, ...s.decisions],
    });
  }

  pause(recordId: string): RecertPause | undefined {
    return this.pauses().find((p) => p.recordId === recordId);
  }

  submit(entry: StoredSubmission): void {
    const s = this.#state();
    this.#write({
      ...s,
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
      decisions: s.decisions.filter((d) => d.recordId !== recordId),
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
