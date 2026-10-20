// Shapes follow the ropa-authoring skill's draft JSON
// (.claude/skills/ropa-authoring/references/fields.md and examples/).

export type ProcessingRole = 'controller' | 'joint_controller' | 'processor';

export const ROLE_LABELS: Record<ProcessingRole, string> = {
  controller: 'Controller',
  joint_controller: 'Joint controller',
  processor: 'Processor',
};

export const ROLE_HELP: Record<ProcessingRole, string> = {
  controller: 'You decide why and how the data is used.',
  joint_controller: 'You decide that together with another company.',
  processor: 'You handle the data for a client, on their instructions.',
};

export interface FieldMeta {
  /** 'inherited': copied from the parent record of a local variation. */
  provenance: 'ai' | 'user' | 'inherited';
  confidence: number; // 0–1
  evidence: string; // verbatim quote from the source
  rationale: string;
}

export interface Relationship {
  type: 'vendor' | 'asset' | 'personalData';
  name: string;
  confidence: number;
  evidence: string;
  rationale: string;
  status: 'suggested' | 'accepted' | 'rejected';
}

export interface DraftField {
  key: string;
  label: string;
  value: string;
  meta?: FieldMeta;
}

export interface RopaDraft {
  id: number;
  name: string;
  role: ProcessingRole;
  subsidiaryId: string;
  description: string;
  fields: DraftField[];
  relationships: Relationship[];
  completeness: number; // 0–100
  sourceFileName?: string;
  submittedAt: string; // ISO timestamp
  submittedBy: string;
}

export type ConfidenceBand = 'high' | 'medium' | 'low';

// Confidence bands. Thresholds are a placeholder until UX and product settle
// the "pre-populate vs suggest only" question.
export function confidenceBand(c: number): ConfidenceBand {
  if (c >= 0.85) return 'high';
  if (c >= 0.6) return 'medium';
  return 'low';
}
