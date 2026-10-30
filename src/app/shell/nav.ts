import type { OcIconName } from '@onetrust/onecore/icon';

// The sidebar's main links (Figma node 2241:5514). New chat isn't a link: it
// starts a fresh conversation on the AI Assisted page (see app-shell.ts).
// Links without their own page render the "Not built yet" placeholder.

export interface NavLink {
  label: string;
  href: string;
  icon: OcIconName;
}

export const NAV: NavLink[] = [
  { label: 'Inbox', href: '/inbox', icon: 'inbox' },
  { label: 'Projects', href: '/projects', icon: 'folder-open' },
];

export function findNavLink(pathname: string): NavLink | undefined {
  return NAV.find((item) => item.href === pathname);
}
