import { inventoryId } from './recertification';
import type { RecertRecord, RecertRelationship, RelType } from './recert-check';
import { LEGAL_BASES } from './recert-check';
import { SUBSIDIARIES } from './org';

// Receives a record for AI assisted re-certification from the Data Mapping
// prototype (KCM-OT/ai-ropa-datamapping): Inventory Maintenance → Recertify →
// "Continue to AI assisted re-certification" opens /recertification/<id> here
// with the record as JSON in the URL fragment (#recert-record=…, base64url),
// in the ropa-recertification skill's `ProcessingActivity` shape. It comes from
// another site, so every value is checked and capped here. The sender is
// lib/authoring/recert-handoff.ts in that repo; change both together.
//
// A received record is kept in localStorage by ID, so the check-in for that ID
// keeps using Data Mapping's details after a reload.

export const RECERT_HANDOFF_FORMAT = 'onetrust.recert-handoff';
export const RECERT_HANDOFF_VERSION = 1;
export const RECERT_HANDOFF_PARAM = 'recert-record';

const KEY = 'ai-ropa-onecore-recert-imports-v1';
const MAX_ENCODED_LENGTH = 60_000;
const REL_TYPES: RelType[] = ['vendor', 'asset', 'personalData'];
const ROLES = ['controller', 'joint_controller', 'processor'];

export interface ReceivedRecord {
  record: RecertRecord;
  receivedAt: string;
  sourceApp: string;
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

function isoDate(v: unknown): string | null {
  const s = str(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? new Date(Date.parse(s)).toISOString() : null;
}

function decodeBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * Reads and checks a record from a URL fragment for the route's ID.
 * Returns null if there's none; throws with a readable message if it's malformed.
 */
export function readRecertHandoff(hash: string, routeId: string): ReceivedRecord | null {
  const encoded = new URLSearchParams(hash.replace(/^#/, '')).get(RECERT_HANDOFF_PARAM);
  if (!encoded) return null;
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error('The record sent from Data Mapping is too large.');

  let raw: unknown;
  try {
    raw = JSON.parse(decodeBase64Url(encoded));
  } catch {
    throw new Error("The record sent from Data Mapping couldn't be read.");
  }
  const h = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (h['format'] !== RECERT_HANDOFF_FORMAT || h['version'] !== RECERT_HANDOFF_VERSION) {
    throw new Error('The record sent from Data Mapping is in a format this app does not recognise.');
  }
  const r = (h['record'] && typeof h['record'] === 'object' ? h['record'] : {}) as Record<string, unknown>;

  const id = str(r['id'], 80);
  const name = str(r['name'], 200);
  if (!id || !name) throw new Error('The record sent from Data Mapping has no name.');
  if (id !== `pa-${routeId}`) throw new Error("The record sent from Data Mapping doesn't match this page.");
  const subsidiaryId = str(r['subsidiaryId'], 64);
  if (!subsidiaryId || !SUBSIDIARIES.some((s) => s.id === subsidiaryId)) {
    throw new Error("The record's owning entity isn't a company in this group.");
  }

  const relationships: RecertRelationship[] = [];
  for (const x of Array.isArray(r['relationships']) ? r['relationships'].slice(0, 200) : []) {
    const rel = (x ?? {}) as Record<string, unknown>;
    const type = rel['type'] as RelType;
    const relName = str(rel['name'], 200);
    if (!REL_TYPES.includes(type) || !relName) continue;
    if (relationships.some((e) => e.type === type && e.name.toLowerCase() === relName.toLowerCase())) continue;
    relationships.push({
      id: str(rel['id'], 80) ?? `rel-${relationships.length + 1}`,
      type,
      name: relName,
      // Resolve against this app's inventory: the sender doesn't share IDs.
      inventoryId: inventoryId(type, relName),
      provenance: 'manual',
      status: 'accepted',
    });
  }

  const legalBasis = str(r['legalBasis'], 60);
  const cadence = Number(r['reviewCadenceDays']);
  const record: RecertRecord = {
    id,
    name,
    description: str(r['description'], 2000) ?? '',
    status: 'active',
    purpose: str(r['purpose'], 1000) ?? '',
    legalBasis: legalBasis && LEGAL_BASES.includes(legalBasis) ? legalBasis : '',
    managingOrganization: str(r['managingOrganization'], 200) ?? '',
    businessProcessOwner: str(r['businessProcessOwner'], 200) ?? '',
    subsidiaryId,
    role: ROLES.includes(r['role'] as string) ? (r['role'] as string) : 'controller',
    dataSubjectCategories: (Array.isArray(r['dataSubjectCategories']) ? r['dataSubjectCategories'] : [])
      .map((s) => str(s, 120))
      .filter((s): s is string => !!s)
      .slice(0, 50),
    retentionPeriod: str(r['retentionPeriod'], 500) ?? '',
    recipients: str(r['recipients'], 500) ?? '',
    internationalTransfers: str(r['internationalTransfers'], 500) ?? '',
    securityMeasures: str(r['securityMeasures'], 500) ?? '',
    jurisdiction: str(r['jurisdiction'], 200) ?? '',
    fieldMeta: {},
    relationships,
    reviewCadenceDays: Number.isFinite(cadence) && cadence >= 1 && cadence <= 3650 ? Math.round(cadence) : 365,
    lastReviewedAt: isoDate(r['lastReviewedAt']),
    nextReviewAt: isoDate(r['nextReviewAt']),
  };
  const source = (h['source'] && typeof h['source'] === 'object' ? h['source'] : {}) as Record<string, unknown>;
  return { record, receivedAt: new Date().toISOString(), sourceApp: str(source['app'], 120) ?? 'Data Mapping' };
}

// ---- Kept by ID ----

function load(): Record<string, ReceivedRecord> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, ReceivedRecord>) : {};
  } catch {
    return {};
  }
}

export function receivedRecord(routeId: string): ReceivedRecord | undefined {
  return load()[routeId];
}

export function keepReceivedRecord(routeId: string, received: ReceivedRecord): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...load(), [routeId]: received }));
  } catch {
    // Storage blocked: the check-in still uses it until the page closes.
  }
}

export function forgetReceivedRecord(routeId: string): void {
  try {
    const all = load();
    delete all[routeId];
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: nothing kept.
  }
}
