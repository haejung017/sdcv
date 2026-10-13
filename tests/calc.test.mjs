import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateInZone, dayNumber, chargeCount, withTax, niceCeil, formatMoney, formatInt, formatShortDate, formatElapsed, formatAgo } from '../calc.mjs';

test('formatAgo: minutes, hours, then the date; date-only timestamps show the date', () => {
  const now = Date.parse('2026-10-14T10:00:00Z');
  assert.equal(formatAgo('2026-10-14T09:59:40.000Z', now), 'just now');
  assert.equal(formatAgo('2026-10-14T10:05:00.000Z', now), 'just now');
  assert.equal(formatAgo('2026-10-14T09:15:00.000Z', now), '45m ago');
  assert.equal(formatAgo('2026-10-14T07:00:00.000Z', now), '3h ago');
  assert.equal(formatAgo('2026-10-12T15:00:00.000Z', now), 'Oct 12');
  assert.equal(formatAgo('2026-10-14T00:00:00.000Z', now), 'Oct 14');
});

test('formatElapsed shows days, hours, minutes, seconds', () => {
  assert.equal(formatElapsed(0), '0d 00h 00m 00s');
  assert.equal(formatElapsed(-5000), '0d 00h 00m 00s');
  assert.equal(formatElapsed(((26 * 60 + 3) * 60 + 4) * 1000 + 999), '1d 02h 03m 04s');
  assert.equal(formatElapsed(400 * 86400000), '400d 00h 00m 00s');
});

test('withTax adds tax per charge, rounded to cents, times the count', () => {
  assert.equal(withTax(28, 0.13), 31.64);
  assert.equal(withTax(28, 0), 28);
  assert.equal(withTax(28, undefined), 28);
  assert.equal(withTax(28, 0.13, 3), 94.92);
  assert.equal(withTax(28, 0.13, 0), 0);
});

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
