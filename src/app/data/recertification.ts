import { profile } from './duplicates';
import { PROTOTYPE_TODAY, SIGNED_IN_USER, subsidiaryName } from './org';
import { nextReview, PROCESSING_ACTIVITIES, type ProcessingActivity } from './processing-activities';
import {
  fieldValue,
  POOL,
  relKey,
  reviewState,
  type ChangeSubmission,
  type FieldChange,
  type FieldKey,
  type RecertInventory,
  type RecertRecord,
  type RecertRelationship,
  type RelationshipChange,
  type RelType,
  type ReviewState,
} from './recert-check';
import { INVENTORY, PERSONAL_DATA_CUES } from './skill-draft';

// The owner side of the ropa-recertification skill
// (.claude/skills/ropa-recertification/SKILL.md steps 2–7 and
// references/owner-chat-agent.md): the record in the skill's shape, the seven
// topics in fixed order, reading the owner's answers into before/after change
// cards, and building the ChangeSubmission for the privacy analyst.
//
// No model is connected. Answers are read with rules: a Yes/No verdict, then
// for a change, known inventory names and simple verb cues (stopped using,
// now use, replaced X with Y, a new retention period). Anything the rules
// can't place becomes a change to the topic's main field in the owner's own
// words, which the owner can edit before applying.

export const RECERT_INVENTORY = INVENTORY as unknown as RecertInventory;
export const TODAY = PROTOTYPE_TODAY;

// ---- Labels ----

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'Name',
  description: 'Description',
  purpose: 'Purpose',
  legalBasis: 'Legal basis',
  managingOrganization: 'Managing organization',
  businessProcessOwner: 'Business process owner',
  dataSubjectCategories: 'Data subjects',
  retentionPeriod: 'Retention period',
  recipients: 'Recipients',
  internationalTransfers: 'International transfers',
  securityMeasures: 'Security measures',
  jurisdiction: 'Jurisdiction',
};

export const REL_GROUP_LABELS: Record<RelType, string> = {
  vendor: 'Vendors',
  asset: 'Systems & assets',
  personalData: 'Personal data',
};

/** Owner-facing words for a relationship type (no "assets"). */
export const REL_OWNER_LABELS: Record<RelType, string> = {
  vendor: 'Tool or vendor',
  asset: 'System',
  personalData: 'Personal data',
};

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  ok: 'On track',
  none: 'Not scheduled',
};

// ---- Records in the skill's shape ----

const JURISDICTION: Record<string, string> = {
  'sub-group': 'EU, UK, US',
  'sub-na': 'US, Canada',
  'sub-us': 'US',
  'sub-ca': 'Canada',
  'sub-emea': 'EU',
  'sub-de': 'EU',
  'sub-uk': 'UK',
  'sub-apac': 'Singapore',
};

function inventoryId(type: RelType, name: string): string | null {
  const k = name.trim().toLowerCase();
  return RECERT_INVENTORY[POOL[type]]?.find((i) => i.name.trim().toLowerCase() === k)?.id ?? null;
}

function isVendor(name: string): boolean {
  return inventoryId('vendor', name) !== null;
}

/** A Processing activities row as a record in the skill's `ProcessingActivity` shape. */
export function recertRecord(a: ProcessingActivity): RecertRecord {
  const p = profile(a.id);
  const relationships: RecertRelationship[] = [];
  const rel = (type: RelType, name: string) =>
    relationships.push({
      id: `rel-${a.id}-${relationships.length + 1}`,
      type,
      name,
      inventoryId: inventoryId(type, name),
      provenance: 'manual',
      status: 'accepted',
    });
  for (const s of p?.systems ?? []) rel(isVendor(s) ? 'vendor' : 'asset', s);
  for (const d of p?.personalData ?? []) rel('personalData', d);
  const next = nextReview(a);
  return {
    id: `pa-${a.id}`,
    name: a.name,
    status: a.status,
    purpose: p?.purpose ?? '',
    legalBasis: p?.legalBasis ?? '',
    managingOrganization: subsidiaryName(a.subsidiaryId),
    businessProcessOwner: a.owner,
    subsidiaryId: a.subsidiaryId,
    role: a.role,
    dataSubjectCategories: p?.dataSubjects ?? [],
    retentionPeriod: p?.retention ?? '',
    recipients: '',
    internationalTransfers: p?.internationalTransfers ?? '',
    securityMeasures: p?.securityMeasures ?? '',
    jurisdiction: JURISDICTION[a.subsidiaryId] ?? '',
    fieldMeta: {},
    relationships,
    reviewCadenceDays: a.cadenceDays,
    lastReviewedAt: `${a.lastReviewed}T00:00:00.000Z`,
    nextReviewAt: `${next}T00:00:00.000Z`,
  };
}

