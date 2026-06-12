'use strict';

// ═════════════════════════════════════════════════════════════════════════════
// CANDIDATE TASK — Analyst Agent
// ═════════════════════════════════════════════════════════════════════════════
//
// The Analyst is Phase 2 of the scan pipeline. All four Scout nodes must
// complete before this node becomes ready (see dag-builder.js).
//
// WHERE SCOUTS STOP, ANALYSTS START
// ----------------------------------
// A Scout says: "Stripe hired 64 more engineers (+50% headcount)"
// The Analyst says: "A 50% headcount surge concentrated in Inference and
//   Enterprise Sales signals a coordinated product-launch build-out. Combined
//   with the simultaneous 83% price cut, this is a developer-acquisition
//   play ahead of an anticipated enterprise upsell motion."
//
// The Scout captures and measures. The Analyst interprets and contextualises.
//
//
// YOUR TASK
// ---------
// Implement runAnalyst() below. The function receives a TaskPayload that
// includes context.scoutFindings[] — one finding per completed scout node.
// Use the LLM to interpret the signals and return a single Finding that:
//
//   1. Explains WHAT each significant signal means in competitive context
//   2. Identifies "hot threads" — signals worth deeper investigation
//   3. Scores an overall confidence and verdict
//
//
// INPUT — TaskPayload (passed in by the orchestrator):
// ─────────────────────────────────────────────────────
// {
//   taskId:     string,
//   dagId:      string,
//   missionId:  string,
//   nodeId:     'analyst',
//   competitors: string[],
//   scanCycle:  number,
//   context: {
//     scoutFindings: Finding[]   ← one per scout node (pricing, hiring, news, patents)
//   }
// }
//
//
// OUTPUT — Finding (what your function must return and persist):
// ─────────────────────────────────────────────────────────────
// {
//   id:         'finding-<uuid>',
//   dag_id:     task.dagId,
//   mission_id: task.missionId,
//   node_id:    'analyst',
//   capability: 'analyst',
//   summary:    string,           ← one crisp sentence
//   details: {
//     interpretations: [{
//       competitor:     string,
//       dimension:      string,
//       signal:         string,   ← the raw change from the scout
//       interpretation: string,   ← what it means strategically
//       implication:    string,   ← so what? what should we do / watch?
//     }],
//     hot_threads: string[],      ← threads that warrant deeper investigation
//   },
//   confidence: number,           ← 0.0–1.0
//   verdict:    'significant' | 'minor' | 'noise' | 'neutral',
//   provenance: { agentId: 'analyst-01', model: string, durationMs: number },
//   created_at: string,
// }
//
//
// PATTERN TO FOLLOW — read ../scout/index.js first, especially:
//   • How it calls reasonWithLLM(systemPrompt, userPrompt, jsonMode=true)
//   • How it parses the response with a try/catch and falls back gracefully
//   • How it builds the Finding and calls saveFinding() before returning
//
// IMPORTS AVAILABLE:
//   const { v4: uuidv4 }        = require('uuid');
//   const { reasonWithLLM }     = require('../../shared/llm');
//   const { saveFinding }       = require('../../db');
//
// LLM GUIDANCE:
//   • Set jsonMode = true so you can parse the response directly
//   • Instruct the model to respond ONLY in JSON matching your schema
//   • Keep temperature low (the llm.js default of 0.3 is correct)
//   • The model is llama-3.1-8b-instant — don't ask for more than ~800 tokens
//   • Always have a fallback in case JSON.parse throws
//
// TESTING WITHOUT A GROQ KEY:
//   The mock in ../../shared/llm.js returns a realistic analyst stub when the
//   system prompt contains the word 'analyst'. Run a scan and check the DB:
//     sqlite3 backend/data/marketmind.db "SELECT summary, confidence FROM findings WHERE capability='analyst'"
//

const { v4: uuidv4 } = require('uuid');
const { reasonWithLLM } = require('../../shared/llm');
const { saveFinding } = require('../../db');

/**
 * @param {object} task  TaskPayload from the orchestrator
 * @returns {Promise<object>}  Finding
 */
async function runAnalyst(task) {
  const startTime = Date.now();
  const { dagId, missionId, scanCycle, context } = task;
  const { scoutFindings = [] } = context;

  // ── Build system prompt for Analyst ───────────────────────────────────────
  const systemPrompt = `You are a competitive intelligence analyst. You receive findings from four scout agents (pricing, hiring, news, patents) monitoring competitors.
Your task is to interpret WHAT each significant signal means strategically and identify patterns worth deeper investigation.

For each significant signal, explain:
1. What the change signals about their strategy (land-grab, defensive response, margin play, etc.)
2. What it implies for the competitive landscape
3. Whether it connects to other signals across dimensions

Respond ONLY in valid JSON matching this exact schema:
{
  "summary": "One crisp sentence capturing the overall strategic interpretation",
  "interpretations": [{
    "competitor": "string",
    "dimension": "string",
    "signal": "string",
    "interpretation": "string",
    "implication": "string"
  }],
  "hot_threads": ["string"],
  "confidence": 0.0–1.0,
  "verdict": "significant|minor|noise|neutral"
}`;

  // ── Build user prompt with scout findings ───────────────────────────────────
  const userPrompt = JSON.stringify({
    mission_id: missionId,
    scan_cycle: scanCycle,
    scout_findings: scoutFindings.map(f => ({
      capability: f.capability,
      summary: f.summary,
      verdict: f.verdict,
      confidence: f.confidence,
      signals: f.details?.signals || []
    }))
  });

  // ── Call LLM with fallback ───────────────────────────────────────────────────
  let parsed = {};
  try {
    const raw = await reasonWithLLM(systemPrompt, userPrompt, true);
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(`[analyst] LLM parse failed: ${e.message}`);
    // Fallback: basic interpretation from scout findings
    const significantFindings = scoutFindings.filter(f => f.verdict === 'significant');
    parsed = {
      summary: significantFindings.length > 0
        ? `Detected ${significantFindings.length} significant competitive signals across ${scoutFindings.length} dimensions`
        : 'No significant competitive signals detected in this scan cycle',
      interpretations: significantFindings.flatMap(f =>
        (f.details?.signals || []).map(s => ({
          competitor: s.competitor,
          dimension: f.capability.replace('scout-', ''),
          signal: s.change,
          interpretation: `${s.competitor} shows ${s.significance} activity in ${f.capability.replace('scout-', '')}`,
          implication: 'Monitor for follow-up actions'
        }))
      ),
      hot_threads: [],
      confidence: significantFindings.length > 0 ? 0.6 : 0.2,
      verdict: significantFindings.length > 0 ? 'significant' : 'neutral'
    };
  }

  // ── Build Finding ──────────────────────────────────────────────────────────
  const finding = {
    id: `finding-${uuidv4()}`,
    dag_id: dagId,
    mission_id: missionId,
    node_id: 'analyst',
    capability: 'analyst',
    summary: parsed.summary || 'Analyst interpretation completed',
    details: {
      interpretations: parsed.interpretations || [],
      hot_threads: parsed.hot_threads || [],
    },
    confidence: parsed.confidence ?? 0.5,
    verdict: parsed.verdict ?? 'neutral',
    provenance: {
      agentId: 'analyst-01',
      model: process.env.GROQ_API_KEY ? 'llama-3.1-8b-instant' : 'mock',
      durationMs: Date.now() - startTime,
    },
    created_at: new Date().toISOString(),
  };

  saveFinding(finding);
  return finding;
}

module.exports = { runAnalyst };
