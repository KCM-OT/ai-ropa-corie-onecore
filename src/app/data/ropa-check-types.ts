// Types the ropa-authoring checker (ropa-check.ts) needs. Copied from the
// AI RoPA Studio prototype's lib/types.ts, which the skill's JSON shapes follow.

export type ProcessingRole = 'controller' | 'processor' | 'joint_controller';

export type RelationshipType = 'vendor' | 'asset' | 'personalData';

export type SubsidiaryKind = 'holding' | 'regional' | 'legal_entity';

export interface Subsidiary {
  id: string;
  name: string;
  shortName: string;
  parentId: string | null;
  jurisdiction: string;
  kind: SubsidiaryKind;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  location: string;
  dpaStatus: 'Signed' | 'Pending' | 'None';
}

export interface Asset {
  id: string;
  name: string;
  type: string; // Application | System | Data store
  hostingRegion: string;
}

export interface PersonalDataCategory {
  id: string;
  name: string;
  sensitivity: 'standard' | 'special';
}

export type ConditionKey =
  | 'specialCategory'
  | 'internationalTransfer'
  | 'legitimateInterests'
  | 'automatedDecisions'
  | 'largeScale'
  | 'systematicMonitoring'
  | 'vulnerableSubjects'
  | 'newActivity';

/** PIA (a.k.a. DPIA), LIA, TIA, Privacy by Design review, AI risk assessment. */
export type AssessmentType = 'PIA' | 'LIA' | 'TIA' | 'PbD' | 'AIRisk';

export type RuleLogic = 'any' | 'all';

/** A review cadence tier. Rules run in order; the first enabled match sets the cadence. */
export interface CadenceRule {
  id: string;
  label: string;
  enabled: boolean;
  logic: RuleLogic;
  conditions: ConditionKey[];
  cadenceDays: number;
}

/** When its conditions match, the record needs this assessment. */
export interface AssessmentRule {
  type: AssessmentType;
  enabled: boolean;
  logic: RuleLogic;
  conditions: ConditionKey[];
  note?: string;
}

export interface PostureConfig {
  defaultCadenceDays: number;
  requireCertification: boolean;
  cadenceRules: CadenceRule[];
  assessmentRules: AssessmentRule[];
}
