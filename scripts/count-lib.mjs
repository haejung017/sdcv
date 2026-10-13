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
    cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
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
