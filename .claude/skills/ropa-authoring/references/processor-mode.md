# Processor mode (Article 30(2))

Use this mode (`"role": "processor"`) when the owning entity processes personal data **on behalf
of** another organisation (the controller) and follows that organisation's instructions.

The fields, completeness score and assessment owners below match the prototype's processor
records (`lib/types.ts`, `lib/ropa.ts`, `lib/posture.ts`).

## Deciding the role

Each record has one of the prototype's three roles: `controller`, `joint_controller` or
`processor`. The same entity can be a controller for some activities (such as its own payroll) and
a processor for others (such as a service it runs for clients). Decide per activity.

| Cues pointing to **processor** | Cues pointing to **controller** | Cues pointing to **joint controller** |
|---|---|---|
| "on behalf of our clients / customers", "for our customers" | "our employees", "our customers' accounts with us" | "jointly decide", "shared system run with…" |
| "on their instructions", "as instructed by the client" | "we decide", "we use the data to…" | Another group company or partner sets purposes together with us |
| "the client is the controller", "we are the processor" | Own marketing, HR, finance, security | "joint controller", "Art. 26 arrangement", "data sharing agreement" between equals |
| The source is a DPA / Art. 28 contract where this entity is the processor or vendor | The source is a DPA where this entity is the customer | Group-wide systems (a shared HRIS, a shared CRM) used for each company's own purposes |
| Hosting, outsourced payroll, support desk, SaaS platform run for others | Decides the purposes, or the means beyond technical details | |

If the cues are mixed or missing, ask one plain question, for example: *"Do you decide why this
data is used, or do you handle it for a client, following their instructions?"*

**Within a corporate group**, one group company often runs a system for the others. It's a
processor if the others decide the purposes and it only follows their instructions. It's a joint
controller if it decides the purposes together with them.

For **joint control** (Art. 26), set `"role": "joint_controller"` and record the other
controllers in `jointControllers` and the arrangement in `jointArrangement` (see `fields.md`).

## Fields

| Key | Label | Art. 30(2) | Required |
|---|---|---|---|
| `name` | Record name | — | Yes |
| `description` | Description of the service | — | Yes |
| `processorDetails` | Processor name & contact details, including any representative and DPO | (a) | Yes |
| `controllers` | Each controller acted for: `name`, `contact`, optional `representative`, `dpo`, `processingCategories` | (a) | Yes (≥ 1) |
| `processingCategories` | Categories of processing carried out (e.g. hosting, payroll calculation, customer support) | (b) | Yes, as a shared list or per controller |
| `internationalTransfers` | Transfers to third countries or international organisations: name the destination and the safeguard, or "None" | (c) | Yes |
| `securityMeasures` | General description of technical and organisational measures (Art. 32(1)) | (d) | Yes |
| `dataSubjectCategories` | Whose data it is | — | Good practice |
| `dpaReference` | The Art. 28(3) contract / DPA governing the processing | — | Good practice |
| `managingOrganization`, `businessProcessOwner`, `jurisdiction` | As in controller records | — | Optional |

Completeness is the share of the seven required items that are filled, the same as
`processorCompleteness()` in the prototype's `lib/ropa.ts`.

**Relationships** work as in controller mode. A `vendor` relationship in a processor record is a
**sub-processor**. Personal-data relationships still drive the special-category check.

**Don't record** a legal basis, purpose or retention period as the processor's own decisions. The
controller makes those. If the source mentions them, note them as "per controller's instructions".
Values that already defer to the controller (e.g. "Per client DPA; deleted or returned at contract
end") pass without a note.

**Owning entity:** `subsidiaryId` is the group company acting as processor. Its name is usually
the start of `processorDetails`.

### Many controllers
For a service offered to many clients, it's usually impractical to list each one in the record.
It's acceptable to add a single controller entry that points to a maintained register, for
example `{"name": "All clients under the standard MSA", "contact": "Customer register in CRM"}`.
The record must still be able to produce each controller's details if a supervisory authority
asks. Say this to the user rather than inventing entries.

### Record JSON shape
```json
{
  "role": "processor",
  "subsidiaryId": "sub-uk",
  "roleDetail": "Processor on behalf of payroll clients (multiple controllers)",
  "name": "Managed payroll processing for clients",
  "description": "Monthly payroll run for client companies on their instructions.",
  "status": "draft",
  "processorDetails": "Acme Payroll Services Ltd, 1 High St, London; privacy@acme.example; DPO: dpo@acme.example",
  "controllers": [
    {
      "name": "Northwind GmbH",
      "contact": "legal@northwind.example",
      "dpo": "dpo@northwind.example",
      "processingCategories": ["Payroll calculation", "Payslip distribution"]
    }
  ],
  "processingCategories": ["Payroll calculation", "Payslip distribution", "Year-end tax filings"],
  "internationalTransfers": "Support access from India under SCCs (Module 3)",
  "securityMeasures": "Encryption at rest and in transit, SSO, MFA, audit logging",
  "dataSubjectCategories": ["Client employees"],
  "dpaReference": "DPA v2.1, Schedule 3 of the MSA",
  "fieldMeta": {
    "processorDetails": { "provenance": "ai", "confidence": 0.9, "evidence": "verbatim quote", "rationale": "…" }
  },
  "relationships": [
    { "type": "vendor", "name": "Amazon Web Services", "confidence": 0.9, "evidence": "…", "rationale": "Hosting sub-processor.", "status": "suggested" },
    { "type": "personalData", "name": "Financial account data", "confidence": 0.87, "evidence": "…", "rationale": "…", "status": "suggested" }
  ]
}
```
A per-controller `processingCategories` list overrides the shared list for that controller.

## Extraction cues
| Field | Look for |
|---|---|
| processorDetails | "Processor:", "Supplier:", "Service provider:", the vendor party in a DPA, DPO contact |
| controllers | "Controller:", "Customer:", "Client:", the customer party in a DPA |
| processingCategories | "Services", "Scope of processing", "Nature of processing", DPA Annex / Schedule 1 |
| internationalTransfers | "Processing locations", "Sub-processor locations", SCC module references (Module 2 or 3) |
| securityMeasures | "Technical and organisational measures", "TOMs", DPA security annex |
| sub-processors | "Sub-processors", "Authorised sub-processors", sub-processor list annex |

Apply the same confidence levels and no-fabrication rules as `extraction-rules.md`.

## Checks the script runs for processor records
- Each controller has contact details
- With several controllers, processing categories are recorded for each
- Transfers name both a destination and a safeguard
- An informational note if a legal basis, purpose or retention period has been set
- An informational note if no DPA is referenced (Art. 28(3))
- Sub-processors are listed with a reminder about controller authorisation (Art. 28(2) and 28(4))
- Special-category data: confirm the controller's instructions cover it and that security reflects the higher risk
- AI keywords: confirm whether the service supports decisions about individuals (Art. 22)

## Posture in processor mode
The same risk conditions and cadence rules apply as for controllers, except that
`legitimateInterests` never fires: a processor has no lawful basis of its own, and the Art. 6(1)(f)
balancing test is the controller's. Each required assessment gets an **owner** (same wording as the
prototype's `PROCESSOR_ASSESSMENT_OWNER`):

| Assessment | Owner |
|---|---|
| PIA / DPIA | Controller — processor assists (Art. 28(3)(f)) |
| LIA | Controller |
| TIA | Processor — for its own onward transfers to sub-processors |
| PbD, AI Risk | Processor — internal review of the service |
