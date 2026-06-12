'use strict';

// ═════════════════════════════════════════════════════════════════════════════
// CANDIDATE TASK — Strategist Agent
// ═════════════════════════════════════════════════════════════════════════════
//
// The Strategist is Phase 3 — the final synthesis layer before the brief is
// assembled. It runs only after the Analyst completes (see dag-builder.js).
//
// WHERE THE ANALYST STOPS, THE STRATEGIST STARTS
// ------------------------------------------------
// The Analyst interprets signals in isolation:
//   "OpenAI's pricing cut signals a developer-acquisition play."
//   "OpenAI's hiring surge signals an enterprise sales build-out."
//
// The Strategist connects them across sources into a single competitive
// narrative:
//   "OpenAI is executing a textbook two-phase land-and-expand: slash API
//    pricing to win developers (pricing + news), build enterprise sales
//    capacity simultaneously (hiring), while filing infrastructure patents
//    (patents) to maintain a moat once commoditisation takes hold. This is
//    a coordinated playbook, not coincidence. Response window: ~90 days
//    before the enterprise sales motion matures."
//
// The Strategist is the answer to "so what do we DO about this?"
//
//
// YOUR TASK
// ---------
// Implement runStrategist() below. The function receives a TaskPayload with
// context.analystFinding — the Finding from the Analyst node.
// Use the LLM to produce a cross-source synthesis and actionable recommendations.
//
//
// INPUT — TaskPayload:
// ─────────────────────
// {
//   taskId:     string,
//   dagId:      string,
//   missionId:  string,
//   nodeId:     'strategist',
//   competitors: string[],
//   scanCycle:  number,
//   context: {
//     analystFinding: Finding    ← the output of runAnalyst()
//   }
// }
//
//
// OUTPUT — Finding:
// ──────────────────
// {
//   id:         'finding-<uuid>',
//   dag_id:     task.dagId,
//   mission_id: task.missionId,
//   node_id:    'strategist',
//   capability: 'strategist',
//   summary:    string,              ← one sentence capturing the big picture
//   details: {
//     narrative: string,             ← 2–4 sentence cross-source story
//     competitive_shifts: [{
//       competitors:          string[],
//       what_changed:         string,
//       strategic_implication: string,
//       urgency:              'high' | 'medium' | 'low',
//     }],
//     recommendations: [{
//       action:    string,
//       rationale: string,
//       priority:  'high' | 'medium' | 'low',
//     }],
//   },
//   confidence: number,              ← 0.0–1.0
//   verdict:    'significant' | 'minor' | 'noise' | 'neutral',
//   provenance: { agentId: 'strategist-01', model: string, durationMs: number },
//   created_at: string,
// }
//
//
// PATTERN TO FOLLOW — ../scout/index.js is the complete reference.
//
// ASSEMBLER CONTRACT:
//   After your Finding is saved, the assembler (../orchestrator/assembler.js)
//   reads it to generate the brief. The assembler accesses:
//     finding.details.narrative
//     finding.details.competitive_shifts[]
//     finding.details.recommendations[]
//   These must be present (even if empty arrays) for the brief to render.
//
// IMPORTS AVAILABLE:
//   const { v4: uuidv4 }        = require('uuid');
//   const { reasonWithLLM }     = require('../../shared/llm');
//   const { saveFinding }       = require('../../db');
//
// TESTING WITHOUT A GROQ KEY:
//   The mock in ../../shared/llm.js returns a realistic strategist stub when
//   the system prompt contains 'strategist' or 'synthesise'. Check output:
//     sqlite3 backend/data/marketmind.db "SELECT summary, confidence FROM findings WHERE capability='strategist'"
//
// ═════════════════════════════════════════════════════════════════════════════

const { v4: uuidv4 } = require('uuid');
const { reasonWithLLM } = require('../../shared/llm');
const { saveFinding } = require('../../db');

/**
 * @param {object} task  TaskPayload from the orchestrator
 * @returns {Promise<object>}  Finding
 */
