# Document view and the approval-gated example

Source: `components/agent/recertify-document-view.tsx`, `public/recertification-example.html`,
`components/records/recertification-example-detail.tsx`.

## Document view (toggle in the chat header)

The owner switches **Document view** on to review the same record as seven sections instead of a
conversation. It produces the same `ChangeSubmission`.

### Sections (same order as the chat)

| Section key | Label | Fields | Relationships |
|---|---|---|---|
| `ownership` | Ownership | `businessProcessOwner`, `managingOrganization` | |
| `tools` | Tools & systems | | vendor, asset |
| `personalData` | Personal data | `dataSubjectCategories` | personalData |
| `purpose` | Purpose & legal basis | `purpose`, `legalBasis` | |
| `retention` | Retention | `retentionPeriod` | |
| `transfers` | Transfers & jurisdictions | `internationalTransfers`, `jurisdiction` | |
| `security` | Security & recipients | `securityMeasures`, `recipients` | |

### Section status

| Status | Trigger | Badge |
|---|---|---|
| `pending` | default | none |
| `affirmed` | owner confirms "still accurate" | "Still accurate" |
| `changed` | owner edits a field, removes or adds a relationship, or accepts a scan difference | "Updated" |

An already-`changed` section stays `changed` even if the owner later affirms it.

### Owner actions per section
- **Confirm** the section as still accurate.
- **Edit** its fields (drafts seed from any earlier edit, else the live value) and save. Saving marks it `changed`.
- **Remove** a linked vendor/system/data item (shown struck through) and **restore** it before submitting.
- **Accept or reject** differences suggested by a document scan (below).

### Submit bar
Shows `reviewedCount / 7` sections checked and the total change count
(`edited fields + removed relationships + added relationships`). Submitting builds:

- `fieldChanges` from the edited fields (`before` from the live record)
- `relationshipChanges` = accepted scan additions + removals of existing relationships
- `decision` = `modified` if any change, else `approved_as_is`
- `ownerNote`: `Reviewed via document view (N/7 sections checked).`
- `aiSummary`: `Document-view recertification for "{name}" — N change(s) proposed.` or `… confirmed accurate as-is.`

Then it shows a confirmation card with links to the analyst review and back to maintenance.
Note it does not require all seven sections to be reviewed before submitting in code terms beyond
the `allReviewed` flag the submit bar receives; follow the on-screen state.

## Scan an updated document

Offered at the top of the view ("Have an updated document?"). The owner pastes text from a DPA,
intake form or project brief (at least 20 characters) and the app calls `POST /api/scan` with
`{ text, mode: 'enrich', existingName: record.name }`, the same extractor used by `ropa-authoring`.

Differences are shown **inline in the matching section**:

- **Field differences:** shown only when the extracted value differs from the current value (compared trimmed, lower-case). Each shows the extracted value, its confidence and the evidence quote, with Accept or Reject. Accept stages it as an edit and marks the section `changed`.
- **Relationship suggestions:** shown only if the type+name is not already on the record. Accept adds an `added` change (resolving `inventoryId` against the inventory); Reject dismisses it.
- A "Scan again" option keeps unresolved differences visible with a count.

Treat scan output as suggestions to confirm, never as facts. Confidence and evidence come from
the extractor; low confidence should prompt the owner to check.

## The approval-gated example (`recertification-example.html`)

A static design mock (record id `recertification-example`, rendered in an iframe by
`RecertificationExampleDetail`; the posture-requirements panel is hidden for it). It shows a
stricter pattern worth reusing when asked to design a gated recertification:

- **Banner:** "Recertification overdue — this record has been active for 12 months. Article 30 requires you, as business process owner, to review it for accuracy and re-approve it before it can stay active." plus how many decisions remain.
- **Side panel:** "Decisions needed before this record can be recertified", with a progress count and "Resolve every item to unlock recertification."
- **Approve & recertify** stays disabled and reads "Resolve N item(s) to recertify" until all items are resolved.
- **Governance panel:** shows "Recertification due" (overdue state, e.g. Aug 28, 2026).
- **On certify:** banner becomes "Recertified" and a stamp reads "Recertified by {name} on {date}. Next recertification due {date + 12 months}."
- **History log** records each action (e.g. "Recertified the full record for the next 12-month cycle"). State persists via `window.storage` and degrades to session-only if unavailable.

Example decision items (for the recruitment/TalentSprint record):

| Item | Prompt |
|---|---|
| Retention | Confirm hired-candidate retention (HRIS has no stated end date; approve as-is or edit before recertifying) |
| Transfers | Confirm Singapore transfer assessment (SCCs drafted, transfer impact assessment not on file) |
| New vendor | Approve new processor: Checkr (added since last certification for background checks) |
| Special category | Confirm special category safeguard ("Racial or ethnic origin" is inferred data under Art. 9; confirm the DPIA covers how it is derived and protected) |
| Model version | Confirm AI scoring model is current (new interview-scoring model shipped this cycle; confirm the DPIA reflects it) |

Each is approved as-is, edited, or flagged for follow-up. Sections: Overview, systems and vendors,
personal data (with flagged special-category items), source documents (e.g. "Candidate screening
DPIA.docx", "TalentSprint AI DPA.pdf") and history.

Use it as the model when the user wants "must resolve all risks before certifying" behaviour. The
production chat flow does not currently gate on this.
