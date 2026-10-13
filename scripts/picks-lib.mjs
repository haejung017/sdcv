// Checks Claude's ranked AI news picks (from Jay's /ai-news command) before they go on the page.

const LIMITS = { title: 300, url: 2000, source: 100, why: 280, skipped: 280 };

// Returns { ranked_at, items: [{ title, url, source, why, tags }], skipped } or throws a
// message naming the first problem. Whitespace is collapsed and unknown fields are dropped.
export function normalizePicks(input, now = new Date()) {
  const fail = (message) => { throw new Error(message); };
  const text = (value, field, where) => {
    if (typeof value !== 'string' || !value.trim()) fail(`${where}${field} is missing`);
    const s = value.replace(/\s+/g, ' ').trim();
    if (s.length > LIMITS[field]) fail(`${where}${field} is over ${LIMITS[field]} characters`);
    return s;
  };

  if (!input || !Array.isArray(input.items)) fail('items must be an array of stories');
  if (input.items.length < 1 || input.items.length > 10) fail('items must hold 1 to 10 stories');
  const items = input.items.map((it, i) => {
    const where = `item ${i + 1}: `;
    const url = text(it.url, 'url', where);
    if (!/^https?:\/\//i.test(url)) fail(`${where}url must start with http:// or https://`);
    const tags = it.tags ?? [];
    if (!Array.isArray(tags) || tags.length > 3 || tags.some((t) => typeof t !== 'string' || !t.trim() || t.trim().length > 20)) {
      fail(`${where}tags must be a list of up to 3 short names`);
    }
    return { title: text(it.title, 'title', where), url, source: text(it.source, 'source', where), why: text(it.why, 'why', where), tags: tags.map((t) => t.trim()) };
  });
  if (input.skipped != null && typeof input.skipped !== 'string') fail('skipped must be text');
  const skipped = input.skipped?.trim() ? text(input.skipped, 'skipped', '') : '';
  return { ranked_at: now.toISOString(), items, skipped };
}
