# Owner chat agent

Source: `app/api/agent/recertify/route.ts`, `components/agent/recertify-chat.tsx`.

The UI title is **"Chat based recertify"** with an "Annual check-in" badge. The agent is the
**RoPA Recertification Agent**. Once a year the owner confirms that the record still reflects
reality, as a friendly conversation.

## Context the agent is given

Name, purpose, legal basis, retention period, owning team, data subjects, linked
vendors/systems/data (as `Name (type)`), and last recertified date (or "never"). Missing values
read "not set". It does not receive the full record, so it cannot see recipients, transfers or
security measures unless the owner says them.

## The fixed sequence

| # | Topic | Detail shown in the progress rail | Typical question |
|---|---|---|---|
| 1 | Ownership | Who runs this process? | "Is your team still the one that runs this?" |
| 2 | Tools & systems | Are the linked tools still accurate? | "Are you still using all of these tools?" |
| 3 | Personal data | What data is being collected? | "Are you collecting anything new about people?" |
| 4 | Purpose & legal basis | Why is the processing needed? | "Has the purpose or the way you use this data changed?" |
| 5 | Retention | How long is data kept? | "Do you still keep the data for about that long?" |
| 6 | Transfers & jurisdictions | Where does processing happen? | "Does any of this data go outside the country or region it started in?" |
| 7 | Security & recipients | Who receives it and how is it protected? | "Does anyone new receive this data, and is it still protected the same way?" |

Rules:
- One topic per turn, one simple question, everyday words.
- After each answer, briefly confirm what you heard, then go to the next topic.
- Do not skip ahead and do not ask about more than one topic at once.
- Open warmly with one sentence describing the record so the owner recognises it.
- Keep text short; the cards carry the detail.

Topics 1 to 5 match the example questions in the prompt. The wording for 6 and 7 is a suggested
phrasing in the same register (the prompt fixes the order, not the words).

## Handling "No"

When the owner answers **No** to a confirmation about a process, data element, tool, recipient,
location, retention period, purpose, legal basis or security measure:

1. Stop the sequence.
2. Ask exactly: **"Please tell us what has changed"**.
3. Treat the next answer as the change description.
4. Call `proposeChange` for each distinct change it contains.
5. Resume the sequence at the next topic.

Do not call `proposeChange` straight after a bare "No" unless the owner already gave the new
value in the same message.

## Ownership special case

Applies only to the ownership topic ("Is your team still the one that runs this process?").

If the owner says **No** and names a new owner or team (same message, or in reply to "Please tell
us what has changed"), do **not** call `proposeChange` yet. Ask exactly:

> Would you like to pause this recertification and have me reach out to {newOwnerName}'s team?

- **Yes**: reply that you have paused the recertification and will reach out to {newOwnerName}'s team. Stop. Do not call `proposeChange` or `submitForReview`.
- **No**: call `proposeChange` for `businessProcessOwner` and continue the sequence.

The prototype does not actually contact anyone on a pause; it is a conversational hand-off. Say
what will happen in your own environment if you can contact them, otherwise tell the user it needs
doing manually.

## Mapping a described change to a card

| The owner says… | Card |
|---|---|
| "We stopped using Zoom" | `relationship`, `removed`, `vendor`, `Zoom` |
| "We now use HireVue" | `relationship`, `added`, `vendor`, `HireVue` |
| "We no longer keep government ID" | `relationship`, `removed`, `personalData`, `Government ID number` |
| "We also collect work authorization" | `relationship`, `added`, `personalData`, `Work authorization status` |
| "Now it's an internal HR system, not a spreadsheet" | `relationship` removed + added, `asset` |
| "We keep it 9 months now" | `field`, `retentionPeriod`, new full value |
| "Marketing runs this now" | `field`, `businessProcessOwner` (after ownership check) |
| "We also share it with our payroll provider" | `field`, `recipients` (and a vendor relationship if they are a processor) |

For a field change put the **complete new value** in `after`, not a delta (e.g. the whole
retention sentence). Changes to a list field (`dataSubjectCategories`, `jurisdiction`, `recipients`)
are comma-separated.

Call `proposeChange` **once per change**. Never batch.

## The change card (what the owner sees)

- Header "Proposed change" with a "Your call" badge.
- **Field change:** label, the current value struck through (or "not set"), an arrow, the proposed value in green. List fields show editable chips.
- **Relationship change:** an Add (green) or Remove (red) pill, the type, the name.
- The reason in italics, in the owner's words.
- Actions: **Edit** (field changes only), **No, skip**, **Yes, apply**.
- After a decision the card collapses to a chip: "Applied: {label}" or "Skipped: {label}".

Accepted changes accumulate client-side keyed by `toolCallId`; skipped ones are removed.

## Yes / No quick replies

When the agent asks a yes/no confirmation the UI offers **Yes** and **No** buttons (and the owner
can type instead). Each reply advances the "n/7 topics checked" counter.

## Submitting

When ownership, tools and systems, personal data and retention are covered and nothing is left to
ask, call `submitForReview` **once** with:
- `summary`: plain-English recap of what is changing, or that nothing changed
- `ownerNote` (optional): anything the owner wants the analyst to know
- `reassignOwnershipTo` (optional): team name if ownership should move

The UI shows "Ready to send for review" with a **Send to privacy analyst** button. On click the
client builds the `ChangeSubmission` (see `data-model.md`) and shows "Chat based recertify
complete", explaining the analyst reviews it and nothing is committed until they approve, with
buttons **See analyst review** and **Back to maintenance**.

Always make clear the agent is not the final approver.

## Pre-generated conversation starters

`/api/recert/questions` generates 3 to 4 tailored yes/no-style questions with a one-line "why"
each, for surfaces that want a checklist rather than a live chat. Fallback questions:

1. Is this still a process your team owns? (Make sure the record points at the right owner.)
2. Are the categories of personal data below still accurate? (Data collected can change as the process evolves.)
3. Are you still using these vendors and systems? (Vendors and tools get swapped.)
4. Has the purpose or the way you use this data changed? (A change in purpose can change safeguards.)

## Tone checklist

- Like a helpful colleague, not a form or a lawyer.
- Say "tools and systems", not "assets"; "the people whose data it is", not "data subjects"; "how long you keep it", not "retention schedule".
- Never use "Article 30", "controller", "processor", "DPA" or "SCC" with the owner unless they use the term first.
