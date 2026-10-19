import inventory from './inventory.example.json';
import type { DraftField, FieldMeta, Relationship } from './types';

// Rule-based stand-in for the authoring model. It follows the skill's
// extraction rules (references/extraction-rules.md): evidence is always a
// verbatim sentence or phrase from the source, confidences use the skill's
// calibration table, and a field with no evidence is left out, never guessed.
// Replace with a call to the model (loading SKILL.md) when one is wired in.

interface Source {
  text: string;
  sentences: string[];
}

function parse(text: string): Source {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return { text, sentences }
}

function labelled(src: Source, labels: string[]): string | undefined {
  const re = new RegExp(`^(?:${labels.join('|')})\\s*:\\s*(.+)$`, 'i')
  for (const s of src.sentences) {
    const m = s.match(re)
    if (m) return m[1].trim().replace(/[.;]+$/, '')
  }
  return undefined
}

function sentenceWith(src: Source, re: RegExp): string | undefined {
  return src.sentences.find((s) => re.test(s))
}

function meta(confidence: number, evidence: string, rationale: string): FieldMeta {
  return { provenance: 'ai', confidence, evidence, rationale }
}

const LEGAL_BASES: [RegExp, string][] = [
  [/\bconsent/i, 'Consent'],
  [/\bcontract\b|terms of service|agreement with (?:the )?customer/i, 'Contract'],
  [/legal obligation|required by law|statutory|regulat(?:ory|ion) requir/i, 'Legal obligation'],
  [/vital interest/i, 'Vital interests'],
  [/public (?:task|interest)/i, 'Public task'],
  [/legitimate interest|in our interest/i, 'Legitimate interests'],
]

const SUBJECTS: [RegExp, string][] = [
  [/\bemployees?\b|\bstaff\b|\bworkers?\b/i, 'Employees'],
  [/\bapplicants?\b|\bcandidates?\b/i, 'Job applicants'],
  [/\bcustomers?\b|\bclients?\b/i, 'Customers'],
  [/\busers?\b/i, 'Users'],
  [/\bvisitors?\b/i, 'Visitors'],
  [/\bcontractors?\b/i, 'Contractors'],
  [/\bdrivers?\b/i, 'Drivers'],
  [/\bpatients?\b/i, 'Patients'],
  [/\bchildren\b|\bminors?\b/i, 'Children'],
]

const SECURITY = /encrypt|\bSSO\b|single sign-on|\bMFA\b|multi-factor|access control|pseudonymi|role-based access/i
const TRANSFER = /outside (?:the )?(?:EU|EEA|UK)|\bSCCs?\b|standard contractual clauses|United States|\bUS\b|\bU\.S\.|India|transferred to/i
const RETENTION = /retain|retention|\bkept\b|\bkeep\b|\bdelete|\bdeleted|\bstored for/i
const PURPOSE = /\bin order to\b|\bso that\b|\bpurpose\b|\bused to\b|\bto help\b|\bwe use\b/i

