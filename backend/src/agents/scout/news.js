'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// News scout — fetches REAL articles from Hacker News via the Algolia API.
// No API key required. Falls back to mock data if the network is unavailable.
//
// Why HN? Free, no auth, JSON API, high signal-to-noise for tech companies.
// In production you'd supplement with NewsAPI, Google Alerts RSS, or a
// scraper targeting the competitor's own press/blog page.
// ─────────────────────────────────────────────────────────────────────────────

const HN_API = 'https://hn.algolia.com/api/v1/search';
const FETCH_TIMEOUT_MS = 6000;

/**
 * Fetch recent Hacker News articles mentioning `competitor`.
 * Returns a normalised snapshot regardless of source (real or mock).
 *
 * @param {string} competitor
 * @param {number} scanCycle - used only for mock fallback
 * @returns {Promise<object>}
 */
async function captureNews(competitor, scanCycle) {
  try {
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
    const url = `${HN_API}?query=${encodeURIComponent(competitor)}&tags=story&numericFilters=created_at_i>${sevenDaysAgo}&hitsPerPage=15`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HN API ${res.status}`);
    const data = await res.json();

    return {
      source: 'hackernews',
      query: competitor,
      articles: data.hits.map(h => ({
        title: h.title ?? '(no title)',
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        points: h.points ?? 0,
        comments: h.num_comments ?? 0,
        author: h.author,
        created_at: h.created_at,
      })),
      total: data.nbHits,
      fetched_at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[scout-news] Live fetch failed (${err.message}) — using mock`);
    return getMockNews(competitor, scanCycle);
  }
}

/**
 * Diff two news snapshots.
 * Returns article count delta and any articles with unusually high engagement.
 */
function diffNews(current, baseline) {
  if (!baseline) return null;

  const changes = [];
  const countDelta = current.articles.length - (baseline.articles?.length ?? 0);
  const pct = baseline.articles?.length > 0
    ? Math.round((countDelta / baseline.articles.length) * 100)
    : 100;

  if (countDelta > 0) {
    changes.push(`Article count: ${baseline.articles?.length ?? 0} → ${current.articles.length} (+${pct}%)`);
  }

  // Surface high-engagement articles (>100 points) — they indicate product launches / controversies
  const hot = current.articles.filter(a => a.points >= 100);
  for (const a of hot) {
    changes.push(`High-engagement: "${a.title}" (${a.points} pts, ${a.comments} comments)`);
  }

  return { changes, max_delta_pct: Math.abs(pct) };
}

// ── Mock fallback ─────────────────────────────────────────────────────────────

function getMockNews(competitor, scanCycle) {
  const cycle = Math.min(scanCycle, 2);
  const mockArticles = {
    OpenAI: {
      0: [
        { title: 'OpenAI raises $6.6B at $157B valuation', url: '#', points: 892, comments: 743, created_at: '2026-05-01T10:00:00Z' },
        { title: 'GPT-4 performance benchmarks updated', url: '#', points: 320, comments: 215, created_at: '2026-05-04T14:00:00Z' },
      ],
      1: [
        { title: 'OpenAI cuts GPT-4o pricing by 80%', url: '#', points: 1402, comments: 1231, created_at: '2026-05-15T09:00:00Z' },
        { title: 'OpenAI announces real-time API for voice applications', url: '#', points: 874, comments: 612, created_at: '2026-05-17T11:00:00Z' },
        { title: 'OpenAI expands to Singapore with new data centre', url: '#', points: 421, comments: 318, created_at: '2026-05-19T16:00:00Z' },
      ],
      2: [
        { title: 'OpenAI launches free developer tier — 100K tokens/month', url: '#', points: 2104, comments: 1843, created_at: '2026-05-22T08:00:00Z' },
        { title: 'Sam Altman: "We want every developer in the world using GPT"', url: '#', points: 1230, comments: 987, created_at: '2026-05-24T14:30:00Z' },
        { title: 'OpenAI GPT-4o-mini benchmarks challenge Mistral and Cohere', url: '#', points: 763, comments: 541, created_at: '2026-05-26T10:00:00Z' },
      ],
    },
    Cohere: {
      0: [
        { title: 'Cohere raises $270M Series C for enterprise AI', url: '#', points: 412, comments: 287, created_at: '2026-04-29T10:00:00Z' },
      ],
      1: [
        { title: 'Cohere Command R+ matches GPT-4 on enterprise benchmarks', url: '#', points: 687, comments: 452, created_at: '2026-05-14T11:00:00Z' },
        { title: 'Cohere targets Fortune 500 with on-prem deployment option', url: '#', points: 354, comments: 229, created_at: '2026-05-18T09:00:00Z' },
      ],
      2: [
        { title: 'Cohere drops Command R+ to $0.001 per 1K tokens', url: '#', points: 943, comments: 712, created_at: '2026-05-23T10:00:00Z' },
        { title: 'Cohere opens Tokyo office for APAC enterprise expansion', url: '#', points: 287, comments: 193, created_at: '2026-05-25T14:00:00Z' },
      ],
    },
    Mistral: {
      0: [
        { title: 'Mistral AI raises €600M, valued at €6B', url: '#', points: 934, comments: 821, created_at: '2026-05-02T09:00:00Z' },
        { title: 'Mixtral 8x7B outperforms LLaMA 2 on MMLU', url: '#', points: 612, comments: 489, created_at: '2026-05-05T13:00:00Z' },
      ],
      1: [
        { title: 'Mistral holds pricing as OpenAI and Cohere slash costs', url: '#', points: 487, comments: 372, created_at: '2026-05-16T10:00:00Z' },
      ],
      2: [
        { title: 'Mistral Large: a new flagship model targeting enterprise buyers', url: '#', points: 1102, comments: 892, created_at: '2026-05-22T09:00:00Z' },
        { title: 'Mistral opens London office and launches enterprise tier', url: '#', points: 423, comments: 315, created_at: '2026-05-25T11:00:00Z' },
        { title: 'Mistral patents aggressive quantisation approach for edge deployment', url: '#', points: 312, comments: 247, created_at: '2026-05-26T15:00:00Z' },
      ],
    },
  };

  const articles = mockArticles[competitor]?.[cycle] ?? [];
  return {
    source: 'mock',
    query: competitor,
    articles: articles.map(a => ({ ...a, author: 'mock' })),
    total: articles.length,
    fetched_at: new Date().toISOString(),
  };
}

module.exports = { captureNews, diffNews };
