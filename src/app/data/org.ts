// Group structure from the ropa-authoring skill's sample inventory
// (src/app/data/inventory.example.json).

export interface Subsidiary {
  id: string;
  name: string;
}

export const SUBSIDIARIES: Subsidiary[] = [
  { id: 'sub-group', name: 'Solera Group' },
  { id: 'sub-na', name: 'Solera North America' },
  { id: 'sub-us', name: 'Solera US Operations, Inc.' },
  { id: 'sub-ca', name: 'Solera Canada Ltd.' },
  { id: 'sub-emea', name: 'Solera EMEA Holdings' },
  { id: 'sub-de', name: 'Solera Deutschland GmbH' },
  { id: 'sub-uk', name: 'Solera UK Ltd.' },
  { id: 'sub-apac', name: 'Solera APAC Pte. Ltd.' },
];

export function subsidiaryName(id: string): string {
  return SUBSIDIARIES.find((s) => s.id === id)?.name ?? id;
}

// Fixed "today" so review statuses don't drift between sessions.
export const PROTOTYPE_TODAY = '2026-10-14';

export const SIGNED_IN_USER = 'Kevin Marshall';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// The tenant is UK-based, so dates show as DD/MM/YYYY.
export const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC' });
