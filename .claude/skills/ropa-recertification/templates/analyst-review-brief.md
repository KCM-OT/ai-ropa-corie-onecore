# Analyst review brief

Use for a Privacy Operations Analyst. Fill from the submission, the record and the output of
`scripts/recert_check.py`.

---

## {recordName}  ·  {status label}

Submitted by **{submittedBy}** ({submittedRole}) on {submittedAt}.
Decision: **{Modified — N change(s) | Approved as-is}**.
Review state before submission: **{overdue | due soon | ok | none}** (next review was {date}).
Cadence tier: **{ruleLabel} — {days} days**.

### What the owner told us
> {ownerNote}

### What this activity does
{2 to 3 sentences naming the real vendors, systems and data.}

### Proposed changes

| Field | Before | After |
|---|---|---|
| {label} | {before} | {after} |

| Action | Type | Name | In inventory? |
|---|---|---|---|
| Added | Vendor | {name} | {Yes (id) / **New to inventory**} |
| Removed | Personal data | {name} | Yes |

*(If none: "The owner confirmed the record is still accurate.")*

### Check results
- Errors: {none | list}
- Warnings: {stale "before" values, no-op edits, vague values, unresolved names}

### Risk and assessment hints
- {e.g. "Added special-category data (Racial or ethnic origin): consider PIA/DPIA and a 180-day tier."}
- {e.g. "New vendor HireVue: confirm signed DPA and hosting location."}

### Follow-ups
| To | Channel | Question | Status |
|---|---|---|---|
| {audience / recipient} | {Teams/Slack} | {question} | {draft/sent/answered} |

Open follow-ups: **{N}**. {Recommend waiting for replies on: …}

### Recommendation
**{Approve and commit | Send back to owner | Wait for follow-ups}** — {one-sentence reason}.

### If committed, the record will
- Apply the changes above, mark changed fields as manual
- Set last reviewed to {today} and next review to {today + cadence} ({cadence} days)
- Set status to active and log "review completed"
- **Not** re-evaluate posture. Re-run it after commit and raise: {assessments, if any}
