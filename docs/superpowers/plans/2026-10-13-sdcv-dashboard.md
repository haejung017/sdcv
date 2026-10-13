# SDCV Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public GitHub Pages dashboard that shows three numbers: Claude subscription spent, value generated, and lines of code from Jay's 4 private repos. A daily GitHub Action keeps it updated.

**Architecture:**
- **Counting:** a dependency-free Node counter (`scripts/`) reads cloned repos and writes `data/stats.json` and `data/history.json`.
- **Page:** a single static page (`index.html` plus the pure helpers in `calc.mjs`) reads `config.json` and the data files.
- **Robot:** one workflow clones the repos with per-repo read-only deploy keys, counts, commits the data, and deploys Pages.

**Tech Stack:** Node 24 (built-in `node:test`, `node:fs`, `child_process`), git, plain HTML/CSS/JS with inline SVG, GitHub Actions, GitHub Pages, and the `gh` CLI for setup.

Spec: `docs/superpowers/specs/2026-10-13-sdcv-dashboard-design.md`

`gh` is installed at `/c/Users/haeju/AppData/Local/Microsoft/WinGet/Packages/GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe/bin/gh.exe`. The steps below call it `$GH`.

---

## File map

| File | Responsibility |
|---|---|
| `config.json` | Hand-edited settings: start time, subscription, value, project list with baselines and excludes |
| `package.json` | `"type": "module"` and the `npm test` script |
| `scripts/count-lib.mjs` | Pure git and file counting: `isCounted`, `parseNumstat`, `countLocByFile`, `countLoc`, `countSince`, `lastCommit`, `countProject` |
| `scripts/stats-lib.mjs` | Merges results into stats (stale handling) and updates history: `buildStats`, `upsertHistory`, `dateInToronto` |
| `scripts/count.mjs` | CLI that wires config, repos and the libs, then writes `data/*.json` |
| `scripts/clone.sh` | Workflow helper: clones each repo with its deploy key |
| `calc.mjs` | Pure page math and formatting: `dateInZone`, `dayNumber`, `chargeCount`, `niceCeil`, `formatMoney`, `formatInt`, `formatShortDate` |
| `index.html` | Page markup, CSS, rendering and the SVG chart |
| `tests/*.test.mjs` | Tests for the three libs |
| `.github/workflows/update.yml` | Daily, manual and push runs: clone, count, commit, deploy Pages |

---

### Task 1: Scaffold

**Files:** Create `config.json`, `package.json`, `.gitignore`

- [ ] **Step 1: Create `config.json`**

```json
{
  "sdcv_start": "2026-10-13T10:30:00-04:00",
  "subscription": { "plan": "Claude Pro", "amount": 28, "currency": "CAD", "charge_day": 18, "first_charge": "2026-10-18" },
  "value_generated": { "amount": 0, "currency": "CAD" },
  "projects": [
    { "name": "Libriso",   "repo": "haejung017/Libriso",   "baseline": "9d9055ddba55c186a21b4d7a43005e5653a707e9", "exclude": [] },
    { "name": "ReportGen", "repo": "haejung017/ReportGen", "baseline": "9edc44b384bbecbe57e47b16fd34cb724f1ed938", "exclude": [] },
    { "name": "TheClimb",  "repo": "haejung017/TheClimb",  "baseline": "de2997c786a821325544b79215f1cbe5668ba8c6", "exclude": [] },
    { "name": "POCRD",     "repo": "haejung017/POCRD",     "baseline": "89d452cf3a0e158388d5de6d75e56c016cb6257d", "exclude": [] }
  ]
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "sdcv",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
repos/
_site/
node_modules/
```

- [ ] **Step 4: Commit:** `git add config.json package.json .gitignore && git commit -m "Scaffold dashboard config"`

---

### Task 2: Counter library (TDD)

**Files:** Create `scripts/count-lib.mjs`. Test: `tests/count-lib.test.mjs`

