// Parity test: runs the ropa-authoring skill's ropa_check.py and the app's
// TypeScript port (src/app/data/ropa-check.ts) on the same records, and fails
// on any difference. Run with `npm run skill:parity` after changing either.
//
// Cases: the skill's example drafts, edge cases (from the upstream parity
// test), and drafts built by the app's own extractor from sample descriptions.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = process.cwd();
const skill = path.join(root, '.claude/skills/ropa-authoring');
const script = path.join(skill, 'scripts/ropa_check.py');
const inventoryPath = path.join(skill, 'assets/inventory.example.json');
const posturePath = path.join(skill, 'assets/posture.default.json');
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const posture = JSON.parse(readFileSync(posturePath, 'utf8'));
const tmp = mkdtempSync(path.join(tmpdir(), 'skill-parity-'));

// Bundle the TypeScript port (and the extractor, for the app-built cases).
const entry = path.join(tmp, 'entry.ts');
writeFileSync(
  entry,
  `export { runRopaChecks } from ${JSON.stringify(path.join(root, 'src/app/data/ropa-check.ts'))};\n` +
    `export { draftRecord, SAMPLES } from ${JSON.stringify(path.join(root, 'src/app/data/skill-draft.ts'))};\n` +
    `export { DEMO_SAMPLES } from ${JSON.stringify(path.join(root, 'src/app/data/demo-samples.ts'))};\n`,
);
const bundle = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
const { runRopaChecks, draftRecord, SAMPLES, DEMO_SAMPLES } = await import(pathToFileURL(bundle).href);

// ---- cases ----

const cases = [];
const examples = {};
for (const file of readdirSync(path.join(skill, 'examples')).filter((f) => f.endsWith('.json'))) {
  examples[file] = JSON.parse(readFileSync(path.join(skill, 'examples', file), 'utf8'));
  cases.push({ label: `example: ${file}`, record: examples[file] });
}
const controller = examples['controller-draft.json'];
const joint = examples['joint-controller-draft.json'];
const processor = examples['processor-draft.json'];
cases.push(
  { label: 'edge: joint controller with nothing named', record: { ...joint, jointControllers: [], jointArrangement: '', roleDetail: '', description: 'Shared HR system.' } },
  { label: 'edge: regional grouping as owner', record: { ...joint, subsidiaryId: 'sub-emea' } },
  { label: 'edge: unknown owner', record: { ...joint, subsidiaryId: 'sub-nope' } },
  { label: 'edge: no owner', record: { ...controller, subsidiaryId: undefined } },
  { label: 'edge: processor relying on legitimate interests', record: { ...processor, legalBasis: 'Legitimate interests' } },
  {
    label: 'edge: processor, several controllers, no categories',
    record: { ...processor, processingCategories: [], controllers: [{ name: 'A Ltd' }, { name: 'B Ltd', contact: 'b@example.com' }] },
  },
  { label: 'edge: transfer with no safeguard or destination', record: { ...controller, internationalTransfers: 'Shared with an overseas partner' } },
  { label: 'edge: vague retention', record: { ...controller, retentionPeriod: 'Until no longer needed' } },
  { label: 'edge: event-based retention', record: { ...controller, retentionPeriod: 'Duration of employment' } },
  { label: 'edge: invalid legal basis', record: { ...controller, legalBasis: 'Business need' } },
  { label: 'edge: AI and monitoring keywords', record: { ...controller, purpose: 'Profiling and behavioural tracking of all users' } },
  { label: 'duplicate check', record: controller, existing: [{ ...controller, id: 'pa-1', name: 'AI candidate screening' }, processor] },
);
// The AI Assisted page's sample variants; the first of each scenario is already in SAMPLES.
for (const s of [...SAMPLES, ...DEMO_SAMPLES.filter((d) => !SAMPLES.some((x) => x.text === d.text))]) {
  for (const role of ['controller', 'joint_controller', 'processor']) {
    cases.push({ label: `app draft: ${s.label} as ${role}`, record: draftRecord(s.text, { role, subsidiaryId: 'sub-uk', name: s.label }) });
  }
}

// ---- run ----

// Drop null/undefined so "missing" and "null" compare equal; round floats.
function normalise(value) {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== null && value[key] !== undefined) out[key] = normalise(value[key]);
    }
    return out;
  }
  if (typeof value === 'number') return Math.round(value * 1000) / 1000;
  return value;
}

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
  const recordPath = path.join(tmp, `record-${i}.json`);
  writeFileSync(recordPath, JSON.stringify(c.record));
  const args = ['-I', script, recordPath, '--inventory', inventoryPath, '--posture', posturePath];
  if (c.existing?.length) {
    const existingPath = path.join(tmp, `existing-${i}.json`);
    writeFileSync(existingPath, JSON.stringify(c.existing));
    args.push('--existing', existingPath);
  }
  const python = normalise(JSON.parse(execFileSync('python3', args, { encoding: 'utf8' })));
  const ts = normalise(JSON.parse(JSON.stringify(runRopaChecks(c.record, { inventory, posture, existing: c.existing }))));
  const diff = firstDifference(python, ts);
  if (diff) {
    failures++;
    console.log(`FAIL  ${c.label}\n      ${diff}`);
  } else {
    console.log(`ok    ${c.label}`);
  }
});

console.log(failures ? `\n${failures} of ${cases.length} cases differ.` : `\nAll ${cases.length} cases match.`);
process.exit(failures ? 1 : 0);
