import type { CheckRecord, CheckWarning, RopaCheckReport } from './ropa-check';
import type { Subsidiary } from './ropa-check-types';
import { INVENTORY, type DraftRole } from './skill-draft';

// Plans the assistant's follow-up questions from the ropa-authoring checker's
// report, in the order SKILL.md step 5 ("Close the gaps") gives:
//
//   1. missing required items (the report's gaps)
//   2. low-confidence values (< 0.6) to confirm
//   3. validation warnings, critical first: legal basis, retention, transfer
//      destination and safeguard, Art. 22, the Art. 9 condition, then the
//      controller / DPO contact (Art. 30(1)(a)) and, for joint controllers,
//      their contacts and the Art. 26 arrangement; for processors, controller
//      contacts, per-controller categories, the DPA and sub-processor authorisation
//   4. items not in the inventory (extraction-rules.md: say so and ask)
//   5. "Needs review" values (0.60–0.84) to confirm, which the user asked for
//      on top of the skill's list
//
// The page owns state; this file only reads it and describes the next question.

/** How the page applies the user's answer. */
export type AnswerMode =
  | 'set' // the answer becomes the field's value
  | 'list' // the answer is split into a list
  | 'parties' // the answer is parsed into named parties with contacts
  | 'append' // the answer is added to the field's value (transfer destination / safeguard)
  | 'legalBasis' // the answer is normalised to one of the six Art. 6 bases
  | 'contact' // the answer is the contact for the named party in `party`
  | 'entity' // the answer picks a legal entity (subsidiaryId)
  | 'relationship' // keep or remove an item that isn't in the inventory
  | 'confirm' // confirm a value, or type a correction
  | 'note' // recorded beside the draft; the check can't clear it (Art. 9, Art. 22, Art. 28)
  | 'describe'; // free text, re-extracted to find vendors, assets or data categories

export type QuestionKind = 'gap' | 'low' | 'warning' | 'unresolved' | 'review';

export interface Question {
  id: string;
  kind: QuestionKind;
  mode: AnswerMode;
  /** The record field the answer fills (or the note key). */
  field: string;
  label: string;
  prompt: string;
  chips: string[];
  /** For 'contact': the party. For 'relationship': `${type}:${name}`. */
  party?: string;
  /** The check this question answers, shown in the draft panel. */
  warning?: CheckWarning;
}

export const LEGAL_BASES = ['Consent', 'Contract', 'Legal obligation', 'Vital interests', 'Public task', 'Legitimate interests'];
export const CONFIRM_CHIP = "Yes, that's right";
export const CONFIRM_ALL_CHIP = 'Confirm the rest';
export const SKIP_CHIP = 'Skip this question';
export const KEEP_CHIP = 'Keep it';
export const REMOVE_CHIP = 'Remove it';

const LIST_FIELDS = new Set(['dataSubjectCategories', 'processingCategories']);
const PARTY_FIELDS = new Set(['controllers', 'jointControllers']);

const GAP_PROMPTS: Record<string, string> = {
  name: 'What should the record be called?',
  description: 'Describe the activity in a sentence or two.',
  purpose: 'Why does the team use this data? What is the purpose of the processing?',
  legalBasis: 'Which Art. 6 legal basis applies?',
  dataSubjectCategories: 'Whose data is it: employees, customers, applicants, someone else?',
  retentionPeriod: 'How long is the data kept, and what happens to it afterwards? A concrete period or trigger works best.',
  recipients: 'Who receives the data: vendors, partners, other group companies?',
  internationalTransfers:
    'Is the data stored or accessed outside the EU or UK? If so, where, and under which safeguard? If not, say "None".',
  securityMeasures: 'How is the data protected: encryption, access controls, SSO, MFA?',
  managingOrganization: 'Which team or department manages this activity?',
  businessProcessOwner: 'Who owns this process day to day?',
  processorDetails:
    "What are the processor's details: the company acting as processor, its contact, and any DPO or representative?",
  controllers: 'Which controllers is this done for? Give each name and a contact, separated by semicolons. For many clients, point to the register that lists them.',
  processingCategories: 'What processing is carried out for the controllers, for example hosting, payroll calculation, customer support?',
  jointControllers: 'Who are the other joint controllers? Give each name and a contact, separated by semicolons.',
};

const FIELD_FOR_GAP: Record<string, { field: string; mode: AnswerMode; prompt: string }> = {
  'At least one vendor or application/asset': {
    field: 'systems',
    mode: 'describe',
    prompt: 'Which systems, applications or vendors are involved?',
  },
  'At least one personal data category': {
    field: 'personalData',
    mode: 'describe',
    prompt: 'What kinds of personal data are involved, for example names, email addresses, bank details, health data?',
  },
  'Joint controllers (Art. 26 / 30(1)(a))': {
    field: 'jointControllers',
    mode: 'parties',
    prompt: GAP_PROMPTS['jointControllers'],
  },
};

