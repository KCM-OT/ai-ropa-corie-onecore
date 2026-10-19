import type { CheckRecord, CheckWarning, RopaCheckReport } from './ropa-check';
import type { FieldMeta, Relationship } from './types';

// Hands a finished RoPA draft to the Data Mapping prototype
// (KCM-OT/ai-ropa-datamapping), which adds it to its Processing activities list.
//
// The draft travels as JSON in the URL fragment (#ropa-import=…), which the
// browser never sends to a server. The receiving page validates it, stores it
// in that site's localStorage, and clears the fragment. The same JSON can be
// downloaded as a file.
//
// The receiving side lives in ai-ropa-datamapping/lib/authoring/ropa-handoff.ts.
// Change both together.

export const HANDOFF_FORMAT = 'onetrust.ropa-handoff';
export const HANDOFF_VERSION = 1;
export const HANDOFF_PARAM = 'ropa-import';

const PRODUCTION_TARGET = 'https://ai-ropa-datamapping-sigma.vercel.app/processing-activities';
// When this app runs locally, hand off to the Data Mapping app's local dev server.
const LOCAL_TARGET = 'http://localhost:3000/processing-activities';

export interface RopaHandoff {
  format: typeof HANDOFF_FORMAT;
  version: typeof HANDOFF_VERSION;
  /** Unique per send, so the receiver can ignore a repeat. */
  id: string;
  createdAt: string;
  source: { app: string; url: string };
  submittedBy: string;
  /** The record in the ropa-authoring skill's JSON shape (references/fields.md, processor-mode.md). */
  record: CheckRecord & {
    fieldMeta: Record<string, FieldMeta>;
    relationships: Relationship[];
  };
  /** The skill's check results at the moment of sending. */
  check: {
    completeness: number;
    gaps: string[];
    validation: CheckWarning[];
    requiredAssessments: { type: string; name: string; owner?: string }[];
    reviewCadenceDays: number;
    reviewCadence: string;
  };
  /** Answers recorded against checks that can't clear on their own (Art. 9 condition, Art. 22, Art. 28). */
  notes: Record<string, string>;
}

export function buildHandoff(input: {
  record: CheckRecord;
  report: RopaCheckReport;
  fieldMeta: Record<string, FieldMeta>;
  relationships: Relationship[];
  notes: Record<string, string>;
  submittedBy: string;
}): RopaHandoff {
  const { record, report } = input;
  // Carry full evidence and rationale, not just the confidence the checker reads.
  const recorded = Object.keys(record.fieldMeta ?? {});
  const fieldMeta = Object.fromEntries(
    recorded.filter((k) => input.fieldMeta[k]).map((k) => [k, input.fieldMeta[k]]),
  );
  return {
    format: HANDOFF_FORMAT,
    version: HANDOFF_VERSION,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: { app: 'AI Assisted RoPA Creation', url: `${location.origin}/ai-assisted-ropa` },
    submittedBy: input.submittedBy,
    record: {
      ...record,
      fieldMeta,
      relationships: input.relationships.filter((r) => r.status !== 'rejected'),
    },
    check: {
      completeness: report.completeness,
      gaps: report.gaps,
      validation: report.validation,
      requiredAssessments: report.posture.requiredAssessments.map(({ type, name, owner }) => ({
        type,
        name,
        owner,
      })),
      reviewCadenceDays: report.posture.reviewCadence.cadenceDays,
      reviewCadence: report.posture.reviewCadence.label,
    },
    notes: input.notes,
  };
}

/** UTF-8 JSON → base64url, safe in a URL fragment. */
export function encodeHandoff(handoff: RopaHandoff): string {
  const bytes = new TextEncoder().encode(JSON.stringify(handoff));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function handoffTarget(): string {
  return ['localhost', '127.0.0.1'].includes(location.hostname) ? LOCAL_TARGET : PRODUCTION_TARGET;
}

export function handoffUrl(handoff: RopaHandoff): string {
  return `${handoffTarget()}#${HANDOFF_PARAM}=${encodeHandoff(handoff)}`;
}

export function handoffFileName(handoff: RopaHandoff): string {
  const slug = (handoff.record.name ?? 'record')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `ropa-${slug || 'record'}.json`;
}
