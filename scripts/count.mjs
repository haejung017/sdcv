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
    results[project.name] = { ok: true, ...countProject(dir, project, new Date(config.sdcv_start)) };
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