function modeFor(field: string): AnswerMode {
  if (field === 'legalBasis') return 'legalBasis';
  if (LIST_FIELDS.has(field)) return 'list';
  if (PARTY_FIELDS.has(field)) return 'parties';
  return 'set';
}

function keyForLabel(report: RopaCheckReport, label: string): string | undefined {
  return report.fields.find((f) => f.label === label)?.key;
}

function display(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'string' ? v : (v as { name: string }).name)).join(', ');
  }
  return typeof value === 'string' ? value : '';
}

function warningId(w: CheckWarning): string {
  return `warn:${w.field}:${w.issue.slice(0, 48)}`;
}

/** Turn one validation warning into a question, or null if there's nothing useful to ask. */
function questionForWarning(w: CheckWarning, record: CheckRecord): Question | null {
  const base = { id: warningId(w), kind: 'warning' as const, warning: w };
  const quoted = w.issue.match(/"([^"]+)"/)?.[1];

  switch (w.field) {
    case 'legalBasis':
      if (/not a recognised/.test(w.issue)) {
        return { ...base, mode: 'legalBasis', field: 'legalBasis', label: 'Legal basis', prompt: `${w.issue} Which one applies?`, chips: LEGAL_BASES };
      }
      // Art. 9: the check fires whenever special-category data is present, so record the condition beside it.
      return {
        ...base,
        mode: 'note',
        field: 'art9Condition',
        label: 'Art. 9(2) condition',
        prompt: `${w.issue} Which Art. 9(2) condition applies?`,
        chips: ['Explicit consent (Art. 9(2)(a))', 'Employment and social security law (Art. 9(2)(b))', 'Substantial public interest (Art. 9(2)(g))'],
      };
    case 'retentionPeriod':
      return { ...base, mode: 'set', field: 'retentionPeriod', label: 'Retention period', prompt: `${w.issue} How long is it kept, or until what event?`, chips: [] };
    case 'internationalTransfers':
      if (/safeguard/.test(w.issue)) {
        return {
          ...base,
          mode: 'append',
          field: 'internationalTransfers',
          label: 'Transfer safeguard',
          prompt: `${w.issue} Which safeguard covers the transfer?`,
          chips: ['Standard contractual clauses (SCCs)', 'Adequacy decision', 'Binding corporate rules (BCRs)', 'EU-US Data Privacy Framework'],
        };
      }
      return { ...base, mode: 'append', field: 'internationalTransfers', label: 'Transfer destination', prompt: `${w.issue} Which country does the data go to?`, chips: [] };
    case 'purpose':
      return {
        ...base,
        mode: 'note',
        field: 'automatedDecisionsNote',
        label: 'Automated decisions (Art. 22)',
        prompt: `${w.issue}`,
        chips: ['No, a person makes every decision', 'Yes, it makes significant decisions automatically'],
      };
    case 'controllerDetails':
      return {
        ...base,
        mode: 'set',
        field: 'controllerDetails',
        label: 'Controller details',
        prompt: `${w.issue} Who is the controller, and what are the controller's and DPO's contact details?`,
        chips: [],
      };
    case 'jointControllers':
    case 'controllers':
      if (quoted) {
        return {
          ...base,
          mode: 'contact',
          field: w.field,
          party: quoted,
          label: `${quoted} contact`,
          prompt: `${w.issue} What's the best contact for ${quoted}?`,
          chips: [],
        };
      }
      return null;
    case 'jointArrangement':
      return {
        ...base,
        mode: 'set',
        field: 'jointArrangement',
        label: 'Art. 26 arrangement',
        prompt: `${w.issue} Which agreement sets out each party's responsibilities?`,
        chips: [],
      };
    case 'processingCategories':
      if (/several controllers/i.test(w.issue)) {
        return { ...base, mode: 'list', field: 'processingCategories', label: 'Categories of processing', prompt: w.issue, chips: [] };
      }
      return {
        ...base,
        mode: 'note',
        field: /special-category/i.test(w.issue) ? 'specialInstructionsNote' : 'automatedDecisionsNote',
        label: /special-category/i.test(w.issue) ? 'Controller instructions for Art. 9 data' : 'Decisions about individuals (Art. 22)',
        prompt: w.issue,
        chips: /special-category/i.test(w.issue)
          ? ["Yes, the controller's instructions cover it", 'Not confirmed yet']
          : ["No, it doesn't support decisions about people", 'Yes, it supports decisions about people'],
      };
    case 'dpaReference':
      return { ...base, mode: 'set', field: 'dpaReference', label: 'DPA reference', prompt: `${w.issue} Which agreement governs it?`, chips: [] };
    case 'subProcessors':
      return {
        ...base,
        mode: 'note',
        field: 'subProcessorAuthorisation',
        label: 'Sub-processor authorisation',
        prompt: w.issue,
        chips: ['Yes, authorised in writing', 'Not confirmed yet'],
      };
    case 'subsidiaryId': {
      if (!/regional grouping/.test(w.issue)) return null;
      const subs = (INVENTORY.subsidiaries ?? []) as Subsidiary[];
      const children = subs.filter((s) => s.parentId === record.subsidiaryId && s.kind === 'legal_entity');
      return { ...base, mode: 'entity', field: 'subsidiaryId', label: 'Owning legal entity', prompt: w.issue, chips: children.map((c) => c.name) };
    }
    case 'jurisdiction': {
      const where = w.issue.match(/is in (.+)\.$/)?.[1];
      return {
        ...base,
        mode: 'set',
        field: 'jurisdiction',
        label: 'Jurisdiction',
        prompt: `${w.issue} Which jurisdiction should the record name?`,
        chips: where ? [where] : [],
      };
    }
    default:
      // e.g. a processor's own legal basis / purpose / retention. The page never sets those.
      return null;
  }
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

