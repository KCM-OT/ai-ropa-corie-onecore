import { computed, Injectable, signal } from '@angular/core';
import { SIGNED_IN_USER } from './org';

// The History list on the AI Assisted RoPA Creation start screen: earlier
// authoring sessions, newest first. Three examples ship with the prototype;
// sessions started in this browser are added and kept up to date in
// localStorage. Opening one starts the assistant again from its description
// (the conversation itself isn't stored).

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
}

const KEY = 'ai-ropa-onecore-history-v1';

const SEEDED: AuthoringSession[] = [
  {
    id: 'seed-dealer-hosting',
    name: 'Dealer management system hosting',
    summary: 'Hosting the dealer management system for dealership clients from our US branch.',
    text: `Solera US Operations hosts the dealer management system on behalf of our clients, following their instructions. Clients: Northwind Motors (privacy@northwind.example); Contoso Auto Group (dpo@contoso.example). Services: hosting, backups and support for the dealer management system. Dealer customers' names, postal addresses, phone numbers and payment card data are stored on Amazon Web Services in the United States. Our support team in India can access the data under standard contractual clauses. Access uses SSO through Okta and MFA, and all data is encrypted at rest and in transit. Each client signs our DPA v2.1 under Art. 28.`,
    source: 'document',
    createdBy: SIGNED_IN_USER,
    createdAt: '2026-10-12',
    completeness: 100,
  },
  {
    id: 'seed-volunteers',
    name: 'Internal volunteer recruitment',
    summary: 'Adding employees to the volunteer list for company events and conferences.',
    text: `Our events team asks employees to volunteer for company events and conferences, and keeps a list of who signed up.`,
    source: 'document',
    createdBy: SIGNED_IN_USER,
    createdAt: '2026-09-23',
    completeness: 25,
  },
  {
    id: 'seed-marketing-outreach',
    name: 'AI driven marketing outreach',
    summary: 'An AI driven initiative to reach more prospects for the Ohio branch.',
    text: `Our marketing team at Solera North America uses AI to score prospects in Salesforce and send personalised emails to reach more people in Ohio. We collect prospects' names, email addresses and phone numbers. Data subjects: prospects. The legal basis is consent.`,
    source: 'document',
    createdBy: SIGNED_IN_USER,
    createdAt: '2026-09-05',
    completeness: 60,
  },
];

function load(): AuthoringSession[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthoringSession[]) : [];
  } catch {
    return [];
  }
}

@Injectable({ providedIn: 'root' })
export class AuthoringHistory {
  readonly #saved = signal<AuthoringSession[]>(load());

  /** Sessions from this browser, then the examples, newest first. */
  readonly sessions = computed(() =>
    [...this.#saved(), ...SEEDED.filter((s) => !this.#saved().some((x) => x.id === s.id))].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),
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