async function runStrategist(task) {
  const startTime = Date.now();
  const { dagId, missionId, scanCycle, context } = task;
  const { analystFinding } = context;

  // ── Build system prompt for Strategist ─────────────────────────────────────
  const systemPrompt = `You are a competitive intelligence strategist. You receive interpreted signals from the Analyst agent.
Your task is to connect signals ACROSS sources into a single competitive narrative and provide actionable recommendations.

Synthesize the interpretations into:
1. A 2-4 sentence narrative explaining the big picture
2. Competitive shifts — what changed, what it means strategically, urgency level
3. Concrete recommendations with rationale and priority

Respond ONLY in valid JSON matching this exact schema:
{
  "summary": "One sentence capturing the overall competitive situation",
  "narrative": "2-4 sentence cross-source story connecting all signals",
  "competitive_shifts": [{
    "competitors": ["string"],
    "what_changed": "string",
    "strategic_implication": "string",
    "urgency": "high|medium|low"
  }],
  "recommendations": [{
    "action": "string",
    "rationale": "string",
    "priority": "high|medium|low"
  }],
  "confidence": 0.0–1.0,
  "verdict": "significant|minor|noise|neutral"
}`;

  // ── Build user prompt with analyst finding ──────────────────────────────────
  const userPrompt = JSON.stringify({
    mission_id: missionId,
    scan_cycle: scanCycle,
    analyst_finding: {
      summary: analystFinding?.summary,
      interpretations: analystFinding?.details?.interpretations || [],
      hot_threads: analystFinding?.details?.hot_threads || []
    }
  });

  // ── Call LLM with fallback ───────────────────────────────────────────────────
  let parsed = {};
  try {
    const raw = await reasonWithLLM(systemPrompt, userPrompt, true);
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn(`[strategist] LLM parse failed: ${e.message}`);
    // Fallback: basic synthesis from analyst interpretations
    const interpretations = analystFinding?.details?.interpretations || [];
    parsed = {
      summary: interpretations.length > 0
        ? 'Competitive landscape shows significant activity requiring strategic response'
        : 'No significant competitive shifts detected',
      narrative: interpretations.length > 0
        ? `Detected ${interpretations.length} interpreted signals across competitors. Strategic monitoring recommended.`
        : 'Current scan shows stable competitive landscape with no major shifts.',
      competitive_shifts: interpretations.length > 0 ? [{
        competitors: [...new Set(interpretations.map(i => i.competitor))],
        what_changed: 'Multiple competitive signals detected',
        strategic_implication: 'Monitor for follow-up competitive actions',
        urgency: 'medium'
      }] : [],
      recommendations: interpretations.length > 0 ? [{
        action: 'Review competitive positioning',
        rationale: 'Recent competitor activity may impact market dynamics',
        priority: 'medium'
      }] : [],
      confidence: analystFinding?.confidence ? analystFinding.confidence * 0.9 : 0.4,
      verdict: interpretations.length > 0 ? 'significant' : 'neutral'
    };
  }

  // ── Build Finding ──────────────────────────────────────────────────────────
  const finding = {
    id: `finding-${uuidv4()}`,
    dag_id: dagId,
    mission_id: missionId,
    node_id: 'strategist',
    capability: 'strategist',
    summary: parsed.summary || 'Strategist synthesis completed',
    details: {
      narrative: parsed.narrative || '',
      competitive_shifts: parsed.competitive_shifts || [],
      recommendations: parsed.recommendations || [],
    },
    confidence: parsed.confidence ?? 0.5,
    verdict: parsed.verdict ?? 'neutral',
    provenance: {
      agentId: 'strategist-01',
      model: process.env.GROQ_API_KEY ? 'llama-3.1-8b-instant' : 'mock',
      durationMs: Date.now() - startTime,
    },
    created_at: new Date().toISOString(),
  };

  saveFinding(finding);
  return finding;
}

module.exports = { runStrategist };
