// TypeScript port of .claude/skills/ropa-authoring/scripts/ropa_check.py, copied
// unchanged (apart from this header, the types import and dropping the Solera
// app's activityToCheckRecord) from KCM-OT/AI-RoPA-Studio-solera-group
// lib/ropa-check.ts at 702f40d. The Python script is the source of truth:
//  runs both on the same records and fails on any difference.

import type {
  Asset,
  AssessmentType,
  ConditionKey,
  PersonalDataCategory,
  PostureConfig,
  ProcessingRole,
  RelationshipType,
  Subsidiary,
  Vendor,
} from './ropa-check-types'

// ---- input shape (a draft record, loosely typed like the script's JSON) ----

export interface CheckController {
  name: string
  contact?: string
  processingCategories?: string[]
}

export interface CheckRelationship {
  type: RelationshipType
  name: string
  inventoryId?: string | null
  confidence?: number
  status?: string
}

export interface CheckRecord {
  id?: string
  name?: string
  description?: string
  purpose?: string
  legalBasis?: string
  managingOrganization?: string
  businessProcessOwner?: string
  dataSubjectCategories?: string[]
  retentionPeriod?: string
  recipients?: string
  internationalTransfers?: string
  securityMeasures?: string
  jurisdiction?: string
  controllerDetails?: string
  role?: ProcessingRole | string | null
  roleDetail?: string
  subsidiaryId?: string | null
  processorDetails?: string
  controllers?: CheckController[]
  processingCategories?: string[]
  dpaReference?: string
  jointControllers?: { name: string; contact?: string }[]
  jointArrangement?: string
  status?: string
  createdAt?: string
  fieldMeta?: Record<string, { confidence?: number } | undefined>
  relationships?: CheckRelationship[]
}

export interface CheckInventory {
  vendors?: Pick<Vendor, 'id' | 'name'>[]
  assets?: Pick<Asset, 'id' | 'name'>[]
  personalDataCategories?: PersonalDataCategory[]
  subsidiaries?: Subsidiary[]
}

// ---- output shape (mirrors the script's JSON report) ----

export type CheckSeverity = 'critical' | 'warning' | 'info'
export type ConfidenceBandLabel = 'High confidence' | 'Needs review' | 'Low confidence'

export interface CheckWarning {
  field: string
  severity: CheckSeverity
  issue: string
}

export interface CheckFieldReport {
  key: string
  label: string
  filled: boolean
  confidence: number | null
  band: ConfidenceBandLabel | null
}

export interface CheckRelationshipReport {
  type: RelationshipType
  relationshipRole?: 'sub-processor' | null
  name: string
  inventoryId: string | null
  resolved: boolean
  special: boolean
  confidence: number | null
  band: ConfidenceBandLabel | null
}

export interface CheckAssessment {
  type: AssessmentType
  name: string
  triggeredBy: string[]
  note?: string
  owner?: string
}

export interface CheckOwningEntity {
  id: string
  resolved: boolean
  name?: string
  kind?: string
  jurisdiction?: string
  path?: string
}

export interface RopaCheckReport {
  role: ProcessingRole
  roleLabel: string
  roleDetail: string | null
  owningEntity: CheckOwningEntity | null
  completeness: number
  incomplete: boolean
  gaps: string[]
  lowConfidence: string[]
  needsReview: string[]
  fields: CheckFieldReport[]
  relationships: CheckRelationshipReport[]
  unresolvedRelationships: string[]
  validation: CheckWarning[]
  possibleDuplicate: { id?: string; name?: string; score: number } | null
  posture: {
    activeConditions: string[]
    requiredAssessments: CheckAssessment[]
    reviewCadence: { cadenceDays: number; label: string; rule: string; isDefault: boolean }
    requireCertification: boolean
  }
  controllers?: { name: string; hasContact: boolean; processingCategories: string[] }[]
  jointControllers?: { name: string; hasContact: boolean }[]
}

