// The ropa-recertification skill's checks (scripts/recert_check.py) in
// TypeScript. The Python script is the source of truth: after changing either,
// run `npm run skill:parity`, which runs both on the skill's examples, edge
// cases and submissions built by the app's check-in, and fails on any
// difference. Message wording, order and the Python list/None formatting are
// kept as-is so the outputs compare equal.

export const FIELD_KEYS = [
  'name',
  'description',
  'purpose',
  'legalBasis',
  'managingOrganization',
  'businessProcessOwner',
  'dataSubjectCategories',
  'retentionPeriod',
  'recipients',
  'internationalTransfers',
  'securityMeasures',
  'jurisdiction',
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const LEGAL_BASES = [
  'Consent',
  'Contract',
  'Legal obligation',
  'Vital interests',
  'Public task',
  'Legitimate interests',
];
const STATUSES = ['pending_review', 'changes_requested', 'approved', 'committed'];
const DECISIONS = ['approved_as_is', 'modified'];
const REL_TYPES = ['vendor', 'asset', 'personalData'];
const REL_ACTIONS = ['added', 'removed'];
const CHANNELS = ['teams', 'slack'];
const AUDIENCES = ['business_process_owner', 'application_owner', 'vendor_owner'];
const FU_STATUSES = ['draft', 'sent', 'answered'];

const SPECIAL_CUES = ['health', 'biometric', 'ethnic', 'racial', 'genetic', 'religio', 'political', 'sexual', 'trade union', 'criminal'];
const AI_CUES = ['ai ', ' ai', 'artificial intelligence', 'machine learning', 'scoring', 'profiling', 'automated decision', 'algorithm', 'predict'];
const MONITOR_CUES = ['monitor', 'tracking', 'surveillance', 'behavioural', 'behavioral'];
const VULNERABLE_CUES = ['child', 'minor', 'student', 'patient', 'vulnerable'];
const VAGUE_VALUES = ['until no longer needed', 'as long as necessary', 'tbd', 'n/a', 'unknown'];
const NO_TRANSFER_PREFIXES = ['none', 'no', 'n/a', 'not applicable', 'domestic', 'within'];

const DAY = 86_400_000;

// ---- Shapes (references/data-model.md) ----

export type RelType = 'vendor' | 'asset' | 'personalData';

export interface RecertRelationship {
  id: string;
  type: RelType;
  name: string;
  inventoryId: string | null;
  provenance: string;
  status: string;
}

/** A record in the skill's `ProcessingActivity` shape (examples/record-recruitment.json). */
export interface RecertRecord {
  id: string;
  name: string;
  description?: string;
  status?: string;
  purpose?: string;
  legalBasis?: string;
  managingOrganization?: string;
  businessProcessOwner?: string;
  subsidiaryId?: string;
  role?: string;
  dataSubjectCategories?: string[];
  retentionPeriod?: string;
  recipients?: string;
  internationalTransfers?: string;
  securityMeasures?: string;
  jurisdiction?: string;
  fieldMeta?: Record<string, unknown>;
  relationships: RecertRelationship[];
  reviewCadenceDays?: number | null;
  lastReviewedAt?: string | null;
  nextReviewAt?: string | null;
  [key: string]: unknown;
}

export interface FieldChange {
  key: FieldKey;
  label: string;
  before: string;
  after: string;
}

export interface RelationshipChange {
  action: 'added' | 'removed';
  type: RelType;
  name: string;
  inventoryId: string | null;
}

export interface FollowUpQuestion {
  id: string;
  question: string;
  channel: 'teams' | 'slack';
  audience: 'business_process_owner' | 'application_owner' | 'vendor_owner';
  recipient?: string;
  status: 'draft' | 'sent' | 'answered';
  aiGenerated?: boolean;
  createdAt?: string;
  sentAt?: string | null;
  answeredAt?: string | null;
  response?: string | null;
}

export interface ChangeSubmission {
  id: string;
  recordId: string;
  recordName: string;
  submittedBy: string;
  submittedRole: string;
  submittedAt: string;
  status: 'pending_review' | 'changes_requested' | 'approved' | 'committed';
  decision: 'modified' | 'approved_as_is';
  ownerNote: string;
  fieldChanges: FieldChange[];
  relationshipChanges: RelationshipChange[];
  followUps: FollowUpQuestion[];
  aiSummary?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
}
export interface RecertInventory {
  vendors?: InventoryItem[];
  assets?: InventoryItem[];
  personalDataCategories?: InventoryItem[];
}

export type ReviewState = 'none' | 'overdue' | 'due_soon' | 'ok';

export interface SuggestedFollowUp {
  question: string;
  audience: FollowUpQuestion['audience'];
  channel: FollowUpQuestion['channel'];
  rationale: string;
}

export interface RecertCheckReport {
  review_state_before: ReviewState;
  days_until_next_review: number | null;
  change_count: number;
  expected_decision: 'modified' | 'approved_as_is';
  errors: string[];
  warnings: string[];
  notes: string[];
  open_follow_ups: number;
  commit_preview: {
    changed_fields: Record<string, { before: string; after: string }>;
    relationships_after: string[];
    lastReviewedAt: string;
    nextReviewAt: string;
    cadenceDaysUsed: number;
    status: 'active';
    submission_status: 'committed';
  };
  suggested_follow_ups: SuggestedFollowUp[];
  risk_hints: string[];
}

export const POOL: Record<RelType, keyof RecertInventory> = {
  vendor: 'vendors',
  asset: 'assets',
  personalData: 'personalDataCategories',
};

// ---- Helpers (Python semantics) ----

/** Python's str() of a value inside an f-string: None prints as None. */
function py(v: unknown): string {
  return v === null || v === undefined ? 'None' : String(v);
}

/** Python's repr of a list of strings, as printed in the script's messages. */
function pyList(items: string[]): string {
  return `[${items.map((s) => `'${s}'`).join(', ')}]`;
}

/** Python's str.strip() (whitespace). */
function strip(s: string): string {
  return s.replace(/^\s+|\s+$/g, '');
}

export function fieldValue(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  if (Array.isArray(v)) return v.join(', ');
  return (v as string) || '';
}

export function relKey(type: string, name: string | null | undefined): string {
  return `${type}\u0000${strip(name || '').toLowerCase()}`;
}

/** `YYYY-MM-DD` of an ISO timestamp, in its own (UTC) zone. */
function isoDate(s: string): string {
  return new Date(Date.parse(s)).toISOString().slice(0, 10);
}

function utcMidnight(today: string): number {
  return Date.parse(`${today}T00:00:00Z`);
}

/** Python `datetime.isoformat()` of a UTC midnight, with Z: no milliseconds. */
function isoSeconds(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export function reviewState(rec: { nextReviewAt?: string | null }, today: string): [ReviewState, number | null] {
  if (!rec.nextReviewAt) return ['none', null];
  const days = Math.round((utcMidnight(isoDate(rec.nextReviewAt)) - utcMidnight(today)) / DAY);
  if (days < 0) return ['overdue', days];
  if (days <= 30) return ['due_soon', days];
  return ['ok', days];
}

// ---- The checks ----

export interface RecertCheckResult extends RecertCheckReport {
  /** The record as a commit would leave it (`--emit-record`). */
  _patched: RecertRecord;
}

/**
 * Mirrors `check(sub, rec, inventory, today)` in recert_check.py.
 * `today` is `YYYY-MM-DD` (UTC).
 */
export function runRecertChecks(
  sub: ChangeSubmission,
  rec: RecertRecord,
  inventory: RecertInventory | null,
  today: string,
): RecertCheckResult {
  const s = sub as unknown as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  // ---- shape ----
  for (const k of ['id', 'recordId', 'recordName', 'submittedBy', 'submittedRole', 'submittedAt', 'status', 'decision', 'ownerNote', 'fieldChanges', 'relationshipChanges', 'followUps']) {
    if (!(k in s)) errors.push(`Missing required property '${k}'.`);
  }
  if (!STATUSES.includes(s['status'] as string)) errors.push(`status '${py(s['status'])}' is not one of ${pyList(STATUSES)}.`);
  if (!DECISIONS.includes(s['decision'] as string)) errors.push(`decision '${py(s['decision'])}' is not one of ${pyList(DECISIONS)}.`);
  if (s['recordId'] !== rec.id) errors.push(`Submission recordId '${py(s['recordId'])}' does not match record id '${py(rec.id)}'.`);
  if (s['recordName'] && s['recordName'] !== rec.name) warnings.push("recordName differs from the record's current name.");
  if (!strip((s['ownerNote'] as string) || '')) warnings.push("ownerNote is empty; the analyst loses the owner's own words.");

  const fcs: FieldChange[] = sub.fieldChanges || [];
  const rcs: RelationshipChange[] = sub.relationshipChanges || [];
  const count = fcs.length + rcs.length;

  const expected = count > 0 ? 'modified' : 'approved_as_is';
  if (DECISIONS.includes(sub.decision) && sub.decision !== expected) {
    errors.push(`decision is '${sub.decision}' but there are ${count} change(s); expected '${expected}'.`);
  }

  // ---- field changes ----
  const seenFields = new Set<string>();
  fcs.forEach((fc, i) => {
    const tag = `fieldChanges[${i}]`;
    const key = fc.key;
    if (!(FIELD_KEYS as readonly string[]).includes(key)) {
      errors.push(`${tag}: key '${py(key)}' is not one of the 12 changeable fields.`);
      return;
    }
    if (seenFields.has(key)) errors.push(`${tag}: '${key}' is changed more than once; merge into a single change.`);
    seenFields.add(key);
    const current = fieldValue(rec, key);
    const before = fc.before ?? '';
    const after = fc.after ?? '';
    if (strip(before) !== strip(current)) {
      warnings.push(`${tag}: 'before' for ${key} is stale. Submitted '${before}', record now has '${current}'.`);
    }
    if (strip(after) === strip(current)) warnings.push(`${tag}: '${key}' after equals the current value; this is a no-op.`);
    if (!strip(after)) warnings.push(`${tag}: '${key}' is being cleared. Confirm that is intended.`);
    if (key === 'legalBasis' && after && !LEGAL_BASES.includes(after)) {
      errors.push(`${tag}: legalBasis '${after}' is not one of ${pyList(LEGAL_BASES)}.`);
    }
    if (key === 'retentionPeriod' && VAGUE_VALUES.includes(strip(after).toLowerCase())) {
      warnings.push(`${tag}: retention '${after}' is vague; ask for a concrete period.`);
    }
    if (fc.label === undefined || fc.label === null) warnings.push(`${tag}: missing display label.`);
  });

  // ---- relationship changes ----
  const existing = new Set((rec.relationships || []).map((r) => relKey(r.type, r.name)));
  const seenRels = new Map<string, string>();
  rcs.forEach((rc, i) => {
    const tag = `relationshipChanges[${i}]`;
    if (!REL_ACTIONS.includes(rc.action)) {
      errors.push(`${tag}: action '${py(rc.action)}' is not one of ${pyList(REL_ACTIONS)}.`);
      return;
    }
    if (!REL_TYPES.includes(rc.type)) {
      errors.push(`${tag}: type '${py(rc.type)}' is not one of ${pyList(REL_TYPES)}.`);
      return;
    }
    const k = relKey(rc.type, rc.name);
    const kName = k.split('\u0000')[1];
    if (!kName) {
      errors.push(`${tag}: name is empty.`);
      return;
    }
    if (seenRels.has(k)) {
      if (seenRels.get(k) === rc.action) errors.push(`${tag}: duplicate '${rc.action}' for ${rc.type} '${rc.name}'.`);
      else errors.push(`${tag}: ${rc.type} '${rc.name}' is both added and removed.`);
    }
    seenRels.set(k, rc.action);
    if (rc.action === 'removed' && !existing.has(k)) warnings.push(`${tag}: removing ${rc.type} '${rc.name}' which is not on the record.`);
    if (rc.action === 'added' && existing.has(k)) warnings.push(`${tag}: adding ${rc.type} '${rc.name}' which is already on the record.`);
    if (rc.action === 'added') {
      const invId = rc.inventoryId ?? null;
      let matched: string | null = null;
      if (inventory) {
        for (const item of inventory[POOL[rc.type]] ?? []) {
          if (strip(item.name).toLowerCase() === kName) {
            matched = item.id;
            break;
          }
        }
      }
      if (invId === null && matched) warnings.push(`${tag}: '${rc.name}' exists in the inventory as ${matched} but inventoryId is null.`);
      if (invId && inventory && matched && invId !== matched) warnings.push(`${tag}: inventoryId ${invId} differs from the inventory match ${matched}.`);
      if (invId === null && !matched) notes.push(`New to inventory: ${rc.type} '${rc.name}'. Decide whether to add it.`);
    }
  });

  // ---- follow-ups ----
  const fus = sub.followUps || [];
  fus.forEach((f, i) => {
    const tag = `followUps[${i}]`;
    if (!CHANNELS.includes(f.channel)) errors.push(`${tag}: channel '${py(f.channel)}' is not one of ${pyList(CHANNELS)}.`);
    if (!AUDIENCES.includes(f.audience)) errors.push(`${tag}: audience '${py(f.audience)}' is not one of ${pyList(AUDIENCES)}.`);
    if (!FU_STATUSES.includes(f.status)) errors.push(`${tag}: status '${py(f.status)}' is not one of ${pyList(FU_STATUSES)}.`);
    if (f.status === 'answered' && !f.response) warnings.push(`${tag}: marked answered but has no response.`);
    if ((f.status === 'sent' || f.status === 'answered') && !f.sentAt) warnings.push(`${tag}: ${f.status} but sentAt is missing.`);
  });
  const openFu = fus.filter((f) => f.status === 'sent');
  if (openFu.length) warnings.push(`${openFu.length} follow-up(s) still awaiting a reply; consider waiting before commit.`);

  // ---- commit preview (applySubmission) ----
  let rels: RecertRelationship[] = (rec.relationships || []).map((r) => ({ ...r }));
  for (const rc of rcs) {
    if (!REL_TYPES.includes(rc.type) || !REL_ACTIONS.includes(rc.action)) continue;
    const k = relKey(rc.type, rc.name);
    if (rc.action === 'removed') {
      rels = rels.filter((r) => relKey(r.type, r.name) !== k);
    } else if (!rels.some((r) => relKey(r.type, r.name) === k)) {
      rels.push({ id: 'rel-(new)', type: rc.type, name: rc.name, inventoryId: rc.inventoryId ?? null, provenance: 'manual', status: 'accepted' });
    }
  }
  const patched: RecertRecord = JSON.parse(JSON.stringify(rec));
  patched.relationships = rels;
  const meta: Record<string, unknown> = { ...(rec.fieldMeta || {}) };
  for (const fc of fcs) {
    if (!(FIELD_KEYS as readonly string[]).includes(fc.key)) continue;
    if (fc.key === 'dataSubjectCategories') {
      patched[fc.key] = (fc.after || '').split(',').map(strip).filter(Boolean);
    } else {
      patched[fc.key] = fc.after || '';
    }
    meta[fc.key] = { provenance: 'manual' };
  }
  patched.fieldMeta = meta;
  const cadence = rec.reviewCadenceDays || 180;
  const now = utcMidnight(today);
  patched.lastReviewedAt = isoSeconds(now);
  patched.nextReviewAt = isoSeconds(now + cadence * DAY);
  patched.status = 'active';
  patched['updatedWithAI'] = true;

  // ---- follow-up suggestions (mirrors /api/recert/follow-ups fallback) ----
  let suggestions: SuggestedFollowUp[] = [];
  for (const rc of rcs) {
    if (rc.action === 'added' && rc.type === 'vendor') {
      suggestions.push({
        question: `A new vendor "${rc.name}" was added. Is there a signed DPA, and where is data hosted?`,
        audience: 'vendor_owner',
        channel: 'teams',
        rationale: 'New processors need a DPA and transfer review before the record is committed.',
      });
    }
    if (rc.action === 'removed' && rc.type === 'personalData') {
      suggestions.push({
        question: `You removed "${rc.name}". Has all historical data of this type been deleted or is it still retained anywhere?`,
        audience: 'business_process_owner',
        channel: 'slack',
        rationale: 'Removing a data element from collection does not always mean retained data is purged.',
      });
    }
    if (rc.action === 'added' && rc.type === 'personalData') {
      suggestions.push({
        question: `You added "${rc.name}". What is the legal basis for collecting this, and for which data subjects?`,
        audience: 'business_process_owner',
        channel: 'slack',
        rationale: 'New personal data can change the legal basis and required assessments.',
      });
    }
  }
  if (!suggestions.length) {
    suggestions.push({
      question: 'Can you confirm nothing about the systems, vendors, or data has changed since last year?',
      audience: 'business_process_owner',
      channel: 'teams',
      rationale: 'An approve-as-is submission still benefits from a quick confirmation.',
    });
  }
  suggestions = suggestions.slice(0, 4);

  // ---- risk hints ----
  const hints: string[] = [];
  for (const rc of rcs) {
    const n = (rc.name || '').toLowerCase();
    if (rc.action === 'added' && rc.type === 'personalData' && SPECIAL_CUES.some((c) => n.includes(c))) {
      hints.push(`Added possible special-category data '${rc.name}': consider PIA/DPIA, PbD review and the 180-day tier.`);
    }
    if (rc.action === 'added' && rc.type === 'vendor') {
      hints.push(`New vendor '${rc.name}': confirm DPA, hosting location and any international transfer (TIA).`);
    }
    if (rc.action === 'added' && AI_CUES.some((c) => n.includes(c))) {
      hints.push(`'${rc.name}' suggests automated decisions or AI: consider PIA/DPIA, PbD and AI Risk Assessment.`);
    }
  }
  for (const fc of fcs) {
    const key = fc.key;
    const after = fc.after || '';
    const low = ` ${after.toLowerCase()} `;
    if (key === 'legalBasis' && after === 'Legitimate interests') {
      hints.push('Legal basis changed to Legitimate interests: a Legitimate Interests Assessment (LIA) is required.');
    }
    if (key === 'internationalTransfers' && strip(after) && !NO_TRANSFER_PREFIXES.some((p) => strip(after).toLowerCase().startsWith(p))) {
      hints.push('International transfer now stated: a Transfer Impact Assessment (TIA) is required; 270-day tier at least.');
    }
    if ((key === 'purpose' || key === 'description') && AI_CUES.some((c) => low.includes(c))) {
      hints.push(`${key} now mentions AI or automated scoring: PIA/DPIA, PbD and AI Risk Assessment likely required.`);
    }
    if ((key === 'purpose' || key === 'description') && MONITOR_CUES.some((c) => low.includes(c))) {
      hints.push(`${key} now mentions monitoring or tracking: systematic monitoring triggers PIA/DPIA and the 180-day tier.`);
    }
    if (key === 'dataSubjectCategories' && VULNERABLE_CUES.some((c) => low.includes(c))) {
      hints.push('Data subjects now include a vulnerable group: PIA/DPIA and at least the 270-day tier.');
    }
    if (key === 'businessProcessOwner') {
      notes.push('Ownership changed: confirm the new owner agrees and update governance contacts.');
    }
  }
  if (!hints.length) hints.push('No new risk conditions detected from the changes. Re-run posture after commit to confirm.');

  const [state, days] = reviewState(rec, today);
  const changedFields: Record<string, { before: string; after: string }> = {};
  for (const fc of fcs) {
    if ((FIELD_KEYS as readonly string[]).includes(fc.key)) {
      changedFields[fc.key] = { before: fieldValue(rec, fc.key), after: fieldValue(patched, fc.key) };
    }
  }
  return {
    review_state_before: state,
    days_until_next_review: days,
    change_count: count,
    expected_decision: expected,
    errors,
    warnings,
    notes,
    open_follow_ups: openFu.length,
    commit_preview: {
      changed_fields: changedFields,
      relationships_after: rels.map((r) => `${r.type}: ${r.name}`),
      lastReviewedAt: patched.lastReviewedAt,
      nextReviewAt: patched.nextReviewAt,
      cadenceDaysUsed: cadence,
      status: 'active',
      submission_status: 'committed',
    },
    suggested_follow_ups: suggestions,
    risk_hints: hints,
    _patched: patched,
  };
}
