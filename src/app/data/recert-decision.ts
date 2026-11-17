// Receives the privacy analyst's decision on a check-in from the Data Mapping
// prototype (KCM-OT/ai-ropa-datamapping). Its Recertification review → Request
// changes opens /recertification/<id> here with the decision as JSON in the
// URL fragment (#recert-decision=…, base64url), usually alongside the record's
// current details (#recert-record=…, recert-handoff.ts). The check-in then
// opens with the analyst's question and a fresh run-through.
//
// It comes from another site, so every value is checked and capped. The
// sender is ai-ropa-datamapping/lib/authoring/recert-decision.ts. Change both
// together.

export const RECERT_DECISION_FORMAT = 'onetrust.recert-decision';
export const RECERT_DECISION_VERSION = 1;
export const RECERT_DECISION_PARAM = 'recert-decision';

const MAX_ENCODED_LENGTH = 20_000;

export interface RecertDecision {
  id: string;
  /** The check-in submission it answers (ChangeSubmission.id). */
  submissionId: string;
  /** The skill's record ID, `pa-<id>`. */
  recordId: string;
  status: 'changes_requested';
  question: string;
  decidedBy: string;
  decidedAt: string;
  receivedAt: string;
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

function decodeBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * Reads and checks a decision from a URL fragment for the route's ID.
 * Returns null if there's none; throws with a readable message if it's malformed.
 */
export function readRecertDecision(hash: string, routeId: string): RecertDecision | null {
  const encoded = new URLSearchParams(hash.replace(/^#/, '')).get(RECERT_DECISION_PARAM);
  if (!encoded) return null;
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error("The privacy analyst's reply is too large.");

  let raw: unknown;
  try {
    raw = JSON.parse(decodeBase64Url(encoded));
  } catch {
    throw new Error("The privacy analyst's reply couldn't be read.");
  }
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (d['format'] !== RECERT_DECISION_FORMAT || d['version'] !== RECERT_DECISION_VERSION) {
    throw new Error("The privacy analyst's reply is in a format this app does not recognise.");
  }
  const id = str(d['id'], 80);
  const submissionId = str(d['submissionId'], 80);
  const recordId = str(d['recordId'], 40);
  const question = str(d['question'], 2000);
  if (d['status'] !== 'changes_requested' || !id || !submissionId || !question) {
    throw new Error("The privacy analyst's reply is incomplete.");
  }
  if (recordId !== `pa-${routeId}`) throw new Error("The privacy analyst's reply doesn't match this record.");
  const decidedAt = str(d['decidedAt'], 40);
  return {
    id,
    submissionId,
    recordId,
    status: 'changes_requested',
    question,
    decidedBy: str(d['decidedBy'], 120) ?? 'The privacy analyst',
    decidedAt: decidedAt && !Number.isNaN(Date.parse(decidedAt)) ? decidedAt : new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  };
}
