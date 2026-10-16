import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OcAvatar } from '@onetrust/onecore/avatar';
import { OcButton } from '@onetrust/onecore/button';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcIconButton } from '@onetrust/onecore/icon-button';
import { filter, map } from 'rxjs';
import { initials, SIGNED_IN_USER } from '../data/org';
import { isGroup, MODULE_NAME, NAV, type NavGroup } from './nav';

// Full-height dark sidebar (logo row, module name, nav) beside the global top
// bar and the routed page. Styling follows the AI revamp concept
// (mike-aigrevamp.vercel.app): near-black surface, an icon per top-level item,
// a brand-green active marker, and a sidebar that narrows to an icon rail.
// OneCore has no shell or side-nav component, so this is native HTML styled
// with --oc-* tokens.
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, OcAvatar, OcButton, OcIcon, OcIconButton],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  readonly #router = inject(Router);

  protected readonly nav = NAV;
  protected readonly moduleName = MODULE_NAME;
  protected readonly isGroup = isGroup;
  protected readonly user = SIGNED_IN_USER;
  protected readonly userInitials = initials(SIGNED_IN_USER);

  protected readonly collapsed = signal(false);
  protected readonly closedGroups = signal<ReadonlySet<string>>(new Set());

  readonly #url = toSignal(
    this.#router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.#router.url),
    ),
    { initialValue: this.#router.url },
  );

  /** A group reads as active when the current page is one of its links. */
  protected groupActive(group: NavGroup): boolean {
    const path = this.#url().split(/[?#]/)[0];
    return group.children.some((c) => path === c.href || path.startsWith(`${c.href}/`));
  }

  protected isOpen(group: NavGroup): boolean {
    return !this.collapsed() && !this.closedGroups().has(group.label);
  }

  protected onGroupClick(group: NavGroup): void {
    // On the icon rail a group has nowhere to show its links, so open the
    // sidebar with that group expanded.
    if (this.collapsed()) {
      this.collapsed.set(false);
      this.closedGroups.update((s) => {
        const next = new Set(s);
        next.delete(group.label);
        return next;
      });
      return;
    }
    this.closedGroups.update((s) => {
      const next = new Set(s);
      if (next.has(group.label)) next.delete(group.label);
      else next.add(group.label);
      return next;
    });
  }
}
