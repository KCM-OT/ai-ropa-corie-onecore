import { SUBSIDIARIES, subsidiaryName } from './org';
import { PROCESSING_ACTIVITIES, type ProcessingActivity } from './processing-activities';
import type { ProcessingRole } from './types';

// Duplicate check for AI Assisted RoPA Creation. Before a new record is
// created, the assistant compares the draft with the processing activities the
// signed-in user is allowed to view and flags a likely duplicate: the matched
// record, why it matched, and the fields that overlap. The user then chooses to
// use the existing record, create a local variation that inherits from it, or
// dismiss the flag. Nothing is created, linked or inherited until they confirm.
//
// The profiles below are prototype data: the Article 30 content behind the
// mock Processing activities list.

export interface RecordProfile {
  id: number;
  name: string;
  role: ProcessingRole;
  subsidiaryId: string;
  owner: string;
  purpose: string;
  dataSubjects: string[];
  personalData: string[];
  /** Vendors and systems (inventory names). */
  systems: string[];
  /** Processor records: the clients it acts for. */
  controllers?: string[];
  legalBasis?: string;
  retention?: string;
  securityMeasures?: string;
  internationalTransfers?: string;
}

type ProfileData = Omit<RecordProfile, 'id' | 'name' | 'role' | 'subsidiaryId' | 'owner'>;

