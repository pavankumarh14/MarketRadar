'use strict';

const { getMockSnapshot } = require('../../data/mock-competitors');

/**
 * Capture current patent filings snapshot for one competitor.
 * In production: scrape USPTO/Espacenet or use a patent data API.
 */
async function capturePatents(competitor, scanCycle) {
  try {
    return getMockSnapshot(competitor, 'patents', scanCycle);
  } catch {
    return null;
  }
}

/**
 * Diff two patent snapshots.
 * Any new filing is significant — patents reveal R&D direction 6-18 months ahead.
 */
function diffPatents(current, baseline) {
  if (!baseline) return null;

  const changes = [];
  const newCount = current.total_recent_filings - baseline.total_recent_filings;
  const pct = baseline.total_recent_filings > 0
    ? Math.round((newCount / baseline.total_recent_filings) * 100)
    : 100;

  if (newCount > 0) {
    changes.push(`New patent filings: ${baseline.total_recent_filings} → ${current.total_recent_filings} (+${newCount})`);
  }

  // Identify new patents by title
  const prevTitles = new Set(baseline.patents.map(p => p.title));
  const newPatents = current.patents.filter(p => !prevTitles.has(p.title));
  for (const p of newPatents) {
    changes.push(`New patent [${p.category}]: "${p.title}"`);
  }

  // Category concentration — spot if company is doubling down on a specific area
  const categoryCounts = {};
  for (const p of current.patents) {
    categoryCounts[p.category] = (categoryCounts[p.category] ?? 0) + 1;
  }
  const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCategory && topCategory[1] >= 3) {
    changes.push(`Patent cluster detected: ${topCategory[1]}× filings in "${topCategory[0]}" — likely R&D focus area`);
  }

  return { changes, max_delta_pct: Math.abs(pct) };
}

module.exports = { capturePatents, diffPatents };
