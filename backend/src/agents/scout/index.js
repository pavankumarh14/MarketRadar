'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Scout agent — reference implementation for MarketRadar.
//
// This is the fully-built agent candidates should use as their pattern when
// implementing the Analyst (../analyst/index.js) and Strategist
// (../strategist/index.js).
//
// What the Scout does per scan cycle:
//   1. For each competitor × dimension:
//      a. Capture current snapshot (mock fixture or live fetch for news)
//      b. Load previous baseline from SQLite
//      c. Compute structured diff (delta)
//      d. If significant delta exists → call LLM to interpret it
//      e. Upsert new baseline so the next cycle has something to diff against
//   2. Aggregate per-competitor signals into one Finding
//   3. Return a Finding conforming to the shared shape (see bottom of file)
//
// TaskPayload shape (what the orchestrator passes in):
//   {
//     taskId:     string,
//     dagId:      string,
//     missionId:  string,
//     nodeId:     'scout-pricing' | 'scout-hiring' | 'scout-news' | 'scout-patents',
//     competitors: string[],
//     dimensions:  string[],    // the mission's configured dimensions
//     scanCycle:  number,
//     context:    {}            // unused at scout level
//   }
// ─────────────────────────────────────────────────────────────────────────────

const { v4: uuidv4 } = require('uuid');
const { reasonWithLLM } = require('../../shared/llm');
const { upsertBaseline, getBaseline, saveFinding } = require('../../db');

const { capturePricing, diffPricing }   = require('./pricing');
const { captureHiring, diffHiring }     = require('./hiring');
const { captureNews, diffNews }         = require('./news');
const { capturePatents, diffPatents }   = require('./patents');

// Map nodeId → { capture, diff, systemPrompt }
const DIMENSION_MAP = {
  'scout-pricing': {
    dimension: 'pricing',
    capture: capturePricing,
    diff: diffPricing,
    systemPrompt: `You are a competitive pricing intelligence analyst with deep knowledge of SaaS and API markets.
You receive current and baseline pricing snapshots for one competitor plus a computed diff.
Detect what the pricing change signals about their strategy. Is it a land-grab, defensive response, or margin play?
Respond ONLY in valid JSON matching this exact schema:
{
  "summary": "One crisp sentence — what changed and what it signals",
  "signals": [{ "competitor": "string", "change": "string", "delta_pct": number, "significance": "high|medium|low" }],
  "confidence": 0.0–1.0,
  "verdict": "significant|minor|noise"
}`,
  },
  'scout-hiring': {
    dimension: 'hiring',
    capture: captureHiring,
    diff: diffHiring,
    systemPrompt: `You are a competitive talent intelligence analyst.
Hiring patterns reveal a company's near-term product and go-to-market bets — a sales surge precedes an enterprise push; an infra surge precedes a scale-out.
You receive hiring snapshots (current vs baseline) and a computed diff.
Respond ONLY in valid JSON matching this exact schema:
{
  "summary": "One sentence — what the hiring pattern signals about their strategy",
  "signals": [{ "competitor": "string", "change": "string", "delta_pct": number, "significance": "high|medium|low" }],
  "confidence": 0.0–1.0,
  "verdict": "significant|minor|noise"
}`,
  },
  'scout-news': {
    dimension: 'news',
    capture: captureNews,
    diff: diffNews,
    systemPrompt: `You are a competitive intelligence analyst specialising in press and media signals.
News volume and engagement scores reveal product launches, fundraising, executive moves, and market positioning plays.
You receive a list of recent news articles (title, engagement metrics) for one competitor.
Respond ONLY in valid JSON matching this exact schema:
{
  "summary": "One sentence — what the news activity signals",
  "signals": [{ "competitor": "string", "change": "string", "delta_pct": number, "significance": "high|medium|low" }],
  "confidence": 0.0–1.0,
  "verdict": "significant|minor|noise"
}`,
  },
  'scout-patents': {
    dimension: 'patents',
    capture: capturePatents,
    diff: diffPatents,
    systemPrompt: `You are a competitive intelligence analyst specialising in IP and R&D strategy.
Patent filings are a leading indicator of where a company's engineering is heading — 6–18 months ahead of product announcements.
Category clustering (e.g. 5 patents in "Inference Efficiency") reveals architectural bets.
You receive current and baseline patent snapshots plus a computed diff.
Respond ONLY in valid JSON matching this exact schema:
{
  "summary": "One sentence — what the patent activity reveals about their R&D direction",
  "signals": [{ "competitor": "string", "change": "string", "delta_pct": number, "significance": "high|medium|low" }],
  "confidence": 0.0–1.0,
  "verdict": "significant|minor|noise"
}`,
  },
};