// ---- controller (Art. 30(1)) fields ----

const FIELD_LABELS: Record<string, string> = {
  name: 'Record name',
  description: 'Description',
  purpose: 'Purpose of processing',
  legalBasis: 'Legal basis (Art. 6)',
  managingOrganization: 'Managing organization',
  businessProcessOwner: 'Business process owner',
  dataSubjectCategories: 'Data subject categories',
  retentionPeriod: 'Retention period',
  recipients: 'Recipients',
  internationalTransfers: 'International transfers',
  securityMeasures: 'Security measures',
  jurisdiction: 'Jurisdiction',
}

const FIELD_ORDER = [
  'name', 'description', 'purpose', 'legalBasis', 'dataSubjectCategories',
  'retentionPeriod', 'recipients', 'internationalTransfers', 'securityMeasures',
  'managingOrganization', 'businessProcessOwner', 'jurisdiction',
]

const CORE_FIELDS = [
  'name', 'description', 'purpose', 'legalBasis', 'managingOrganization',
  'businessProcessOwner', 'retentionPeriod', 'recipients',
  'internationalTransfers', 'securityMeasures',
]

const OPTIONAL_FIELDS = new Set(['jurisdiction'])

// ---- processor (Art. 30(2)) fields ----

const PROCESSOR_FIELD_LABELS: Record<string, string> = {
  name: 'Record name',
  description: 'Description of the service',
  processorDetails: 'Processor name & contact details (Art. 30(2)(a))',
  controllers: 'Controllers acted for (Art. 30(2)(a))',
  processingCategories: 'Categories of processing (Art. 30(2)(b))',
  internationalTransfers: 'International transfers (Art. 30(2)(c))',
  securityMeasures: 'Security measures (Art. 30(2)(d))',
  dataSubjectCategories: 'Data subject categories',
  dpaReference: 'DPA / contract reference (Art. 28(3))',
  managingOrganization: 'Managing organization',
  businessProcessOwner: 'Business process owner',
  jurisdiction: 'Jurisdiction',
}

const PROCESSOR_FIELD_ORDER = [
  'name', 'description', 'processorDetails', 'controllers', 'processingCategories',
  'internationalTransfers', 'securityMeasures', 'dataSubjectCategories',
  'dpaReference', 'managingOrganization', 'businessProcessOwner', 'jurisdiction',
]

const PROCESSOR_CORE = [
  'name', 'description', 'processorDetails', 'controllers',
  'processingCategories', 'internationalTransfers', 'securityMeasures',
]

const PROCESSOR_OPTIONAL = new Set([
  'dataSubjectCategories', 'dpaReference', 'managingOrganization',
  'businessProcessOwner', 'jurisdiction',
])

const PROCESSOR_ASSESSMENT_OWNER: Record<AssessmentType, string> = {
  PIA: 'Controller — processor assists (Art. 28(3)(f))',
  LIA: 'Controller',
  TIA: 'Processor — for its own onward transfers to sub-processors',
  PbD: 'Processor — internal review of the service',
  AIRisk: 'Processor — internal review of the service',
}

const LEGAL_BASES = [
  'Consent', 'Contract', 'Legal obligation', 'Vital interests',
  'Public task', 'Legitimate interests',
]

const CONDITION_ORDER: ConditionKey[] = [
  'specialCategory', 'internationalTransfer', 'legitimateInterests',
  'automatedDecisions', 'largeScale', 'systematicMonitoring',
  'vulnerableSubjects', 'newActivity',
]

const CONDITION_LABEL: Record<ConditionKey, string> = {
  specialCategory: 'Special-category data',
  internationalTransfer: 'International transfer',
  legitimateInterests: 'Legitimate interests basis',
  automatedDecisions: 'Automated decisions / AI',
  largeScale: 'Large-scale processing',
  systematicMonitoring: 'Systematic monitoring',
  vulnerableSubjects: 'Vulnerable data subjects',
  newActivity: 'New / draft activity',
}