const PROFILE_DATA: Record<number, ProfileData> = {
  1012: {
    purpose: 'Pay employees and file payroll taxes',
    dataSubjects: ['Employees'],
    personalData: ['Name', 'Financial account data', 'Government ID number', 'Employment history'],
    systems: ['Workday', 'HRIS'],
    legalBasis: 'Legal obligation',
    retention: '7 years after employment ends',
    securityMeasures: 'SSO, role-based access and encryption at rest',
  },
  1013: {
    purpose: 'Screen and shortlist job applicants with AI scoring',
    dataSubjects: ['Job applicants'],
    personalData: ['Name', 'Email address', 'Employment history', 'Inferred candidate scores', 'Video interview recordings', 'Health data'],
    systems: ['Greenhouse', 'TalentSprint AI', 'Candidate ATS', 'Zoom', 'Recorded Interview Workspace'],
    legalBasis: 'Legitimate interests',
    retention: '12 months after the role is filled',
    securityMeasures: 'SSO and encryption at rest',
    internationalTransfers: 'United States under standard contractual clauses',
  },
  1014: {
    purpose: 'Answer customer support requests',
    dataSubjects: ['Customers'],
    personalData: ['Name', 'Email address', 'Phone number'],
    systems: ['Zendesk', 'Okta'],
    legalBasis: 'Contract',
    retention: '3 years after the ticket closes',
  },
  1015: {
    purpose: 'Send marketing emails to subscribers',
    dataSubjects: ['Customers', 'Prospects'],
    personalData: ['Name', 'Email address', 'Device identifiers'],
    systems: ['Salesforce'],
    legalBasis: 'Consent',
    retention: 'Until consent is withdrawn',
  },
  1016: {
    purpose: 'Collect vehicle telematics and score driving for insurer clients',
    dataSubjects: ['Drivers'],
    personalData: ['Name', 'Location data', 'Device identifiers'],
    systems: ['Amazon Web Services'],
    controllers: ['Allianz Partners', 'Aviva'],
    securityMeasures: 'Encryption in transit and at rest, MFA for operators',
  },
  1017: {
    purpose: 'Estimate vehicle repair costs for insurer claims',
    dataSubjects: ['Claimants', 'Vehicle owners'],
    personalData: ['Name', 'Postal address', 'Phone number', 'Location data'],
    systems: ['Amazon Web Services', 'Okta'],
    controllers: ['Aviva', 'Zurich Insurance'],
    securityMeasures: 'SSO, MFA and encryption at rest and in transit',
    internationalTransfers: 'None',
  },
  1018: {
    purpose: 'Run the group-wide HR information system',
    dataSubjects: ['Employees'],
    personalData: ['Name', 'Email address', 'Employment history', 'Financial account data'],
    systems: ['Workday', 'HRIS'],
    legalBasis: 'Contract',
    retention: '6 years after employment ends',
    securityMeasures: 'SSO and role-based access',
  },
  1019: {
    purpose: 'Measure website use with analytics cookies',
    dataSubjects: ['Website visitors'],
    personalData: ['IP address', 'Device identifiers'],
    systems: [],
    legalBasis: 'Consent',
  },
  1020: {
    purpose: 'Run pre-employment background checks on new hires',
    dataSubjects: ['New hires', 'Job applicants'],
    personalData: ['Name', 'Government ID number', 'Employment history', 'Postal address'],
    systems: ['Checkr', 'Background Check Repository'],
    legalBasis: 'Legitimate interests',
    retention: '6 months after the hiring decision',
  },
  1021: {
    purpose: 'Host the dealer management system for dealership clients',
    dataSubjects: ['Dealer customers', 'Dealer staff'],
    personalData: ['Name', 'Postal address', 'Payment card data', 'Phone number'],
    systems: ['Amazon Web Services', 'Okta'],
    controllers: ['Northwind Motors', 'Contoso Auto Group'],
  },
  1022: {
    purpose: 'Record and investigate workplace health and safety incidents',
    dataSubjects: ['Employees', 'Contractors'],
    personalData: ['Name', 'Health data', 'Employment history'],
    systems: ['HRIS'],
    legalBasis: 'Legal obligation',
    retention: '10 years after the incident',
  },
  1023: {
    purpose: 'Monitor regional offices with CCTV',
    dataSubjects: ['Employees', 'Visitors'],
    personalData: ['Biometric data'],
    systems: [],
  },
  1024: {
    purpose: 'Verify customer identity at onboarding',
    dataSubjects: ['Customers'],
    personalData: ['Name', 'Government ID number', 'Biometric data'],
    systems: ['Okta', 'Amazon Web Services'],
    legalBasis: 'Legal obligation',
  },
  1025: {
    purpose: 'Run shared services finance for group companies',
    dataSubjects: ['Employees', 'Suppliers'],
    personalData: ['Name', 'Financial account data', 'Email address'],
    systems: ['Workday'],
    legalBasis: 'Contract',
    retention: '7 years after the financial year ends',
  },
  1026: {
    purpose: 'Share claim and repair data with repair shops for insurer clients',
    dataSubjects: ['Vehicle owners', 'Claimants'],
    personalData: ['Name', 'Phone number', 'Postal address'],
    systems: ['Amazon Web Services'],
    controllers: ['Aviva', 'Direct Line'],
  },
  1027: {
    purpose: 'Manage sales leads and the pipeline',
    dataSubjects: ['Prospects', 'Customers'],
    personalData: ['Name', 'Email address', 'Phone number'],
    systems: ['Salesforce'],
    legalBasis: 'Legitimate interests',
  },
  1028: {
    purpose: 'Deliver training and track course completion for employees',
    dataSubjects: ['Employees'],
    personalData: ['Name', 'Email address', 'Education and qualifications'],
    systems: ['Workday', 'Okta'],
    legalBasis: 'Contract',
    retention: '3 years after employment ends',
  },
  1029: {
    purpose: 'Score insurance claims for fraud for insurer clients',
    dataSubjects: ['Claimants', 'Policyholders'],
    personalData: ['Name', 'Postal address', 'Inferred candidate scores'],
    systems: ['Amazon Web Services'],
    controllers: ['Zurich Insurance', 'Aviva'],
  },
  1030: {
    purpose: 'Register visitors at headquarters',
    dataSubjects: ['Visitors'],
    personalData: ['Name', 'Email address'],
    systems: [],
  },
  1031: {
    purpose: 'Run customer satisfaction surveys',
    dataSubjects: ['Customers'],
    personalData: ['Name', 'Email address'],
    systems: ['Salesforce'],
  },
  1032: {
    purpose: 'Reimburse employee expenses',
    dataSubjects: ['Employees'],
    personalData: ['Name', 'Financial account data'],
    systems: ['Workday'],
    legalBasis: 'Contract',
  },
  1033: {
    purpose: 'Receive and investigate whistleblowing reports',
    dataSubjects: ['Employees', 'Contractors'],
    personalData: ['Name', 'Email address'],
    systems: [],
    legalBasis: 'Legal obligation',
  },
};

export const RECORD_PROFILES: RecordProfile[] = PROCESSING_ACTIVITIES.filter((a) => PROFILE_DATA[a.id]).map(
  (a: ProcessingActivity) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    subsidiaryId: a.subsidiaryId,
    owner: a.owner,
    ...PROFILE_DATA[a.id],
  }),
);