/**
 * Main entry point — called by the orchestrator for each scout node.
 *
 * @param {object} task  TaskPayload from the orchestrator
 * @returns {Promise<object>}  Finding
 */
async function runScout(task) {
  const startTime = Date.now();
  const { taskId, dagId, missionId, nodeId, competitors, scanCycle } = task;

  const config = DIMENSION_MAP[nodeId];
  if (!config) throw new Error(`Unknown scout node: ${nodeId}`);

  const { dimension, capture, diff, systemPrompt } = config;

  // ── 1. Process each competitor ────────────────────────────────────────────
  const allSignals = [];
  let totalDelta = 0;

  for (const competitor of competitors) {
    // a. Capture current snapshot (mock or live)
    const current = await capture(competitor, scanCycle);
    if (!current) {
      console.warn(`[${nodeId}] No data for "${competitor}" — skipping`);
      continue;
    }

    // b. Load previous baseline
    const baseline = getBaseline(missionId, competitor, dimension);

    // c. Compute diff
    const delta = diff(current, baseline?.content ?? null);

    // d. Only call LLM when there's something interesting to say
    const hasChanges = delta && delta.changes.length > 0;
    if (hasChanges) {
      const userPrompt = JSON.stringify({
        competitor,
        current,
        baseline: baseline?.content ?? null,
        diff: delta,
      });

      let parsed = {};
      try {
        const raw = await reasonWithLLM(systemPrompt, userPrompt, true);
        parsed = JSON.parse(raw);
      } catch (e) {
        console.warn(`[${nodeId}] LLM parse failed for "${competitor}": ${e.message}`);
      }

      allSignals.push(...(parsed.signals ?? [{
        competitor,
        change: delta.changes[0] ?? 'Change detected',
        delta_pct: delta.max_delta_pct ?? 0,
        significance: delta.max_delta_pct >= 30 ? 'high' : 'medium',
      }]));
      totalDelta = Math.max(totalDelta, delta.max_delta_pct ?? 0);
    }

    // e. Upsert baseline so next cycle has a reference
    upsertBaseline({
      id: uuidv4(),
      mission_id: missionId,
      competitor,
      dimension,
      content: current,
      scan_cycle: scanCycle,
    });
  }

  // ── 2. Build Finding ──────────────────────────────────────────────────────
  const confidence = allSignals.length > 0
    ? Math.min(0.95, 0.5 + (allSignals.filter(s => s.significance === 'high').length * 0.1))
    : 0.2;

  const verdict = totalDelta >= 30 ? 'significant' : totalDelta >= 10 ? 'minor' : 'noise';

  const summary = allSignals.length > 0
    ? allSignals.map(s => `${s.competitor}: ${s.change}`).join(' | ')
    : `No significant ${dimension} changes detected across ${competitors.length} competitors`;

  const finding = {
    id: `finding-${uuidv4()}`,
    dag_id: dagId,
    mission_id: missionId,
    node_id: nodeId,
    capability: nodeId,
    summary,
    details: {
      dimension,
      signals: allSignals,
      competitors_scanned: competitors,
      scan_cycle: scanCycle,
    },
    confidence,
    verdict,
    provenance: {
      agentId: `${nodeId}-01`,
      model: process.env.GROQ_API_KEY ? 'llama-3.1-8b-instant' : 'mock',
      durationMs: Date.now() - startTime,
    },
    created_at: new Date().toISOString(),
  };

  saveFinding(finding);
  return finding;
}

module.exports = { runScout };