const ASSESSMENT_NAME: Record<AssessmentType, string> = {
  PIA: 'Privacy Impact Assessment',
  LIA: 'Legitimate Interests Assessment',
  TIA: 'Transfer Impact Assessment',
  PbD: 'Privacy by Design Review',
  AIRisk: 'AI Risk Assessment',
}

const AI_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'model', 'algorithm',
  'automated decision', 'automated decision-making', 'profiling', 'scoring',
  'predict', 'recommendation engine',
]
const LARGE_SCALE_KEYWORDS = [
  'large-scale', 'large scale', 'nationwide', 'millions', 'all customers',
  'all users', 'entire user base', 'across all', 'high volume',
]
const MONITORING_KEYWORDS = [
  'monitor', 'monitoring', 'tracking', 'track ', 'surveillance', 'observ',
  'behavioral', 'behaviour', 'geolocation tracking',
]
const VULNERABLE_KEYWORDS = ['child', 'children', 'minor', 'student', 'patient', 'vulnerable', 'elderly']
const SPECIAL_TEXT_KEYWORDS = ['health', 'biometric', 'ethnic', 'racial', 'genetic']

const TRANSFER_SAFEGUARD =
  /\bsccs?\b|standard contractual|adequacy|\bbcrs?\b|binding corporate|data privacy framework|\bdpf\b|\bidta\b|derogation|art(icle)?\.?\s*49/i
const TRANSFER_DESTINATION = new RegExp(
  '\\b(united states|u\\.?s\\.?a?|america|canada|mexico|brazil|argentina|chile|colombia|' +
    'india|china|hong kong|japan|south korea|korea|singapore|philippines|malaysia|vietnam|' +
    'indonesia|thailand|taiwan|australia|new zealand|israel|turkey|uae|united arab emirates|' +
    'saudi arabia|egypt|south africa|nigeria|kenya|morocco|russia|ukraine|serbia|' +
    'switzerland|norway|iceland|united kingdom|uk|great britain|third countr(y|ies)|' +
    'international organi[sz]ation|worldwide|global)\\b',
  'i',
)
const CONCRETE_PERIOD =
  /\d|\b(day|week|month|year)s?\b|duration of|\bafter\b|end of|termination|closure|statutory|withdraw|contract end|deleted or returned/i
const JOINT_ARRANGEMENT =
  /art(icle)?\.?\s*26|joint[- ]controller (arrangement|agreement)|arrangement|data sharing agreement/i
const DEFERS_TO_CONTROLLER = /\bclient|\bcustomer|controller|\bdpa\b|instruction|on behalf/i

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with', 'by',
  'data', 'processing', 'activity', 'personal', 'customer', 'customers', 'new',
  'process', 'management', 'service', 'services', 'user', 'users',
])
const DUPLICATE_THRESHOLD = 0.16

// ---- helpers ----

const ROLES: ProcessingRole[] = ['controller', 'joint_controller', 'processor']
const ROLE_LABEL: Record<ProcessingRole, string> = {
  controller: 'Controller',
  joint_controller: 'Joint controller',
  processor: 'Processor',
}

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function roleOf(pa: CheckRecord): ProcessingRole {
  const raw = (text(pa.role) || 'controller').toLowerCase().replace(/[-\s]/g, '_')
  return (ROLES as string[]).includes(raw) ? (raw as ProcessingRole) : 'controller'
}

const isProcessor = (pa: CheckRecord) => roleOf(pa) === 'processor'
const isJoint = (pa: CheckRecord) => roleOf(pa) === 'joint_controller'

function jointControllersOf(pa: CheckRecord) {
  return (pa.jointControllers ?? []).filter((c) => c && text(c.name))
}

function controllersOf(pa: CheckRecord) {
  return (pa.controllers ?? []).filter((c) => c && text(c.name))
}

