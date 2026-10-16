# AI RoPA prototype on OneCore

A working prototype of AI-assisted RoPA (GDPR Article 30) authoring in OneTrust Privacy
Management → Data Mapping, built with Angular 21 and the OneCore design system
(`@onetrust/onecore`).

Screens:

- **Processing activities** (`/processing-activities`): the RoPA list.
- **Author with AI** (`/processing-activities/new`): describe an activity, review the AI draft
  (suggested values with evidence, follow-up questions, linked inventory), send it for approval.
- **Pending inventory** (`/pending-inventory`): records awaiting review, including AI drafts.

All data is mocked. Drafting is rule-based (no AI model is connected), and drafts are kept in
the browser's localStorage.

## Run it

`@onetrust/onecore` is published to OneTrust's internal Nexus registry, so you need Nexus
configured in your `~/.npmrc`. Install with npm 11 (npm 10.8 fails on this dependency tree):

```bash
npx npm@11 install
npm start
```

Then open http://localhost:4200.

## Deploy

Vercel can't reach Nexus, so the app is built on your machine and the output is uploaded
(project `ai-ropa-corie-onecore` in the Onetrust PM-UX Vercel team):

```bash
npm run deploy          # production: https://ai-ropa-corie-onecore.vercel.app
npm run deploy:preview  # a preview deployment
```

Pushing to GitHub does not deploy.

See `CLAUDE.md` for how the project is put together and the rules for using OneCore.
