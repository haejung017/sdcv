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
