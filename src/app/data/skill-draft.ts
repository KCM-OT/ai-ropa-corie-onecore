import inventoryJson from '../../../.claude/skills/ropa-authoring/assets/inventory.example.json';
import postureJson from '../../../.claude/skills/ropa-authoring/assets/posture.default.json';
import { extractDraft, SAMPLE_DESCRIPTION } from './extract';
import type { CheckInventory, CheckRecord, CheckRelationship } from './ropa-check';
import type { PostureConfig } from './ropa-check-types';
import type { FieldMeta, ProcessingRole, Relationship } from './types';

// Turns a description into a draft record in the ropa-authoring skill's JSON
// shape (references/fields.md and processor-mode.md), ready for ropa-check.ts.
//
// It builds on the rule-based extractor in extract.ts and adds what the skill
// expects but that extractor doesn't cover: the managing organization, the
// role cues, processor and joint-controller fields, the skill's standard
// personal-data categories, and tools named in the text that aren't in the
// inventory (which the skill reports as unresolved).
//
// Confidence values follow references/extraction-rules.md. No model is
// connected; a real build would run the skill's extraction prompt instead.

export const INVENTORY = inventoryJson as unknown as CheckInventory;
export const POSTURE = postureJson as unknown as PostureConfig;

export type DraftRole = ProcessingRole;

export interface Party {
  name: string;
  contact?: string;
}

/** What extraction found, before the role decides which fields the record carries. */
export interface Extraction {
  values: Record<string, string | string[] | Party[]>;
  meta: Record<string, FieldMeta>;
  relationships: Relationship[];
  /** The role the text points to, per the cue table in processor-mode.md. */
  roleCue?: { role: DraftRole; evidence: string };
}

// ---- helpers ----

