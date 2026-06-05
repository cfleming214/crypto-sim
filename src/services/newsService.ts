// ---------------------------------------------------------------------------
// Crypto news feed. Aggregates a couple of public RSS feeds (no API key, no
// native deps — plain fetch + a small regex parser) into a normalized list the
// News tab renders. RSS carries a title, summary, hero image, source, author
// and a link to the original article — but NOT the full copyrighted body, so
// the detail screen shows the summary + a "Read full article" link out.
// ---------------------------------------------------------------------------

export interface NewsArticle {
  id: string;          // stable unique key (the article URL)
  title: string;
  summary: string;     // plain-text excerpt (HTML stripped)
  imageUrl: string | null;
  url: string;         // canonical link to the real article
  source: string;      // e.g. 'CoinDesk'
  author: string | null;
  publishedAt: number; // ms epoch
  category: string | null;
}

interface Feed { source: string; url: string; }

// Public, key-free RSS feeds. Add/remove here to tune the mix.
const FEEDS: Feed[] = [
  { source: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
];

const CACHE_TTL = 5 * 60_000; // 5 min
let cache: { at: number; articles: NewsArticle[] } | null = null;

// --- tiny RSS helpers (regex, not a full XML parser — RSS items are flat) ----

function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Inner text of the first <tag>…</tag> in `block`, CDATA-unwrapped. */
function tagText(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? stripCdata(m[1]) : undefined;
}

/** Value of an attribute on the first matching self-closing/open tag. */
function tagAttr(block: string, tag: string, attr: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`));
  return m ? decodeEntities(m[1]) : undefined;
}

function firstImgSrc(html: string): string | undefined {
  const m = html.match(/<img[^>]*\ssrc="([^"]+)"/);
  return m ? decodeEntities(m[1]) : undefined;
}

function parseFeed(source: string, xml: string): NewsArticle[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const out: NewsArticle[] = [];
  for (const item of items) {
    const rawTitle = tagText(item, 'title');
    const rawLink = tagText(item, 'link');
    if (!rawTitle || !rawLink) continue;

    const descRaw = tagText(item, 'description') ?? '';
    const image =
      tagAttr(item, 'media:content', 'url') ??
      tagAttr(item, 'enclosure', 'url') ??
      firstImgSrc(descRaw) ??
      null;

    const pub = tagText(item, 'pubDate');
    const ts = pub ? Date.parse(pub) : NaN;

    out.push({
      id: decodeEntities(rawLink).split('?')[0],
      title: stripHtml(rawTitle),
      summary: stripHtml(descRaw),
      imageUrl: image,
      url: decodeEntities(rawLink),
      source,
      author: tagText(item, 'dc:creator') ? stripHtml(tagText(item, 'dc:creator')!) : null,
      publishedAt: Number.isNaN(ts) ? Date.now() : ts,
      category: tagText(item, 'category') ? stripHtml(tagText(item, 'category')!) : null,
    });
  }
  return out;
}

async function fetchFeed(feed: Feed): Promise<NewsArticle[]> {
  try {
    const res = await fetch(feed.url, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeed(feed.source, xml);
  } catch {
    return [];
  }
}

/**
 * Fetch the merged, de-duplicated, newest-first news list. Cached for 5 min;
 * pass `force` (pull-to-refresh) to bypass the cache.
 */
export async function fetchCryptoNews(force = false): Promise<NewsArticle[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.articles;

  const results = await Promise.all(FEEDS.map(fetchFeed));
  const seen = new Set<string>();
  const merged: NewsArticle[] = [];
  for (const article of results.flat()) {
    const key = article.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(article);
  }
  merged.sort((a, b) => b.publishedAt - a.publishedAt);

  // Keep the last-good cache if every feed failed (offline / rate-limited).
  if (merged.length === 0 && cache) return cache.articles;
  cache = { at: Date.now(), articles: merged };
  return merged;
}

/** Compact relative time, e.g. "3h ago" / "2d ago". */
export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}