function isFilled(pa: CheckRecord, key: string): boolean {
  if (key === 'controllers') return controllersOf(pa).length > 0
  if (key === 'processingCategories' && isProcessor(pa)) {
    const perController = controllersOf(pa)
    return (
      (pa.processingCategories?.length ?? 0) > 0 ||
      (perController.length > 0 && perController.every((c) => (c.processingCategories?.length ?? 0) > 0))
    )
  }
  const value = (pa as Record<string, unknown>)[key]
  if (Array.isArray(value)) return value.length > 0
  return Boolean(text(value))
}

function confidenceBand(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.85) return 'high'
  if (c >= 0.6) return 'medium'
  return 'low'
}

const BAND_LABEL: Record<'high' | 'medium' | 'low', ConfidenceBandLabel> = {
  high: 'High confidence',
  medium: 'Needs review',
  low: 'Low confidence',
}

// Matches lib/ropa.ts completeness(): processors are scored on the seven
// Art. 30(2) items, every other role on the Art. 30(1) formula below.
function completeness(pa: CheckRecord): number {
  if (isProcessor(pa)) {
    const filled = PROCESSOR_CORE.filter((f) => isFilled(pa, f)).length
    return Math.round((filled / PROCESSOR_CORE.length) * 100)
  }
  let filled = CORE_FIELDS.filter((f) => text((pa as Record<string, unknown>)[f])).length
  const total = CORE_FIELDS.length + 3
  const rels = pa.relationships ?? []
  if ((pa.dataSubjectCategories?.length ?? 0) > 0) filled += 1
  if (rels.some((r) => r.type === 'vendor' || r.type === 'asset')) filled += 1
  if (rels.some((r) => r.type === 'personalData')) filled += 1
  return Math.round((filled / total) * 100)
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function resolveInventoryId(type: RelationshipType, name: string, inventory: CheckInventory): string | null {
  const n = norm(name)
  if (n.length < 2) return null
  const pool =
    type === 'vendor'
      ? inventory.vendors ?? []
      : type === 'asset'
        ? inventory.assets ?? []
        : inventory.personalDataCategories ?? []
  for (const item of pool) {
    const inm = norm(item.name)
    if (inm === n || inm.includes(n) || n.includes(inm)) return item.id
  }
  return null
}

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

function summaryText(rec: CheckRecord): string {
  const categories = (rec.processingCategories ?? []).join(' ')
  return `${text(rec.name)} ${text(rec.purpose)} ${text(rec.description)} ${categories}`
}

function findDuplicate(pa: CheckRecord, existing: CheckRecord[]) {
  const group = isProcessor(pa)
  const cand = tokens(summaryText(pa))
  let best: { rec: CheckRecord; score: number } | null = null
  for (const rec of existing) {
    if (isProcessor(rec) !== group) continue
    const score = jaccard(cand, tokens(summaryText(rec)))
    if (!best || score > best.score) best = { rec, score }
  }
  if (best && best.score >= DUPLICATE_THRESHOLD) {
    return { id: best.rec.id, name: best.rec.name, score: Math.round(best.score * 1000) / 1000 }
  }
  return null
}

// ---- posture ----

// Same text as lib/posture.ts corpus().
function corpus(pa: CheckRecord): string {
  const subjects = (pa.dataSubjectCategories ?? []).join(' ')
  return `${text(pa.name)} ${text(pa.description)} ${text(pa.purpose)} ${subjects}`.toLowerCase()
}

const hasAny = (haystack: string, needles: string[]) => needles.some((n) => haystack.includes(n))

function isTransferring(value: unknown): boolean {
  const v = text(value).toLowerCase()
  if (!v) return false
  return !/^(none|no\b|n\/a|not applicable|domestic|within)/.test(v)
}

function daysSince(iso?: string): number | null {
  if (!iso) return null
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return null
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24))
}

