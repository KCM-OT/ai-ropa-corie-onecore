import type { ChangeSubmission, RecertCheckReport } from './recert-check';

// Sends an owner's recertification check-in back to the Data Mapping prototype
// (KCM-OT/ai-ropa-datamapping) for the privacy analyst. "Send to privacy
// analyst" opens that app's /recertification-review page in a new tab with the
// submission and its check report as JSON in the URL fragment
// (#recert-result=…, base64url), which the browser never sends to a server.
// The analyst approves it or asks for changes there.
//
// The receiving side lives in ai-ropa-datamapping/lib/authoring/recert-result.ts.
// Change both together.

export const RECERT_RESULT_FORMAT = 'onetrust.recert-result';
export const RECERT_RESULT_VERSION = 1;
export const RECERT_RESULT_PARAM = 'recert-result';

const PRODUCTION_TARGET = 'https://ai-ropa-datamapping-sigma.vercel.app/recertification-review';
// When this app runs locally, send to the Data Mapping app's local dev server.
const LOCAL_TARGET = 'http://localhost:3000/recertification-review';

export interface RecertResult {
  format: typeof RECERT_RESULT_FORMAT;
  version: typeof RECERT_RESULT_VERSION;
  /** The submission's ID, so the receiver can ignore a repeat. */
  id: string;
  createdAt: string;
  source: { app: string; url: string };
  submission: ChangeSubmission;
  /** recert_check.py's findings, for the analyst. */
  check: {
    reviewStateBefore: RecertCheckReport['review_state_before'];
    daysUntilNextReview: number | null;
    changeCount: number;
    errors: string[];
    warnings: string[];
    notes: string[];
    riskHints: string[];
    suggestedFollowUps: RecertCheckReport['suggested_follow_ups'];
    /** What the record would get if the analyst approves. */
    ifApproved: { lastReviewedAt: string; nextReviewAt: string; cadenceDays: number };
  };
}

export function buildRecertResult(submission: ChangeSubmission, check: RecertCheckReport): RecertResult {
  return {
    format: RECERT_RESULT_FORMAT,
    version: RECERT_RESULT_VERSION,
    id: submission.id,
    createdAt: new Date().toISOString(),
    source: { app: 'AI Assisted Recertification', url: location.href.split('#')[0] },
    submission,
    check: {
      reviewStateBefore: check.review_state_before,
      daysUntilNextReview: check.days_until_next_review,
      changeCount: check.change_count,
      errors: check.errors,
      warnings: check.warnings,
      notes: check.notes,
      riskHints: check.risk_hints,
      suggestedFollowUps: check.suggested_follow_ups,
      ifApproved: {
        lastReviewedAt: check.commit_preview.lastReviewedAt,
        nextReviewAt: check.commit_preview.nextReviewAt,
        cadenceDays: check.commit_preview.cadenceDaysUsed,
      },
    },
  };
}

/** UTF-8 JSON → base64url, safe in a URL fragment. */
function encode(result: RecertResult): string {
  const bytes = new TextEncoder().encode(JSON.stringify(result));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Data Mapping's Recertification review with this result: localhost:3000 when running locally, else production. */
export function recertResultUrl(result: RecertResult): string {
  const base = ['localhost', '127.0.0.1'].includes(location.hostname) ? LOCAL_TARGET : PRODUCTION_TARGET;
  return `${base}#${RECERT_RESULT_PARAM}=${encode(result)}`;
}

/** Open it in a new tab. Call synchronously from a click so popup blockers allow it. */
export function openRecertResult(submission: ChangeSubmission, check: RecertCheckReport): void {
  const tab = window.open(recertResultUrl(buildRecertResult(submission, check)), '_blank');
  if (tab) tab.opener = null;
}
