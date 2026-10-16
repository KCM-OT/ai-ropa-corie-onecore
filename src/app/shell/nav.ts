// The Data Mapping sidebar, mirrored from the live module (Pending inventory
// screen, Oct 2026). Any nav item without its own route renders the
// placeholder page (see app.routes.ts), so links never 404.

export interface NavLink {
  label: string;
  href: string;
}
export interface NavGroup {
  label: string;
  children: NavLink[];
}
export type NavItem = NavLink | NavGroup;

export const MODULE_NAME = 'Data Mapping Automation';

export const NAV: NavItem[] = [
  {
    label: 'Inventory',
    children: [
      { label: 'Pending inventory', href: '/pending-inventory' },
      { label: 'Processing activities', href: '/processing-activities' },
      { label: 'Assets', href: '/assets' },
      { label: 'Entities', href: '/entities' },
      { label: 'Vendors', href: '/vendors' },
      { label: 'Projects', href: '/projects' },
    ],
  },
  { label: 'Dashboard', href: '/dashboard' },
  {
    label: 'Assessments',
    children: [
      { label: 'Active', href: '/assessments/active' },
      { label: 'Archive', href: '/assessments/archive' },
      { label: 'Recycle bin', href: '/assessments/recycle-bin' },
    ],
  },
  { label: 'Risk register', href: '/risk-register' },
  { label: 'Objects', href: '/objects' },
  {
    label: 'Reporting',
    children: [
      { label: 'Asset map', href: '/reporting/asset-map' },
      { label: 'Cross-Border', href: '/reporting/cross-border' },
      { label: 'Data lineage', href: '/reporting/data-lineage' },
      { label: 'Reports', href: '/reporting/reports' },
    ],
  },
  {
    label: 'Setup',
    children: [
      { label: 'Automation rules', href: '/setup/automation-rules' },
      { label: 'Automations', href: '/setup/automations' },
      { label: 'Assessment templates', href: '/setup/assessment-templates' },
      { label: 'Assessment workflows', href: '/setup/assessment-workflows' },
      { label: 'Inventory manager', href: '/setup/inventory-manager' },
      { label: 'Control library', href: '/setup/control-library' },
      { label: 'Setup checklist', href: '/setup/setup-checklist' },
      { label: 'Global/Local Default', href: '/setup/global-local-default' },
    ],
  },
  { label: 'Data Mapping Automation settings', href: '/settings' },
];

export function isGroup(item: NavItem): item is NavGroup {
  return 'children' in item;
}

export function findNavLink(pathname: string): NavLink | undefined {
  for (const item of NAV) {
    if (isGroup(item)) {
      const hit = item.children.find((c) => c.href === pathname);
      if (hit) return hit;
    } else if (item.href === pathname) {
      return item;
    }
  }
  return undefined;
}
