import { PROTOTYPE_TODAY } from './org';
import type { ProcessingRole } from './types';

// Mock RoPA records for the Processing activities screen.

export type ReviewStatus = 'overdue' | 'due-soon' | 'current';
/** The record's lifecycle status in Data Mapping (separate from its review status). */
export type RecordStatus = 'active' | 'pending' | 'archived';

export interface ProcessingActivity {
  id: number;
  name: string;
  role: ProcessingRole;
  subsidiaryId: string;
  completeness: number; // 0–100, as scored by the skill's ropa_check
  owner: string;
  status: RecordStatus;
  lastReviewed: string; // ISO date
  cadenceDays: 180 | 270 | 365; // from the skill's default posture rules
}

const DAY = 86_400_000;
const DUE_SOON_DAYS = 30;

export function nextReview(a: ProcessingActivity): string {
  return new Date(Date.parse(a.lastReviewed) + a.cadenceDays * DAY).toISOString().slice(0, 10);
}

export function reviewStatus(a: ProcessingActivity): ReviewStatus {
  const daysLeft = (Date.parse(nextReview(a)) - Date.parse(PROTOTYPE_TODAY)) / DAY;
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= DUE_SOON_DAYS) return 'due-soon';
  return 'current';
}

type Row = [number, string, ProcessingRole, string, number, string, string, ProcessingActivity['cadenceDays']];

// [id, name, role, subsidiary, completeness, owner, lastReviewed, cadence]
const ROWS: Row[] = [
  [1012, 'Employee payroll processing', 'controller', 'sub-us', 96, 'Priya Shah', '2026-03-02', 365],
  [1013, 'AI-assisted candidate screening', 'controller', 'sub-group', 74, 'Jane Smith', '2026-03-20', 180],
  [1014, 'Customer support ticketing', 'controller', 'sub-uk', 88, 'Tom Becker', '2025-11-04', 365],
  [1015, 'Marketing email campaigns', 'controller', 'sub-na', 81, 'Ana Lopez', '2025-10-01', 365],
  [1016, 'Fleet telematics for insurers', 'processor', 'sub-de', 69, 'Lukas Weber', '2026-02-11', 270],
  [1017, 'Vehicle claims estimation platform', 'processor', 'sub-emea', 92, 'Claire Martin', '2026-06-30', 270],
  [1018, 'Group HR information system', 'joint_controller', 'sub-group', 85, 'Priya Shah', '2026-01-15', 270],
  [1019, 'Website analytics and cookies', 'controller', 'sub-uk', 77, 'Tom Becker', '2026-09-01', 365],
  [1020, 'Background checks for new hires', 'controller', 'sub-ca', 63, 'Marc Tremblay', '2026-04-12', 180],
  [1021, 'Dealer management system hosting', 'processor', 'sub-us', 90, 'Ana Lopez', '2025-12-01', 365],
  [1022, 'Employee health and safety incidents', 'controller', 'sub-de', 71, 'Lukas Weber', '2026-04-20', 180],
  [1023, 'CCTV at regional offices', 'controller', 'sub-apac', 58, 'Wei Lin', '2025-08-18', 365],
  [1024, 'Customer identity verification', 'controller', 'sub-na', 94, 'Ana Lopez', '2026-07-07', 270],
  [1025, 'Shared services finance', 'joint_controller', 'sub-emea', 82, 'Claire Martin', '2026-05-05', 365],
  [1026, 'Repair shop data exchange', 'processor', 'sub-uk', 66, 'Tom Becker', '2026-01-28', 270],
  [1027, 'Sales CRM and pipeline', 'controller', 'sub-us', 89, 'Priya Shah', '2026-08-14', 365],
  [1028, 'Learning management platform', 'controller', 'sub-group', 79, 'Jane Smith', '2025-10-30', 365],
  [1029, 'Insurer fraud scoring service', 'processor', 'sub-emea', 73, 'Claire Martin', '2026-04-25', 180],
  [1030, 'Visitor management at HQ', 'controller', 'sub-group', 61, 'Jane Smith', '2026-06-01', 365],
  [1031, 'Customer satisfaction surveys', 'controller', 'sub-apac', 84, 'Wei Lin', '2026-02-20', 270],
  [1032, 'Expense management', 'controller', 'sub-ca', 91, 'Marc Tremblay', '2026-09-22', 365],
  [1033, 'Whistleblowing hotline', 'controller', 'sub-group', 68, 'Jane Smith', '2026-05-10', 180],
];

// Most records are active; a few are pending sign-off or archived.
const STATUS_OVERRIDES: Record<number, RecordStatus> = { 1030: 'pending', 1033: 'pending', 1023: 'archived' };

export const PROCESSING_ACTIVITIES: ProcessingActivity[] = ROWS.map(
  ([id, name, role, subsidiaryId, completeness, owner, lastReviewed, cadenceDays]) => ({
    id,
    name,
    role,
    subsidiaryId,
    completeness,
    owner,
    status: STATUS_OVERRIDES[id] ?? 'active',
    lastReviewed,
    cadenceDays,
  }),
);