function evaluateCondition(pa: CheckRecord, key: ConditionKey, pdcs: PersonalDataCategory[]): boolean {
  const corp = corpus(pa)
  const rels = pa.relationships ?? []
  switch (key) {
    case 'specialCategory': {
      const specialIds = new Set(pdcs.filter((p) => p.sensitivity === 'special').map((p) => p.id))
      const specialNames = pdcs.filter((p) => p.sensitivity === 'special').map((p) => p.name.toLowerCase())
      const viaRel = rels.some(
        (r) =>
          r.type === 'personalData' &&
          r.status !== 'rejected' &&
          ((r.inventoryId && specialIds.has(r.inventoryId)) ||
            specialNames.some((n) => r.name.toLowerCase().includes(n))),
      )
      return viaRel || hasAny(corp, SPECIAL_TEXT_KEYWORDS)
    }
    case 'internationalTransfer':
      return isTransferring(pa.internationalTransfers)
    case 'legitimateInterests':
      // A processor has no lawful basis of its own: the Art. 6(1)(f) balancing
      // test is the controller's (Art. 30(2) has no legal basis field).
      return !isProcessor(pa) && pa.legalBasis === 'Legitimate interests'
    case 'automatedDecisions':
      return hasAny(corp, AI_KEYWORDS)
    case 'largeScale':
      return hasAny(corp, LARGE_SCALE_KEYWORDS)
    case 'systematicMonitoring':
      return hasAny(corp, MONITORING_KEYWORDS)
    case 'vulnerableSubjects':
      return hasAny(corp, VULNERABLE_KEYWORDS)
    case 'newActivity': {
      if ((pa.status ?? 'draft') === 'draft') return true
      const age = daysSince(pa.createdAt)
      return age !== null && age < 90
    }
    default:
      return false
  }
}

function matchesRule(logic: string, conditions: ConditionKey[], active: Set<ConditionKey>): boolean {
  if (conditions.length === 0) return false
  return logic === 'all' ? conditions.every((c) => active.has(c)) : conditions.some((c) => active.has(c))
}

function cadenceLabel(days: number): string {
  if (days % 365 === 0) {
    const y = days / 365
    return y === 1 ? 'Annually' : `Every ${y} years`
  }
  if (days % 30 === 0) {
    const m = days / 30
    return m === 1 ? 'Monthly' : `Every ${m} months`
  }
  return `Every ${days} days`
}

function resolveCadence(active: Set<ConditionKey>, posture: PostureConfig) {
  for (const rule of posture.cadenceRules ?? []) {
    if (rule.enabled && matchesRule(rule.logic ?? 'any', rule.conditions ?? [], active)) {
      return { cadenceDays: rule.cadenceDays, label: cadenceLabel(rule.cadenceDays), rule: rule.label, isDefault: false }
    }
  }
  const d = posture.defaultCadenceDays ?? 365
  return { cadenceDays: d, label: cadenceLabel(d), rule: 'Default cadence', isDefault: true }
}

function requiredAssessments(active: Set<ConditionKey>, posture: PostureConfig, processor: boolean): CheckAssessment[] {
  const out: CheckAssessment[] = []
  for (const rule of posture.assessmentRules ?? []) {
    if (!rule.enabled || !matchesRule(rule.logic ?? 'any', rule.conditions ?? [], active)) continue
    const item: CheckAssessment = {
      type: rule.type,
      name: ASSESSMENT_NAME[rule.type] ?? rule.type,
      triggeredBy: rule.conditions.filter((c) => active.has(c)).map((c) => CONDITION_LABEL[c]),
      note: rule.note,
    }
    if (processor) item.owner = PROCESSOR_ASSESSMENT_OWNER[rule.type] ?? 'Processor'
    out.push(item)
  }
  return out
}

// ---- validation ----

