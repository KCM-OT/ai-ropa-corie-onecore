---
name: ropa-recertification
description: Run, review, explain or configure the recertification (re-certification, annual check-in, "recertify") process for GDPR Article 30 Records of Processing Activity. Covers the business process owner's guided check-in (chat or document view), proposing before/after changes, submitting to a privacy analyst, AI review summaries, follow-up questions over Teams or Slack, approving or sending back, committing to the inventory and resetting the review cadence, plus how due dates, overdue states and risk-based cadence tiers are decided. Use when the user wants to recertify a record, prepare or review a recertification submission, decide what to ask an owner, work out when a record is due, explain how the recertify flow works, or change the recertification code or settings.
---

# RoPA Recertification

Recertification is the recurring, human-in-the-loop check that a GDPR Article 30 record still
reflects reality. A **Business Process Owner** confirms (or corrects) the record in plain English.
A **Privacy Operations Analyst** reviews what they said and decides whether to commit it. Only then
does the permanent inventory change and the review clock restart.

Logic extracted from the Cartographer / AI RoPA Studio prototype
(`KCM-OT/AI-RoPA-Studio-solera-group`). It is the companion to `ropa-authoring`: that skill creates
records, this one keeps them accurate.

## Reference files

Read these when you reach the step that needs them:

- `references/lifecycle.md` — the end-to-end flow, roles, submission states and who can do what
- `references/data-model.md` — `ChangeSubmission`, `FieldChange`, `RelationshipChange`, `FollowUpQuestion`, the 12 changeable field keys, JSON shapes
- `references/owner-chat-agent.md` — the owner conversation: fixed 7-topic sequence, exact wording, the `proposeChange` / `submitForReview` tools, ownership hand-off
- `references/document-view.md` — the alternative section-by-section review, scanning an updated document for differences, and the approval-gated example page
- `references/analyst-review.md` — the review queue, AI review summary, follow-up questions and routing, the decision, and exactly what a commit does
- `references/cadence-and-triggers.md` — how a record becomes due, overdue states, risk-based cadence tiers, and when a change should trigger new assessments
- `templates/recertification-submission.md` — owner-facing recap layout
- `templates/analyst-review-brief.md` — analyst-facing review brief layout
- `scripts/recert_check.py` — deterministic checks on a submission (validation, stale "before" values, decision consistency, commit preview, follow-up suggestions, posture hints). Always run it; do not compute these by hand.
- `examples/` — a record plus a modified and an approved-as-is submission to try the script on

Related: `.claude/skills/ropa-authoring` (field definitions, completeness, posture rules, `ropa_check.py`).

## Principles (never break these)

1. **A human decides.** The agent proposes; the owner accepts, edits or rejects each change; the analyst commits. Never write a change into the inventory yourself, and never describe a submission as approved before the analyst has approved it.
2. **No answer, no change.** Never propose a change the owner did not confirm. If a topic is unchanged, move on.
3. **Plain English.** The owner is not a privacy expert. No legal or technical jargon in owner-facing text.
4. **One topic and one change at a time.** One question per turn, in the fixed sequence. One before/after card per change.
5. **Everything is auditable.** Every change carries a before value, an after value and a reason in the owner's words.
6. **Certify even when nothing changed.** "Still accurate" is a valid outcome (`approved_as_is`) and still resets the review date after approval.

## Workflow

### 1. Identify the mode and the record
Work out what the user wants:
- **Recertify a record** (owner side) → steps 2 to 7
- **Review a submission** (analyst side) → steps 8 to 11
- **Check what is due** → step 2 and `references/cadence-and-triggers.md`
- **Explain or change the feature** → `references/lifecycle.md`, then the code map below

