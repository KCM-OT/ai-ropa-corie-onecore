# ropa-recertification — Claude Code skill

A [Claude Code](https://code.claude.com) skill that captures everything in the prototype's
recertification process: the owner's guided check-in (chat or document view), proposing before/after
changes, submitting to a privacy analyst, the analyst review (AI summary, follow-ups over Teams or
Slack, approve or send back), exactly what a commit changes, and how due dates and risk-based
cadence tiers work. It is the companion to `ropa-authoring`, which creates the records.

It is independent of the Next.js app and nothing in the app imports it.

## Using it

**In this repo:** open Claude Code anywhere in the repository. The skill loads automatically from
`.claude/skills/`. Then ask, for example:

> Walk me through recertifying the candidate screening record
>
> Review this recertification submission and tell me what to ask the vendor owner
>
> Which of our records are overdue, and why is this one on a 180-day cadence?
>
> Explain how the recertify flow commits changes

or type `/ropa-recertification`.

**In every project:** link it into your personal skills folder:

```bash
ln -s "$(pwd)/.claude/skills/ropa-recertification" ~/.claude/skills/ropa-recertification
```

Every recertification is for human review. The skill never commits anything to an inventory.

## What's inside

| Path | Purpose |
|---|---|
| `SKILL.md` | The 12-step workflow, principles, code map and known quirks (entry point) |
| `references/lifecycle.md` | Roles, flow, submission states, entry points, audit log |
| `references/data-model.md` | `ChangeSubmission`, `FieldChange`, `RelationshipChange`, `FollowUpQuestion`, the 12 field keys, tool schemas, endpoints |
| `references/owner-chat-agent.md` | Fixed 7-topic sequence, exact wording, "No" handling, ownership hand-off, change cards |
| `references/document-view.md` | Section-by-section review, document scan, the approval-gated example page |
| `references/analyst-review.md` | Queue, detail screen, AI summary, follow-up routing, decision, commit semantics |
| `references/cadence-and-triggers.md` | Review state, cadence tiers, assessment triggers, when a change should raise new work |
| `templates/` | Owner recap and analyst brief layouts |
| `scripts/recert_check.py` | Validation, stale-value detection, commit preview, follow-up suggestions, risk hints (Python 3, standard library only) |
| `examples/` | An example record plus a modified and an approved-as-is submission |

## Running the checks directly

```bash
cd .claude/skills/ropa-recertification
python3 scripts/recert_check.py examples/submission-modified.json \
  --record examples/record-recruitment.json \
  --inventory ../ropa-authoring/assets/inventory.example.json \
  --today 2026-11-16

# Write the post-commit record so you can re-run posture on it
python3 scripts/recert_check.py examples/submission-modified.json \
  --record examples/record-recruitment.json --emit-record /tmp/after.json
```

Add `--json` for machine-readable output. Exit code 1 means the submission has errors.

## Keeping it in step with the prototype

The skill describes the code at the time it was written. When these change, update the skill:

| If you change… | Update |
|---|---|
| The agent prompt in `app/api/agent/recertify/route.ts` | `references/owner-chat-agent.md` and step 4 to 6 in `SKILL.md` |
| `lib/recert.ts` (`applySubmission`) | `references/analyst-review.md` (commit section) and the commit preview in `scripts/recert_check.py` |
| Types in `lib/types.ts` | `references/data-model.md` and the enums at the top of `scripts/recert_check.py` |
| `DEFAULT_POSTURE` or `lib/posture.ts` | `references/cadence-and-triggers.md` (and `ropa-authoring` posture reference) |
| The follow-up fallback in `app/api/recert/follow-ups/route.ts` | The routing table in `references/analyst-review.md` and the suggestion rules in the script |
| Any of the known quirks listed in `SKILL.md` | Remove the quirk once it is fixed |

Roles, field keys and posture rules are shared with `ropa-authoring`; keep them consistent.

## Customising
- Swap the wording and tone rules in `references/owner-chat-agent.md` to match your house style.
- Add risk cues or vague-value phrases at the top of `scripts/recert_check.py`.
- Replace the example record and inventory with your own to test against real data.
