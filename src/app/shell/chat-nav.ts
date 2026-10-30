import { Injectable, signal } from '@angular/core';
import type { AuthoringSession } from '../data/authoring-history';

/** Something the sidebar asks the AI Assisted page to do. */
export type ChatRequest = { kind: 'new' } | { kind: 'open'; session: AuthoringSession };

/**
 * Links the sidebar's New chat and Chats list to the AI Assisted RoPA page.
 * The sidebar leaves a request here and navigates to the page; the page takes
 * the request (now, or when it loads) and reports which chat is open so the
 * sidebar can mark it.
 */
@Injectable({ providedIn: 'root' })
export class ChatNav {
  /** The session the AI page has open, if any. */
  readonly activeId = signal<string | null>(null);
  readonly #request = signal<ChatRequest | null>(null);
  readonly request = this.#request.asReadonly();

  newChat(): void {
    this.#request.set({ kind: 'new' });
  }

  open(session: AuthoringSession): void {
    this.#request.set({ kind: 'open', session });
  }

  /** The page calls this once it has acted on the request. */
  take(): ChatRequest | null {
    const r = this.#request();
    this.#request.set(null);
    return r;
  }
}
