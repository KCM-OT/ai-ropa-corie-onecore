# RoPA prototype on OneCore

Angular 21 prototype of OneTrust Privacy Management → Data Mapping (RoPA records), built on
the OneCore design system (`@onetrust/onecore`, pinned to 1.0.0).
Upgrade on purpose: install the exact version with npm 11, then run
`npx ng update @onetrust/onecore --migrate-only --from=<old> --to=<new>` for the migration report
(`onecore-upgrade-report.md`; don't commit it) and read the Release Notes.

## Run

- `npm start` → http://localhost:4200
- `npm run build`
- Install with npm 11 (`npx npm@11 install`). npm 10.8 crashes with
  `Cannot read properties of null (reading 'edgesOut')` on this dependency tree.
- `@onetrust/onecore` comes from OneTrust Nexus (configured in `~/.npmrc`). It is not on public npm,
  so hosts without Nexus access (for example Vercel) cannot install it. If install returns 401, check
  `npm whoami --registry=https://nexus.onetrust.dev/nexus/repository/npm-group/` prints
  `npm-developer`; if not, re-run `npx odk-register --verbose --force` (Devkit).

## Deploy

`npm run deploy` (production) or `npm run deploy:preview`. These run `vercel build` locally, where
Nexus is reachable, then upload with `vercel deploy --prebuilt`. Vercel project:
onetrustpmux-v0/ai-ropa-corie-onecore. Pushing to GitHub does not deploy. `vercel.json` rewrites
every path to `index.html` so deep links work.

Both deploy scripts first run `npm run skill:upstream`, which compares each vendored skill with the
upstream repo's main branch (read from its `UPSTREAM.md`, fetched with your git credentials) and
stops the deploy if the copy is behind, listing the changed files and upstream commits.
`SKILL_UPSTREAM_CHECK=warn npm run deploy` deploys anyway with a warning; if upstream can't be
reached, the check warns and the deploy carries on.

## Screens

Ported from the React/Vitreus prototype in `../ai-ropa-datamapping` (same data and flow):

- `/processing-activities`: the RoPA list (saved views, search, sort, selection, row menus, pagination).
- `/processing-activities/new`: Author with AI. Describe → rule-based draft (`data/extract.ts`) →
  review suggested values, follow-up questions and linked inventory → send to Pending inventory.
- `/settings`: Language and Theme (see Sidebar below).
- `/recertification`: Recertification, in the sidebar. Active records by review state
  (overdue, due soon, on track: the ropa-recertification skill's SKILL.md step 2, 30-day window,
  `PROTOTYPE_TODAY`), with each record's check-in status (with the analyst, paused) and Recertify.
- `/recertification/:id`: the owner check-in, also opened from a Processing activities row menu
  (Start re-certification). It follows the ropa-recertification skill's owner side (SKILL.md steps
  3–7, `references/owner-chat-agent.md`): an `oc-assistant-thread` beside the record under review
  (topic progress, fields and links, with applied and proposed changes marked). Seven topics in
  fixed order, one yes/no question each; a "No" gets exactly "Please tell us what has changed";
  changes become before/after cards (Yes, apply / Edit for field changes / No, skip); a named new
  owner gets the pause question; then the recap (`templates/recertification-submission.md`), an
  optional note, and Send to privacy analyst, which first asks "Send to privacy analyst?" in an
  `oc-dialog` modelled on AI Assisted RoPA's "Send to Pending inventory?" (what happens next, in
  three steps; Cancel or Send and open Data Mapping). It stays separate from the AI Assisted page and its
  composer. Answers are read with rules in `data/recertification.ts` (no model); quick-reply chips
  include a realistic example change for each topic. Submissions (`pending_review`) and pauses live
  in `data/recert.store.ts` (localStorage). **To Data Mapping:** Send to privacy analyst also opens
  the Vitreus prototype's `/recertification-review` in a new tab with the submission and its check
  report in the URL fragment (`#recert-result=…`, `format: "onetrust.recert-result"`, version 1,
  `data/recert-result.ts`; localhost:3000 when running locally). The privacy analyst approves it or
  asks for changes there. **Changes requested:** Data Mapping's Request changes opens
  `/recertification/<id>` here with the analyst's question (`#recert-decision=…`,
  `format: "onetrust.recert-decision"`, version 1, `data/recert-decision.ts`; checked against the
  route) and the record's current details. `RecertStore.addDecision` marks the submission
  `changes_requested`; until the owner sends a newer check-in, the check-in opens with the question
  and a fresh run-through, and it shows "Changes requested" in the panel and on the Recertification
  list. The sender is `lib/authoring/recert-decision.ts` in that repo. Approvals don't come back
  yet, so an approved check-in still shows "With the analyst" here. "Open in Data Mapping" in the footer sends it again (blocked popup, closed tab). The
  receiver is `lib/authoring/recert-result.ts` in KCM-OT/ai-ropa-datamapping; change both together.
  **From Data Mapping:** the Vitreus prototype's Inventory Maintenance → Recertify → "Continue to
  AI assisted re-certification" opens `/recertification/<id>` here with the record as JSON in the
  URL fragment (`#recert-record=…`, `format: "onetrust.recert-handoff"`, version 1, the skill's
  record shape). `data/recert-handoff.ts` checks and caps every value (it comes from another site;
  the record ID must match the route), resolves linked items against this app's inventory, keeps it
  in localStorage by ID and clears the fragment. The check-in then uses those details instead of this
  app's copy, and the record panel says where they came from; a bad package shows a message and
  falls back to this app's copy. The sender is `lib/authoring/recert-handoff.ts` in
  KCM-OT/ai-ropa-datamapping; change both together.
