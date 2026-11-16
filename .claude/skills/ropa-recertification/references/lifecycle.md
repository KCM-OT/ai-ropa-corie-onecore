# Recertification lifecycle

Source: `lib/types.ts`, `lib/recert.ts`, `lib/store.tsx`, `components/agent/*`, `components/review/*`.

## Roles

| Role | Does | Cannot |
|---|---|---|
| **Business Process Owner** | Confirms or corrects the record, proposes changes, submits | Commit to the inventory |
| **Privacy Operations Analyst** | Reviews, asks follow-ups, approves and commits, or sends back | Change a record without a submission |
| **AI agent** | Guides the owner, drafts before/after cards, summarises, suggests follow-ups | Approve, commit, or change anything on its own |

## The flow

```
Record due (or owner starts early)
   |
   v
Owner check-in  ── chat (default)  or  document view (toggle)
   |   7 topics, one question at a time
   |   "No" -> "Please tell us what has changed" -> before/after card
   |   owner applies / edits / skips each card
   v
Submit for review  ->  ChangeSubmission { status: pending_review }
   |                    decision = modified | approved_as_is
   v
Analyst review  (/review, /review/[id])
   |   AI summary  ·  owner note  ·  record with changes highlighted
   |   follow-ups to owner / app owner / vendor owner via Teams or Slack
   v
Decision
   ├── Approve & commit  -> inventory updated, review clock reset, status committed
   └── Send back to owner -> status changes_requested
```

## Submission states

| Status | Label | Meaning | Queue group |
|---|---|---|---|
| `pending_review` | Pending review | Submitted, waiting on an analyst | Needs review |
| `changes_requested` | Changes requested | Analyst sent it back to the owner | Needs review |
| `approved` | Approved | Defined but not set by any current UI action | Recently completed |
| `committed` | Committed | Changes are in the inventory | Recently completed |

Transitions in the app: `pending_review → committed` (approve and commit),
`pending_review → changes_requested` (send back). Nothing in the UI moves a submission out of
`changes_requested`; the owner would start a fresh recertification.

## Decisions

| `decision` | When | What the analyst sees |
|---|---|---|
| `approved_as_is` | Zero accepted changes | "{owner} confirmed this record is still accurate. Approve to stamp a fresh certification date, or send a follow-up if something looks off." |
| `modified` | One or more accepted attribute or relationship changes | Diff view plus change count |

`decision` is derived, not chosen: `fieldChanges.length + relationshipChanges.length > 0`.

## Two ways for the owner to recertify

1. **Chat** ("Chat based recertify"): default, conversational, agent-led. See `owner-chat-agent.md`.
2. **Document view**: toggled with the "Document view" switch. Same seven topics as sections the owner confirms or edits, plus a scan of an updated document. See `document-view.md`.

Both produce the same `ChangeSubmission` and enter the same analyst queue.

A third artefact, `public/recertification-example.html`, demonstrates an **approval-gated**
design (the owner must resolve every flagged item before "Approve & recertify" unlocks). It is a
static design example, not wired to the store. See `document-view.md`.

## Entry points

- **Maintenance queue** (`/maintenance`): groups records into overdue, due soon, incomplete (completeness below 70) and on track, from `reviewState()`.
- **Record page** (`/records/[id]`): shows Last reviewed and Next review and has a **Recertify** button linking to `/recertify/[id]`.
- **Direct link** `/recertify/[id]`: loads the record from the store; shows "Record not found" with a link back to maintenance if the id is unknown.
- **After submitting:** "See analyst review" goes to `/review/[submissionId]`; "Back to maintenance" goes to `/maintenance`.

## Audit log entries

| Moment | `action` | Actor | Detail |
|---|---|---|---|
| Owner submits | `review_scheduled` | You | `{owner} recertified the record as accurate — submitted for analyst review.` or `{owner} submitted N change(s) for analyst review.` |
| Analyst sends back | `review_scheduled` | You | `Sent recertification back to {owner} for changes.` |
| Analyst commits | `review_completed` | You | `Recertification by {owner} approved and committed to the inventory.` or `Committed N recertification change(s) from {owner} to the inventory.` |

## Persistence

The prototype keeps submissions, activities and the log in a client-side React store seeded from
`lib/seed.ts` (`SEED_SUBMISSIONS` provides two examples: a modified recruitment submission with
follow-ups, and an approved-as-is marketing submission). Reloading resets it. A production build
needs a database; see the data model for the shapes to persist.