export function extractDraft(description: string): { fields: DraftField[]; relationships: Relationship[] } {
  const src = parse(description)
  const fields: DraftField[] = []
  const add = (key: string, label: string, value: string, m: FieldMeta) => fields.push({ key, label, value, meta: m })

  // Purpose
  const purposeLabel = labelled(src, ['purpose'])
  if (purposeLabel) add('purpose', 'Purpose', purposeLabel, meta(0.92, purposeLabel, 'Stated under a "Purpose" label.'))
  else {
    const s = sentenceWith(src, PURPOSE)
    if (s) add('purpose', 'Purpose', s, meta(0.74, s, 'Inferred from a sentence describing why the data is used.'))
  }

  // Legal basis: a basis named next to "legal basis" wins over one mentioned elsewhere.
  const basisSentence = sentenceWith(src, /legal basis|lawful basis/i)
  const explicitBasis = basisSentence && LEGAL_BASES.find(([re]) => re.test(basisSentence))
  if (basisSentence && explicitBasis) {
    add('legalBasis', 'Legal basis', explicitBasis[1], meta(0.9, basisSentence, 'Named alongside "legal basis".'))
  } else {
    for (const [re, basis] of LEGAL_BASES) {
      const s = sentenceWith(src, re)
      if (s) {
        add('legalBasis', 'Legal basis', basis, meta(0.7, s, `Mentioned without a "legal basis" label, so ${basis.toLowerCase()} is a likely reading.`))
        break
      }
    }
  }

  // Data subjects
  const subjectsLabel = labelled(src, ['data subjects'])
  if (subjectsLabel) add('dataSubjectCategories', 'Data subjects', subjectsLabel, meta(0.88, subjectsLabel, 'Stated under a "Data subjects" label.'))
  else {
    const found = SUBJECTS.filter(([re]) => re.test(src.text)).map(([, label]) => label)
    const s = found.length ? sentenceWith(src, SUBJECTS.find(([, l]) => l === found[0])![0]) : undefined
    if (s) add('dataSubjectCategories', 'Data subjects', found.join(', '), meta(0.68, s, 'Inferred from the people the description mentions.'))
  }

  // Retention
  const retentionLabel = labelled(src, ['retention', 'retention period'])
  if (retentionLabel) add('retentionPeriod', 'Retention period', retentionLabel, meta(0.89, retentionLabel, 'Stated under a "Retention" label.'))
  else {
    const s = sentenceWith(src, RETENTION)
    const duration = s?.match(/\b\d+\s+(?:days?|weeks?|months?|years?)\b/i)?.[0]
    if (s) add('retentionPeriod', 'Retention period', duration ?? s, meta(0.65, s, 'Inferred from a sentence about keeping or deleting the data.'))
  }

  // International transfers
  const transferLabel = labelled(src, ['international transfers', 'processing location'])
  if (transferLabel) add('internationalTransfers', 'International transfers', transferLabel, meta(0.86, transferLabel, 'Stated under a transfers / location label.'))
  else {
    const s = sentenceWith(src, TRANSFER)
    if (s) add('internationalTransfers', 'International transfers', s, meta(0.71, s, 'A sentence names a location or transfer mechanism outside the EU.'))
  }

  // Security measures
  const sec = sentenceWith(src, SECURITY)
  if (sec) add('securityMeasures', 'Security measures', sec, meta(0.78, sec, 'Named security controls.'))

  // Business process owner
  const ownerLabel = labelled(src, ['owner', 'process owner', 'business owner'])
  const ownerMatch = src.text.match(/(?:owned by|owner is|managed by)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/)
  if (ownerLabel) add('businessProcessOwner', 'Business process owner', ownerLabel, meta(0.87, ownerLabel, 'Stated under an "Owner" label.'))
  else if (ownerMatch) add('businessProcessOwner', 'Business process owner', ownerMatch[1], meta(0.82, ownerMatch[0], 'A named person is described as owning the process.'))

  // Relationships, matched against the tenant inventory
  const relationships: Relationship[] = []
  const lower = src.text.toLowerCase()
  const evidenceFor = (name: string) => sentenceWith(src, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) ?? name
  for (const v of inventory.vendors) {
    if (lower.includes(v.name.toLowerCase())) {
      relationships.push({ type: 'vendor', name: v.name, confidence: 0.91, evidence: evidenceFor(v.name), rationale: `Named directly. In your inventory (${v.location}).`, status: 'suggested' })
    }
  }
  for (const a of inventory.assets) {
    if (lower.includes(a.name.toLowerCase())) {
      relationships.push({ type: 'asset', name: a.name, confidence: 0.84, evidence: evidenceFor(a.name), rationale: 'Internal system named directly.', status: 'suggested' })
    }
  }
  for (const c of inventory.personalDataCategories) {
    if (lower.includes(c.name.toLowerCase())) {
      const special = c.sensitivity === 'special'
      relationships.push({
        type: 'personalData',
        name: c.name,
        confidence: special ? 0.8 : 0.87,
        evidence: evidenceFor(c.name),
        rationale: special ? 'Special-category data (Art. 9). Check the legal basis and whether a DPIA is needed.' : 'Personal-data category named directly.',
        status: 'suggested',
      })
    }
  }

  // Recipients follow from the vendors found
  const vendors = relationships.filter((r) => r.type === 'vendor')
  if (vendors.length) {
    add('recipients', 'Recipients', vendors.map((v) => v.name).join(', '), meta(0.83, vendors[0].evidence, 'Third parties named in the description receive the data.'))
  }

  return { fields, relationships }
}

// Display labels for the fields the draft fills or asks about.
export const FIELD_LABELS: Record<string, string> = {
  purpose: 'Purpose',
  legalBasis: 'Legal basis',
  dataSubjectCategories: 'Data subjects',
  retentionPeriod: 'Retention period',
  internationalTransfers: 'International transfers',
  securityMeasures: 'Security measures',
  businessProcessOwner: 'Business process owner',
  recipients: 'Recipients',
}

// Fields the draft can't fill get a follow-up question, per the skill.
export const FOLLOW_UPS: Record<string, string> = {
  purpose: 'Why does the team use this data?',
  legalBasis: 'What is the legal basis: consent, contract, legal obligation, or legitimate interests?',
  dataSubjectCategories: 'Whose data is it: employees, customers, applicants?',
  retentionPeriod: 'How long is the data kept, and what happens to it afterwards?',
  internationalTransfers: 'Is the data stored or accessed outside the EU or UK?',
  securityMeasures: 'How is the data protected: encryption, access controls, SSO?',
  businessProcessOwner: 'Who owns this process day to day?',
  recipients: 'Who receives the data: vendors, partners, other group companies?',
}

// Completeness per references/fields.md: 13 items, 10 core text fields plus at
// least one data subject category, one vendor or asset, one personal-data category.
export function completeness(fields: DraftField[], relationships: Relationship[], hasName: boolean, hasDescription: boolean, hasOrg: boolean) {
  const has = (k: string) => fields.some((f) => f.key === k && f.value.trim())
  const core = [
    hasName,
    hasDescription,
    has('purpose'),
    has('legalBasis'),
    hasOrg,
    has('businessProcessOwner'),
    has('retentionPeriod'),
    has('recipients'),
    has('internationalTransfers'),
    has('securityMeasures'),
  ]
  const extras = [
    has('dataSubjectCategories'),
    relationships.some((r) => r.type !== 'personalData' && r.status !== 'rejected'),
    relationships.some((r) => r.type === 'personalData' && r.status !== 'rejected'),
  ]
  return Math.round(([...core, ...extras].filter(Boolean).length / 13) * 100)
}

export const SAMPLE_DESCRIPTION = `Our talent team screens job applicants for open roles at Solera Group. Applicants upload their CV through the Candidate ATS, run by Greenhouse, and TalentSprint AI scores each CV so that recruiters can shortlist faster. We rely on legitimate interests as the legal basis. Data subjects: job applicants. Applicants can share disability accommodation needs, which we treat as health data. Interviews happen over Zoom and the recordings are stored in the Recorded Interview Workspace. Retention: 12 months after the role is filled, then deleted. Data is processed in the United States under standard contractual clauses. Access uses SSO and all data is encrypted at rest. The process is owned by Jane Smith.`
