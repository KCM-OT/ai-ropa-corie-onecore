# ropa-authoring — Claude Code skill

A [Claude Code](https://code.claude.com) skill that drafts GDPR Article 30 Records of Processing
Activity through conversation or from a source document. It uses the prototype's three roles,
**controller**, **joint controller** (Art. 26) and **processor** (Art. 30(2)), and records which
group company (`subsidiaryId`) owns each record.

The skill packages the authoring logic from this prototype: the extraction rules, confidence
scoring, completeness, duplicate detection and posture rules (PIA/LIA/TIA/PbD/AI Risk triggers and
review cadence). It's independent of the Next.js app, and nothing in the app imports it.

## Using it

**In this repo:** open Claude Code anywhere in the repository. The skill loads automatically from
`.claude/skills/`. Then ask, for example:

> Help me create a RoPA record for our candidate screening process

or type `/ropa-authoring`. You can also attach a DPA, DPIA, project brief or intake form and ask
for a record to be drafted from it.

**In every project:** link the skill into your personal skills folder:

```bash
ln -s "$(pwd)/.claude/skills/ropa-authoring" ~/.claude/skills/ropa-authoring
```

Pull the repo to get updates.

Every draft is for human review. The skill doesn't save records anywhere.

## What's inside

| Path | Purpose |
|---|---|
| `SKILL.md` | The workflow Claude follows (entry point) |
| `references/fields.md` | Controller (Art. 30(1)) fields, legal bases, completeness formula |
| `references/processor-mode.md` | Choosing controller vs processor, processor (Art. 30(2)) fields and checks |
| `references/extraction-rules.md` | Confidence calibration, label aliases, relationship types, special-category cues |
| `references/posture-rules.md` | Risk conditions, assessment triggers, review cadence |
| `templates/` | Output layouts for controller and processor records |
| `scripts/ropa_check.py` | Scoring and checks (Python 3, standard library only) |
| `assets/inventory.example.json` | Sample vendors/assets/data categories (the prototype's demo data) |
| `assets/posture.default.json` | Default posture rules (from `lib/seed.ts`) |
| `examples/` | Sample controller, joint-controller and processor drafts to try the checks script on |

## Running the checks directly

```bash
cd .claude/skills/ropa-authoring
python3 scripts/ropa_check.py examples/controller-draft.json \
  --inventory assets/inventory.example.json \
  --posture assets/posture.default.json
```

## Keeping it in step with the prototype

The app now runs on this skill. `lib/agent/ropa-skill.ts` loads `SKILL.md` and the reference
files into the authoring agent at runtime, so edits to them reach the app on the next deploy. Keep
the workflow's step numbers stable, because the app's prompt refers to them.

`scripts/ropa_check.py` can't run in the app, so `lib/ropa-check.ts` is a TypeScript port of it.
**Change both together**, then run the parity test from the repo root:

```bash
npm run test:ropa-parity
```

It runs the script and the port on the seed records, these examples and edge cases, and fails on
any difference. It also checks both against the app's own `lib/ropa.ts` and `lib/posture.ts`.

Roles and owning entities follow `lib/types.ts` (`ProcessingRole`, `Subsidiary`) and `lib/org.ts`.
The sample organisation structure in `assets/inventory.example.json` is copied from `SUBSIDIARIES`
in `lib/seed.ts`. The joint-controller and processor (Art. 30(2)) fields, the role-aware
completeness score and the processor assessment owners all match the prototype. The only field
the skill adds is `controllerDetails` (Art. 30(1)(a)). See "Prototype mapping" in
`references/fields.md`.

## Customising
- Replace `assets/inventory.example.json` with your organisation's real group structure,
  vendors, systems and personal-data categories.
- Adjust `assets/posture.default.json` to change assessment triggers or review cadences.