/** Archived records aren't recertified; pending ones have no review date yet. */
export const RECERT_ACTIVITIES = PROCESSING_ACTIVITIES.filter((a) => a.status === 'active');

export function recertRecordById(id: number): RecertRecord | undefined {
  const a = RECERT_ACTIVITIES.find((r) => r.id === id);
  return a && recertRecord(a);
}

export function recordReviewState(rec: RecertRecord): { state: ReviewState; days: number | null } {
  const [state, days] = reviewState(rec, TODAY);
  return { state, days };
}

export function relNames(rec: RecertRecord, ...types: RelType[]): string[] {
  return rec.relationships.filter((r) => types.includes(r.type)).map((r) => r.name);
}

// ---- The seven topics (owner-chat-agent.md) ----

export type TopicKey = 'ownership' | 'tools' | 'personalData' | 'purpose' | 'retention' | 'transfers' | 'security';

export interface Topic {
  key: TopicKey;
  label: string;
  detail: string;
}

export const TOPICS: Topic[] = [
  { key: 'ownership', label: 'Ownership', detail: 'Who runs this process?' },
  { key: 'tools', label: 'Tools & systems', detail: 'Are the linked tools still accurate?' },
  { key: 'personalData', label: 'Personal data', detail: 'What data is being collected?' },
  { key: 'purpose', label: 'Purpose & legal basis', detail: 'Why is the processing needed?' },
  { key: 'retention', label: 'Retention', detail: 'How long is data kept?' },
  { key: 'transfers', label: 'Transfers & jurisdictions', detail: 'Where does processing happen?' },
  { key: 'security', label: 'Security & recipients', detail: 'Who receives it and how is it protected?' },
];

/** The skill's exact follow-up after a "No". */
export const WHAT_CHANGED = 'Please tell us what has changed';

const BASIS_PLAIN: Record<string, string> = {
  Consent: 'people agreed to it',
  Contract: "you need it to deliver what you've agreed with them",
  'Legal obligation': 'the law requires it',
  'Legitimate interests': "it's a reasonable business need people would expect",
  'Vital interests': "it protects someone's life or safety",
  'Public task': "it's part of a public duty",
};

