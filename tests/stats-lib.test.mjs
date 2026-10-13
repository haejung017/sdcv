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
