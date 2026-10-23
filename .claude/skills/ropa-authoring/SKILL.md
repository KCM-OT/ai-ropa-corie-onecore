---
name: ropa-authoring
description: Create a GDPR Article 30 Record of Processing Activity (RoPA) through conversation or from a source document (project brief, vendor contract/DPA, DPIA, intake form, SOP, email). Handles controller and joint-controller records (Art. 30(1), Art. 26) and processor records (Art. 30(2)) for processing carried out on behalf of clients, owned by a specific group subsidiary. Use when the user wants to draft, create, or document a processing activity, build a RoPA entry, create a processor or joint-controller record, or turn a description of what a team does with personal data into an Article 30 record.
---

# RoPA Authoring

Help a business user create a complete, defensible GDPR Article 30 processing-activity record
through natural conversation — no forms, no jargon. Every value is evidence-backed and
confidence-scored, and a human always reviews the draft before it is treated as final.

Logic extracted from the Cartographer / AI RoPA Studio prototype
(`KCM-OT/AI-RoPA-Studio-solera-group`).

## Reference files

Read these when you reach the step that needs them:

- `references/fields.md` — controller (Art. 30(1)) attributes, labels, display order, allowed legal bases, completeness formula, record JSON shape
- `references/processor-mode.md` — how to decide the role, plus processor (Art. 30(2)) fields, extraction cues, checks and assessment ownership
- `references/extraction-rules.md` — how to extract values, calibrate confidence, classify relationships, flag special-category data
- `references/posture-rules.md` — risk conditions, review-cadence tiers, and assessment triggers (PIA/LIA/TIA/PbD/AI Risk)
- `templates/ropa-record.md` — controller output layout
- `templates/ropa-processor-record.md` — processor output layout
- `scripts/ropa_check.py` — deterministic checks (completeness, validation, posture, inventory matching, duplicates) for both record types. Always run it; don't compute these by hand.
- `assets/inventory.example.json`, `assets/posture.default.json` — sample inventory and default posture config. If the user has their own inventory or posture config, use theirs instead.

## Workflow

### 1. Gather the description
- Ask for a plain-English description of what the team does with people's data, or accept a pasted/attached document. If a file is attached (.docx, .pdf, .rtf, .txt), read its text.
- Talk like a helpful colleague. One or two friendly questions at a time — never a wall of questions.

### 2. Decide the role and the owning entity
These match the prototype's `role` and `subsidiaryId` fields (see "Prototype mapping" in
`references/fields.md`).

**Role.** Work out which of the three roles the owning entity plays:
- **Controller** (`"controller"`): it decides why and how the data is used.
- **Joint controller** (`"joint_controller"`): it decides that jointly with another entity, such as
  another company in the group (Art. 26).
- **Processor** (`"processor"`): it handles the data for a client, on that client's instructions.

Use the cue table in `references/processor-mode.md`. If it's unclear, ask one plain question, for
example: *"Do you decide why this data is used, or do you handle it for a client, following their
instructions?"* If one description covers more than one role (for example, a SaaS company's own CRM
plus the platform it runs for clients), split it into separate records.

**Owning entity.** Ask which group entity owns the activity, for example: *"Which group entity
owns this activity?"* Refer to it as the "group entity", not the "group company". Match it to a
subsidiary in the inventory's `subsidiaries` list. Prefer a legal entity over a regional grouping,
because controllers and processors are legal entities. Don't guess the entity.

Tell the user which role and entity you've recorded and why, in one sentence. Set `role`,
`subsidiaryId` and a short `roleDetail` (e.g. "Processor on behalf of enterprise SaaS clients",
"Joint controller with Solera Group under Art. 26") in the draft JSON.

### 3. Extract a draft
As soon as the user has described the activity in any detail, extract structured fields following
`references/extraction-rules.md`, plus `references/processor-mode.md` for processor records. For
each field record: value, confidence (0–1), a short **verbatim** evidence quote, and a one-sentence
rationale. Also extract relationships (vendors, assets, personal-data categories). In a processor
record, vendors are **sub-processors**.