function lowerFirst(s: string): string {
  // Leave acronyms alone: "IP address", "MFA".
  if (!s || /^[A-Z]{2}/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function upperFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function listText(items: string[]): string {
  return items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function noTransfer(v: string | undefined): boolean {
  return !v || /^(?:none|no\b|n\/a|not applicable|domestic|within)/i.test(v.trim());
}

/** One simple yes/no question per topic, in everyday words. "Yes" always means "still right". */
export function topicQuestion(key: TopicKey, rec: RecertRecord): string {
  switch (key) {
    case 'ownership':
      return `The record says ${rec.businessProcessOwner || 'nobody yet'} runs this. Is your team still the one that runs this process?`;
    case 'tools': {
      const tools = relNames(rec, 'vendor', 'asset');
      return tools.length
        ? `It lists these tools and systems: ${listText(tools)}. Are you still using all of them, and nothing new?`
        : "It doesn't list any tools or systems. Is that still right?";
    }
    case 'personalData': {
      const data = relNames(rec, 'personalData');
      const who = rec.dataSubjectCategories?.length ? ` about ${listText(rec.dataSubjectCategories.map(lowerFirst))}` : '';
      return data.length
        ? `You collect ${listText(data.map(lowerFirst))}${who}. Is that still everything, with nothing new?`
        : `The record doesn't list what you collect${who}. Is that still right?`;
    }
    case 'purpose': {
      const basis = rec.legalBasis && BASIS_PLAIN[rec.legalBasis];
      return rec.purpose
        ? `You use this data to ${lowerFirst(rec.purpose)}${basis ? `, because ${basis}` : ''}. Is that still why and how you use it?`
        : "The record doesn't say why you use this data yet. Is that still the case?";
    }
    case 'retention':
      return rec.retentionPeriod
        ? `You keep the data for ${lowerFirst(rec.retentionPeriod)}. Is that still about right?`
        : "The record doesn't say how long you keep the data. Is that still the case?";
    case 'transfers':
      return noTransfer(rec.internationalTransfers)
        ? 'As far as the record shows, none of this data goes outside the country or region it started in. Is that still right?'
        : `Some of the data goes outside the region it started in: ${rec.internationalTransfers}. Is that still right?`;
    case 'security': {
      const how = rec.securityMeasures ? `It's protected with ${lowerFirst(rec.securityMeasures)}` : "The record doesn't say how it's protected";
      const who = rec.recipients ? `, and shared with ${lowerFirst(rec.recipients)}` : '';
      return `${how}${who}. Is that still right, with nobody new receiving it?`;
    }
  }
}

/** Short "what I heard" confirmations for a Yes. */
export const CONFIRMED_PHRASE: Record<TopicKey, string> = {
  ownership: 'Your team still runs this',
  tools: 'Same tools and systems',
  personalData: 'Same personal data',
  purpose: 'Same purpose and reason',
  retention: 'Kept for the same time',
  transfers: 'No change to where the data goes',
  security: 'Same protection and recipients',
};

/** Demo chips: a realistic change for each topic, written for this record. */
export function exampleAnswer(key: TopicKey, rec: RecertRecord): string {
  const tool = relNames(rec, 'vendor')[0] ?? relNames(rec, 'asset')[0];
  const data = relNames(rec, 'personalData').find((d) => d !== 'Name');
  switch (key) {
    case 'ownership':
      return 'No, the People Operations team runs this now';
    case 'tools':
      return tool ? `We stopped using ${tool} and now use HireVue` : 'We now use HireVue';
    case 'personalData':
      return data
        ? `We no longer collect ${lowerFirst(data)}, and we now also collect work authorization status`
        : 'We now also collect work authorization status';
    case 'purpose':
      return 'We now also use it to plan team capacity';
    case 'retention':
      return rec.retentionPeriod ? 'We keep it for 9 months now' : 'We keep it for 2 years after the record closes';
    case 'transfers':
      return noTransfer(rec.internationalTransfers)
        ? 'Some of it now goes to our support team in India under standard contractual clauses'
        : 'None of it leaves the region any more';
    case 'security':
      return 'We now also share it with our payroll provider';
  }
}

// ---- Reading the owner's answer ----

export type Verdict = 'yes' | 'no' | 'unsure' | 'unclear';

const NO_CHANGE =
  /\b(?:no changes?|nothing (?:has )?changed|nothing new|unchanged|still (?:accurate|right|correct|the same|true|valid)|same as (?:before|last time)|all good|that'?s (?:right|correct)|all correct)\b/i;
const YES = /^\s*(?:yes|yep|yeah|yup|y|correct|right|sure|confirmed?|still|exactly|ok(?:ay)?)\b/i;
const NO = /^\s*(?:no|nope|n|not (?:any ?more|really|quite)|wrong|incorrect)\b/i;
const UNSURE = /\b(?:not sure|don'?t know|no idea|unsure|can'?t remember)\b/i;
const LEAD = /^\s*(?:yes|yep|yeah|yup|no|nope|well|so|ok(?:ay)?|actually|not any ?more|not really|not quite)\b[\s,.:;!-]*/i;

export function verdict(text: string): Verdict {
  if (UNSURE.test(text)) return 'unsure';
  if (NO_CHANGE.test(text)) return 'yes';
  if (NO.test(text)) return 'no';
  if (YES.test(text)) return 'yes';
  return 'unclear';
}

/** The answer without its leading yes/no, for reading a change out of it. */
export function withoutLead(text: string): string {
  return text.replace(LEAD, '').replace(/^\s*(?:but|and|though)\b[\s,]*/i, '').trim();
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** A clause as a value: capitalised, no trailing punctuation. */
function asValue(s: string): string {
  return upperFirst(s.trim().replace(/[\s.!;,]+$/, ''));
}

/** The owner's words as a one-sentence reason. */
function asReason(s: string): string {
  const v = asValue(s);
  return v ? `${v}.` : '';
}

export interface Proposal {
  id: number;
  kind: 'field' | 'relationship';
  field?: FieldChange;
  relationship?: RelationshipChange;
  reason: string;
  status: 'pending' | 'applied' | 'skipped';
}

type Draft = Omit<Proposal, 'id' | 'status'>;

/** The answer read for one topic: a change, an ownership hand-off, or nothing the rules could place. */
export interface Reading {
  proposals: Draft[];
  /** Ownership: the new owner or team, when named (SKILL.md step 6). */
  newOwner?: string;
}

function fieldDraft(rec: RecertRecord, key: FieldKey, after: string, reason: string): Draft | null {
  const before = fieldValue(rec, key);
  if (!after.trim() || after.trim() === before.trim()) return null;
  return { kind: 'field', field: { key, label: FIELD_LABELS[key], before, after }, reason };
}

function clauses(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+|\s*;\s*|,\s*(?=(?:and|but|so|plus)\b)|\s+but\s+|\s+and\s+(?=(?:we|now|also|they|it|started|added|stopped|no longer|switched|moved|replaced|dropped|retired)\b)/i)
    .map((c) => c.replace(/^\s*(?:and|but|so|plus)\b\s*/i, '').trim())
    .filter(Boolean);
}

const REMOVE_RE =
  /\b(?:stopped|stop using|no longer|not using|aren'?t using|don'?t (?:use|collect|keep|ask|store|need)|do not (?:use|collect|keep|ask|store|need)|retired|removed?|dropped|got rid of|phased out|decommissioned|ended|cancell?ed|not any ?more)\b/i;
const ADD_RE =
  /\b(?:now|started|start|began|added|add|adopted|introduced|also|new|switched to|moved to|onboarded|brought in|collect(?:ing)?|captur(?:e|ing)|we use|using|signed up)\b/i;
const SWAP_RES = [
  /\breplaced\s+(.+?)\s+with\s+(.+)/i, // remove 1, add 2
  /\bswitched\s+from\s+(.+?)\s+to\s+(.+)/i,
  /\bmoved\s+from\s+(.+?)\s+to\s+(.+)/i,
];
const INSTEAD_RE = /(.+?)\s+instead of\s+(.+)/i; // add 1, remove 2
const ASSET_CUE = /\b(?:system|platform|database|portal|repository|spreadsheet|warehouse|workspace|console|app|in-house|internal tool|intranet)\b/i;
const NOT_A_NAME =
  /^(?:we|i|now|no|yes|our|the|a|an|they|it|also|but|and|since|this|that|then|some|all|none|nothing|united states|united kingdom|uk|us|usa|eu|eea|europe|india|canada|germany|singapore|sso|mfa|sccs?|gdpr|dpa|hr|it)$/i;

const KNOWN_TOOLS = [
  ...(RECERT_INVENTORY.vendors ?? []).map((v) => ({ name: v.name, type: 'vendor' as RelType })),
  ...(RECERT_INVENTORY.assets ?? []).map((v) => ({ name: v.name, type: 'asset' as RelType })),
];

/** Tool and system names in a fragment: on the record or in the inventory first, then capitalised names. */
function toolsIn(fragment: string, rec: RecertRecord): { name: string; type: RelType }[] {
  const found: { name: string; type: RelType }[] = [];
  const low = fragment.toLowerCase();
  const known = [
    ...rec.relationships.filter((r) => r.type !== 'personalData').map((r) => ({ name: r.name, type: r.type })),
    ...KNOWN_TOOLS,
  ];
  let rest = fragment;
  for (const k of known) {
    if (low.includes(k.name.toLowerCase()) && !found.some((f) => f.name.toLowerCase() === k.name.toLowerCase())) {
      found.push(k);
      rest = rest.replace(new RegExp(k.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
    }
  }
  for (const m of rest.matchAll(/\b([A-Z][\w.&+-]*(?:\s+[A-Z][\w.&+-]*){0,3})/g)) {
    const words = m[1].split(/\s+/);
    while (words.length && NOT_A_NAME.test(words[0])) words.shift();
    const name = words.join(' ');
    if (!name || NOT_A_NAME.test(name) || found.some((f) => f.name.toLowerCase() === name.toLowerCase())) continue;
    found.push({ name, type: ASSET_CUE.test(fragment) ? 'asset' : 'vendor' });
  }
  return found;
}

const PD_PHRASE =
  /\b(?:collect(?:ing)?|captur(?:e|ing)|ask(?:ing)? for|record(?:ing)?|keep(?:ing)?|stor(?:e|ing)|gather(?:ing)?|hold(?:ing)?|need)\s+(?:the\s+|their\s+|candidates?'?\s+|people'?s\s+|employees?'?\s+|customers?'?\s+|any\s+)?([a-z][a-z \-]+?)(?:\s+(?:any ?more|anymore|now|too|as well|at|from|for|in|on|during|when)\b|[.,;]|$)/i;

/** Personal-data categories in a fragment: on the record, the skill's cues, then "collect <thing>". */
function dataIn(fragment: string, rec: RecertRecord): string[] {
  const found: string[] = [];
  const low = fragment.toLowerCase();
  const add = (n: string) => {
    if (!found.some((f) => f.toLowerCase() === n.toLowerCase())) found.push(n);
  };
  for (const r of rec.relationships.filter((x) => x.type === 'personalData')) {
    if (r.name !== 'Name' && low.includes(r.name.toLowerCase())) add(r.name);
  }
  for (const c of RECERT_INVENTORY.personalDataCategories ?? []) {
    if (c.name !== 'Name' && low.includes(c.name.toLowerCase())) add(c.name);
  }
  for (const cue of PERSONAL_DATA_CUES) {
    if (cue.name === 'Name') continue;
    if (cue.re.test(fragment)) {
      // Prefer the record's own wording of the same category.
      const onRecord = rec.relationships.find((r) => r.type === 'personalData' && cue.re.test(r.name));
      add(onRecord?.name ?? cue.name);
    }
  }
  if (!found.length) {
    const m = fragment.match(PD_PHRASE);
    if (m && wordCount(m[1]) <= 5) add(upperFirst(m[1].trim()));
  }
  return found;
}

function relDraft(
  rec: RecertRecord,
  action: 'added' | 'removed',
  type: RelType,
  name: string,
  reason: string,
): Draft | null {
  const k = relKey(type, name);
  const onRecord = rec.relationships.find((r) => relKey(r.type, r.name) === k);
  if (action === 'removed' && !onRecord) return null;
  if (action === 'added' && onRecord) return null;
  return {
    kind: 'relationship',
    relationship: {
      action,
      type,
      name: onRecord?.name ?? name,
      inventoryId: action === 'removed' ? onRecord!.inventoryId : inventoryId(type, name),
    },
    reason,
  };
}

function relationshipReading(text: string, rec: RecertRecord, kind: 'tools' | 'personalData'): Draft[] {
  const out: Draft[] = [];
  const push = (d: Draft | null) => {
    if (d && !out.some((o) => o.relationship!.type === d.relationship!.type && o.relationship!.name.toLowerCase() === d.relationship!.name.toLowerCase())) out.push(d);
  };
  const names = (frag: string): { name: string; type: RelType }[] =>
    kind === 'tools' ? toolsIn(frag, rec) : dataIn(frag, rec).map((name) => ({ name, type: 'personalData' as RelType }));

  for (const clause of clauses(text)) {
    const reason = asReason(clause);
    const swap = SWAP_RES.map((re) => clause.match(re)).find(Boolean);
    const instead = swap ? null : clause.match(INSTEAD_RE);
    if (swap || instead) {
      const [oldPart, newPart] = swap ? [swap[1], swap[2]] : [instead![2], instead![1]];
      for (const n of names(oldPart)) push(relDraft(rec, 'removed', n.type, n.name, reason));
      for (const n of names(newPart)) push(relDraft(rec, 'added', n.type, n.name, reason));
      continue;
    }
    const action = REMOVE_RE.test(clause) ? 'removed' : ADD_RE.test(clause) ? 'added' : null;
    if (!action) continue;
    for (const n of names(clause)) push(relDraft(rec, action, n.type, n.name, reason));
  }
  return out;
}

const OWNER_RES = [
  /(?:now|moved to|transferred to|handed (?:it )?(?:over )?to|owned by|run by|managed by|taken over by|belongs to|is with|sits with)\s+(?:the\s+)?(.+?)$/i,
  /^(?:the\s+)?(.+?)\s+(?:now\s+)?(?:runs|owns|has taken over|took over|manages|is running|are running)\b/i,
];

/** The new owner named in an answer: "the People Operations team runs this now" → "People Operations". */
export function newOwnerIn(text: string, describing: boolean): string | undefined {
  const t = withoutLead(text).replace(/[.!]+$/, '');
  for (const re of OWNER_RES) {
    const m = t.match(re);
    if (m) {
      const name = m[1]
        .replace(/\b(?:runs?|owns?)\s+(?:this|it)\b.*$/i, '')
        .replace(/\s+(?:now|these days|instead)$/i, '')
        .replace(/'s\s+team$|\s+team$/i, '')
        .replace(/^(?:the|our)\s+/i, '')
        .trim();
      if (name && wordCount(name) <= 6 && !/^(?:this|it|we|us|me)$/i.test(name)) return name;
    }
  }
  if (describing && t && wordCount(t) <= 6) return t.replace(/'s\s+team$|\s+team$/i, '').replace(/^(?:the|our)\s+/i, '');
  return undefined;
}

const BASIS_CUES: [RegExp, string][] = [
  [/\bconsent|agreed to it|opt(?:ed)? in\b/i, 'Consent'],
  [/\bcontract/i, 'Contract'],
  [/legal (?:obligation|requirement)|required by law|the law requires|law says/i, 'Legal obligation'],
  [/legitimate interest|business need/i, 'Legitimate interests'],
  [/vital interest|life or safety/i, 'Vital interests'],
  [/public (?:task|interest|duty)/i, 'Public task'],
];

const DURATION =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty-four)\s+(days?|weeks?|months?|years?)\b([^.;]*)/i;

/**
 * Reads a change out of the owner's words for one topic (SKILL.md step 5).
 * `describing` is true when the text answers "Please tell us what has
 * changed", so field topics always produce a change in the owner's words.
 */
export function readChange(key: TopicKey, text: string, rec: RecertRecord, describing: boolean): Reading {
  const t = withoutLead(text);
  const reason = asReason(t);
  const fallback = (field: FieldKey): Reading => {
    const d = describing || wordCount(t) >= 3 ? fieldDraft(rec, field, asValue(t), reason) : null;
    return { proposals: d ? [d] : [] };
  };

  switch (key) {
    case 'ownership': {
      const newOwner = newOwnerIn(text, describing);
      return { proposals: [], newOwner };
    }
    case 'tools':
    case 'personalData':
      return { proposals: relationshipReading(t, rec, key) };
    case 'purpose': {
      const basis = BASIS_CUES.find(([re]) => re.test(t))?.[1];
      const out: Draft[] = [];
      const basisDraft = basis ? fieldDraft(rec, 'legalBasis', basis, reason) : null;
      if (basisDraft) out.push(basisDraft);
      const purposeText = clauses(t)
        .filter((c) => !BASIS_CUES.some(([re]) => re.test(c)))
        .join('. ')
        .replace(/^(?:we\s+)?(?:now\s+)?(?:also\s+)?use (?:it|the data|this data|this) (?:to|for)\s+/i, '');
      if (purposeText && wordCount(purposeText) >= 2) {
        const also = /\balso\b/i.test(t) && rec.purpose;
        const after = also ? `${rec.purpose}, and ${lowerFirst(asValue(purposeText))}` : asValue(purposeText);
        const d = fieldDraft(rec, 'purpose', after, reason);
        if (d) out.push(d);
      }
      return out.length ? { proposals: out } : fallback('purpose');
    }
    case 'retention': {
      const m = t.match(DURATION);
      if (m) {
        const duration = `${m[1]} ${m[2]}`;
        const tail = m[3].replace(/\b(?:now|these days|instead)\b/gi, '').trim();
        let after: string;
        if (/^(?:after|from|since|until|following|once|from the)\b/i.test(tail)) after = `${duration} ${tail}`;
        else if (rec.retentionPeriod && DURATION.test(rec.retentionPeriod)) {
          after = rec.retentionPeriod.replace(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty-four)\s+(days?|weeks?|months?|years?)\b/i, duration);
        } else after = duration;
        const d = fieldDraft(rec, 'retentionPeriod', asValue(after), reason);
        return { proposals: d ? [d] : [] };
      }
      return fallback('retentionPeriod');
    }
    case 'transfers': {
      if (/\b(?:none of it|nothing|no longer|stays? in|only in|doesn'?t leave|does not leave|not any ?more|any more)\b/i.test(t) && /\b(?:none|nothing|no longer|stays?|only|leave|any ?more)\b/i.test(t)) {
        const d = fieldDraft(rec, 'internationalTransfers', 'None', reason);
        if (d) return { proposals: [d] };
      }
      const after = t.replace(/^(?:some of it|some of the data|it)\s+(?:now\s+)?(?:goes|is sent|is transferred)\s+to\s+/i, '');
      return fallback2(rec, 'internationalTransfers', upperFirst(after), reason, describing || wordCount(t) >= 3);
    }
    case 'security': {
      const out: Draft[] = [];
      for (const c of clauses(t)) {
        if (/\b(?:share|shared|sharing|send|sent|sending|receives?|give|gives|pass(?:es)?|access)\b/i.test(c)) {
          const removing = REMOVE_RE.test(c);
          const party = asValue(
            (c.match(/\b(?:with|to)\s+(?:our\s+|the\s+)?(.+?)(?:\s+(?:now|too|as well|any ?more))?[.,;]?$/i)?.[1] ?? c).trim(),
          );
          const current = (rec.recipients ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          const next = removing
            ? current.filter((r) => r.toLowerCase() !== party.toLowerCase())
            : current.some((r) => r.toLowerCase() === party.toLowerCase())
              ? current
              : [...current, party];
          const d = fieldDraft(rec, 'recipients', next.join(', '), asReason(c));
          if (d) out.push(d);
        } else if (wordCount(c) >= 3 || describing) {
          const also = /\b(?:also|added|too|as well|plus)\b/i.test(c) && rec.securityMeasures;
          const value = asValue(c.replace(/^(?:we\s+)?(?:now\s+)?(?:also\s+)?(?:use|have|added)\s+/i, ''));
          const d = fieldDraft(rec, 'securityMeasures', also ? `${rec.securityMeasures}, ${lowerFirst(value)}` : value, asReason(c));
          if (d) out.push(d);
        }
      }
      return { proposals: out };
    }
  }
}

function fallback2(rec: RecertRecord, key: FieldKey, after: string, reason: string, ok: boolean): Reading {
  const d = ok ? fieldDraft(rec, key, asValue(after), reason) : null;
  return { proposals: d ? [d] : [] };
}

/** The owner's description of one card, for chips and the recap. */
export function proposalLabel(p: Pick<Proposal, 'kind' | 'field' | 'relationship'>): string {
  if (p.kind === 'field') return p.field!.label;
  const r = p.relationship!;
  return `${r.action === 'added' ? 'Add' : 'Remove'} ${r.name}`;
}

// ---- The submission (SKILL.md step 7, data-model.md) ----

export function buildSubmission(
  rec: RecertRecord,
  applied: Pick<Proposal, 'kind' | 'field' | 'relationship'>[],
  ownerNote: string,
  submittedAt: string,
): ChangeSubmission {
  const fieldChanges = applied.filter((p) => p.kind === 'field').map((p) => ({ ...p.field! }));
  const relationshipChanges = applied.filter((p) => p.kind === 'relationship').map((p) => ({ ...p.relationship! }));
  const count = fieldChanges.length + relationshipChanges.length;
  return {
    id: `sub-${Math.random().toString(36).slice(2, 9)}`,
    recordId: rec.id,
    recordName: rec.name,
    submittedBy: SIGNED_IN_USER,
    submittedRole: rec.businessProcessOwner || 'Business Process Owner',
    submittedAt,
    status: 'pending_review',
    decision: count ? 'modified' : 'approved_as_is',
    ownerNote: ownerNote.trim() || summaryText(rec, applied),
    fieldChanges,
    relationshipChanges,
    followUps: [],
    aiSummary: null,
  };
}

/** Plain-English recap of what's changing, or that nothing changed. */
export function summaryText(rec: RecertRecord, applied: Pick<Proposal, 'kind' | 'field' | 'relationship'>[]): string {
  if (!applied.length) return `The owner confirmed "${rec.name}" is still accurate.`;
  return `Changes to "${rec.name}": ${applied
    .map((p) =>
      p.kind === 'field'
        ? `${p.field!.label.toLowerCase()} now "${p.field!.after}"`
        : `${p.relationship!.action === 'added' ? 'add' : 'remove'} ${p.relationship!.name}`,
    )
    .join('; ')}.`;
}

/** The date the next check-in would fall on if the analyst approved today. */
export function nextReviewIfApproved(rec: RecertRecord): string {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) + (rec.reviewCadenceDays || 180) * 86_400_000).toISOString();
}

// ---- Parity cases: the check-in's own submissions (scripts/recert-parity.mjs) ----

/** Reads scripted answers the way the check-in does and applies every card. */
export function scriptedSubmission(rec: RecertRecord, answers: Partial<Record<TopicKey, string>>, note = ''): ChangeSubmission {
  const applied: Draft[] = [];
  for (const topic of TOPICS) {
    const answer = answers[topic.key];
    if (!answer || verdict(answer) === 'yes') continue;
    const reading = readChange(topic.key, answer, rec, true);
    if (topic.key === 'ownership' && reading.newOwner) {
      const d = fieldDraft(rec, 'businessProcessOwner', reading.newOwner, asReason(withoutLead(answer)));
      if (d) applied.push(d);
    }
    applied.push(...reading.proposals);
  }
  return { ...buildSubmission(rec, applied, note, `${TODAY}T09:00:00.000Z`), id: `sub-parity-${rec.id}` };
}

export function parityCases(): { label: string; sub: ChangeSubmission; record: RecertRecord }[] {
  const cases: { label: string; sub: ChangeSubmission; record: RecertRecord }[] = [];
  for (const a of RECERT_ACTIVITIES) {
    const rec = recertRecord(a);
    const examples = Object.fromEntries(TOPICS.map((t) => [t.key, exampleAnswer(t.key, rec)])) as Record<TopicKey, string>;
    cases.push({ label: `app check-in: ${a.name}, every example change`, sub: scriptedSubmission(rec, examples, 'Scripted.'), record: rec });
    cases.push({ label: `app check-in: ${a.name}, nothing changed`, sub: scriptedSubmission(rec, {}), record: rec });
  }
  return cases;
}