export function profile(id: number): RecordProfile | undefined {
  return RECORD_PROFILES.find((p) => p.id === id);
}

// ---- Permissions (prototype) ----

/**
 * The signed-in user's view scope: every group company except APAC. The
 * duplicate check only ever compares against, and only ever reveals, records
 * in this scope.
 */
const VIEWABLE_SUBSIDIARIES = new Set(SUBSIDIARIES.map((s) => s.id).filter((id) => id !== 'sub-apac'));

export function canView(p: Pick<RecordProfile, 'subsidiaryId'>): boolean {
  return VIEWABLE_SUBSIDIARIES.has(p.subsidiaryId);
}

export const VIEWABLE_PROFILES = RECORD_PROFILES.filter(canView);

/** A record's content written as a description, for starting a new draft from it. */
export function describeProfile(p: RecordProfile): string {
  const entity = subsidiaryName(p.subsidiaryId).replace(/\.$/, '');
  const lines = [
    p.role === 'processor'
      ? `${entity} works on behalf of our clients, following their instructions, to ${lower(p.purpose)}.`
      : p.role === 'joint_controller'
        ? `${entity} and Solera Group jointly decide how we ${lower(p.purpose)}.`
        : `We decide how ${entity} uses this data to ${lower(p.purpose)}.`,
    p.controllers?.length ? `Clients: ${p.controllers.join('; ')}.` : '',
    `Data subjects: ${p.dataSubjects.join(', ').toLowerCase()}.`,
    p.personalData.length ? `We hold ${p.personalData.join(', ').toLowerCase()}.` : '',
    p.systems.length ? `We use ${p.systems.join(' and ')}.` : '',
    p.legalBasis ? `The legal basis is ${p.legalBasis.toLowerCase()}.` : '',
    p.retention ? `Retention: ${p.retention}.` : '',
    p.securityMeasures ? `Security: ${p.securityMeasures}.` : '',
    `The process is owned by ${p.owner}.`,
  ];
  return lines.filter(Boolean).join(' ');
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// ---- Matching ----

/** What the duplicate check reads from the draft. */
export interface DraftProfile {
  name: string;
  text: string;
  role: ProcessingRole;
  subsidiaryId: string | null;
  dataSubjects: string[];
  personalData: string[];
  systems: string[];
  controllers: string[];
}

export interface Overlap {
  label: string;
  draft: string;
  existing: string;
}

export interface DuplicateMatch {
  record: RecordProfile;
  /** 0–1; a likely duplicate scores at least LIKELY_DUPLICATE. */
  score: number;
  strength: 'Strong match' | 'Likely match';
  /** Why it matched, in one or two sentences. */
  because: string;
  /** The matched record in a sentence, then `because`. */
  rationale: string;
  overlaps: Overlap[];
  /** How many records the check compared against: the ones the user can view. */
  checked: number;
}

export const LIKELY_DUPLICATE = 0.33;
const STRONG_DUPLICATE = 0.6;

const STOP = new Set(
  ('the a an and or of to for in on with by our we us is are be it its at as from this that their them they ' +
    'data processing activity personal new process service services user users run runs use uses used using ' +
    'each all any can into who which then after where when how what about solera group ltd inc gmbh').split(' '),
);

function topicTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3 && !STOP.has(t))
      .map((t) => t.replace(/(ies)$/, 'y').replace(/(?<!s)s$/, '')),
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/s$/, '');

function shared(a: string[], b: string[]): string[] {
  const nb = new Set(b.map(norm));
  return a.filter((x) => nb.has(norm(x)));
}