**Never fabricate.** If the narrative doesn't support a field, leave it out — a missing field is a
signal to ask a follow-up, not to guess.

Write the draft to a JSON file in the shape shown in `references/fields.md` (controller and joint
controller) or `references/processor-mode.md` (processor).

### 4. Run the checks
```bash
python3 scripts/ropa_check.py draft.json \
  --inventory assets/inventory.example.json \
  --posture assets/posture.default.json \
  [--existing existing-records.json]
```
The script reads `role` and reports: the owning entity and its place in the group, completeness %,
confidence band per field, validation warnings, unresolved inventory relationships, possible
duplicates (processor records are compared only with processor records), active risk conditions,
required assessments (with an owner for processor records), and review cadence.

`completeness` uses the same formula as the prototype's dashboard: processors are scored on the
seven Art. 30(2) items, every other role on the Art. 30(1) formula.

If a possible duplicate is reported (similarity ≥ 0.16), tell the user and ask whether to create a
new record, enrich the existing one, or create a local variation of it.

### 5. Close the gaps
Briefly tell the user what you captured and what is still thin or missing. Prioritise follow-ups on:

**Controller and joint-controller records**
1. Missing core fields (from the script's `gaps` list), including the owning entity
2. Low-confidence fields (< 0.6) — ask the user to confirm
3. Validation warnings — especially legal basis, retention period, cross-border transfer destination and safeguards, automated decisions, and the Art. 9 condition for special-category data
4. Controller / DPO contact details (Art. 30(1)(a))
5. Joint controllers only — each joint controller's name and contact details, and the Art. 26 arrangement

**Processor records**
1. Missing required items — the owning entity, processor details, each controller's name and contact, categories of processing, transfers, security measures
2. Low-confidence fields (< 0.6)
3. Validation warnings — transfer destination and safeguard, per-controller processing categories, special-category data
4. Good practice — the DPA reference and sub-processor authorisation (Art. 28)

When the user adds detail, re-extract from the **full** combined narrative, update the JSON, and
re-run the script.

### 6. Propose the record
When the record is reasonably complete, render it once using the matching template, including
confidence bands, the posture outcome (required assessments, their owners for processor records,
and review cadence), and any remaining gaps. Then stop and let the user decide.

Make clear that this is a **draft for human review** — you cannot commit it to the inventory.
For processor records, also make clear that the record doesn't replace the client's own
Art. 30(1) record. Offer to export it (Word via the docx skill, spreadsheet via the xlsx skill,
or Markdown).

## Rules
- Only extract what the user or document actually says. Unknown = gap, not a guess.
- In controller records, `legalBasis` must be one of the six Art. 6 bases in `references/fields.md`.
- In processor records, don't set a legal basis, purpose or retention period as the processor's own. Those are the controller's decisions.
- Never invent controller or joint-controller entries. For a service with many clients, point to a maintained customer register instead (see `references/processor-mode.md`).
- Use the prototype's field names and role values (`role`, `subsidiaryId`, `roleDetail`) so drafts map straight onto its records.
- Evidence must be a short verbatim quote from the source.
- Keep prose short. The structured record does the heavy lifting.
- Flag special-category (Art. 9) data prominently whenever it appears.
- Use the script for all scoring and rule evaluation so results match the prototype exactly.

## Beyond the prototype
The prototype now has the joint-controller and processor fields, but still omits a couple of
Article 30 items. Ask for these too, and mark them as gaps if unknown:
- **Art. 30(1)(a)** — name and contact details of the controller (and any representative and DPO),
  recorded as `controllerDetails`
- **Art. 30(1)(e)** — the destination country of each transfer, and for transfers under
  Art. 49(1) second subparagraph, documentation of suitable safeguards