function validate(pa: CheckRecord, active: Set<ConditionKey>): CheckWarning[] {
  const warnings: CheckWarning[] = []
  const warn = (field: string, severity: CheckSeverity, issue: string) => warnings.push({ field, severity, issue })

  const transfers = pa.internationalTransfers
  if (isTransferring(transfers)) {
    if (!TRANSFER_SAFEGUARD.test(text(transfers))) {
      warn('internationalTransfers', 'warning',
        'A transfer is described but no safeguard is named (SCCs, adequacy decision, BCRs, DPF, Art. 49 derogation).')
    }
    if (!TRANSFER_DESTINATION.test(text(transfers))) {
      warn('internationalTransfers', 'warning',
        'Name the destination third country or international organisation (Art. 30(1)(e) / 30(2)(c)).')
    }
  }

  if (isProcessor(pa)) return [...warnings, ...validateProcessor(pa, active)]

  const lb = text(pa.legalBasis)
  if (lb && !LEGAL_BASES.includes(lb)) {
    warn('legalBasis', 'critical', `"${lb}" is not a recognised Art. 6 basis. Use one of: ${LEGAL_BASES.join(', ')}.`)
  }

  const retention = text(pa.retentionPeriod)
  if (retention && !CONCRETE_PERIOD.test(retention)) {
    warn('retentionPeriod', 'warning', 'Retention is described but has no concrete period or trigger.')
  }

  if (active.has('specialCategory')) {
    let issue = 'Special-category (Art. 9) data is present — document the Art. 9(2) condition relied on.'
    if (lb === 'Legitimate interests') {
      issue += ' Legitimate interests alone is not sufficient for special-category data.'
      warn('legalBasis', 'critical', issue)
    } else {
      warn('legalBasis', 'warning', issue)
    }
  }

  if (active.has('automatedDecisions')) {
    warn('purpose', 'info',
      'AI / automated-decision keywords detected — confirm whether decisions with legal or similarly significant effects are made (Art. 22).')
  }

  if (!text(pa.controllerDetails)) {
    warn('controllerDetails', 'info',
      'Controller (and DPO / representative) name and contact details are required by Art. 30(1)(a).')
  }

  if (isJoint(pa)) {
    for (const c of jointControllersOf(pa)) {
      if (!text(c.contact)) {
        warn('jointControllers', 'warning', `Joint controller "${c.name}" has no contact details (Art. 30(1)(a)).`)
      }
    }
    const arrangement = [pa.jointArrangement, pa.roleDetail, pa.description, pa.securityMeasures].map(text).join(' ')
    if (!JOINT_ARRANGEMENT.test(arrangement)) {
      warn('jointArrangement', 'warning',
        "No joint-controller arrangement is referenced — Art. 26 requires one setting out each party's " +
          'responsibilities, with its essence made available to data subjects.')
    }
  }

  return warnings
}