/** Shared items over the shorter list (`strict`: over the longer one, for common items like "Name"). */
function overlapShare(a: string[], b: string[], strict = false): number {
  if (!a.length || !b.length) return 0;
  return shared(a, b).length / (strict ? Math.max(a.length, b.length) : Math.min(a.length, b.length));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const ROLE_LABEL: Record<ProcessingRole, string> = {
  controller: 'controller',
  joint_controller: 'joint controller',
  processor: 'processor',
};

/** Data subject cues in free text, in the inventory's wording. */
const SUBJECT_CUES: { name: string; re: RegExp }[] = [
  { name: 'Employees', re: /\bemployees?\b|\bstaff\b|\bworkforce\b/i },
  { name: 'Job applicants', re: /\bapplicants?\b|\bcandidates?\b/i },
  { name: 'New hires', re: /\bnew hires?\b|\bnew starters?\b/i },
  { name: 'Customers', re: /\bcustomers?\b/i },
  { name: 'Prospects', re: /\bprospects?\b|\bleads?\b/i },
  { name: 'Drivers', re: /\bdrivers?\b/i },
  { name: 'Claimants', re: /\bclaimants?\b/i },
  { name: 'Policyholders', re: /\bpolicyholders?\b/i },
  { name: 'Vehicle owners', re: /\bvehicle owners?\b/i },
  { name: 'Visitors', re: /\bvisitors?\b/i },
  { name: 'Contractors', re: /\bcontractors?\b/i },
  { name: 'Suppliers', re: /\bsuppliers?\b|\bvendors?\b/i },
  { name: 'Dealer customers', re: /\bdealer(ship)? customers?\b/i },
];

export function subjectsIn(text: string): string[] {
  return SUBJECT_CUES.filter((c) => c.re.test(text)).map((c) => c.name);
}

/** Owning entity named in the text, if any ("Solera UK runs…"). */
export function subsidiaryIn(text: string): string | null {
  const byLength = [...SUBSIDIARIES].sort((a, b) => b.name.length - a.name.length);
  for (const s of byLength) {
    const short = s.name.replace(/,? (Ltd|Inc|GmbH|Pte)\.?.*$/, '').replace(/ Operations$/, '');
    if (new RegExp(`\\b${short.replace(/\./g, '\\.')}\\b`, 'i').test(text) && short !== 'Solera Group') return s.id;
  }
  return /\bSolera Group\b/i.test(text) ? 'sub-group' : null;
}

function listText(items: string[]): string {
  return items.length <= 2 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The most likely duplicate among the records the user can view, or null.
 * `pinned` forces a match with that record (the user started from it).
 */
export function findDuplicate(draft: DraftProfile, pinned?: number): DuplicateMatch | null {
  const pool = VIEWABLE_PROFILES;
  let best: { record: RecordProfile; score: number; parts: Record<string, number> } | null = null;

  for (const rec of pool) {
    const topic = jaccard(
      topicTokens(`${draft.name} ${draft.text}`),
      topicTokens(`${rec.name} ${rec.purpose}`),
    );
    // How much of the existing record's own topic the draft covers.
    const recTopic = topicTokens(`${rec.name} ${rec.purpose}`);
    const draftTopic = topicTokens(`${draft.name} ${draft.text}`);
    const covered = recTopic.size ? [...recTopic].filter((t) => draftTopic.has(t)).length / recTopic.size : 0;
    const parts = {
      topic: Math.max(topic * 2, covered),
      systems: overlapShare(draft.systems, rec.systems),
      personalData: overlapShare(draft.personalData, rec.personalData, true),
      subjects: overlapShare(draft.dataSubjects, rec.dataSubjects, true),
      controllers: overlapShare(draft.controllers, rec.controllers ?? []),
    };
    // Vendors, systems and clients are distinctive; data subjects and personal data are common to many records.
    let score =
      0.4 * Math.min(1, parts.topic) +
      0.25 * parts.systems +
      0.1 * parts.personalData +
      0.15 * parts.subjects +
      0.1 * parts.controllers;
    if ((draft.role === 'processor') !== (rec.role === 'processor')) score *= 0.75;
    if (draft.subsidiaryId && draft.subsidiaryId === rec.subsidiaryId) score += 0.05;
    if (rec.id === pinned) score = 1;
    if (!best || score > best.score) best = { record: rec, score, parts };
  }

  if (!best || best.score < LIKELY_DUPLICATE) return null;
  const rec = best.record;
  const overlaps = overlapsFor(draft, rec);
  const reasons: string[] = [];
  if (rec.id === pinned) reasons.push('you started from this record');
  const sys = shared(draft.systems, rec.systems);
  const subjects = shared(draft.dataSubjects, rec.dataSubjects);
  const pd = shared(draft.personalData, rec.personalData);
  if (best.parts['topic'] >= 0.5 && rec.id !== pinned) reasons.push(`it describes the same activity (${lower(rec.purpose)})`);
  if (sys.length) reasons.push(`it uses ${listText(sys)}`);
  if (subjects.length) reasons.push(`it covers the same people (${listText(subjects).toLowerCase()})`);
  if (pd.length >= 2) reasons.push(`it holds ${plural(pd.length, 'of the same data categories')}`);
  const roleNote =
    (draft.role === 'processor') !== (rec.role === 'processor')
      ? ` It's a ${ROLE_LABEL[rec.role]} record, so this may be the other side of the same activity.`
      : '';
  const because = (reasons.length ? `It matches because ${listText(reasons)}.` : 'Its content is close to this draft.') + roleNote;
  const rationale =
    `${rec.name} (#${rec.id}) is a ${ROLE_LABEL[rec.role]} record owned by ${subsidiaryName(rec.subsidiaryId).replace(/\.$/, '')}. ` +
    because;

  return {
    record: rec,
    score: Math.round(Math.min(1, best.score) * 100) / 100,
    strength: best.score >= STRONG_DUPLICATE ? 'Strong match' : 'Likely match',
    because,
    rationale,
    overlaps,
    checked: pool.length,
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}`;
}

function overlapsFor(draft: DraftProfile, rec: RecordProfile): Overlap[] {
  const out: Overlap[] = [];
  const recTopic = topicTokens(`${rec.name} ${rec.purpose}`);
  const draftTopic = topicTokens(`${draft.name} ${draft.text}`);
  const common = [...recTopic].filter((t) => draftTopic.has(t));
  if (common.length) {
    out.push({ label: 'Activity', draft: draft.name || common.join(', '), existing: `${rec.name}: ${rec.purpose}` });
  }
  const pairs: [string, string[], string[]][] = [
    ['Vendors and systems', draft.systems, rec.systems],
    ['Data subjects', draft.dataSubjects, rec.dataSubjects],
    ['Personal data', draft.personalData, rec.personalData],
    ['Clients (controllers)', draft.controllers, rec.controllers ?? []],
  ];
  for (const [label, a, b] of pairs) {
    const s = shared(a, b);
    if (s.length) out.push({ label, draft: s.join(', '), existing: b.join(', ') });
  }
  if (draft.subsidiaryId && draft.subsidiaryId === rec.subsidiaryId) {
    const name = subsidiaryName(rec.subsidiaryId);
    out.push({ label: 'Owning entity', draft: name, existing: name });
  }
  return out;
}

/**
 * Fields a local variation inherits from its parent, in the skill's record
 * shape. The variation keeps its own value wherever it has one.
 */
export function inheritable(rec: RecordProfile): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (rec.role !== 'processor') {
    out['purpose'] = rec.purpose;
    if (rec.legalBasis) out['legalBasis'] = rec.legalBasis;
    if (rec.retention) out['retentionPeriod'] = rec.retention;
  } else {
    out['processingCategories'] = [rec.purpose];
  }
  if (rec.dataSubjects.length) out['dataSubjectCategories'] = rec.dataSubjects;
  if (rec.securityMeasures) out['securityMeasures'] = rec.securityMeasures;
  if (rec.internationalTransfers) out['internationalTransfers'] = rec.internationalTransfers;
  return out;
}

/** The draft as the duplicate check reads it. */
export function draftProfile(input: {
  name: string;
  text: string;
  role: ProcessingRole;
  subsidiaryId: string | null;
  values: Record<string, unknown>;
  relationships: { type: string; name: string; status?: string }[];
}): DraftProfile {
  const kept = input.relationships.filter((r) => r.status !== 'rejected');
  const subjects = input.values['dataSubjectCategories'];
  const controllers = (input.values['controllers'] as { name: string }[] | undefined) ?? [];
  return {
    name: input.name,
    text: input.text,
    role: input.role,
    subsidiaryId: input.subsidiaryId ?? subsidiaryIn(input.text),
    dataSubjects: [
      ...new Set([...subjectsIn(input.text), ...subjectsIn(Array.isArray(subjects) ? subjects.join(', ') : String(subjects ?? ''))]),
    ],
    personalData: kept.filter((r) => r.type === 'personalData').map((r) => r.name),
    systems: kept.filter((r) => r.type !== 'personalData').map((r) => r.name),
    controllers: controllers.map((c) => c.name),
  };
}
