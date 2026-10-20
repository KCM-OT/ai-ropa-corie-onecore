import { SAMPLE_DESCRIPTION } from './extract';
import { JOINT_SAMPLE, PROCESSOR_SAMPLE } from './skill-draft';

// Sample scenarios for AI Assisted RoPA Creation. Each chip picks one of its
// variants at random, and every variant overlaps a record that already exists
// (see duplicates.ts), so the demo shows the duplicate check catching a
// different kind of overlap each time: a previous RoPA record, a shared
// vendor, or the same data subjects. The new variants leave out a field or two
// (legal basis, retention, security) that "Create as local variation" then
// inherits from the matched record.

export type DuplicateKind = 'Previous RoPA record' | 'Shared vendor' | 'Same data subjects';

export interface SampleVariant {
  name: string;
  text: string;
  /** The existing record this variant is written to overlap, and how. */
  duplicateOf: number;
  kind: DuplicateKind;
}

export interface SampleScenario {
  chip: string;
  variants: SampleVariant[];
}

export const SCENARIOS: SampleScenario[] = [
  {
    chip: 'Sample: HR activity (controller)',
    variants: [
      { name: 'Candidate screening', text: SAMPLE_DESCRIPTION, duplicateOf: 1013, kind: 'Previous RoPA record' },
      {
        name: 'New hire screening',
        duplicateOf: 1020,
        kind: 'Shared vendor',
        text: `Our talent team checks new hires at Solera UK before their start date. Checkr verifies each new hire's identity, employment history and right to work, using their passport number and home address, and the results are stored in the Background Check Repository. Data subjects: new hires. Some new hires share disability details when they ask for workplace adjustments, which we treat as health data. Checkr processes the data in the United States under standard contractual clauses. Access uses SSO and all data is encrypted at rest. The process is owned by Tom Becker.`,
      },
      {
        name: 'Workplace injury reporting',
        duplicateOf: 1022,
        kind: 'Same data subjects',
        text: `Our HR team at Solera Deutschland records workplace injuries and near misses so that we can investigate each incident and meet our legal reporting duties. Data subjects: employees and contractors. We collect each person's name, employee ID, what happened and any medical notes, which are health data. Reports are logged in the HRIS. Access uses SSO and role-based access. The process is owned by Lukas Weber.`,
      },
    ],
  },
  {
    chip: 'Sample: client service (processor)',
    variants: [
      { name: 'Client payroll', text: PROCESSOR_SAMPLE, duplicateOf: 1012, kind: 'Previous RoPA record' },
      {
        name: 'Repair estimating for insurers',
        duplicateOf: 1017,
        kind: 'Shared vendor',
        text: `Solera UK estimates vehicle repair costs on behalf of our clients, following their instructions. Our clients are insurers. Clients: Aviva (dpo@aviva.example); Zurich Insurance. Services: damage assessment, repair cost estimation and total-loss valuation for insurance claims. Claimants' names, phone numbers, postal addresses and vehicle photos are uploaded to our estimating platform, hosted on Amazon Web Services. Our engineering team in India can access the data under standard contractual clauses. Each client signs our DPA v2.1 under Art. 28.`,
      },
      {
        name: 'Usage-based insurance scoring',
        duplicateOf: 1016,
        kind: 'Same data subjects',
        text: `Solera Deutschland scores driving behaviour on behalf of our clients, following their instructions. Our clients are insurers. Clients: Allianz Partners (privacy@allianz.example); Aviva. Services: telematics collection, trip scoring and monthly driver reports. Drivers' names, location data and device identifiers are collected from connected cars and stored on Amazon Web Services in the EU. Each client signs our DPA v2.1 under Art. 28.`,
      },
    ],
  },
  {
    chip: 'Sample: group system (joint controller)',
    variants: [
      { name: 'Group HR information system', text: JOINT_SAMPLE, duplicateOf: 1018, kind: 'Previous RoPA record' },
      {
        name: 'Group finance operations',
        duplicateOf: 1025,
        kind: 'Shared vendor',
        text: `Solera UK and Solera EMEA Holdings jointly decide how the shared services finance platform is used. We run it together with Solera EMEA Holdings, who sets the group-wide finance purposes with us. Suppliers' names, email addresses and bank details are processed in Workday so that shared services can pay suppliers for every group company. The legal basis is contract. Owner: Claire Martin, Finance.`,
      },
      {
        name: 'Group learning academy',
        duplicateOf: 1028,
        kind: 'Same data subjects',
        text: `Solera UK and Solera Group jointly decide how the group learning academy is used. We run it together with Solera Group, who sets the group-wide training purposes with us. Employees' names, work email addresses and course completions are stored in the academy, and they sign in through Okta. The legal basis is contract. Access uses SSO and role-based access. Owner: Jane Smith, People Operations.`,
      },
    ],
  },
];

/** Every variant's text, for the skill parity test. */
export const DEMO_SAMPLES: { label: string; text: string }[] = SCENARIOS.flatMap((s) =>
  s.variants.map((v) => ({ label: v.name, text: v.text })),
);

export function pickVariant(scenario: SampleScenario): SampleVariant {
  return scenario.variants[Math.floor(Math.random() * scenario.variants.length)];
}