function validateProcessor(pa: CheckRecord, active: Set<ConditionKey>): CheckWarning[] {
  const warnings: CheckWarning[] = []
  const warn = (field: string, severity: CheckSeverity, issue: string) => warnings.push({ field, severity, issue })
  const controllers = controllersOf(pa)

  for (const c of controllers) {
    if (!text(c.contact)) warn('controllers', 'warning', `Controller "${c.name}" has no contact details (Art. 30(2)(a)).`)
  }

  if (controllers.length > 1 && !(pa.processingCategories?.length)) {
    if (!controllers.every((c) => (c.processingCategories?.length ?? 0) > 0)) {
      warn('processingCategories', 'warning',
        'Several controllers are listed — record the categories of processing carried out for each (Art. 30(2)(b)).')
    }
  }

  const controllerDecided: [keyof CheckRecord, string][] = [
    ['legalBasis', 'legal basis'],
    ['purpose', 'purpose'],
    ['retentionPeriod', 'retention period'],
  ]
  for (const [key, label] of controllerDecided) {
    const value = text(pa[key])
    if (value && !DEFERS_TO_CONTROLLER.test(value)) {
      warn(key, 'info',
        `A ${label} is set, but in a processor record the controller decides this. ` +
          "Keep it as a reference to the controller's instructions, or remove it.")
    }
  }

  if (!text(pa.dpaReference)) {
    warn('dpaReference', 'info',
      'No data processing agreement is referenced — processing must be governed by a contract under Art. 28(3).')
  }

  const subProcessors = (pa.relationships ?? [])
    .filter((r) => r.type === 'vendor' && r.status !== 'rejected')
    .map((r) => r.name)
  if (subProcessors.length > 0) {
    warn('subProcessors', 'info',
      `Sub-processors engaged (${subProcessors.join(', ')}) — confirm the controller's prior written ` +
        'authorisation and flow-down terms (Art. 28(2) and 28(4)).')
  }

  if (active.has('specialCategory')) {
    warn('processingCategories', 'warning',
      "Special-category (Art. 9) data is processed — confirm the controller's instructions cover it " +
        'and that security measures reflect the higher risk (Art. 32).')
  }

  if (active.has('automatedDecisions')) {
    warn('processingCategories', 'info',
      'AI / automated-decision keywords detected — confirm whether the service makes or supports decisions ' +
        'about individuals, so the controller can meet Art. 22.')
  }

  return warnings
}

