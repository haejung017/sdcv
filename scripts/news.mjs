#!/usr/bin/env node
// Usage: node scripts/news.mjs
// Fetches the feeds under "news" in config.json and writes data/news.json: the morning's
// AI headlines. A feed that fails is skipped with a warning. If every feed fails,
// data/news.json is left as it was.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFeed, selectNews } from './news-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { news } = JSON.parse(await readFile(join(root, 'config.json'), 'utf8'));
const headers = { 'user-agent': 'Mozilla/5.0 (compatible; sdcv-dashboard; +https://haejung017.github.io/sdcv/)' };

const feeds = await Promise.all(news.feeds.map(async (feed) => {
  try {
    const res = await fetch(feed.url, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = parseFeed(await res.text());
    if (!items.length) throw new Error('no items found (feed format changed?)');
    console.log(`${feed.name}: ${items.length} items`);
    return { ...feed, items };
  } catch (err) {
    console.log(`::warning::${feed.name} feed skipped: ${err.message}`);
    return null;
  }
}));

const read = feeds.filter(Boolean);
if (!read.length) {
  console.log('::warning::No news feed could be read; keeping the previous data/news.json');
  process.exit(0);
}
const now = new Date();
const items = selectNews(read, now, { limit: news.limit, perSource: news.per_source, hours: news.hours });
await mkdir(join(root, 'data'), { recursive: true });
await writeFile(join(root, 'data', 'news.json'), JSON.stringify({ updated_at: now.toISOString(), items }, null, 2) + '\n');
console.log(`${items.length} headlines:`);
for (const it of items) console.log(`  ${it.source}: ${it.title}`);
