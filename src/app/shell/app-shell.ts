import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OcAvatar } from '@onetrust/onecore/avatar';
import { OcButton } from '@onetrust/onecore/button';
import { OcIcon } from '@onetrust/onecore/icon';
import { OcIconButton } from '@onetrust/onecore/icon-button';
import { initials, SIGNED_IN_USER } from '../data/org';
import { isGroup, MODULE_NAME, NAV, type NavGroup } from './nav';

// Fills the viewport: global top bar, then the Data Mapping sidebar and the
// routed page. Pages scroll inside <main>. OneCore has no shell or side-nav
// component, so both are native HTML styled with --oc-* tokens.
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, OcAvatar, OcButton, OcIcon, OcIconButton],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  protected readonly nav = NAV;
  protected readonly moduleName = MODULE_NAME;
  protected readonly isGroup = isGroup;
  protected readonly user = SIGNED_IN_USER;
  protected readonly userInitials = initials(SIGNED_IN_USER);

  protected readonly collapsed = signal(false);
  protected readonly closedGroups = signal<ReadonlySet<string>>(new Set());

  protected toggleGroup(group: NavGroup): void {
    this.closedGroups.update((s) => {
      const next = new Set(s);
      if (next.has(group.label)) next.delete(group.label);
      else next.add(group.label);
      return next;
    });
  }
}
