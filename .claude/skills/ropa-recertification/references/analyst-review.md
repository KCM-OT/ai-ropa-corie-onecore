# Analyst review

Source: `components/review/review-queue.tsx`, `components/review/review-detail.tsx`,
`lib/store.tsx` (`commitSubmission`), `lib/recert.ts` (`applySubmission`),
`app/api/recert/*`.

## Review queue (`/review`)

Title "Recertification review": *Change submissions from business process owners waiting for
privacy operations sign-off before they hit the inventory.*

Three stat tiles: **Awaiting your review** (open submissions), **Follow-ups out** (follow-ups with
status `sent`), **Completed** (approved or committed).

- **Needs review:** `pending_review` and `changes_requested`. Empty state: "Queue is clear".
- **Recently completed:** `approved` and `committed`, shown muted.

Each row shows: an icon (green check for approved-as-is, pencil for modified), record name, a
status badge, `Recertified as accurate — no changes` or `N change(s) proposed`, submitter, date,
and follow-up state (`N awaiting reply`, or `N answered` when none are open).

## Review detail (`/review/[id]`)

Header: record name, "Submitted by {name} ({role}) on {date}", **Open record** button.
If the submission or record is missing: "Review not found" with a back link.

Left column:
1. **AI review summary**: **Summarize activity** button (becomes **Regenerate**). Explains what the activity does and what changed since the last review.
2. **What the owner told us**: the owner note as a quote (hidden if empty).
3. **Record with proposed changes**: every field in display order. Changed fields show before (red, struck) → after (green). Unchanged fields show the current value or "Not documented". Below, **Relationship changes** grouped into Personal data, Vendors, Systems & assets, each as a green `+` or red `−` chip. Added items with `inventoryId = null` get a **new to inventory** badge. Badge in the header: `N change(s)` or `No changes`.

Right column:
4. **Decision** card
5. **Follow-up questions** card

## AI review summary

Write a short, concrete summary for a privacy analyst: what the activity does, naming the actual
vendors, systems and data categories, then what changed since the last review or what needs
verifying. For a non-expert owner version use `/api/recert/summary` (2 to 3 sentences plus 2 to 4
bullets). If you cannot generate, the deterministic fallback is:

> `{name}` exists to `{purpose, lower-cased}`. It relies on `{up to 3 vendors, else "internal systems"}` and processes personal data such as `{up to 3 data categories, else "contact details"}`.

Bullets: last reviewed date (or "has not been formally reviewed before"), and prompts to confirm
vendors and systems, personal data, and ownership.

## Follow-up questions

Analysts ask clarifying questions in the tools people already use.

- **Audience:** business process owner, application owner, vendor owner
- **Channel:** Microsoft Teams or Slack
- **Lifecycle:** `draft → sent → answered`; `sentAt` and `answeredAt` stamped; `response` holds the reply
- **Sources:** AI "Suggest" (`aiGenerated: true`) or a manual composer (`aiGenerated: false`)
- Consolidated responses stay on the submission so the analyst sees owner, app and vendor answers together

### Routing rules (what the AI and the fallback do)

| Change in the submission | Question | Audience | Channel |
|---|---|---|---|
| Vendor **added** | "A new vendor "{name}" was added. Is there a signed DPA, and where is data hosted?" Rationale: new processors need a DPA and transfer review. | vendor owner | Teams |
| Personal data **removed** | "You removed "{name}". Has all historical data of this type been deleted or is it still retained anywhere?" Rationale: removing a field from collection does not mean retained data is purged. | business process owner | Slack |
| Personal data **added** | "You added "{name}". What is the legal basis for collecting this, and for which data subjects?" Rationale: new data can change the legal basis and required assessments. | business process owner | Slack |
| No changes at all | "Can you confirm nothing about the systems, vendors, or data has changed since last year?" Rationale: an approve-as-is submission still benefits from a quick confirmation. | business process owner | Teams |

Return 2 to 4, specific to the actual changes. Never ask generic questions when specific ones
exist. Extra judgement beyond the fallback: an added **asset** (where is it hosted, who owns it →
application owner), a removed **vendor** (confirm the contract and data return or deletion →
vendor owner), a retention shortening (confirm deletion jobs ran), and a legal-basis or transfers
change (confirm the supporting assessment).

### Open follow-ups
`sent` follow-ups are counted. The Decision card warns: "{N} follow-up(s) still awaiting a reply.
You can still commit, but you may want to wait for answers." It never blocks.

## Decision

**Approve & commit to inventory** (primary) and **Send back to owner** (secondary).

If already committed the card shows "Committed to the inventory — These changes are now part of the
official RoPA."

### Send back
Sets `status: 'changes_requested'` and logs `review_scheduled`:
`Sent recertification back to {owner} for changes.` The record is untouched.

### Commit: exactly what changes (`applySubmission` + `commitSubmission`)

1. **Relationships** start from the current list.
   - `removed`: drops any relationship with the same `type` and lower-cased, trimmed `name`.
   - `added`: appends `{ id: rel-…, type, name, inventoryId, provenance: 'manual', status: 'accepted' }` unless one with the same type and name already exists.
2. **Attributes:** each `fieldChange.after` is written to the record. `dataSubjectCategories` is split on commas, trimmed, empties dropped. Every changed key gets `fieldMeta[key] = { provenance: 'manual' }` (no confidence, no evidence).
3. **Review clock:** `lastReviewedAt = now`; `nextReviewAt = now + (record.reviewCadenceDays ?? 180) days`.
4. **Status:** `active`.
5. **Flags:** `updatedWithAI = true`, `updatedAt = now`.
6. **Submission:** `status = 'committed'`.
7. **Audit log:** `review_completed` (see `lifecycle.md`).
8. Router returns to `/review`.

An approved-as-is submission commits with no attribute or relationship changes, but still
refreshes the dates and status. That is the "stamp a fresh certification date" behaviour.

### Things a commit does not do (so do them or flag them)
- Does not re-resolve the cadence from the posture rules (it reuses the stored `reviewCadenceDays`).
- Does not re-evaluate required assessments or risk conditions.
- Does not create inventory entries for relationships with `inventoryId = null`; they are stored as unresolved names.
- Does not change role, owning entity or processor/joint-controller details.
- Does not clear or answer open follow-ups.

## Analyst checklist

1. Read the owner's note first.
2. Review each diff: is the new value specific and complete, or vague ("until no longer needed")?
3. Check every **new to inventory** item and decide whether to add it to the inventory.
4. Probe using the routing rules and wait for critical answers (new vendor DPA, special-category data).
5. Ask whether any change moves the record into a new risk tier (see `cadence-and-triggers.md`).
6. Commit, or send back with a clear reason.
7. After commit, re-run posture and raise any new assessment.
