# RoPA prototype on OneCore

Angular 21 prototype of OneTrust Privacy Management → Data Mapping (RoPA records), built on
the OneCore design system (`@onetrust/onecore`, pinned to 0.7.0).

## Run

- `npm start` → http://localhost:4200
- `npm run build`
- Install with npm 11 (`npx npm@11 install`). npm 10.8 crashes with
  `Cannot read properties of null (reading 'edgesOut')` on this dependency tree.
- `@onetrust/onecore` comes from OneTrust Nexus (configured in `~/.npmrc`). It is not on public npm,
  so hosts without Nexus access (for example Vercel) cannot install it.

## Deploy

`npm run deploy` (production) or `npm run deploy:preview`. These run `vercel build` locally, where
Nexus is reachable, then upload with `vercel deploy --prebuilt`. Vercel project:
onetrustpmux-v0/ai-ropa-corie-onecore. Pushing to GitHub does not deploy. `vercel.json` rewrites
every path to `index.html` so deep links work.

Both deploy scripts first run `npm run skill:upstream`, which compares the vendored skill with the
upstream repo's main branch (read from its `UPSTREAM.md`, fetched with your git credentials) and
stops the deploy if the copy is behind, listing the changed files and upstream commits.
`SKILL_UPSTREAM_CHECK=warn npm run deploy` deploys anyway with a warning; if upstream can't be
reached, the check warns and the deploy carries on.

## Screens

Ported from the React/Vitreus prototype in `../ai-ropa-datamapping` (same data and flow):

- `/processing-activities`: the RoPA list (saved views, search, sort, selection, row menus, pagination).
- `/processing-activities/new`: Author with AI. Describe → rule-based draft (`data/extract.ts`) →
  review suggested values, follow-up questions and linked inventory → send to Pending inventory.
- `/pending-inventory`: pending records plus AI drafts (from `DraftsStore`, kept in localStorage).
- `/ai-assisted-ropa`: AI Assisted RoPA Creation, the home page (`/` redirects here). Reached from
  the sidebar's New chat and Chats, and from the Add processing activity menu. It opens on a
  start screen (`pages/ai-assisted/start/`, Figma node 2241:5516) built from OneCore parts: an
  `oc-assistant-composer` in a card (Enter or Send sends; the composer needs some text, so attaching
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
Collapse (to a 60px icon rail), New chat, Inbox and Projects (both placeholders, `shell/nav.ts`), a
collapsible Chats list of every authoring session newest first (the open one has a filled dot),
and the signed-in user, whose button opens the User Menu (Figma 2260:769, an `oc-menu` opening upward
from the button's top edge: profile, organisation, Customize view, Settings, Sign out; the items
have no destination yet). New chat and Chats talk to the AI page through `shell/chat-nav.ts`.
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
- OneCore has no table, side nav or page header component. Build those from native HTML
  styled with tokens, as `shell/` and the `.data-table` styles do.
- Known upstream noise: OneCore's tooltip (used by every `oc-icon-button`) logs ng-primitives
  "Use setTooltip()/setDisabled()/setContext() instead of setting the value directly" warnings in
  dev mode. They come from the library, not this app.
- Hosted docs (Storybook, needs GitLab sign-in):
  https://onecore-5e147a.gitlab.io/release-alpha/?path=/docs/guides-developer-overview--docs

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
