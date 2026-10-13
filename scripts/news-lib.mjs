// Reads RSS 2.0 and Atom feeds and picks the morning's AI headlines. No dependencies.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
};

// Feed text -> plain text: unwraps CDATA, decodes entities, drops HTML tags, collapses spaces.
function plain(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? m;
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (block, name) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))?.[1] ?? '';

// RSS: <link>url</link>. Atom: <link href="url"/>, the rel="alternate" one (or the one with no rel).
function linkOf(block) {
  const text = plain(tag(block, 'link'));
  if (text) return text;
  const attrs = [...block.matchAll(/<link\b([^>]*)>/g)].map((m) => m[1])
    .find((a) => !/\brel=/.test(a) || /\brel=["']alternate["']/.test(a));
  return attrs ? plain(attrs.match(/\bhref=["']([^"']+)["']/)?.[1] ?? '') : '';
}

// [{ title, url, published }] for every item with a headline, an http(s) link and a date.
export function parseFeed(xml) {
  const items = [];
  for (const [block] of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)) {
    const title = plain(tag(block, 'title'));
    const url = linkOf(block);
    const date = new Date(plain(tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date')));
    if (title && /^https?:\/\//i.test(url) && !Number.isNaN(date.getTime())) {
      items.push({ title, url, published: date.toISOString() });
    }
  }
  return items;
}

// feeds: [{ name, lab?, hours?, items }]. Keeps items published within each feed's window
// (`hours`, default 24), at most `perSource` per feed, newest first. Lab announcements go
// before everything else. A repeated link or headline appears once.
export function selectNews(feeds, now, { limit = 10, perSource = 2, hours = 24 } = {}) {
  const fresh = (feed) => feed.items
    .filter((it) => {
      const age = now - new Date(it.published);
      return age >= -3600e3 && age <= (feed.hours ?? hours) * 3600e3;
    })
    .sort((a, b) => b.published.localeCompare(a.published))
    .slice(0, perSource)
    .map((it) => ({ title: it.title, url: it.url, source: feed.name, published: it.published }));
  const newest = (list) => list.flatMap(fresh).sort((a, b) => b.published.localeCompare(a.published));
  const seen = new Set();
  return [...newest(feeds.filter((f) => f.lab)), ...newest(feeds.filter((f) => !f.lab))]
    .filter((it) => {
      const keys = [it.url, it.title.trim().toLowerCase()];
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    })
    .slice(0, limit);
}
