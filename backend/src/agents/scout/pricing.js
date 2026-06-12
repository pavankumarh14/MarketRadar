'use strict';

const { getMockSnapshot } = require('../../data/mock-competitors');

// ─────────────────────────────────────────────────────────────────────────────
// Pricing scout — captures competitor API/product pricing and computes delta.
//
// In production this would drive a Playwright browser to scrape pricing pages.
// For the hackathon we use structured mock fixtures that simulate real changes
// across scan cycles, so the LLM analysis is meaningful without a browser.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capture current pricing snapshot for one competitor.
 * Returns null if no mock data exists (unknown competitor).
 *
 * @param {string} competitor
 * @param {number} scanCycle
 * @returns {object|null}
 */
async function capturePricing(competitor, scanCycle) {
  try {
    return getMockSnapshot(competitor, 'pricing', scanCycle);
  } catch {
    return null;
  }
}

/**
 * Compute a human-readable diff between two pricing snapshots.
 * Returns null when there is no baseline (first scan).
 *
 * @param {object} current
 * @param {object} baseline
 * @returns {{ changes: string[], max_delta_pct: number }|null}
 */
function diffPricing(current, baseline) {
  if (!baseline) return null;

  const changes = [];
  let maxDelta = 0;

  // Detect tier price changes
  for (const cur of current.tiers) {
    const prev = baseline.tiers.find(t => t.name === cur.name || t.type === cur.type);
    if (!prev) {
      changes.push(`New tier added: "${cur.name}" at $${cur.price_per_1k_tokens}/1K tokens`);
    } else if (cur.price_per_1k_tokens !== prev.price_per_1k_tokens && prev.price_per_1k_tokens > 0) {
      const pct = Math.round(((cur.price_per_1k_tokens - prev.price_per_1k_tokens) / prev.price_per_1k_tokens) * 100);
      const dir = pct < 0 ? '↓' : '↑';
      changes.push(`${cur.name}: $${prev.price_per_1k_tokens} → $${cur.price_per_1k_tokens}/1K tokens (${dir}${Math.abs(pct)}%)`);
      maxDelta = Math.max(maxDelta, Math.abs(pct));
    }
  }

  // Detect removed tiers
  for (const prev of baseline.tiers) {
    const still = current.tiers.find(t => t.name === prev.name);
    if (!still) changes.push(`Tier removed: "${prev.name}"`);
  }

  // Detect free-tier change
  if (!baseline.free_tier && current.free_tier) {
    changes.push('Free tier introduced');
    maxDelta = Math.max(maxDelta, 100);
  }

  return { changes, max_delta_pct: maxDelta };
}

module.exports = { capturePricing, diffPricing };