- [ ] **Step 1: Write the failing tests** in `tests/count-lib.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { isCounted, parseNumstat, countLoc, countSince, lastCommit } from '../scripts/count-lib.mjs';

test('isCounted keeps code files and drops excluded ones', () => {
  assert.equal(isCounted('R/app.R'), true);
  assert.equal(isCounted('src/App.jsx'), true);
  assert.equal(isCounted('report.Rmd'), true);
  assert.equal(isCounted('README.md'), false);
  assert.equal(isCounted('data/program.json'), false);
  assert.equal(isCounted('package-lock.json'), false);
  assert.equal(isCounted('node_modules/x/index.js'), false);
  assert.equal(isCounted('www/lib/pdf.min.js'), false);
  assert.equal(isCounted('renv/activate.R'), false);
  assert.equal(isCounted('python/.venv/lib/a.py'), false);
  assert.equal(isCounted('www/pdfjs/pdf.js', ['www/pdfjs']), false);
  assert.equal(isCounted('www/pdfjs2/a.js', ['www/pdfjs']), true);
  assert.equal(isCounted('one-off.js', ['one-off.js']), false);
});

test('parseNumstat sums additions of counted files, resolving renames', () => {
  const out = [
    '3\t1\tsrc/a.js',
    '-\t-\timg/logo.png',
    '2\t0\tsrc/{old => new}/b.js',
    '1\t1\told.js => new.js',
    '9\t0\tpackage-lock.json',
    '',
  ].join('\n');
  assert.equal(parseNumstat(out), 6);
  assert.equal(parseNumstat(out, ['src/new']), 4);
});

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'sdcv-test-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  const write = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  git('init', '-q', '-b', 'main');
  return { dir, git, write, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('countLoc counts non-blank lines in counted files only', () => {
  const r = makeRepo();
  try {
    r.write('app.R', 'x <- 1\n\n  \ny <- 2\nz <- 3\n');
    r.write('node_modules/dep/index.js', 'a\nb\n');
    r.write('lib.min.js', 'a\n');
    r.write('data.json', '{\n}\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'init');
    assert.equal(countLoc(r.dir), 3);
  } finally { r.cleanup(); }
});

test('countSince sums additions after the baseline commit', () => {
  const r = makeRepo();
  try {
    r.write('app.R', 'x <- 1\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'base');
    const baseline = r.git('rev-parse', 'HEAD');
    r.write('app.R', 'x <- 1\ny <- 2\nz <- 3\n');
    r.write('b.js', '1\n2\n3\n4\n');
    r.write('notes.json', '{}\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'work');
    assert.equal(countSince(r.dir, baseline), 6);
    assert.equal(countSince(r.dir, r.git('rev-parse', 'HEAD')), 0);
    assert.throws(() => countSince(r.dir, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'));
  } finally { r.cleanup(); }
});

test('lastCommit returns an ISO timestamp', () => {
  const r = makeRepo();
  try {
    r.write('a.js', '1\n');
    r.git('add', '-A');
    r.git('commit', '-q', '-m', 'one');
    assert.match(lastCommit(r.dir), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  } finally { r.cleanup(); }
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL, because `scripts/count-lib.mjs` doesn't exist yet.

- [ ] **Step 3: Implement `scripts/count-lib.mjs`**

```js
// Counts lines of code in a git repo. No dependencies: node + git only.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CODE_EXTENSIONS = new Set([
  '.r', '.rmd', '.qmd', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.py', '.css', '.scss', '.html', '.sql', '.sh', '.ps1',
]);
const EXCLUDED_DIRS = new Set([
  'node_modules', 'dist', 'build', 'renv', '.venv', 'venv', 'vendor',
  'coverage', 'test-results', 'playwright-report', '.wrangler',
]);

// extraExcludes: repo-relative file or folder paths from config.json "exclude".
export function isCounted(path, extraExcludes = []) {
  const p = path.replace(/\\/g, '/');
  const lower = p.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0 || !CODE_EXTENSIONS.has(lower.slice(dot))) return false;
  if (/\.min\.(js|css)$/.test(lower)) return false;
  if (p.split('/').slice(0, -1).some((dir) => EXCLUDED_DIRS.has(dir))) return false;
  return !extraExcludes.some((ex) => p === ex || p.startsWith(ex.replace(/\/$/, '') + '/'));
}

