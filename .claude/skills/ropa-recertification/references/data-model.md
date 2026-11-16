# Recertification data model

Source: `lib/types.ts`, `lib/agent/schemas.ts`, `lib/recert.ts`.

## ChangeSubmission

```jsonc
{
  "id": "sub-ab12cd3",                 // `sub-` + random suffix
  "recordId": "pa-recruitment",        // ProcessingActivity.id
  "recordName": "AI-Assisted Candidate Screening & Recruitment",
  "submittedBy": "Elena Marín",        // prototype hard-codes "You" for live submissions
  "submittedRole": "Global Talent Acquisition",   // falls back to record.businessProcessOwner, then "Business Process Owner"
  "submittedAt": "2026-11-16T09:30:00.000Z",
  "status": "pending_review",          // pending_review | changes_requested | approved | committed
  "decision": "modified",              // modified | approved_as_is  (derived from change count)
  "ownerNote": "…",                    // the owner's own words; chat falls back to the agent summary
  "fieldChanges": [ /* FieldChange */ ],
  "relationshipChanges": [ /* RelationshipChange */ ],
  "followUps": [ /* FollowUpQuestion */ ],
  "aiSummary": null                    // string or null
}
```

`changeCount = fieldChanges.length + relationshipChanges.length`.

## FieldChange

```jsonc
{
  "key": "retentionPeriod",            // one of the 12 FieldKey values below
  "label": "Retention period",         // FIELD_LABELS[key]
  "before": "12 months after requisition closure; …",
  "after": "9 months after requisition closure; …"
}
```

`before` is read from the live record at proposal time (`FIELD_VALUE_GETTERS`). If the record has
changed since, `before` is stale; `recert_check.py` warns on this.

### The 12 changeable field keys

| Key | Label | Notes |
|---|---|---|
| `name` | Name | |
| `description` | Description | |
| `purpose` | Purpose | |
| `legalBasis` | Legal basis | One of: Consent, Contract, Legal obligation, Vital interests, Public task, Legitimate interests |
| `managingOrganization` | Managing organization | |
| `businessProcessOwner` | Business process owner | Triggers the ownership hand-off check |
| `dataSubjectCategories` | Data subjects | Stored as an array; changes travel as a comma-separated string and are split on commit |
| `retentionPeriod` | Retention period | |
| `recipients` | Recipients | Edited as chips in the card |
| `internationalTransfers` | International transfers | |
| `securityMeasures` | Security measures | |
| `jurisdiction` | Jurisdiction | Edited as chips in the card |

Recertification **cannot** change role, owning subsidiary, processor or joint-controller details,
or additional details. Those go through `ropa-authoring` / the record editor.

Chip-style editing (add and remove values) applies to `dataSubjectCategories`, `jurisdiction`
and `recipients`; their values travel as comma-separated strings.

## RelationshipChange

```jsonc
{
  "action": "added",                   // added | removed
  "type": "vendor",                    // vendor | asset | personalData
  "name": "HireVue",
  "inventoryId": null                  // null => not in the inventory yet ("new to inventory")
}
```

- Added: `inventoryId` comes from `resolveInventory(type, name, inventory)`; `null` if no match.
- Removed: `inventoryId` is taken from the existing relationship on the record.
- Matching is on `type` plus lowercase, trimmed `name`.
- Group labels: vendor → "Vendors", asset → "Systems & assets", personalData → "Personal data".

## FollowUpQuestion

```jsonc
{
  "id": "fu-xyz",
  "question": "Does HireVue have a signed DPA in place, and where is recorded-interview data hosted?",
  "channel": "teams",                  // teams | slack
  "audience": "vendor_owner",          // business_process_owner | application_owner | vendor_owner
  "recipient": "Procurement — Vendor Risk",
  "status": "answered",                // draft | sent | answered
  "aiGenerated": true,
  "createdAt": "…", "sentAt": "…", "answeredAt": "…",
  "response": "DPA was signed on the 3rd. …"   // null until answered
}
```

Labels: channel `teams` = Microsoft Teams, `slack` = Slack. Audience labels: Business process
owner, Application owner, Vendor owner. Default recipient names in the composer: owner = the
submitter; app owner = "Application owner"; vendor = "Vendor owner".

## Agent tool inputs (zod, `lib/agent/schemas.ts`)

```ts
proposeChange({
  changeType: 'field' | 'relationship',
  fieldKey?: FieldKey,            // field changes
  after?: string,                 // field changes: new value, plain text
  relAction?: 'added' | 'removed',// relationship changes
  relType?: 'vendor' | 'asset' | 'personalData',
  relName?: string,
  reason: string,                 // one short plain-English sentence in the owner's words
})

submitForReview({
  summary: string,                // plain-English recap, or note that nothing changed
  ownerNote?: string,
  reassignOwnershipTo?: string,   // team name if ownership should move (see quirks: not persisted)
})
```

Both are **client-interaction tools** (no server `execute`). The client renders a card and returns
the outcome string:

| Tool | Outcome string returned to the model |
|---|---|
| `proposeChange` accepted | `ACCEPTED: <description>` |
| `proposeChange` rejected | `REJECTED by owner — do not include this change.` |
| `submitForReview` | `SUBMITTED to privacy analyst with N change(s).` |

## Record fields recertification touches on commit

`relationships`, `fieldMeta`, any of the 12 field keys, `lastReviewedAt`, `nextReviewAt`,
`status`, `updatedWithAI`, `updatedAt`. Relationship shape on the record:

```jsonc
{ "id": "rel-abc", "type": "vendor", "name": "HireVue", "inventoryId": null,
  "provenance": "manual", "status": "accepted" }
```

## Generation endpoints

| Endpoint | Input | Output | Fallback |
|---|---|---|---|
| `POST /api/agent/recertify` | `{ messages, record }` | UI message stream with the two tools | n/a (model `openai/gpt-4.1-mini`, `maxDuration 60`, `stepCountIs(6)`) |
| `POST /api/recert/questions` | `{ record }` | `{ questions: [{ prompt, why }] }` (3 to 4) | 4 canned questions: ownership, personal data, vendors/systems, purpose |
| `POST /api/recert/summary` | `{ record }` | `{ summary, changesSinceReview: string[] }` (2 to 4 items) | deterministic summary from purpose, vendors, data |
| `POST /api/recert/follow-ups` | `{ record, submission }` | `{ followUps: [{ question, audience, channel, rationale }] }` (2 to 4) | rule-based, see `analyst-review.md` |

All generation uses `generateText` with `Output.object` and a zod schema; each falls back to a
deterministic result on error so the demo always renders something.