export interface PlanState {
  role: DraftRole;
  record: CheckRecord;
  report: RopaCheckReport;
  /** Questions answered, skipped or confirmed; never asked again. */
  handled: ReadonlySet<string>;
}

/** Every question still worth asking, in the skill's priority order. */
export function planQuestions({ record, report, handled }: PlanState): Question[] {
  const out: Question[] = [];
  const push = (q: Question | null) => q && !handled.has(q.id) && !out.some((o) => o.id === q.id) && out.push(q);
  const values = record as unknown as Record<string, unknown>;

  // A possible duplicate comes first (SKILL.md step 4).
  if (report.possibleDuplicate) {
    const d = report.possibleDuplicate;
    push({
      id: `duplicate:${d.id ?? d.name}`,
      kind: 'warning',
      mode: 'note',
      field: 'duplicateDecision',
      label: 'Possible duplicate',
      prompt: `This looks similar to an existing record, "${d.name}" (similarity ${d.score}). Should this be a new record, enrich the existing one, or be a local variation of it?`,
      chips: ['Create a new record', 'Enrich the existing record', 'Create a local variation'],
    });
  }

  // 1. Missing required items
  for (const gap of report.gaps) {
    const special = FIELD_FOR_GAP[gap];
    if (special) {
      push({ id: `gap:${special.field}`, kind: 'gap', mode: special.mode, field: special.field, label: gap, prompt: special.prompt, chips: [] });
      continue;
    }
    const key = keyForLabel(report, gap);
    if (!key) continue; // the owning entity is set in the record-details chain
    push({
      id: `gap:${key}`,
      kind: 'gap',
      mode: modeFor(key),
      field: key,
      label: gap,
      prompt: GAP_PROMPTS[key] ?? `What should the ${gap.toLowerCase()} be?`,
      chips: key === 'legalBasis' ? LEGAL_BASES : key === 'internationalTransfers' ? ['None'] : [],
    });
  }

  // 2. Low-confidence values
  for (const label of report.lowConfidence) {
    const key = keyForLabel(report, label);
    if (!key) continue;
    push({
      id: `low:${key}`,
      kind: 'low',
      mode: 'confirm',
      field: key,
      label,
      prompt: `I'm not confident about the ${label.toLowerCase()}. I have "${display(values[key])}". Is that right? If not, type the correct value.`,
      chips: [CONFIRM_CHIP],
    });
  }

  // 3. Validation warnings, most severe first (stable within a severity)
  const warnings = [...report.validation].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  for (const w of warnings) push(questionForWarning(w, record));

  // 4. Items the inventory doesn't know
  for (const item of report.unresolvedRelationships) {
    const [type, ...rest] = item.split(': ');
    const name = rest.join(': ');
    const kind = type === 'personalData' ? 'data category' : type;
    push({
      id: `unresolved:${item}`,
      kind: 'unresolved',
      mode: 'relationship',
      field: 'relationships',
      party: `${type}:${name}`,
      label: name,
      prompt: `${name} isn't in your inventory as a ${kind}. Keep it on the record (it would need adding to the inventory), or remove it?`,
      chips: [KEEP_CHIP, REMOVE_CHIP],
    });
  }

  // 5. "Needs review" values
  for (const label of report.needsReview) {
    const key = keyForLabel(report, label);
    if (!key) continue;
    push({
      id: `review:${key}`,
      kind: 'review',
      mode: 'confirm',
      field: key,
      label,
      prompt: `Please confirm the ${label.toLowerCase()}: "${display(values[key])}". Is that right? If not, type the correct value.`,
      chips: [CONFIRM_CHIP, CONFIRM_ALL_CHIP],
    });
  }

  return out;
}

/** Normalise free text to one of the six Art. 6 bases, or return it unchanged for the check to flag. */
export function normaliseLegalBasis(answer: string): string {
  const a = answer.toLowerCase();
  if (/legitimate interest/.test(a)) return 'Legitimate interests';
  if (/\bconsent/.test(a)) return 'Consent';
  if (/legal obligation|required by law|statutory/.test(a)) return 'Legal obligation';
  if (/vital interest/.test(a)) return 'Vital interests';
  if (/public (task|interest)/.test(a)) return 'Public task';
  if (/\bcontract/.test(a)) return 'Contract';
  return answer.trim();
}
