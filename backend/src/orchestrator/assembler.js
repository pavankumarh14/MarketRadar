'use strict';

const { v4: uuidv4 } = require('uuid');
const { reasonWithLLM } = require('../shared/llm');
const { saveBrief } = require('../db');
const { rankSignals } = require('./signal-ranker');

/**
 * Assembles the final intelligence brief after all agents complete.
 * Reads the strategist finding (which has the cross-source narrative and
 * recommendations) and optionally calls the LLM for a crisp executive summary.
 *
 * @param {string} missionId
 * @param {number} scanCycle
 * @param {object[]} allFindings  All findings for this DAG (scouts + analyst + strategist)
 * @returns {Promise<object>} Brief
 */
async function assembleBrief(missionId, scanCycle, allFindings) {
  const strategistFinding = allFindings.find(f => f.capability === 'strategist');
  const rawScoutFindings  = allFindings.filter(f => f.capability.startsWith('scout-'));

  // Run the signal ranker (candidate task). Falls back to raw order if the
  // stub hasn't been implemented yet — pipeline never breaks.
  let scoutFindings = rawScoutFindings;
  try {
    const ranked = rankSignals(rawScoutFindings, missionId, scanCycle);
    if (Array.isArray(ranked) && ranked.length > 0) scoutFindings = ranked;
  } catch (e) {
    console.warn('[assembler] signal-ranker threw — using unranked findings:', e.message);
  }
  const analystFinding = allFindings.find(f => f.capability === 'analyst');

  // Use the strategist's synthesis as the source of truth for the brief.
  // If the strategist stub hasn't been implemented, fall back to a summary
  // derived from the scout signals so the brief is always useful.
  const hasRealStrategist = strategistFinding && !strategistFinding.details._stub;

  let executive_summary = '';
  let cross_source_insights = [];
  let strategic_recommendations = [];
  let confidence = 0;

  if (hasRealStrategist) {
    executive_summary  = strategistFinding.details.narrative;
    cross_source_insights    = (strategistFinding.details.competitive_shifts ?? [])
      .map(s => s.strategic_implication);
    strategic_recommendations = strategistFinding.details.recommendations ?? [];
    confidence = strategistFinding.confidence;
  } else {
    // Fallback: synthesise from scout summaries using the LLM
    const scoutContext = scoutFindings
      .filter(f => f.verdict !== 'noise')
      .map(f => `[${f.capability}] ${f.summary}`)
      .join('\n');

    const systemPrompt = `You are a competitive intelligence editor. Synthesise the scout signals below into a concise brief.
Respond ONLY in valid JSON:
{
  "executive_summary": "2–3 sentence brief",
  "cross_source_insights": ["insight1", "insight2"],
  "strategic_recommendations": [{ "action": "string", "rationale": "string", "priority": "high|medium|low" }],
  "confidence": 0.0–1.0
}`;

    let parsed = {};
    try {
      const raw = await reasonWithLLM(systemPrompt, scoutContext, true);
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    executive_summary         = parsed.executive_summary ?? 'Competitive scan complete. Implement the Analyst and Strategist for a full synthesis.';
    cross_source_insights     = parsed.cross_source_insights ?? scoutFindings.map(f => f.summary);
    strategic_recommendations = parsed.strategic_recommendations ?? [];
    confidence = parsed.confidence ?? (scoutFindings.reduce((s, f) => s + f.confidence, 0) / Math.max(scoutFindings.length, 1));
  }

  const brief = {
    id: `brief-${uuidv4()}`,
    mission_id: missionId,
    scan_cycle: scanCycle,
    executive_summary,
    cross_source_insights,
    strategic_recommendations,
    confidence: Math.round(confidence * 100) / 100,
    created_at: new Date().toISOString(),
  };

  saveBrief(brief);
  return brief;
}

module.exports = { assembleBrief };
