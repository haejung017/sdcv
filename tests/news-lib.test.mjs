import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, selectNews } from '../scripts/news-lib.mjs';

test('parseFeed reads RSS items: CDATA, entities, tags in titles', () => {
  const xml = `<rss><channel><title>Feed</title><link>https://example.com/</link>
    <item><title><![CDATA[Big model & more]]></title><link>https://example.com/a</link><pubDate>Tue, 13 Oct 2026 12:00:00 GMT</pubDate></item>
    <item>
      <title>Caf&#233; &amp; &#x27;quotes&#x27; &lt;b&gt;bold&lt;/b&gt; &#8217;</title>
      <link>https://example.com/b?x=1&amp;y=2</link>
      <pubDate>Mon, 12 Oct 2026 08:00:00 +0000</pubDate>
    </item>
    <item><title>No date</title><link>https://example.com/c</link></item>
    <item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Mon, 12 Oct 2026 08:00:00 +0000</pubDate></item>
  </channel></rss>`;
  assert.deepEqual(parseFeed(xml), [
    { title: 'Big model & more', url: 'https://example.com/a', published: '2026-10-13T12:00:00.000Z' },
    { title: 'Café & \'quotes\' bold ’', url: 'https://example.com/b?x=1&y=2', published: '2026-10-12T08:00:00.000Z' },
  ]);
});

test('parseFeed reads Atom entries: alternate link, published before updated', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><link href="https://blog.example/" rel="alternate"/>
    <entry><author><name>A</name></author><title type="html"><![CDATA[Agents ship]]></title>
      <link rel="replies" href="https://blog.example/a#comments"/>
      <link rel="alternate" type="text/html" href="https://blog.example/a" />
      <updated>2026-10-13T16:23:23-04:00</updated><published>2026-10-13T15:42:42-04:00</published></entry>
    <entry><title>Plain</title><link href="https://blog.example/b"/><updated>2026-10-12T10:00:00Z</updated></entry>
  </feed>`;
  assert.deepEqual(parseFeed(xml), [
    { title: 'Agents ship', url: 'https://blog.example/a', published: '2026-10-13T19:42:42.000Z' },
    { title: 'Plain', url: 'https://blog.example/b', published: '2026-10-12T10:00:00.000Z' },
  ]);
  assert.deepEqual(parseFeed('<html>not a feed</html>'), []);
});

const now = new Date('2026-10-14T10:00:00Z');
const item = (title, hoursAgo) => ({ title, url: `https://x.example/${title}`, published: new Date(now - hoursAgo * 3600e3).toISOString() });

test('selectNews: labs first, newest first, per-source cap, per-feed window, limit', () => {
  const feeds = [
    { name: 'Lab', lab: true, items: [item('lab-old', 30), item('lab-new', 5)] },
    { name: 'Mirror', lab: true, hours: 48, items: [item('mirror', 34), item('mirror-old', 50)] },
    { name: 'News', items: [item('n3', 3), item('n1', 1), item('n2', 2)] },
    { name: 'Blog', items: [item('b1', 0.5), item('future', -3)] },
  ];
  const picked = selectNews(feeds, now, { perSource: 2 });
  assert.deepEqual(picked.map((it) => it.title), ['lab-new', 'mirror', 'b1', 'n1', 'n2']);
  assert.deepEqual(picked[1], { title: 'mirror', url: 'https://x.example/mirror', source: 'Mirror', published: item('mirror', 34).published });
  assert.deepEqual(selectNews(feeds, now, { limit: 3, perSource: 2 }).map((it) => it.title), ['lab-new', 'mirror', 'b1']);
  assert.deepEqual(selectNews(feeds, now, { hours: 72, perSource: 1 }).map((it) => it.title), ['lab-new', 'mirror', 'b1', 'n1']);
  assert.deepEqual(selectNews([], now), []);
});

test('selectNews drops repeats of the same link or headline', () => {
  const feeds = [
    { name: 'A', items: [{ ...item('Same story', 1) }] },
    { name: 'B', items: [{ ...item('same story ', 2), url: 'https://x.example/other' }] },
    { name: 'C', items: [{ ...item('Different words', 3), url: 'https://x.example/Same story' }] },
  ];
  assert.deepEqual(selectNews(feeds, now).map((it) => it.source), ['A']);
});
