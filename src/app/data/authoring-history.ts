import { computed, Injectable, signal } from '@angular/core';
import { SIGNED_IN_USER } from './org';

// AI Assisted RoPA authoring sessions. The start screen's Pending list shows
// the ones not yet sent to Data Mapping, most urgent first; the sidebar's Chats
// list shows all of them, newest first.
// Examples ship with the prototype; sessions started in this browser are added
// and kept up to date in localStorage. Opening one starts the assistant again
// from its description (the conversation itself isn't stored).

export interface AuthoringSession {
  id: string;
  name: string;
  /** One line about the activity. */
  summary: string;
  /** What the assistant drafts from when the session is opened again. */
  text: string;
  source: 'document' | 'prompt';
  createdBy: string;
  createdAt: string; // ISO date
  /** The checker's completeness when the session was last updated. */
  completeness: number;
  /** Follow-up questions still open when the session was last updated. */
  openQuestions: number;
  /** When the record should be finished (ISO date). */
  dueAt: string;
  /** Sent to Data Mapping, or resolved by using an existing record: no longer pending. */
  done?: boolean;
}

const KEY = 'ai-ropa-onecore-history-v1';

/** Prototype rule: a new session is due two weeks after it starts. */
export const DUE_AFTER_DAYS = 14;

/** Today plus `days`, as an ISO date (YYYY-MM-DD) in local time. */
export function isoDaysFromToday(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole days from today until an ISO date; negative when it has passed. */
export function daysUntil(iso: string, today = new Date()): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const due = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / 86_400_000);
}

// Due dates are relative to today so the examples always show the same badges.
const SEEDED: AuthoringSession[] = [
  {
    id: 'seed-dealer-hosting',
    name: 'Dealer management system hosting',
    summary: 'Hosting the dealer management system for dealership clients from our US branch.',
    text: `Solera US Operations hosts the dealer management system on behalf of our clients, following their instructions. Clients: Northwind Motors (privacy@northwind.example); Contoso Auto Group (dpo@contoso.example). Services: hosting, backups and support for the dealer management system. Dealer customers' names, postal addresses, phone numbers and payment card data are stored on Amazon Web Services in the United States. Our support team in India can access the data under standard contractual clauses. Access uses SSO through Okta and MFA, and all data is encrypted at rest and in transit. Each client signs our DPA v2.1 under Art. 28.`,
    source: 'document',
    createdBy: SIGNED_IN_USER,
    createdAt: isoDaysFromToday(-1),
    completeness: 100,
    openQuestions: 0,
    dueAt: isoDaysFromToday(13),
    // Already sent to Data Mapping: it's a chat, not a pending report.
    done: true,
  },
  {
    id: 'seed-feedback-analytics',
    name: 'Customer Feedback Analytics Rollout',
    summary: 'Rolling out AI sentiment scoring of customer survey and support feedback.',
    text: `Our customer experience team at Solera UK is rolling out a feedback analytics tool. It collects customers' survey responses and support ticket comments from Zendesk and uses AI to score sentiment and flag unhappy customers for follow-up.`,
    source: 'document',
    createdBy: SIGNED_IN_USER,
    createdAt: isoDaysFromToday(-19),
    completeness: 38,
    openQuestions: 12,
    dueAt: isoDaysFromToday(-5),
  },
  {
    id: 'seed-vendor-ai',
    name: 'Vendor AI assessment',
    summary: "Using an AI service to assess suppliers' risk from their contact and contract details.",
    text: `Our procurement team at Solera Group uses an AI service in Salesforce to assess supplier risk. It reads suppliers' contact names, email addresses and contract details, and scores each supplier before onboarding. The legal basis is legitimate interests. Retention: 3 years after the contract ends. Access uses SSO.`,
    source: 'prompt',
    createdBy: SIGNED_IN_USER,
    createdAt: isoDaysFromToday(-11),
    completeness: 77,
    openQuestions: 2,
    dueAt: isoDaysFromToday(3),
  },
  {
    id: 'seed-volunteers',
    name: 'Internal volunteer recruitment',
    summary: 'Adding employees to the volunteer list for company events and conferences.',
    text: `Our events team asks employees to volunteer for company events and conferences, and keeps a list of who signed up.`,
    source: 'document',
    createdBy: SIGNED_IN_USER,
    createdAt: isoDaysFromToday(-6),
    completeness: 25,
    openQuestions: 9,
    dueAt: isoDaysFromToday(8),
  },
  {
    id: 'seed-marketing-outreach',
    name: 'AI driven marketing outreach',
    summary: 'An AI driven initiative to reach more prospects for the Ohio branch.',
    text: `Our marketing team at Solera North America uses AI to score prospects in Salesforce and send personalised emails to reach more people in Ohio. We collect prospects' names, email addresses and phone numbers. Data subjects: prospects. The legal basis is consent.`,
    source: 'prompt',
    createdBy: SIGNED_IN_USER,
    createdAt: isoDaysFromToday(-2),
    completeness: 60,
    openQuestions: 5,
    dueAt: isoDaysFromToday(12),
  },
];

function load(): AuthoringSession[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<AuthoringSession>[]) : [];
    // Sessions saved before due dates and question counts existed.
    return saved.map((s) => ({
      openQuestions: 0,
      dueAt: isoDaysFromToday(DUE_AFTER_DAYS, new Date(s.createdAt ?? Date.now())),
      ...s,
    })) as AuthoringSession[];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class AuthoringHistory {
  readonly #saved = signal<AuthoringSession[]>(load());

  /** Every session: this browser's, then the examples it hasn't replaced. */
  readonly sessions = computed(() => [
    ...this.#saved(),
    ...SEEDED.filter((s) => !this.#saved().some((x) => x.id === s.id)),
  ]);

  /** Sessions not yet sent or resolved, soonest due first. */
  readonly pending = computed(() =>
    this.sessions()
      .filter((s) => !s.done)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.createdAt.localeCompare(a.createdAt)),
  );

  /** The sidebar's Chats: every session, newest first. */
  readonly chats = computed(() =>
    [...this.sessions()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  /** Add a session, or update it if it's already there. */
  save(session: AuthoringSession): void {
    const rest = this.#saved().filter((s) => s.id !== session.id);
    const next = [session, ...rest];
    this.#saved.set(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage blocked (private mode etc.): keep the in-memory copy for this session.
    }
  }
}