Get the record (JSON in the app's `ProcessingActivity` shape, see `references/data-model.md`). If
the user only describes it, offer to draft it with `ropa-authoring` first. Do not recertify a
record that does not exist.

### 2. Decide whether it is due
A record is **overdue** when `nextReviewAt` is in the past, **due soon** within 30 days, **ok**
otherwise, and **none** when it has no `nextReviewAt` (never reviewed or draft). Report the state
and the cadence that applies (`references/cadence-and-triggers.md`). Owners can also start a
recertification early from the record page; do not refuse because a record is not yet due, just say
so.

### 3. Open warmly and orient the owner
One sentence: what the record is, in everyday words, who owns it, and when it was last recertified
(or "never"). Say you are not the final approver: a privacy analyst reviews everything.
Use `templates/recertification-submission.md` for the recap at the end, not the opening.

### 4. Walk the seven topics in fixed order
Ask exactly one simple question per topic, wait, confirm what you heard, then continue. Never skip
ahead and never combine topics. The sequence (full wording in `references/owner-chat-agent.md`):

1. Ownership
2. Tools and systems (vendors and assets)
3. Personal data
4. Purpose and legal basis
5. Retention
6. Transfers and jurisdictions
7. Security and recipients

If the owner answers **No** to any confirmation, stop the sequence and ask exactly:
**"Please tell us what has changed"**. Treat their next answer as the change description.

### 5. Turn each confirmed change into a before/after card
Once the owner has described a change, produce **one change per card**:
- **Attribute change** (retention, owner, purpose, legal basis, transfers, security, recipients, jurisdiction, data subjects): field key, current value, proposed value, one-sentence reason.
- **Relationship change** (vendor, system/asset, personal-data category added or removed): action, type, name, reason.

The owner can **apply**, **edit then apply** (attribute changes only; list-like fields such as
data subjects, jurisdiction and recipients are edited as chips) or **skip**. A skipped card is
excluded from the submission. Never call a bare "No" a change: ask the follow-up first, unless
the new value was already given in the same answer.

### 6. Handle an ownership transfer
If the owner says their team no longer runs the process **and** names the new owner (in the same
answer or in reply to "Please tell us what has changed"), do not propose a change yet. Ask exactly:
*"Would you like to pause this recertification and have me reach out to {newOwnerName}'s team?"*
- **Yes** → say you have paused it and will contact that team. Stop. No change is proposed and nothing is submitted.
- **No** → propose the `businessProcessOwner` change as a normal card and continue the sequence.

### 7. Build and send the submission
When ownership, tools and systems, personal data and retention have been covered and nothing is
left to ask, summarise in plain English what is changing (or that nothing changed) and ask the
owner to send it to the privacy analyst. Build the `ChangeSubmission` per `references/data-model.md`:
`decision` is `modified` if there is at least one accepted change, otherwise `approved_as_is`;
`status` is `pending_review`; `followUps` is `[]`.

Then **run the check script** and fix any errors before treating it as ready:

```bash
cd .claude/skills/ropa-recertification
python3 scripts/recert_check.py examples/submission-modified.json \
  --record examples/record-recruitment.json
```

Tell the owner what happens next: a privacy analyst will review it and nothing reaches the
inventory until they approve it.

### 8. (Analyst) Open the submission
Show who submitted, their role and when. Surface the owner's own note first (it is the owner's
voice), then the record with changes highlighted: each attribute as before → after, each
relationship as added or removed, with a "new to inventory" flag when `inventoryId` is `null`.
If there are no changes, say the owner confirmed the record is accurate. Use
`templates/analyst-review-brief.md`.

### 9. (Analyst) Summarise and decide what to probe
Write a short, concrete summary of what the activity does and what changed since the last review,
naming the actual vendors, systems and data. Then apply the probing rules in
`references/analyst-review.md` and the script's `suggested_follow_ups`:
- New vendor → signed DPA, hosting location, transfers
- Removed personal data → has historic data been purged or is it still held anywhere
- New personal data → legal basis and which data subjects
- Approved as-is → a quick "nothing changed in systems, vendors or data?" confirmation

Also check whether the change should trigger new assessments or a different cadence
(`references/cadence-and-triggers.md`): new special-category data, a new transfer, a legal basis
moved to legitimate interests, or AI/monitoring now in scope.

### 10. (Analyst) Send follow-ups
Each follow-up has an audience (business process owner, application owner, vendor owner) and a
channel (Microsoft Teams or Slack), and moves **draft → sent → answered**. Mark AI-written
questions `aiGenerated: true`. Open follow-ups (`sent`) do not block a commit, but warn the
analyst and recommend waiting for replies.

### 11. (Analyst) Decide
- **Approve and commit** → apply the commit rules in `references/analyst-review.md`: relationships and attributes updated, changed fields marked manual, `lastReviewedAt` = now, `nextReviewAt` = now + the record's cadence, status `active`, submission `committed`, audit entry `review_completed`.
- **Send back to owner** → status `changes_requested`, audit entry noting who it went back to. No inventory change.