function checkEntity(pa: CheckRecord, subsidiaries: Subsidiary[]): [CheckOwningEntity | null, CheckWarning[]] {
  const warnings: CheckWarning[] = []
  const sid = text(pa.subsidiaryId)
  if (!sid) return [null, warnings]
  const byId = new Map(subsidiaries.map((s) => [s.id, s]))
  const entity = byId.get(sid)
  if (!entity) {
    if (subsidiaries.length > 0) {
      warnings.push({ field: 'subsidiaryId', severity: 'warning',
        issue: `"${sid}" is not a known subsidiary in the organisation structure.` })
    }
    return [{ id: sid, resolved: false }, warnings]
  }

  const chain: string[] = []
  let current: Subsidiary | undefined = entity
  while (current) {
    chain.unshift(current.name)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  if (entity.kind === 'regional') {
    warnings.push({ field: 'subsidiaryId', severity: 'info',
      issue: `"${entity.name}" is a regional grouping. Controllers and processors are legal entities, so confirm which entity owns this record.` })
  }
  if (!text(pa.jurisdiction) && entity.jurisdiction) {
    warnings.push({ field: 'jurisdiction', severity: 'info',
      issue: `Jurisdiction is blank — the owning entity is in ${entity.jurisdiction}.` })
  }
  return [
    { id: sid, resolved: true, name: entity.name, kind: entity.kind, jurisdiction: entity.jurisdiction, path: chain.join(' › ') },
    warnings,
  ]
}

// ---- main ----

const EMPTY_POSTURE: PostureConfig = {
  defaultCadenceDays: 365,
  requireCertification: false,
  cadenceRules: [],
  assessmentRules: [],
}

export function runRopaChecks(
  record: CheckRecord,
  options: { inventory?: CheckInventory; posture?: PostureConfig; existing?: CheckRecord[] } = {},
): RopaCheckReport {
  const inventory = options.inventory ?? {}
  const hasInventory = Boolean(
    inventory.vendors?.length || inventory.assets?.length || inventory.personalDataCategories?.length,
  )
  const posture = options.posture ?? EMPTY_POSTURE
  const existing = options.existing ?? []
  const pdcs = inventory.personalDataCategories ?? []

  // Work on a copy so resolving inventory ids does not mutate the caller's draft.
  const pa: CheckRecord = {
    ...record,
    relationships: (record.relationships ?? []).map((r) => ({ ...r })),
  }
  const processor = isProcessor(pa)
  const [labels, order, optional] = processor
    ? [PROCESSOR_FIELD_LABELS, PROCESSOR_FIELD_ORDER, PROCESSOR_OPTIONAL]
    : [FIELD_LABELS, FIELD_ORDER, OPTIONAL_FIELDS]

  const relReport: CheckRelationshipReport[] = []
  for (const r of pa.relationships ?? []) {
    if (hasInventory && !r.inventoryId) r.inventoryId = resolveInventoryId(r.type, r.name ?? '', inventory)
    const pdc = pdcs.find((p) => p.id === r.inventoryId)
    const item: CheckRelationshipReport = {
      type: r.type,
      name: r.name,
      inventoryId: r.inventoryId ?? null,
      resolved: Boolean(r.inventoryId),
      special: Boolean(pdc && pdc.sensitivity === 'special'),
      confidence: typeof r.confidence === 'number' ? r.confidence : null,
      band: typeof r.confidence === 'number' ? BAND_LABEL[confidenceBand(r.confidence)] : null,
    }
    if (processor) item.relationshipRole = r.type === 'vendor' ? 'sub-processor' : null
    relReport.push(item)
  }

  const meta = pa.fieldMeta ?? {}
  const fields: CheckFieldReport[] = []
  const gaps: string[] = []
  for (const key of order) {
    const filled = isFilled(pa, key)
    const c = meta[key]?.confidence
    fields.push({
      key,
      label: labels[key],
      filled,
      confidence: typeof c === 'number' ? c : null,
      band: typeof c === 'number' && filled ? BAND_LABEL[confidenceBand(c)] : null,
    })
    if (!filled && !optional.has(key)) gaps.push(labels[key])
  }

  if (!processor) {
    const rels = pa.relationships ?? []
    if (!rels.some((r) => r.type === 'vendor' || r.type === 'asset')) gaps.push('At least one vendor or application/asset')
    if (!rels.some((r) => r.type === 'personalData')) gaps.push('At least one personal data category')
  }
  if (isJoint(pa) && jointControllersOf(pa).length === 0) gaps.push('Joint controllers (Art. 26 / 30(1)(a))')

  const [entity, entityWarnings] = checkEntity(pa, inventory.subsidiaries ?? [])
  if (!entity) gaps.push('Owning legal entity (subsidiary)')

  const active = CONDITION_ORDER.filter((k) => evaluateCondition(pa, k, pdcs))
  const activeSet = new Set(active)
  const role = roleOf(pa)
  const score = completeness(pa)

  const report: RopaCheckReport = {
    role,
    roleLabel: ROLE_LABEL[role],
    roleDetail: text(pa.roleDetail) || null,
    owningEntity: entity,
    completeness: score,
    incomplete: score < 80,
    gaps,
    lowConfidence: fields.filter((f) => f.band === 'Low confidence').map((f) => f.label),
    needsReview: fields.filter((f) => f.band === 'Needs review').map((f) => f.label),
    fields,
    relationships: relReport,
    unresolvedRelationships: hasInventory
      ? relReport.filter((r) => !r.resolved).map((r) => `${r.type}: ${r.name}`)
      : [],
    validation: [...validate(pa, activeSet), ...entityWarnings],
    possibleDuplicate: existing.length > 0 ? findDuplicate(pa, existing) : null,
    posture: {
      activeConditions: active.map((k) => CONDITION_LABEL[k]),
      requiredAssessments: requiredAssessments(activeSet, posture, processor),
      reviewCadence: resolveCadence(activeSet, posture),
      requireCertification: posture.requireCertification ?? false,
    },
  }

  if (processor) {
    report.controllers = controllersOf(pa).map((c) => ({
      name: c.name,
      hasContact: Boolean(text(c.contact)),
      processingCategories: c.processingCategories?.length ? c.processingCategories : pa.processingCategories ?? [],
    }))
  }
  if (isJoint(pa)) {
    report.jointControllers = jointControllersOf(pa).map((c) => ({ name: c.name, hasContact: Boolean(text(c.contact)) }))
  }
  return report
}
