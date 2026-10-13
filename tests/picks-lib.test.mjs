import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePicks } from '../scripts/picks-lib.mjs';

const now = new Date('2026-10-14T12:15:00Z');
const story = (n) => ({ title: `Story ${n}`, url: `https://x.example/${n}`, source: 'The Verge', why: `Reason ${n}.` });

test('normalizePicks tidies text, keeps known fields, stamps the time', () => {
  const input = {
    items: [
      { title: '  Big   launch ', url: 'https://x.example/a', source: 'The Verge · Ars Technica', why: 'Changes\nwhat agents can do.', tags: [' ReportGen '], rank: 1 },
      story(2),
    ],
    skipped: ' 4 funding stories ',
    extra: true,
  };
  assert.deepEqual(normalizePicks(input, now), {
    ranked_at: '2026-10-14T12:15:00.000Z',
    items: [
      { title: 'Big launch', url: 'https://x.example/a', source: 'The Verge · Ars Technica', why: 'Changes what agents can do.', tags: ['ReportGen'] },
      { title: 'Story 2', url: 'https://x.example/2', source: 'The Verge', why: 'Reason 2.', tags: [] },
    ],
    skipped: '4 funding stories',
  });
  assert.equal(normalizePicks({ items: [story(1)] }, now).skipped, '');
});

test('normalizePicks rejects anything the page should not show', () => {
  const bad = [
    [{}, /items/],
    [{ items: [] }, /1 to 10/],
    [{ items: Array.from({ length: 11 }, (_, i) => story(i)) }, /1 to 10/],
    [{ items: [{ ...story(1), why: ' ' }] }, /item 1: why/],
    [{ items: [story(1), { ...story(2), url: 'javascript:alert(1)' }] }, /item 2: url/],
    [{ items: [{ ...story(1), tags: ['a', 'b', 'c', 'd'] }] }, /item 1: tags/],
    [{ items: [{ ...story(1), tags: 'Libriso' }] }, /item 1: tags/],
    [{ items: [{ ...story(1), why: 'x'.repeat(281) }] }, /item 1: why is over 280/],
    [{ items: [story(1)], skipped: 5 }, /skipped/],
  ];
  for (const [input, message] of bad) assert.throws(() => normalizePicks(input, now), message);
});
