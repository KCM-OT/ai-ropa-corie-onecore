# Article 30 fields — controller and joint-controller records (Art. 30(1))

Source: `lib/types.ts`, `lib/authoring.ts`, `lib/ropa.ts`, `lib/org.ts` in the prototype.

This file covers records where `role` is `"controller"` (the default) or `"joint_controller"`.
For `"processor"` records, see `processor-mode.md`.

## Role and owning entity (all records)

| Key | Values | Notes |
|---|---|---|
| `role` | `controller`, `joint_controller`, `processor` | Prototype `ProcessingRole`. Shown as Controller / Joint controller / Processor. |
| `subsidiaryId` | A subsidiary `id`, e.g. `sub-de` | The legal entity that owns the record. Must match the inventory's `subsidiaries` list. |
| `roleDetail` | Short text | e.g. "Joint controller with Solera Group under Art. 26". The prototype shows this in the records list in place of the purpose. |

Subsidiaries form a tree: a `holding` company, `regional` groupings, and `legal_entity` companies
beneath them. Records belong to the entity that owns the processing. Prefer a legal entity, or
the holding company, over a regional grouping, which usually isn't a legal entity itself.

## Joint controllers (Art. 26)

| Key | Notes |
|---|---|
| `jointControllers` | The other controller(s): a list of `{ "name", "contact" }` |
| `jointArrangement` | Reference to the Art. 26 arrangement setting out each party's responsibilities |

Both fields exist in the prototype with the same names. The checks script requires at least one named joint controller, warns if a joint
controller has no contact details, and warns if no arrangement is referenced anywhere in the
record. A joint-controller record otherwise uses all the controller fields below.

## Attributes (display order)

| Key | Label | Notes |
|---|---|---|
| `name` | Record name | Short title for the activity |
| `description` | Description | What the activity is |
| `purpose` | Purpose of processing | Art. 30(1)(b) |
| `legalBasis` | Legal basis (Art. 6) | Must be one of the six values below |
| `dataSubjectCategories` | Data subject categories | List. Art. 30(1)(c) |
| `retentionPeriod` | Retention period | Art. 30(1)(f) — should be a concrete period |
| `recipients` | Recipients | Art. 30(1)(d) |
| `internationalTransfers` | International transfers | Art. 30(1)(e) — include the safeguard (SCCs, adequacy, BCRs) or "None" |
| `securityMeasures` | Security measures | Art. 30(1)(g) |
| `managingOrganization` | Managing organization | Owning team/department |
| `businessProcessOwner` | Business process owner | Named person |
| `jurisdiction` | Jurisdiction | Primary country/region |

Personal-data categories (Art. 30(1)(c)) and vendors/systems are captured as **relationships**,
not as fields.

## Allowed legal bases
`Consent`, `Contract`, `Legal obligation`, `Vital interests`, `Public task`, `Legitimate interests`

If the source names several, use the first recognised one and mention the others in the rationale.

## Confidence bands
| Confidence | Band | Label shown |
|---|---|---|
| ≥ 0.85 | high | High confidence |
| 0.60 – 0.84 | medium | Needs review |
| < 0.60 | low | Low confidence |

## Completeness
Out of 13 items: 10 core text fields (`name`, `description`, `purpose`, `legalBasis`,
`managingOrganization`, `businessProcessOwner`, `retentionPeriod`, `recipients`,
`internationalTransfers`, `securityMeasures`) + at least one data subject category + at least one
vendor or asset relationship + at least one personal-data relationship.
`jurisdiction` is not counted. Result = round(filled / 13 × 100). Records under 80% are flagged as
incomplete in the prototype's dashboard. Controller and joint-controller records use this
formula; processor records use the seven-item Art. 30(2) score in `processor-mode.md`.

## Record JSON shape
```json
{
  "role": "controller",
  "subsidiaryId": "sub-group",
  "roleDetail": "Controller for global recruitment",
  "name": "AI-Assisted Candidate Screening",
  "description": "…",
  "status": "draft",
  "purpose": "…",
  "legalBasis": "Legitimate interests",
  "managingOrganization": "Talent Acquisition",
  "businessProcessOwner": "Jane Smith",
  "dataSubjectCategories": ["Job applicants"],
  "retentionPeriod": "12 months after the role is filled",
  "recipients": "Hiring managers; TalentSprint AI (processor)",
  "internationalTransfers": "US via TalentSprint AI under SCCs",
  "securityMeasures": "Encryption at rest and in transit, SSO, RBAC",
  "jurisdiction": "United Kingdom",
  "controllerDetails": "Optional — Art. 30(1)(a), not in the prototype",
  "fieldMeta": {
    "purpose": {
      "provenance": "ai",
      "confidence": 0.92,
      "evidence": "verbatim quote",
      "rationale": "Explicitly stated under a Purpose heading."
    }
  },
  "relationships": [
    {
      "type": "vendor",
      "name": "TalentSprint AI",
      "confidence": 0.91,
      "evidence": "verbatim quote",
      "rationale": "Named directly in the document.",
      "status": "suggested"
    }
  ]
}
```
`type` is `vendor` (third-party company/processor), `asset` (internal system, application or data
store) or `personalData` (category of personal data). `status` is `suggested`, `accepted`,
`edited`, `rejected` or `unresolved`.

For a joint-controller record, set `"role": "joint_controller"` and add `jointControllers` and
`jointArrangement`. See `examples/joint-controller-draft.json`.

## Prototype mapping
Drafts use the prototype's `ProcessingActivity` field names, so they map onto its records directly.

| Skill field | In the prototype? |
|---|---|
| All controller fields above, `role`, `subsidiaryId`, `roleDetail`, `relationships`, `fieldMeta`, `status` | Yes, same name |
| `jointControllers`, `jointArrangement` | Yes, same name |
| Processor fields (`processorDetails`, `controllers`, `processingCategories`, `dpaReference`) | Yes, same name (see `processor-mode.md`) |
| `controllerDetails` | No; skill only |

`controllerDetails` is an Article 30(1)(a) requirement the skill adds. When handing a draft to the
prototype, mention that it would otherwise be lost.
