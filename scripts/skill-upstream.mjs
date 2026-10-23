// Checks that the vendored ropa-authoring skill (.claude/skills/ropa-authoring)
// still matches the upstream repo's main branch. `npm run deploy` and
// `npm run deploy:preview` run it first, so a deploy stops when the copy has
// fallen behind.
//
//   npm run skill:upstream                       check, exit 1 if behind
//   SKILL_UPSTREAM_CHECK=warn npm run deploy     deploy anyway, with a warning
//
// It reads the source repo and path from the skill's UPSTREAM.md, fetches main
// with your git credentials into a cache (node_modules/.cache/skill-upstream),
// and compares every file's git blob hash. UPSTREAM.md itself is local only.
// If upstream can't be reached (offline, no access), it warns and lets the
// deploy carry on.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = path.join(root, '.claude/skills/ropa-authoring');
const cache = path.join(root, 'node_modules/.cache/skill-upstream');
const mode = process.env.SKILL_UPSTREAM_CHECK ?? 'fail'; // 'fail' | 'warn' | 'off'

if (mode === 'off') process.exit(0);

// Never stop for a credentials prompt: without access, git fails and the check warns.
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env, ...opts }).trim();

// ---- What UPSTREAM.md says ----

const upstreamMd = readFileSync(path.join(skillDir, 'UPSTREAM.md'), 'utf8');
const source = upstreamMd.match(/Source:\s*(https:\/\/github\.com\/[\w.-]+\/[\w.-]+),\s*`([^`]+)`/);
if (!source) {
  console.error('skill:upstream: UPSTREAM.md has no "Source: https://github.com/<owner>/<repo>, `<path>`" line.');
  process.exit(1);
}
const repoUrl = `${source[1]}.git`;
const skillPath = source[2].replace(/\/$/, '');
const recorded = upstreamMd.match(/Commit:\s*([0-9a-f]{7,40})/)?.[1];

// ---- Fetch upstream main ----

let head;
try {
  if (!existsSync(cache)) {
    mkdirSync(cache, { recursive: true });
    git(['init', '-q', '--bare', cache]);
  }
  git(['-C', cache, 'fetch', '-q', '--no-tags', repoUrl, '+refs/heads/main:refs/heads/main'], { timeout: 60_000 });
  head = git(['-C', cache, 'rev-parse', '--short', 'main']);
} catch (err) {
  const reason = String(err.stderr || err.message).split('\n').find(Boolean) ?? 'unknown error';
  console.warn(`⚠ skill:upstream: couldn't reach ${repoUrl} (${reason.trim()}).`);
  console.warn('  The ropa-authoring skill was not checked against upstream. Carrying on.');
  process.exit(0);
}

// ---- Compare files by git blob hash ----

const upstream = new Map(
  git(['-C', cache, 'ls-tree', '-r', 'main', '--', skillPath])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split('\t');
      return [path.posix.relative(skillPath, file), meta.split(' ')[2]];
    }),
);

function localFiles(dir, prefix = '') {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(full).isDirectory() ? localFiles(full, rel) : [rel];
  });
}
const local = new Map(
  localFiles(skillDir)
    .filter((f) => f !== 'UPSTREAM.md' && !f.endsWith('.DS_Store') && !f.includes('__pycache__'))
    .map((f) => [f, git(['hash-object', path.join(skillDir, f)])]),
);

const changed = [...upstream.keys()].filter((f) => local.has(f) && local.get(f) !== upstream.get(f));
const added = [...upstream.keys()].filter((f) => !local.has(f));
const removed = [...local.keys()].filter((f) => !upstream.has(f));

if (!changed.length && !added.length && !removed.length) {
  const note = recorded && !head.startsWith(recorded) && !recorded.startsWith(head) ? ` (UPSTREAM.md records ${recorded})` : '';
  console.log(`✓ ropa-authoring skill matches upstream main at ${head}${note}.`);
  process.exit(0);
}

// ---- Behind: say what changed and how to update ----

let commits = '';
try {
  if (recorded) {
    commits = git(['-C', cache, 'log', '--format=%h %cs %s', `${recorded}..main`, '--', skillPath])
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n');
  }
} catch {
  // The recorded commit isn't on main (rebased or mistyped): list nothing.
}

const lines = [
  `✖ The ropa-authoring skill is behind upstream main (${head}).`,
  ...changed.map((f) => `  changed upstream:  ${f}`),
  ...added.map((f) => `  new upstream:      ${f}`),
  ...removed.map((f) => `  removed upstream:  ${f}`),
  ...(commits ? ['', `Upstream commits since ${recorded}:`, commits] : []),
  '',
  'To update: copy the folder again from main, keep UPSTREAM.md and change its commit, then run',
  '`npm run skill:parity` (and update src/app/data/ropa-check.ts if scripts/ropa_check.py changed).',
  'To deploy anyway: SKILL_UPSTREAM_CHECK=warn npm run deploy',
];

if (mode === 'warn') {
  console.warn(lines.map((l) => l.replace(/^✖/, '⚠')).join('\n'));
  process.exit(0);
}
console.error(lines.join('\n'));
process.exit(1);
