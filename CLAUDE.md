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

## Screens

Ported from the React/Vitreus prototype in `../ai-ropa-datamapping` (same data and flow):

- `/processing-activities`: the RoPA list (saved views, search, sort, selection, row menus, pagination).
- `/processing-activities/new`: Author with AI. Describe → rule-based draft (`data/extract.ts`) →
  review suggested values, follow-up questions and linked inventory → send to Pending inventory.
- `/pending-inventory`: pending records plus AI drafts (from `DraftsStore`, kept in localStorage).
- `/ai-assisted-ropa`: AI Assisted RoPA Creation (prototype-only, top of the sidebar and in the
  Add processing activity menu). A OneCore `oc-assistant-thread` conversation beside a live draft
  panel: describe → `oc-assistant-steps` chain for name, entity and role → one follow-up question
  per missing field → send to Pending inventory. Replies are written in the component and streamed
  with `[ocStream]` through one `send()`; there's no model. OneCore only shows Edit on a user turn
  that is the newest message, so Stop drops the partial reply to make the message editable.
- Every other nav item renders `pages/placeholder.ts`.

Layout: `shell/` holds the app shell (top bar + side nav), `PageHeader`, and `TableFooter`
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

## RoPA content

GDPR Article 30 field logic lives in the `ropa-authoring` skill, also used by the earlier
React prototype at `../ai-ropa-datamapping`.
