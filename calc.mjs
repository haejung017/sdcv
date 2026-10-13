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

// Each charge is amount + tax, rounded to the cent as on the card statement.
export function withTax(amount, taxRate = 0, count = 1) {
  return (Math.round(amount * (1 + (taxRate ?? 0)) * 100) * count) / 100;
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
  const dateOnly = value.length === 10;
  const date = dateOnly ? new Date(utcDay(value) + DAY_MS / 2) : new Date(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: dateOnly ? 'UTC' : ZONE }).format(date);
}
