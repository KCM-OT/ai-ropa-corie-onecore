// Parity test: runs the ropa-recertification skill's recert_check.py and the
// app's TypeScript port (src/app/data/recert-check.ts) on the same submissions,
// and fails on any difference. `npm run skill:parity` runs it after the
// ropa-authoring parity test.
//
// Cases: the skill's example submissions, edge cases, and submissions the
// app's check-in builds from scripted owner answers (data/recertification.ts).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const skill = path.join(root, '.claude/skills/ropa-recertification');
const script = path.join(skill, 'scripts/recert_check.py');
const inventoryPath = path.join(root, '.claude/skills/ropa-authoring/assets/inventory.example.json');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const tmp = mkdtempSync(path.join(tmpdir(), 'recert-parity-'));
const TODAY = '2026-10-14';

const entry = path.join(tmp, 'entry.ts');
writeFileSync(
  entry,
  `export { runRecertChecks } from ${JSON.stringify(path.join(root, 'src/app/data/recert-check.ts'))};\n` +
    `export { parityCases } from ${JSON.stringify(path.join(root, 'src/app/data/recertification.ts'))};\n`,
);
const bundle = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
const { runRecertChecks, parityCases } = await import(pathToFileURL(bundle).href);

const ex = (f) => JSON.parse(readFileSync(path.join(skill, 'examples', f), 'utf8'));
const record = ex('record-recruitment.json');
const modified = ex('submission-modified.json');
const asIs = ex('submission-approved-as-is.json');

const cases = [
  { label: 'example: modified', sub: modified, record, inventory: null },
  { label: 'example: modified, with inventory', sub: modified, record, inventory },
  { label: 'example: approved as-is', sub: asIs, record, inventory },
  { label: 'edge: wrong decision', sub: { ...modified, decision: 'approved_as_is' }, record, inventory },
  { label: 'edge: bad enums', sub: { ...asIs, status: 'nope', decision: null }, record, inventory },
  { label: 'edge: other record', sub: { ...asIs, recordId: 'pa-other', recordName: 'Other' }, record, inventory },
  { label: 'edge: missing ownerNote', sub: (({ ownerNote, ...s }) => s)(asIs), record, inventory },
  {
    label: 'edge: field changes',
    sub: {
      ...modified,
      relationshipChanges: [],
      followUps: [],
      fieldChanges: [
        { key: 'legalBasis', label: 'Legal basis', before: 'Legitimate interests', after: 'Business need' },
        { key: 'legalBasis', label: 'Legal basis', before: 'old', after: 'Legitimate interests' },
        { key: 'retentionPeriod', before: 'x', after: 'Until no longer needed' },
        { key: 'internationalTransfers', label: 'International transfers', before: 'None', after: 'United States under SCCs' },
        { key: 'purpose', label: 'Purpose', before: 'Shortlist and hire job applicants', after: 'AI scoring and behavioural tracking of applicants' },
        { key: 'dataSubjectCategories', label: 'Data subjects', before: 'Job applicants', after: 'Job applicants, Students' },
        { key: 'businessProcessOwner', label: 'Business process owner', before: 'Global Talent Acquisition', after: '' },
        { key: 'jurisdiction', label: 'Jurisdiction', before: 'EU, UK', after: 'EU, UK' },
        { key: 'role', label: 'Role', before: '', after: 'processor' },
      ],
    },
    record,
    inventory,
  },
  {
    label: 'edge: relationship changes',
    sub: {
      ...modified,
      fieldChanges: [],
      followUps: [{ id: 'f', question: 'q', channel: 'email', audience: 'dpo', status: 'answered', sentAt: null, response: null }],
      relationshipChanges: [
        { action: 'added', type: 'vendor', name: 'Zoom', inventoryId: null },
        { action: 'added', type: 'vendor', name: 'Workday', inventoryId: null },
        { action: 'added', type: 'vendor', name: 'Okta', inventoryId: 'ven-wrong' },
        { action: 'removed', type: 'vendor', name: 'Slack', inventoryId: null },
        { action: 'added', type: 'personalData', name: 'Health data', inventoryId: null },
        { action: 'removed', type: 'personalData', name: 'Health data', inventoryId: null },
        { action: 'added', type: 'asset', name: 'AI scoring engine', inventoryId: null },
        { action: 'added', type: 'asset', name: 'AI scoring engine', inventoryId: null },
        { action: 'added', type: 'asset', name: '  ', inventoryId: null },
        { action: 'moved', type: 'asset', name: 'x', inventoryId: null },
        { action: 'added', type: 'team', name: 'x', inventoryId: null },
      ],
    },
    record,
    inventory,
  },
  { label: 'edge: never reviewed', sub: asIs, record: { ...record, nextReviewAt: null, reviewCadenceDays: null }, inventory },
  { label: 'edge: due soon', sub: asIs, record: { ...record, nextReviewAt: '2026-11-01T00:00:00.000Z' }, inventory },
  ...parityCases().map((c) => ({ ...c, inventory })),
];

function firstDifference(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDifference(a[k], b[k], `${at}.${k}`);
      if (d) return d;
    }
  }
  return `${at || '(root)'}: python=${JSON.stringify(a)} typescript=${JSON.stringify(b)}`;
}

let failures = 0;
cases.forEach((c, i) => {
  const subPath = path.join(tmp, `sub-${i}.json`);
  const recPath = path.join(tmp, `rec-${i}.json`);
  const outPath = path.join(tmp, `out-${i}.json`);
  writeFileSync(subPath, JSON.stringify(c.sub));
  writeFileSync(recPath, JSON.stringify(c.record));
  const args = ['-I', script, subPath, '--record', recPath, '--today', TODAY, '--json', '--emit-record', outPath];
  if (c.inventory) args.push('--inventory', inventoryPath);
  let out;
  try {
    out = execFileSync('python3', args, { encoding: 'utf8' });
  } catch (e) {
    out = e.stdout; // exit 1 when there are errors
  }
  const python = { ...JSON.parse(out), _patched: JSON.parse(readFileSync(outPath, 'utf8')) };
  const ts = JSON.parse(JSON.stringify(runRecertChecks(c.sub, c.record, c.inventory, TODAY)));
  const diff = firstDifference(python, ts);
  if (diff) {
    failures++;
    console.log(`FAIL  ${c.label}\n      ${diff}`);
  } else {
    console.log(`ok    ${c.label}`);
  }
});

console.log(failures ? `\n${failures} of ${cases.length} recertification cases differ.` : `\nAll ${cases.length} recertification cases match.`);
process.exit(failures ? 1 : 0);
