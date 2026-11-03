import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OcAvatar } from '@onetrust/onecore/avatar';
import { OcBadge } from '@onetrust/onecore/badge';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcIconButton } from '@onetrust/onecore/icon-button';
import { OcMenu, OcMenuItem, OcMenuSeparator, OcMenuTrigger } from '@onetrust/onecore/menu';
import { AuthoringHistory, type AuthoringSession } from '../data/authoring-history';
import { initials, SIGNED_IN_EMAIL, SIGNED_IN_USER } from '../data/org';
import { ChatNav } from './chat-nav';
import { NAV } from './nav';

/** The AI Assisted RoPA page, where New chat and the Chats list lead. */
const CHAT_PAGE = '/ai-assisted-ropa';

// The AI-first sidebar (Figma "Left Nav", node 2241:5514): logo with Search
// and Collapse, New chat / Inbox / Projects, a collapsible list of recent
// authoring chats, and the signed-in user at the foot. It narrows to an icon
// rail. OneCore has no side-nav component, so this is native HTML styled with
// --oc-* tokens.
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    OcAvatar,
    OcBadge,
    OcIcon,
    OcIconButton,
    OcMenu,
    OcMenuItem,
    OcMenuSeparator,
    OcMenuTrigger,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  readonly #router = inject(Router);
  readonly #chatNav = inject(ChatNav);

  protected readonly nav = NAV;
  protected readonly chats = inject(AuthoringHistory).chats;
  protected readonly activeChat = this.#chatNav.activeId;
  protected readonly user = SIGNED_IN_USER;
  protected readonly userInitials = initials(SIGNED_IN_USER);
  // Prototype stand-ins for the signed-in user's role and tenant.
  protected readonly userRole = 'AI Governance Admin';
  protected readonly userTenant = 'Main Tenant 1234';
  protected readonly userEmail = SIGNED_IN_EMAIL;
  // The organisation shown in the user menu (Figma node 2260:769).
  protected readonly entity = { name: 'Solera Global', detail: 'Enterprise • Production', plan: 'Enterprise' };

  protected readonly collapsed = signal(false);
  protected readonly chatsOpen = signal(true);

  /** Start a fresh conversation on the AI Assisted page. */
  protected newChat(): void {
    this.#chatNav.newChat();
    void this.#router.navigateByUrl(CHAT_PAGE);
  }

  protected openChat(session: AuthoringSession): void {
    this.#chatNav.open(session);
    void this.#router.navigateByUrl(CHAT_PAGE);
  }
}
