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

// Milliseconds -> "12d 03h 04m 05s" (negative counts as zero).
export function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${Math.floor(s / 86400)}d ${pad(Math.floor(s / 3600) % 24)}h ${pad(Math.floor(s / 60) % 60)}m ${pad(s % 60)}s`;
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

// "Claude Pro · $28 CAD + 13% HST = $31.64 CAD on the 18th · 2 charges". A plan with
// "tax_included": true and no tax_rate shows its price as "$203 CAD incl. HST".
export function formatPlan(sub, charges) {
  const money = (n) => formatMoney(n, sub.currency);
  const price = sub.tax_rate
    ? `${money(sub.amount)} + ${+(sub.tax_rate * 100).toFixed(3)}% ${sub.tax_label ?? 'tax'} = ${money(withTax(sub.amount, sub.tax_rate))}`
    : `${money(sub.amount)}${sub.tax_included ? ` incl. ${sub.tax_label ?? 'tax'}` : ''}`;
  return `${sub.plan} · ${price} on the ${sub.charge_day}th · ${charges} ${charges === 1 ? 'charge' : 'charges'}`;
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

// "just now", "45m ago", "3h ago", then the date once a day has passed. A timestamp at exactly
// midnight UTC comes from a feed that only gives the date, so it shows as that date.
export function formatAgo(iso, nowMs = Date.now()) {
  const t = new Date(iso);
  if (t.getTime() % DAY_MS === 0) return formatShortDate(t.toISOString().slice(0, 10));
  const mins = Math.floor((nowMs - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  return formatShortDate(iso);
}

// "2026-10-13" or a full ISO timestamp -> "Oct 13" (the timestamp is read in Eastern time).
export function formatShortDate(value) {
  const dateOnly = value.length === 10;
  const date = dateOnly ? new Date(utcDay(value) + DAY_MS / 2) : new Date(value);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: dateOnly ? 'UTC' : ZONE }).format(date);
}