function sentences(text: string): string[] {
  // Don't break after "Art." or "No." ("under Art. 28", "No. 3").
  return text
    .split(/(?<!\b(?:Art|No|e\.g|i\.e)\.)(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function labelled(text: string, labels: string[]): { value: string; evidence: string } | undefined {
  const re = new RegExp(`^(?:${labels.join('|')})\\s*:\\s*(.+)$`, 'i');
  for (const s of sentences(text)) {
    const m = s.match(re);
    if (m) return { value: m[1].trim().replace(/[.;]+$/, ''), evidence: s };
  }
  return undefined;
}

function sentenceWith(text: string, re: RegExp): string | undefined {
  return sentences(text).find((s) => re.test(s));
}

function meta(confidence: number, evidence: string, rationale: string): FieldMeta {
  return { provenance: 'ai', confidence, evidence, rationale };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "A Ltd (a@x.com); B GmbH, b@y.com" → parties. */
export function parseParties(text: string): Party[] {
  return text
    .split(/;|\band\b|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const paren = p.match(/^(.+?)\s*\((.+)\)$/);
      if (paren) return { name: paren[1].trim(), contact: paren[2].trim() };
      const comma = p.match(/^(.+?),\s*(\S+@\S+|\+?[\d ()-]{7,})$/);
      if (comma) return { name: comma[1].trim(), contact: comma[2].trim() };
      return { name: p.replace(/[.]+$/, '') };
    });
}

export function splitList(text: string): string[] {
  return text
    .split(/,|;|\band\b/)
    .map((s) => s.trim().replace(/[.]+$/, ''))
    .filter(Boolean);
}

// ---- cue tables (extraction-rules.md, processor-mode.md) ----

const PERSONAL_DATA_CUES: { name: string; special?: boolean; re: RegExp }[] = [
  { name: 'Name', re: /full name|employee name|customer'?s name|\bnames?\b/i },
  { name: 'Email address', re: /e-?mail address|work email|\bemails?\b/i },
  { name: 'Phone number', re: /phone number/i },
  { name: 'Postal address', re: /postal address|mailing address|home address/i },
  { name: 'IP address', re: /\bip address/i },
  { name: 'Location data', re: /location data|approximate location|geolocation/i },
  { name: 'Device identifiers', re: /device identifier|push token/i },
  { name: 'Payment card data', re: /payment card|card details/i },
  { name: 'Government ID number', re: /government id|passport number|national id/i },
  { name: 'Employment history', re: /employee id|employment record|work history|resume|\bcvs?\b/i },
  { name: 'Video interview recordings', re: /interview recordings|recorded interviews|recordings/i },
  { name: 'Financial account data', re: /financial account|bank account|bank details/i },
  { name: 'Health data', special: true, re: /health data|mental health|counsel+ing|medical|health assessment|disability/i },
  { name: 'Biometric data', special: true, re: /biometric/i },
  { name: 'Racial or ethnic origin', special: true, re: /racial|ethnic origin|ethnicity/i },
];

const ROLE_CUES: { role: DraftRole; re: RegExp }[] = [
  {
    role: 'processor',
    re: /on behalf of (?:our |its )?(?:clients|customers)|for our (?:clients|customers)|on (?:their|the client'?s|our clients'?) instructions|as instructed by|the client is the controller|we are (?:the|a) processor|\bprocessor\b.*\bon behalf\b/i,
  },
  {
    role: 'joint_controller',
    re: /jointly (?:decide|determine)|joint controller|art(?:icle)?\.?\s*26|together with [A-Z][\w&. ]+ we decide|shared (?:system|platform|hris|crm) (?:run|used) with/i,
  },
  {
    role: 'controller',
    re: /\bwe decide\b|our employees|our (?:own )?(?:marketing|hr|finance|security)|we use (?:the|this) data to|our (?:talent|marketing|sales|hr|finance) team/i,
  },
];

// Words that look like tool names but aren't (countries, acronyms, safeguards).
const NOT_A_TOOL =
  /^(?:the|a|an|our|their|this|that|it|we|they|united states|united kingdom|uk|us|usa|eu|eea|europe|india|canada|germany|singapore|sso|mfa|sccs?|gdpr|dpa|art|article|monday|tuesday|wednesday|thursday|friday)$/i;
const TOOL_PHRASE =
  /\b(?:use|uses|using|via|through|run by|hosted (?:on|by|in)|powered by|stored in|sent with|send with|managed in)\s+((?:[A-Z][\w.&+-]*)(?:\s+[A-Z][\w.&+-]*){0,3})/g;

// ---- extraction ----

export function extractForSkill(text: string): Extraction {
  const base = extractDraft(text);
  const values: Extraction['values'] = {};
  const metaOut: Extraction['meta'] = {};
  for (const f of base.fields) {
    values[f.key] = f.key === 'dataSubjectCategories' ? splitList(f.value) : f.value;
    if (f.meta) metaOut[f.key] = f.meta;
  }
  const relationships: Relationship[] = [...base.relationships];
  const add = (key: string, value: Extraction['values'][string], m: FieldMeta) => {
    values[key] = value;
    metaOut[key] = m;
  };

  // Owner labels written as "Name, Team" carry the managing organization too.
  const owner = values['businessProcessOwner'];
  if (typeof owner === 'string' && owner.includes(',')) {
    const [person, team] = owner.split(/,\s*/, 2);
    const evidence = metaOut['businessProcessOwner']?.evidence ?? owner;
    add('businessProcessOwner', person, meta(0.87, evidence, 'Named owner under an "Owner" label.'));
    add('managingOrganization', team, meta(0.87, evidence, 'Team named alongside the owner.'));
  }

  // Managing organization
  if (!values['managingOrganization']) {
    const label = labelled(text, ['managing organi[sz]ation', 'department', 'team', 'owning team', 'business unit']);
    if (label) add('managingOrganization', label.value, meta(0.87, label.evidence, 'Stated under a team / department label.'));
    else {
      const s = sentenceWith(text, /\b(?:our|the) ([a-z][a-z&-]*(?: [a-z&-]+)?) (?:team|department)\b/i);
      const m = s?.match(/\b(?:our|the) ([a-z][a-z&-]*(?: [a-z&-]+)?) (team|department)\b/i);
      if (s && m) {
        add(
          'managingOrganization',
          `${capitalise(m[1])} ${m[2].toLowerCase()}`,
          meta(0.65, s, 'Inferred from the team the description says does the work.'),
        );
      }
    }
  }

  // "Stays in the EU" is a transfer answer too: None.
  if (!values['internationalTransfers']) {
    const s = sentenceWith(text, /(?:stays?|kept|stored|remains?) (?:only )?(?:in|within) the (?:EU|EEA|UK)|no (?:international )?transfers|not transferred outside/i);
    if (s) add('internationalTransfers', 'None', meta(0.8, s, 'The text says the data stays within the EU / UK.'));
  }

  // Processor (Art. 30(2)) fields
  const processorLabel = labelled(text, ['processor', 'supplier', 'service provider']);
  if (processorLabel) add('processorDetails', processorLabel.value, meta(0.9, processorLabel.evidence, 'Stated under a processor / supplier label.'));
  const controllerLabel = labelled(text, ['controllers?', 'customers?', 'clients?']);
  if (controllerLabel) {
    add('controllers', parseParties(controllerLabel.value), meta(0.88, controllerLabel.evidence, 'Stated under a controller / client label.'));
  }
  const categoriesLabel = labelled(text, ['services', 'scope of processing', 'nature of processing', 'processing categories']);
  if (categoriesLabel) {
    add('processingCategories', splitList(categoriesLabel.value), meta(0.86, categoriesLabel.evidence, 'Stated under a services / scope label.'));
  }
  const dpa = sentenceWith(text, /\bDPA\b|data processing agreement|art(?:icle)?\.?\s*28/i);
  if (dpa) add('dpaReference', dpa.replace(/[.]+$/, ''), meta(0.8, dpa, 'A data processing agreement is referenced.'));

  // Joint-controller (Art. 26) fields
  const jointWith = text.match(/(?:jointly|together) with ([A-Z][\w&.' -]+?)(?=[,.;]| under | to | we | who )/);
  if (jointWith) {
    const evidence = sentenceWith(text, new RegExp(jointWith[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) ?? jointWith[0];
    add('jointControllers', [{ name: jointWith[1].trim() }], meta(0.8, evidence, 'Named as deciding the purposes jointly.'));
  }
  const arrangement = sentenceWith(text, /art(?:icle)?\.?\s*26|joint[- ]controller (?:arrangement|agreement)|data sharing agreement/i);
  if (arrangement) add('jointArrangement', arrangement.replace(/[.]+$/, ''), meta(0.8, arrangement, 'An Art. 26 arrangement is referenced.'));

  // Standard personal-data categories not already matched from the inventory
  const has = (type: Relationship['type'], name: string) =>
    relationships.some((r) => r.type === type && r.name.toLowerCase() === name.toLowerCase());
  for (const cue of PERSONAL_DATA_CUES) {
    const s = sentenceWith(text, cue.re);
    if (s && !has('personalData', cue.name)) {
      relationships.push({
        type: 'personalData',
        name: cue.name,
        confidence: cue.special ? 0.8 : 0.87,
        evidence: s,
        rationale: cue.special
          ? 'Special-category data (Art. 9). Check the legal basis and whether a DPIA is needed.'
          : 'Personal-data category named in the text.',
        status: 'suggested',
      });
    }
  }

  // Tools the text names that aren't in the inventory: unresolved, per the skill.
  for (const m of text.matchAll(TOOL_PHRASE)) {
    const name = m[1].trim().replace(/[.,]+$/, '');
    if (NOT_A_TOOL.test(name) || name.length < 3) continue;
    const known = relationships.some((r) => r.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(r.name.toLowerCase()));
    if (known) continue;
    relationships.push({
      type: 'vendor',
      name,
      confidence: 0.6,
      evidence: sentenceWith(text, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) ?? m[0],
      rationale: "Named as a tool the team uses, but it isn't in your inventory.",
      status: 'suggested',
    });
  }

  // Role cue
  let roleCue: Extraction['roleCue'];
  for (const cue of ROLE_CUES) {
    const s = sentenceWith(text, cue.re);
    if (s) {
      roleCue = { role: cue.role, evidence: s };
      break;
    }
  }

  return { values, meta: metaOut, relationships, roleCue };
}

// ---- record ----

const CONTROLLER_KEYS = [
  'purpose', 'legalBasis', 'dataSubjectCategories', 'retentionPeriod', 'recipients',
  'internationalTransfers', 'securityMeasures', 'managingOrganization', 'businessProcessOwner',
  'jurisdiction', 'controllerDetails',
];
const JOINT_KEYS = [...CONTROLLER_KEYS, 'jointControllers', 'jointArrangement'];
// Processors don't record a legal basis, purpose or retention as their own (processor-mode.md).
const PROCESSOR_KEYS = [
  'processorDetails', 'controllers', 'processingCategories', 'internationalTransfers',
  'securityMeasures', 'dataSubjectCategories', 'dpaReference', 'managingOrganization',
  'businessProcessOwner', 'jurisdiction',
];

export function recordKeys(role: DraftRole): string[] {
  return role === 'processor' ? PROCESSOR_KEYS : role === 'joint_controller' ? JOINT_KEYS : CONTROLLER_KEYS;
}

export function roleDetail(role: DraftRole, values: Extraction['values']): string {
  const names = (key: string) => ((values[key] as Party[] | undefined) ?? []).map((p) => p.name).join(', ');
  if (role === 'processor') return `Processor on behalf of ${names('controllers') || 'clients'}`;
  // Deliberately no "Art. 26" here: the checker reads roleDetail when it looks for a referenced arrangement.
  if (role === 'joint_controller') return `Joint controller${names('jointControllers') ? ` with ${names('jointControllers')}` : ''}`;
  return 'Controller: decides why and how the data is used';
}

export interface RecordInput {
  role: DraftRole;
  subsidiaryId: string | null;
  name: string;
  values: Extraction['values'];
  meta: Extraction['meta'];
  relationships: Relationship[];
  description: string;
}

/** Assemble the record the checker reads, carrying only the role's fields. */
export function toCheckRecord(input: RecordInput): CheckRecord {
  const record: Record<string, unknown> = {
    role: input.role,
    subsidiaryId: input.subsidiaryId ?? undefined,
    roleDetail: roleDetail(input.role, input.values),
    name: input.name,
    description: input.description,
    status: 'draft',
  };
  const fieldMeta: Record<string, { confidence?: number }> = {};
  for (const key of recordKeys(input.role)) {
    const value = input.values[key];
    if (value === undefined) continue;
    record[key] = value;
    if (input.meta[key]) fieldMeta[key] = { confidence: input.meta[key].confidence };
  }
  record['fieldMeta'] = fieldMeta;
  record['relationships'] = input.relationships
    .filter((r) => r.status !== 'rejected')
    .map<CheckRelationship>((r) => ({ type: r.type, name: r.name, confidence: r.confidence, status: r.status }));
  return record as CheckRecord;
}

/** One-shot draft from a description, as the parity test uses it. */
export function draftRecord(text: string, opts: { role: DraftRole; subsidiaryId: string | null; name: string }): CheckRecord {
  const x = extractForSkill(text);
  return toCheckRecord({ ...opts, ...x, description: text });
}

// ---- samples ----

export const PROCESSOR_SAMPLE = `Solera UK runs payroll on behalf of our clients, following their instructions. Clients: Northwind GmbH (legal@northwind.example); Contoso Ltd. Services: payroll calculation, payslip distribution and year-end tax filings. Client employees' names, bank details and salary data are uploaded to Workday. Our support team in India can access the data under standard contractual clauses. Access uses SSO and MFA, and all data is encrypted at rest and in transit. Each client signs our DPA v2.1 under Art. 28.`;

export const JOINT_SAMPLE = `Solera UK and Solera Group jointly decide how the Group HR information system is used. We run it together with Solera Group, who sets the group-wide HR purposes with us. Employees' names, email addresses, employment records and bank details are stored in the HRIS, hosted by Workday in the EU. The legal basis is contract. Retention: 6 years after employment ends. Access uses SSO and role-based access. Owner: Priya Shah, People Operations.`;

export const SAMPLES: { label: string; text: string }[] = [
  { label: 'Candidate screening', text: SAMPLE_DESCRIPTION },
  { label: 'Client payroll', text: PROCESSOR_SAMPLE },
  { label: 'Group HR system', text: JOINT_SAMPLE },
  {
    label: 'Customer newsletter',
    text: 'Our marketing team sends newsletters to customers who sign up on our website. We use Mailchimp to send the emails and track opens.',
  },
];
