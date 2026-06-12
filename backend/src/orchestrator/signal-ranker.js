'use strict';

// ═════════════════════════════════════════════════════════════════════════════
// CANDIDATE TASK — Signal Ranker
// ═════════════════════════════════════════════════════════════════════════════
//
// This module sits between the scout phase and the brief assembler.
// It answers two questions the assembler cannot answer on its own:
//
//   1. RANKING: Which signals actually matter most right now?
//      Four scouts produce findings every cycle. Not all signals are equal —
//      a 67% price cut matters more than a 5% headcount bump. The assembler
//      should receive signals in priority order so the brief leads with what's
//      most important, not whatever ran first.
//
//   2. DEDUPLICATION: Has this signal appeared before?
//      If OpenAI cut prices last cycle AND this cycle, the brief should say
//      "price cut confirmed and accelerating" — not surface the same alert
//      twice as if it's new information. Without dedup, the brief gets noisier
//      with every scan cycle. At 10+ cycles this becomes unreadable.
//
// This is a classic signal-processing problem, not an LLM problem.
// Implement it as a deterministic algorithm — no LLM calls required.
//
//
// YOUR TASK
// ---------
// Implement rankSignals() below. The stub returns findings unranked and
// undeduped. A working implementation must:
//
//   A. Score each finding using the formula:
//        score = SIGNIFICANCE_WEIGHT[finding.verdict]
//                × finding.confidence
//                × recencyDecay(finding, scanCycle)
//
//   B. Query SQLite for signals from PREVIOUS scan cycles (same mission_id,
//      same capability) and mark current findings as 'new' or 'recurring'.
//
//   C. Adjust scores: recurring signals get a 0.6× multiplier (still
//      surfaced but ranked lower than genuinely new developments).
//
//   D. Return findings sorted descending by final score.
//
//
// SCORING WEIGHTS
// ───────────────
// Use these constants (exported below so your tests can import them):
//
//   SIGNIFICANCE_WEIGHT = { significant: 1.0, minor: 0.5, noise: 0.1, neutral: 0.3 }
//
//   recencyDecay(finding, currentScanCycle):
//     finding.details.scan_cycle === currentScanCycle     → 1.0   (current)
//     finding.details.scan_cycle === currentScanCycle - 1 → 0.7   (one cycle old)
//     older                                               → 0.4
//
//   recurring multiplier: 0.6 (signal appeared in a previous cycle with same capability + verdict)
//
//
// DEDUP LOGIC
// ────────────
// A signal is "recurring" when ALL of the following match a previous finding:
//   - same mission_id
//   - same capability  (e.g. 'scout-pricing')
//   - same verdict     (e.g. 'significant')
//   - previous scan_cycle (finding.details.scan_cycle < currentScanCycle)
//
// Don't try to match on summary text — it changes every cycle. Match on
// structural fields only.
//
//
// INPUT
// ─────
// findings:   Finding[]   scout findings from the CURRENT scan cycle only
// missionId:  string
// scanCycle:  number      the current cycle number
//
//
// OUTPUT
// ──────
// RankedFinding[]  — same shape as Finding[] but with two extra fields:
//   finding.score:      number   (the final computed score)
//   finding.is_new:     boolean  (false = same capability+verdict seen before)
//
// Return them sorted descending by score.
//
//
// DB FUNCTION TO USE
// ───────────────────
//   const { getSignalsByMissionId } = require('../db');
//   getSignalsByMissionId(missionId, 500)
//     → Finding[]  (all scout findings for this mission, newest first)
//   Filter these to scan_cycle < currentScanCycle to get historical signals.
//
//
// TESTING
// ────────
// After implementing, run two scans on the same mission and check ranking:
//   sqlite3 backend/data/marketmind.db \
//     "SELECT capability, verdict, confidence FROM findings \
//      WHERE mission_id = (SELECT id FROM missions LIMIT 1) \
//      ORDER BY created_at DESC LIMIT 10"
//
// A correct implementation should rank 'significant' + high-confidence
// findings above 'minor' ones, and mark recurring signals with is_new=false.
//
// ═════════════════════════════════════════════════════════════════════════════

const { getSignalsByMissionId } = require('../db');

const SIGNIFICANCE_WEIGHT = {
  significant: 1.0,
  minor:       0.5,
  noise:       0.1,
  neutral:     0.3,
};

/**
 * @param {object[]} findings     Scout findings from the current scan cycle
 * @param {string}   missionId
 * @param {number}   scanCycle    Current scan cycle number
 * @returns {object[]}            Ranked + annotated findings (descending score)
 */
function rankSignals(findings, missionId, scanCycle) {
  // ── Get historical signals for deduplication ───────────────────────────────
  const historicalSignals = getSignalsByMissionId(missionId, 500)
    .filter(f => f.details?.scan_cycle < scanCycle);

  // ── Build dedup map: (capability + verdict) → seen before ───────────────────
  const seenSignals = new Map();
  for (const hist of historicalSignals) {
    const key = `${hist.capability}|${hist.verdict}`;
    if (!seenSignals.has(key)) {
      seenSignals.set(key, true);
    }
  }

  // ── Score each finding ─────────────────────────────────────────────────────
  const scored = findings.map(f => {
    // A. Calculate base score
    const significanceWeight = SIGNIFICANCE_WEIGHT[f.verdict] ?? 0.3;
    const recencyDecay = calculateRecencyDecay(f.details?.scan_cycle, scanCycle);
    const baseScore = significanceWeight * (f.confidence ?? 0.5) * recencyDecay;

    // B. Check if recurring
    const key = `${f.capability}|${f.verdict}`;
    const isRecurring = seenSignals.has(key);

    // C. Apply recurring multiplier
    const finalScore = isRecurring ? baseScore * 0.6 : baseScore;

    return {
      ...f,
      score: finalScore,
      is_new: !isRecurring,
    };
  });

  // ── Sort descending by score ───────────────────────────────────────────────
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Calculate recency decay factor based on scan cycle difference
 */
function calculateRecencyDecay(findingScanCycle, currentScanCycle) {
  if (!findingScanCycle || findingScanCycle === currentScanCycle) {
    return 1.0; // current cycle
  }
  if (findingScanCycle === currentScanCycle - 1) {
    return 0.7; // one cycle old
  }
  return 0.4; // older
}

module.exports = { rankSignals, SIGNIFICANCE_WEIGHT };