Only the analyst commits. Confirm before committing if follow-ups are still open.

### 12. After the commit
The app does **not** re-evaluate posture on commit. Do it yourself and tell the user: re-run the
posture check on the updated record (`ropa-authoring/scripts/ropa_check.py`), and flag any newly
required assessment (PIA, LIA, TIA, PbD, AI risk) or a cadence that should now be shorter.

## Output format

- **Owner side:** short friendly messages, one question each, plus structured before/after cards. Closing recap per `templates/recertification-submission.md`.
- **Analyst side:** `templates/analyst-review-brief.md`, then the script's findings.
- **Never** show raw JSON to an owner. Show JSON to analysts and engineers only when asked.

## Where it lives in the app (code map)

| Concern | File |
|---|---|
| Owner chat UI, topic progress, accept/reject, submit | `components/agent/recertify-chat.tsx` |
| Alternative section-by-section view and document scan | `components/agent/recertify-document-view.tsx` |
| Chat agent prompt and the two client-rendered tools | `app/api/agent/recertify/route.ts` |
| Tool input schemas | `lib/agent/schemas.ts` (`proposeChangeInput`, `submitForReviewInput`) |
| Submission types | `lib/types.ts` (`ChangeSubmission`, `FieldChange`, `RelationshipChange`, `FollowUpQuestion`) |
| Diffing, applying a submission, labels | `lib/recert.ts` (`diffRelationships`, `applySubmission`, `changeCount`) |
| Store actions | `lib/store.tsx` (`addSubmission`, `updateSubmission`, `addFollowUp`, `updateFollowUp`, `commitSubmission`) |
| Review queue | `components/review/review-queue.tsx`, route `/review` |
| Review detail, decision, follow-ups | `components/review/review-detail.tsx`, route `/review/[id]` |
| Owner entry point | route `/recertify/[id]`, `components/agent/recertify-loader.tsx` |
| AI summary, follow-up and question generation | `app/api/recert/summary`, `follow-ups`, `questions` |
| Due-date state | `lib/ropa.ts` (`reviewState`) and `components/maintenance/maintenance-queue.tsx` |
| Cadence and assessment rules | `lib/posture.ts`, `DEFAULT_POSTURE` in `lib/seed.ts`, `components/settings/posture-settings.tsx` |
| Approval-gated design example | `public/recertification-example.html` (record id `recertification-example`) |

## Known quirks to be honest about

These are real behaviours in the prototype. Mention them when they affect the user's task; do not
silently work around them.

- **Follow-up suggestions look empty in the review screen.** `/api/recert/follow-ups` returns `{ followUps: [{ question, audience, channel, rationale }] }`, but `FollowUpsCard.suggest()` reads `data.questions` with a `recipient` field, so AI suggestions render as an empty list.
- **AI summary ignores the submission.** The review screen posts `{ submission, record }`, but `/api/recert/summary` only reads `record`, and only `summary` is shown (`changesSinceReview` is dropped).
- **`approved` is never set.** `commitSubmission` moves a submission straight to `committed`; `approved` exists in the type and queue grouping but no UI sets it.
- **`reassignOwnershipTo` is dropped.** `submitForReview` accepts it and the card displays it, but `finalizeSubmission` does not copy it into the submission.
- **Cadence is not re-resolved on commit.** `nextReviewAt` uses the record's stored `reviewCadenceDays` (default 180), not the current posture rules.
- **Submitter is hard-coded to "You".** Both chat and document view set `submittedBy: 'You'`.
- **Topic progress is approximate.** The "n/7 topics checked" counter increments per owner message, not per confirmed topic.
- **State is in memory.** Submissions, follow-ups and commits live in the client store and reset on reload.
- **The agent's closing condition is narrower than the sequence.** The prompt says to submit after ownership, tools, personal data and retention are covered, though the sequence has seven topics.

## Guardrails

- Never invent vendors, systems, data categories or owners. Use only what the owner said or what is on the record.
- Resolve vendor, system and data names against the inventory when you can; an unmatched name is "new to inventory", not an error.
- Do not give legal conclusions. Flag the question for the analyst or DPO.
- Do not expose the analyst-only reasoning (posture hints, risk language) to the owner in the chat.
- Never log or echo secrets, and never include real personal data in examples.
