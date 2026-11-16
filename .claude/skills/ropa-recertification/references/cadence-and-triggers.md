# Cadence, due dates and triggers

Source: `lib/ropa.ts` (`reviewState`), `lib/posture.ts` (`resolveCadence`, `requiredAssessments`),
`DEFAULT_POSTURE` in `lib/seed.ts`, `components/maintenance/maintenance-queue.tsx`,
`components/settings/posture-settings.tsx`. Risk conditions and assessment triggers are documented
in full in `.claude/skills/ropa-authoring/references/posture-rules.md`; this file covers how they
drive recertification.

## Review state

`reviewState(record)`:

| State | Rule |
|---|---|
| `none` | no `nextReviewAt` (never reviewed, or draft) |
| `overdue` | `nextReviewAt` is in the past (days < 0) |
| `due_soon` | `nextReviewAt` within the next 30 days |
| `ok` | otherwise |

The **maintenance queue** buckets every record into overdue, due soon, on track, and separately
lists **incomplete** records (completeness below 70). Records with state `none` fall in on-track
in the queue's split, so call them out separately when reporting.

## Review cadence tiers

`resolveCadence(record, posture, inventory)` evaluates `posture.cadenceRules` **in order**; the
first enabled rule whose conditions match wins; otherwise `defaultCadenceDays`.

Default (`DEFAULT_POSTURE`):

| Order | Tier | Logic | Conditions | Cadence |
|---|---|---|---|---|
| 1 | High-risk activities | any | specialCategory, automatedDecisions, systematicMonitoring | **180 days** |
| 2 | Elevated (transfers / large-scale) | any | internationalTransfer, largeScale, vulnerableSubjects | **270 days** |
| – | Default | | | **365 days** (annually) |

`requireCertification: true` means the business owner must certify at each review. Cadence labels:
multiples of 365 days read "Annually" / "Every N years"; multiples of 30 read "Monthly" / "Every N
months"; otherwise "Every N days". Presets in the editor include Quarterly (90d) and
Semi-annually (180d).

## Risk conditions (what can move a record between tiers)

`specialCategory`, `internationalTransfer`, `legitimateInterests`, `automatedDecisions`,
`largeScale`, `systematicMonitoring`, `vulnerableSubjects`, `newActivity`. They are evaluated
from the record's text (name, description, purpose, data subjects), its legal basis, transfers,
status and age, and its non-rejected personal-data relationships against the inventory. Keyword
matching is plain substring matching and can over-trigger (for example "ai" inside "maintain").
Treat hits as prompts to confirm.

## Assessment triggers (default)

| Assessment | Required when any of |
|---|---|
| PIA / DPIA | specialCategory, largeScale, systematicMonitoring, automatedDecisions, vulnerableSubjects |
| LIA | legitimateInterests |
| TIA | internationalTransfer |
| PbD (Privacy by Design review) | newActivity, specialCategory, automatedDecisions |
| AI Risk Assessment | automatedDecisions |

## When a recertification change should trigger action

Use this table in step 9 and step 12 of the workflow. It is **analyst guidance**; the app does not
do any of it automatically.

| Change in the submission | Likely new condition | What to raise |
|---|---|---|
| Added personal data such as health, biometric, racial or ethnic, genetic, religious, political, sexual orientation or trade-union data | `specialCategory` | PIA/DPIA and PbD review; move to the 180-day tier |
| `internationalTransfers` changed to a real transfer, or a vendor hosted outside the region added | `internationalTransfer` | TIA; the 270-day tier (unless already 180) |
| `legalBasis` changed to Legitimate interests | `legitimateInterests` | LIA |
| Purpose, description or tools now mention AI, scoring, profiling or automated decisions | `automatedDecisions` | PIA/DPIA, PbD, AI Risk Assessment; 180-day tier |
| Monitoring, tracking or behavioural analytics added | `systematicMonitoring` | PIA/DPIA; 180-day tier |
| Data subjects now include children, students, patients | `vulnerableSubjects` | PIA/DPIA; 270-day tier |
| Large-scale wording added (all customers, millions) | `largeScale` | PIA/DPIA; 270-day tier |
| New vendor added | not a condition by itself | DPA check; check the vendor's hosting for transfers |
| Special-category data removed, or monitoring ended | conditions may clear | Consider lengthening cadence; do not shorten the history |

To re-evaluate: apply the commit preview from `scripts/recert_check.py --emit-record`, then run
`ropa-authoring/scripts/ropa_check.py` with the posture config on the result.

## Timing a recertification

- Next review after commit: `commit time + reviewCadenceDays` (default 180 if the field is null).
- If the cadence tier has changed, set `reviewCadenceDays` to the new tier before the commit so the new date is right. The app has no UI for this in the review screen; change it in the record's governance settings.
- Early recertification is allowed; it simply resets the clock from the commit time.

## Posture settings an admin can change

`/settings` → posture: default cadence, **Require business certification** toggle, ordered
cadence tiers (label, logic any/all, conditions, days, enabled), and assessment rules (type,
logic, conditions, note, enabled). Changing these changes future cadence resolution and
required assessments; it does not retroactively rewrite `nextReviewAt` on existing records.

The posture dashboard in settings also shows an "open items" KPI where `overdueCount` is computed
as records in status `under_review` or `draft` (a proxy, not the same as `reviewState === 'overdue'`).
Be careful quoting that number as "overdue recertifications".