- `/pending-inventory`: pending records plus AI drafts (from `DraftsStore`, kept in localStorage).
- `/ai-assisted-ropa`: AI Assisted RoPA Creation, the home page (`/` redirects here). Reached from
  the sidebar's New chat and Chats, and from the Add processing activity menu. It opens on a
  start screen (`pages/ai-assisted/start/`, Figma node 2241:5516) built from OneCore parts: an
  `oc-assistant-composer`, which draws its own frame (Enter or Send sends; the composer needs some text, so attaching
  a document to an empty composer fills in "Create a RoPA record from <file>.", which isn't read as
  part of the description), `oc-assistant-suggestion`
  sample chips (they fill the composer with a random variant and never send), and Pending
  (`data/authoring-history.ts`: example sessions plus those started in this browser, in
  localStorage, soonest due first, each with open questions and a due date two weeks after it
  starts; sent or "use existing" sessions leave the list; View report drafts again from the
  session's description). Sending anything switches to a
  OneCore `oc-assistant-thread` conversation beside a live draft panel that follows the
  ropa-authoring skill's workflow (SKILL.md steps 1–6): describe → `oc-assistant-steps` chain
  for name, owning entity and role (pre-selected from the description's role cues) → follow-up
  questions planned from the checker's report → send to Pending inventory.
  Replies are written in the component and streamed with `[ocStream]` through one `send()`; there's
  no model. OneCore only shows Edit on a user turn that is the newest message, so Stop drops the
  partial reply to make the message editable.
  The draft panel shows an `oc-skeleton` of the whole record while the first reply builds it, then
  a skeleton on any block (name, entity, role, field) whose value changes, for `UPDATE_MS`.
- **Attached documents** (`data/document-text.ts`): both composers accept .docx, .doc (Word 97–2003),
  .pdf, .rtf and .txt (also .md/.csv), up to 10 MB, read in the browser. .docx is unzipped with
  `fflate` (a two-column table row reads "Label: value"), .doc through its piece table with `cfb`,
  .rtf with a small parser, .pdf with `pdfjs-dist` (worker copied to `/pdfjs/` by `angular.json`;
  wrapped lines are put back into paragraphs and aligned table columns read "Label: value"). The PDF
  and .doc readers load on first use. The text goes through the same extractor as a typed
  description; the reply says what was read ("1 page, 78 words") or why a file couldn't be
  (scanned PDF, password, damaged). No OCR.
- **Duplicate check** (`data/duplicates.ts`): after the description, an attached document, or a record
  picked from Processing activities (row menu → Create variation with AI, `?from=<id>`), the draft is
  compared with the records the user can view (`canView`: every group entity except APAC in this
  prototype). A likely duplicate shows in OneCore's caution yellow: the matched record, a rationale and
  the overlapping fields in the panel, and a card in the conversation with Use existing record,
  Create as local variation with inheritance, or Dismiss duplicate flag. Nothing is created, linked or
  inherited until the user confirms. A variation inherits the parent's fields it doesn't set itself
  (provenance `inherited`); the decision travels in the handoff as `duplicateCheck`. Record content
  for the mock list lives in `RECORD_PROFILES`.
- **Samples** (`data/demo-samples.ts`): each sample chip on the start screen picks one of three
  variants at random, each written to overlap a different existing record (a previous RoPA record, a
  shared vendor, or the same data subjects). `npm run skill:parity` covers every variant.
- **Send to Pending inventory** hands the RoPA to the Data Mapping prototype (KCM-OT/ai-ropa-datamapping,
  https://ai-ropa-datamapping-sigma.vercel.app). `data/handoff.ts` packages it as JSON
  (`format: "onetrust.ropa-handoff"`, version 1: the record in the skill's shape with full evidence,
  plus the check results) and opens that app's `/processing-activities` in a new tab with the package
  in the URL fragment (`#ropa-import=…`, base64url). That page validates it and adds it as a pending
  record. Locally it targets http://localhost:3000. The receiver is `lib/authoring/ropa-handoff.ts`
  in that repo; change both together. The JSON can also be downloaded.

Sidebar (`shell/app-shell.*`, Figma "Left Nav" node 2241:5514): logo with Search (no action) and
Collapse (to a 60px icon rail), New chat, Inbox and Projects (both placeholders) and Recertification (`shell/nav.ts`), a
collapsible Chats list of every authoring session newest first (the open one has a filled dot),
and the signed-in user, whose button opens the User Menu (Figma 2260:769, an `oc-menu` opening upward
from the button's top edge: profile, organisation, Customize view, Settings, Sign out; only Settings
has a destination). `/settings` (Figma 2260:1275) has Language (`oc-select`; remembered only, the
prototype has no translations) and Theme (`oc-toggle-button-group`: Light, Dark, System). Both live in
`data/preferences.ts` (localStorage); the theme sets OneCore's `data-mode="dark"` on `<html>`, and
System follows the OS. The sidebar is dark in both modes, so it pins `--oc-foreground-on-dark`. New chat and Chats talk to the AI page through `shell/chat-nav.ts`.
Processing activities and Pending inventory aren't in the sidebar; reach them by URL or from links.

Layout: `shell/` holds the app shell (side nav only; there is no global top bar), `PageHeader`, and `TableFooter`
(wraps `oc-pagination` with a row count and page-size picker). Mock data lives in `data/`.
Shared table styles (`.data-table`) are in `src/styles.scss`. Scroll containers are
`position: relative` so OneCore's visually-hidden absolute text can't overflow the page.

## Using OneCore

- Before using a component, look it up: the `onecore` MCP server (`.mcp.json`) or
  `npx onecore list`, `npx onecore docs <component>`, `npx onecore rules <component>`.
  These read the docs and rules shipped inside the installed package.
- Use only components and tokens that exist in the installed version. Import from the
  per-component entry point (`@onetrust/onecore/button`), never the package root.
- Register every icon a screen renders with `provideOcIcons([...])` from
  `@onetrust/onecore/icon` (see `src/app/app.config.ts`). An unregistered icon renders nothing.
- Style with `--oc-*` tokens only. No raw hex, rgb or px colour values.
- Foundation styles (tokens, Antique Legacy fonts, base) load once in `src/styles.scss`
  via `@use 'foundation/styles'`, resolved through `stylePreprocessorOptions.includePaths`.
- OneCore has no side nav or page header component. Build those from native HTML styled with
  tokens, as `shell/` does. OneCore 0.10 added `oc-data-grid` (`@onetrust/onecore/data-grid`,
  TanStack); the list pages still use the native `.data-table` and haven't been moved to it.
- Known upstream noise: OneCore's tooltip (used by every `oc-icon-button`) logs ng-primitives
  "Use setTooltip()/setDisabled()/setContext() instead of setting the value directly" warnings in
  dev mode. They come from the library, not this app.
- Hosted docs (Storybook, no sign-in, always the latest release, not necessarily the installed one):
  https://onecore.1trust.app (Angular setup: `?path=/docs/guides-engineers-angular-setup--docs`,
  Release Notes: `?path=/docs/release-notes--docs`). The same host serves a hosted MCP at
  https://onecore.1trust.app/mcp; this repo uses the local `npx onecore mcp` instead because it
  matches the installed version.

## RoPA content: the ropa-authoring skill

The skill is vendored at `.claude/skills/ropa-authoring` (see its `UPSTREAM.md`). The app reads
its inventory and posture config straight from `assets/`. It doesn't load the skill at runtime, so
upstream changes arrive only when the folder is copied again; `npm run skill:upstream` says when
that's due.

- `data/ropa-check.ts` is the skill's checks (`scripts/ropa_check.py`) in TypeScript, copied from
  the upstream Solera app's port. The Python script is the source of truth. After changing either,
  or the extractor, run `npm run skill:parity`: it runs both on the skill's examples, edge cases and
  drafts the app's extractor builds for every role, and fails on any difference.
- `data/skill-draft.ts` builds a record in the skill's JSON shape for the chosen role, extending
  the rule-based `data/extract.ts` with the skill's cues (managing organization, role, processor
  and joint-controller fields, standard personal-data categories, tools not in the inventory).
- `data/skill-questions.ts` plans the assistant's follow-ups from the check report in SKILL.md
  step 5's order, then asks to confirm "Needs review" values.
- The Author with AI page (`/processing-activities/new`) still uses only `data/extract.ts`.

## Recertification: the ropa-recertification skill

Vendored at `.claude/skills/ropa-recertification` (see its `UPSTREAM.md`) from the same repo. Its
code map and "Known quirks" describe the Solera app, not this one. Used only by the Recertification
pages.

- `data/recert-check.ts` is the skill's checks (`scripts/recert_check.py`) in TypeScript, ported
  here, including the Python list/None formatting in messages. The Python script is the source of
  truth. `npm run skill:parity` also runs `scripts/recert-parity.mjs`: both on the skill's example
  submissions, edge cases, and the submissions the check-in builds from every record's example
  answers (`parityCases()`), with `--today` fixed to `PROTOTYPE_TODAY`.
- `data/recertification.ts`: records in the skill's `ProcessingActivity` shape (from the
  Processing activities rows and `RECORD_PROFILES`; vendors vs systems by the inventory), the seven
  topics and questions, the answer reader (`verdict`, `readChange`, `newOwnerIn`) and
  `buildSubmission`. Send to privacy analyst runs the checks and refuses to send on errors.