// Resolves git's rename notation to the new path:
// "src/{old => new}/b.js" -> "src/new/b.js", "old.js => new.js" -> "new.js".
function renamedTo(path) {
  if (!path.includes(' => ')) return path;
  if (path.includes('{')) return path.replace(/\{[^}]* => ([^}]*)\}/, '$1').replace(/\/\//g, '/');
  return path.split(' => ')[1];
}

export function parseNumstat(output, extraExcludes = []) {
  let added = 0;
  for (const line of output.split('\n')) {
    const [add, , ...rest] = line.split('\t');
    if (!rest.length || add === '-') continue;
    if (isCounted(renamedTo(rest.join('\t')), extraExcludes)) added += Number(add);
  }
  return added;
}

function git(dir, ...args) {
  return execFileSync('git', ['-c', 'core.quotepath=off', ...args], {
    cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
}

// [{ path, lines }] for every counted file at HEAD, largest first.
export function countLocByFile(dir, extraExcludes = []) {
  return git(dir, 'ls-files', '-z')
    .split('\0')
    .filter((path) => path && isCounted(path, extraExcludes))
    .map((path) => ({
      path,
      lines: readFileSync(join(dir, path), 'utf8').split(/\r?\n/).filter((l) => l.trim()).length,
    }))
    .sort((a, b) => b.lines - a.lines);
}

export function countLoc(dir, extraExcludes = []) {
  return countLocByFile(dir, extraExcludes).reduce((sum, f) => sum + f.lines, 0);
}

// Lines added in commits after `baseline`. Throws if the baseline is unknown.
export function countSince(dir, baseline, extraExcludes = []) {
  git(dir, 'cat-file', '-e', `${baseline}^{commit}`);
  return parseNumstat(git(dir, 'log', '--numstat', '--format=', `${baseline}..HEAD`), extraExcludes);
}

export function lastCommit(dir) {
  return git(dir, 'log', '-1', '--format=%cI').trim();
}

export function countProject(dir, project) {
  const exclude = project.exclude ?? [];
  return {
    loc: countLoc(dir, exclude),
    since_sdcv: countSince(dir, project.baseline, exclude),
    last_commit: lastCommit(dir),
  };
}
```

- [ ] **Step 4: Run** `npm test`. Expected: all count-lib tests PASS.

- [ ] **Step 5: Commit:** `git add scripts/count-lib.mjs tests/count-lib.test.mjs && git commit -m "Add line counter library"`

---

### Task 3: Stats merging (TDD)

**Files:** Create `scripts/stats-lib.mjs`. Test: `tests/stats-lib.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStats, upsertHistory, dateInToronto } from '../scripts/stats-lib.mjs';

const config = { projects: [{ name: 'A' }, { name: 'B' }] };
const now = new Date('2026-10-14T10:00:00Z');

test('buildStats uses fresh results and sums totals', () => {
  const stats = buildStats(config, {
    A: { ok: true, loc: 100, since_sdcv: 10, last_commit: '2026-10-13T12:00:00-04:00' },
    B: { ok: true, loc: 50, since_sdcv: 5, last_commit: '2026-10-12T12:00:00-04:00' },
  }, null, now);
  assert.equal(stats.updated_at, '2026-10-14T10:00:00.000Z');
  assert.deepEqual(stats.totals, { loc: 150, since_sdcv: 15 });
  assert.equal(stats.projects[0].stale_since, null);
});

test('buildStats keeps previous numbers for a failed repo and marks it stale', () => {
  const previous = { projects: [
    { name: 'A', loc: 90, since_sdcv: 8, last_commit: 'x', stale_since: null },
    { name: 'B', loc: 40, since_sdcv: 4, last_commit: 'y', stale_since: '2026-10-12' },
  ] };
  const stats = buildStats(config, {
    A: { ok: false, error: 'clone failed' },
    B: { ok: false, error: 'clone failed' },
  }, previous, now);
  assert.deepEqual(stats.projects[0], { name: 'A', loc: 90, since_sdcv: 8, last_commit: 'x', stale_since: '2026-10-14' });
  assert.equal(stats.projects[1].stale_since, '2026-10-12');
  assert.deepEqual(stats.totals, { loc: 130, since_sdcv: 12 });
});

test('buildStats with no previous data and a failure reports zeros, stale', () => {
  const stats = buildStats({ projects: [{ name: 'A' }] }, { A: { ok: false } }, null, now);
  assert.deepEqual(stats.projects[0], { name: 'A', loc: 0, since_sdcv: 0, last_commit: null, stale_since: '2026-10-14' });
});

test('upsertHistory replaces the row for the same date and keeps order', () => {
  const rows = upsertHistory(
    [{ date: '2026-10-14', since_sdcv: 1, loc: 1 }, { date: '2026-10-13', since_sdcv: 0, loc: 1 }],
    '2026-10-14', { since_sdcv: 7, loc: 9 });
  assert.deepEqual(rows, [
    { date: '2026-10-13', since_sdcv: 0, loc: 1 },
    { date: '2026-10-14', since_sdcv: 7, loc: 9 },
  ]);
});

test('dateInToronto uses Eastern time', () => {
  assert.equal(dateInToronto(new Date('2026-10-14T03:00:00Z')), '2026-10-13');
  assert.equal(dateInToronto(new Date('2026-10-14T10:00:00Z')), '2026-10-14');
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL, because `stats-lib.mjs` is missing.

- [ ] **Step 3: Implement `scripts/stats-lib.mjs`**

```js
// Turns per-project count results into data/stats.json and data/history.json rows.

export function dateInToronto(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(date);
}

// results: { [name]: { ok: true, loc, since_sdcv, last_commit } | { ok: false, error } }
// A failed project keeps its previous numbers and is marked stale from the first failed day.
export function buildStats(config, results, previous, now) {
  const today = dateInToronto(now);
  const prevByName = new Map((previous?.projects ?? []).map((p) => [p.name, p]));
  const projects = config.projects.map(({ name }) => {
    const r = results[name];
    if (r?.ok) {
      return { name, loc: r.loc, since_sdcv: r.since_sdcv, last_commit: r.last_commit, stale_since: null };
    }
    const prev = prevByName.get(name);
    return {
      name,
      loc: prev?.loc ?? 0,
      since_sdcv: prev?.since_sdcv ?? 0,
      last_commit: prev?.last_commit ?? null,
      stale_since: prev?.stale_since ?? today,
    };
  });
  const totals = {
    loc: projects.reduce((s, p) => s + p.loc, 0),
    since_sdcv: projects.reduce((s, p) => s + p.since_sdcv, 0),
  };
  return { updated_at: now.toISOString(), projects, totals };
}

export function upsertHistory(history, date, totals) {
  return [...history.filter((r) => r.date !== date), { date, since_sdcv: totals.since_sdcv, loc: totals.loc }]
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Run** `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit:** `git add scripts/stats-lib.mjs tests/stats-lib.test.mjs && git commit -m "Add stats merging with stale handling"`

---

### Task 4: Counter CLI plus a check against the real repos

**Files:** Create `scripts/count.mjs`. Modify `config.json` (the `exclude` lists). Create `data/stats.json` and `data/history.json`.

- [ ] **Step 1: Implement `scripts/count.mjs`**

```js
#!/usr/bin/env node
// Usage: node scripts/count.mjs [--repos <dir>] [--top <n>]
// <dir> holds one clone per project, named as in config.json (e.g. repos/Libriso).
// --top prints each project's largest counted files, to check the exclude lists.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countProject, countLocByFile } from './count-lib.mjs';
import { buildStats, upsertHistory, dateInToronto } from './stats-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const reposDir = resolve(arg('--repos') ?? join(root, 'repos'));
const top = Number(arg('--top') ?? 0);
const readJson = async (path, fallback) => (existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : fallback);

const config = await readJson(join(root, 'config.json'));
const previous = await readJson(join(root, 'data', 'stats.json'), null);
const history = await readJson(join(root, 'data', 'history.json'), []);

const results = {};
for (const project of config.projects) {
  const dir = join(reposDir, project.name);
  try {
    if (!existsSync(join(dir, '.git'))) throw new Error(`not cloned at ${dir}`);
    results[project.name] = { ok: true, ...countProject(dir, project) };
    console.log(`${project.name}: ${results[project.name].loc} lines, ${results[project.name].since_sdcv} since SDCV`);
    if (top) {
      for (const f of countLocByFile(dir, project.exclude ?? []).slice(0, top)) console.log(`  ${String(f.lines).padStart(7)}  ${f.path}`);
    }
  } catch (err) {
    results[project.name] = { ok: false, error: err.message };
    console.log(`::warning::${project.name} not counted: ${err.message}`);
  }
}

const now = new Date();
const stats = buildStats(config, results, previous, now);
await mkdir(join(root, 'data'), { recursive: true });
await writeFile(join(root, 'data', 'stats.json'), JSON.stringify(stats, null, 2) + '\n');
await writeFile(join(root, 'data', 'history.json'),
  JSON.stringify(upsertHistory(history, dateInToronto(now), stats.totals), null, 2) + '\n');
console.log(`Total: ${stats.totals.loc} lines, ${stats.totals.since_sdcv} since SDCV`);
```

- [ ] **Step 2: Clone the real repos locally** (this uses the `gh` login)

```bash
mkdir -p repos && for r in Libriso ReportGen TheClimb POCRD; do "$GH" repo clone "haejung017/$r" "repos/$r" -- -q; done
```

- [ ] **Step 3: Run** `node scripts/count.mjs --top 15`. Expected: 4 lines like `Libriso: N lines, 0 since SDCV`. Since SDCV must be 0 for every project, because baseline = HEAD.

- [ ] **Step 4: Check the exclusions.** Read each project's top-15 list. Any third-party or generated file goes into that project's `exclude` in `config.json`, as a path or folder prefix. Examples: a vendored `pdf.js` under `www/`, generated HTML reports, copied libraries. Re-run until each top list holds only Jay's own code. Record the final numbers.

- [ ] **Step 5: Delete `data/` and re-run once,** so `history.json` starts with one clean row for today: `rm -rf data && node scripts/count.mjs`

- [ ] **Step 6: Commit:** `git add scripts/count.mjs config.json data && git commit -m "Add counter CLI and baseline numbers"`

---

### Task 5: Page helpers (TDD)

**Files:** Create `calc.mjs`. Test: `tests/calc.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateInZone, dayNumber, chargeCount, niceCeil, formatMoney, formatInt, formatShortDate } from '../calc.mjs';

test('dayNumber: start day is Day 1', () => {
  assert.equal(dayNumber('2026-10-13', '2026-10-13'), 1);
  assert.equal(dayNumber('2026-10-13', '2026-10-14'), 2);
  assert.equal(dayNumber('2026-10-13', '2026-11-13'), 32);
});

test('chargeCount counts charge dates from the first charge up to today', () => {
  assert.equal(chargeCount('2026-10-18', 18, '2026-10-17'), 0);
  assert.equal(chargeCount('2026-10-18', 18, '2026-10-18'), 1);
  assert.equal(chargeCount('2026-10-18', 18, '2026-11-17'), 1);
  assert.equal(chargeCount('2026-10-18', 18, '2026-11-18'), 2);
  assert.equal(chargeCount('2026-10-18', 18, '2027-10-18'), 13);
});

test('niceCeil rounds up to 1, 2 or 5 times a power of ten', () => {
  assert.equal(niceCeil(0), 10);
  assert.equal(niceCeil(7), 10);
  assert.equal(niceCeil(130), 200);
  assert.equal(niceCeil(4100), 5000);
});

test('formatting', () => {
  assert.equal(formatMoney(28, 'CAD'), '$28 CAD');
  assert.equal(formatMoney(0, 'CAD'), '$0 CAD');
  assert.equal(formatMoney(1234.5, 'CAD'), '$1,234.50 CAD');
  assert.equal(formatInt(51234), '51,234');
  assert.equal(formatShortDate('2026-10-13T12:34:50-04:00'), 'Oct 13');
  assert.equal(formatShortDate('2026-10-13'), 'Oct 13');
  assert.equal(dateInZone(new Date('2026-10-14T03:00:00Z')), '2026-10-13');
});
```

- [ ] **Step 2: Run** `npm test`. Expected: FAIL, because `calc.mjs` is missing.

- [ ] **Step 3: Implement `calc.mjs`**

```js
// Pure helpers for index.html. Also imported by tests/calc.test.mjs.
const ZONE = 'America/Toronto';
const DAY_MS = 86400000;
const utcDay = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };

export function dateInZone(date, timeZone = ZONE) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

// The start date is Day 1.
export function dayNumber(startYmd, todayYmd) {
  return Math.round((utcDay(todayYmd) - utcDay(startYmd)) / DAY_MS) + 1;
}

// Charge dates on `chargeDay` of each month, from `firstChargeYmd` up to `todayYmd`, inclusive.
export function chargeCount(firstChargeYmd, chargeDay, todayYmd) {
  if (todayYmd < firstChargeYmd) return 0;
  const [fy, fm] = firstChargeYmd.split('-').map(Number);
  const [ty, tm, td] = todayYmd.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td >= chargeDay ? 1 : 0);
}

export function niceCeil(n) {
  if (n <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export function formatMoney(amount, currency) {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' ' + currency;
}

export function formatInt(n) {
  return n.toLocaleString('en-US');
}

// "2026-10-13" or a full ISO timestamp -> "Oct 13" (the timestamp is read in Eastern time).
export function formatShortDate(value) {
  const date = value.length === 10 ? new Date(utcDay(value) + DAY_MS / 2) : new Date(value);
  const timeZone = value.length === 10 ? 'UTC' : ZONE;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(date);
}
```

- [ ] **Step 4: Run** `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit:** `git add calc.mjs tests/calc.test.mjs && git commit -m "Add page calculation helpers"`

---

### Task 6: The page

**Files:** Create `index.html`

Color roles come from the dataviz reference palette:
- light: surface `#fcfcfb`, series `#2a78d6`
- dark: surface `#1a1a19`, series `#3987e5`

There is one series, so there's no legend; the chart title names it. Lines are 2px, the end marker is 8px, and there's a hover crosshair with a tooltip, plus a "Show as table" view. Exactly one hero number (lines since SDCV).

- [ ] **Step 1: Create `index.html`**. The full file content lives in the repo once written. It must contain:
  - **`<head>`:**
    - `<meta name="viewport">`
    - `<title>SDCV</title>`
    - a meta description
    - an inline SVG favicon
    - CSS custom properties on `:root`, redefined under `@media (prefers-color-scheme: dark)` (with a `:root:not([data-theme="light"])` guard) and under `:root[data-theme="dark"]`
    - an explicit `body` background
  - **Markup:**
    - header ("Stop Doomscrolling, Create Value", `<h1>SDCV</h1>`, `#day`)
    - hero (`#since`, `#loc`)
    - two tiles (`#spent` with `#plan`; `#value`)
    - chart section (`#chart`, `<details>` with `#history-rows`)
    - projects table (`#projects`)
    - footer (`#updated` plus the counting note)
    - `#error` for load failures
  - **Module script:**
    - import from `./calc.mjs`
    - fetch `config.json`, `data/stats.json` and `data/history.json` with `?v=<timestamp>`
    - fill every id
    - render projects rows, sorted by `since_sdcv` then `loc`, descending; a stale row shows "Stale since Oct 14"
    - `renderChart()`: an SVG sized to the container width × 220 px; y from 0 to `niceCeil(max)` with 3 recessive gridlines and labels; x by date, with first and last date labels; a 2px path; an 8px end marker labeled with the latest value; a pointer crosshair plus a tooltip (date, value); re-render on resize
  - **Layout:** works at 375 px, with no horizontal scroll and a 16 px side gutter.

  (Executor: write the complete file. All behavior is specified above, and every helper it needs exists in `calc.mjs`.)

- [ ] **Step 2: Serve and look at it:** `npx --yes http-server -p 8765 -c-1 .` (or `python -m http.server`). Open `http://localhost:8765` in Chrome. Check:
  - the numbers match `data/stats.json`
  - Day N is right
  - Subscription is `$0 CAD` before Oct 18
  - it looks right at 375 px and in dark mode
  - the hover tooltip works

- [ ] **Step 3: Commit:** `git add index.html && git commit -m "Add dashboard page"`

---

### Task 7: Workflow

**Files:** Create `scripts/clone.sh`, `.github/workflows/update.yml`

- [ ] **Step 1: Create `scripts/clone.sh`**

```bash
#!/usr/bin/env bash
# Clones each project in config.json with its read-only deploy key (secret KEY_<NAME>).
# A repo that fails is skipped; count.mjs then keeps its old numbers and marks it stale.
set -u
dest="$1"
mkdir -p "$dest"
keydir="$(mktemp -d)"
trap 'rm -rf "$keydir"' EXIT
node -e 'for (const p of require("./config.json").projects) console.log(p.name, p.repo)' |
while read -r name repo; do
  var="KEY_$(echo "$name" | tr '[:lower:]' '[:upper:]')"
  key="${!var:-}"
  if [ -z "$key" ]; then echo "::warning::Secret $var is missing; skipping $name"; continue; fi
  printf '%s\n' "$key" > "$keydir/$name"
  chmod 600 "$keydir/$name"
  if GIT_SSH_COMMAND="ssh -i $keydir/$name -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
     git clone --quiet "git@github.com:$repo.git" "$dest/$name"; then
    echo "Cloned $name"
  else
    echo "::warning::Could not clone $name"
  fi
done
```

- [ ] **Step 2: Create `.github/workflows/update.yml`**

```yaml
name: Update stats

on:
  schedule:
    - cron: "0 10 * * *" # 10:00 UTC, about 6 AM Eastern
  workflow_dispatch:
  push:
    branches: [main]

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: update-stats
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
      - name: Test
        run: npm test
      - name: Clone project repos
        env:
          KEY_LIBRISO: ${{ secrets.KEY_LIBRISO }}
          KEY_REPORTGEN: ${{ secrets.KEY_REPORTGEN }}
          KEY_THECLIMB: ${{ secrets.KEY_THECLIMB }}
          KEY_POCRD: ${{ secrets.KEY_POCRD }}
        run: bash scripts/clone.sh "$RUNNER_TEMP/repos"
      - name: Count lines
        run: node scripts/count.mjs --repos "$RUNNER_TEMP/repos"
      - name: Save numbers
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data
          if git diff --cached --quiet; then echo "No changes"; exit 0; fi
          git commit -m "Update stats $(date -u +%F)"
          git pull --rebase origin main
          git push origin HEAD:main
      - name: Build site
        run: |
          mkdir -p _site/data
          cp index.html calc.mjs config.json _site/
          cp data/*.json _site/data/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: _site
      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Commit:** `git add scripts/clone.sh .github && git commit -m "Add daily update workflow"`

---

### Task 8: GitHub setup and first live run

- [ ] **Step 1: Create the public repo and push:** `"$GH" repo create haejung017/sdcv --public --source . --remote origin --description "Stop Doomscrolling, Create Value: public build log" --push`

- [ ] **Step 2: Create one read-only deploy key per project** (in the scratchpad, never in the repo):

```bash
for r in Libriso ReportGen TheClimb POCRD; do
  up=$(echo $r | tr '[:lower:]' '[:upper:]')
  ssh-keygen -t ed25519 -N "" -C "sdcv-dashboard-$r" -f "$KEYS/$r" -q
  "$GH" repo deploy-key add "$KEYS/$r.pub" --repo "haejung017/$r" --title "sdcv dashboard (read-only)"
  "$GH" secret set "KEY_$up" --repo haejung017/sdcv < "$KEYS/$r"
done
rm -rf "$KEYS"
```

Expected: 4 deploy keys added (read-only is the default) and 4 secrets set.

- [ ] **Step 3: Enable Pages from Actions:** `"$GH" api -X POST repos/haejung017/sdcv/pages -f build_type=workflow`

- [ ] **Step 4: Run it:** `"$GH" workflow run update.yml --repo haejung017/sdcv`, then `"$GH" run watch --repo haejung017/sdcv`. Expected: success, with all 4 repos cloned (no `::warning::` lines).

- [ ] **Step 5: Verify live:** open `https://haejung017.github.io/sdcv/` and check that the numbers match the local run.

---

### Task 9: Record it in the control center

- [ ] Update the "SDCV dashboard" section of `SDCV/CLAUDE.md` (outside this repo):
  - the live URL
  - how to change Value generated (edit `config.json` on github.com)
  - how to add a project (add it to `config.json`, add a deploy key, and add a `KEY_<NAME>` secret plus its `env` line in `update.yml`)
  - that the deploy keys exist
