#!/usr/bin/env node
// Usage: node scripts/save-picks.mjs < picks.json
// Reads Claude's ranked AI news picks ({ items: [{ title, url, source, why, tags }], skipped })
// from stdin, checks them, stamps the time and writes data/picks.json. Used by /ai-news.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePicks } from './picks-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const picks = normalizePicks(JSON.parse(readFileSync(0, 'utf8')));
  writeFileSync(join(root, 'data', 'picks.json'), JSON.stringify(picks, null, 2) + '\n');
  console.log(`Saved ${picks.items.length} picks to data/picks.json`);
} catch (err) {
  console.error(`Picks not saved: ${err.message}`);
  process.exit(1);
}
