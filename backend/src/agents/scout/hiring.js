'use strict';

const { getMockSnapshot } = require('../../data/mock-competitors');

/**
 * Capture current hiring snapshot for one competitor.
 */
async function captureHiring(competitor, scanCycle) {
  try {
    return getMockSnapshot(competitor, 'hiring', scanCycle);
  } catch {
    return null;
  }
}

/**
 * Diff two hiring snapshots.
 * A headcount change >15% is considered significant.
 */
function diffHiring(current, baseline) {
  if (!baseline) return null;

  const changes = [];
  let maxDelta = 0;

  // Overall headcount delta
  if (baseline.total_openings > 0) {
    const pct = Math.round(((current.total_openings - baseline.total_openings) / baseline.total_openings) * 100);
    if (Math.abs(pct) >= 5) {
      const dir = pct > 0 ? '↑' : '↓';
      changes.push(`Total openings: ${baseline.total_openings} → ${current.total_openings} (${dir}${Math.abs(pct)}%)`);
      maxDelta = Math.max(maxDelta, Math.abs(pct));
    }
  }

  // Category shifts
  for (const [cat, count] of Object.entries(current.by_category)) {
    const prev = baseline.by_category[cat] ?? 0;
    if (prev > 0) {
      const pct = Math.round(((count - prev) / prev) * 100);
      if (Math.abs(pct) >= 30) {
        changes.push(`${cat} roles: ${prev} → ${count} (${pct > 0 ? '+' : ''}${pct}%)`);
      }
    } else if (count > 0) {
      changes.push(`New category: ${cat} (${count} openings)`);
    }
  }

  // New locations
  for (const loc of (current.new_locations ?? [])) {
    if (!baseline.locations.includes(loc)) {
      changes.push(`Expanding to new location: ${loc}`);
    }
  }

  return { changes, max_delta_pct: maxDelta };
}

module.exports = { captureHiring, diffHiring };
