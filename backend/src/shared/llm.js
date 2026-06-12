'use strict';

require('dotenv').config();

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';

/**
 * Single entry point for all LLM calls across every agent.
 *
 * @param {string} systemPrompt  - Role definition + output schema contract
 * @param {string} userPrompt    - The data/question for this specific call
 * @param {boolean} jsonMode     - When true, forces the model to emit valid JSON
 * @returns {Promise<string>}    - Raw string (JSON-parseable if jsonMode=true)
 */
async function reasonWithLLM(systemPrompt, userPrompt, jsonMode = false) {
  if (!process.env.GROQ_API_KEY) {
    console.warn('[llm] No GROQ_API_KEY — returning mock response');
    return mockResponse(systemPrompt);
  }

  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1024,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  // Groq free tier hits rate limits under burst load — retry with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const wait = (attempt + 1) * 2000;
      console.warn(`[llm] Rate limited — retrying in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Groq API ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  throw new Error('[llm] Exhausted retries after rate limiting');
}

// ── Mock responses ─────────────────────────────────────────────────────────
// Realistic stubs so the pipeline runs end-to-end with no API key.
// Keyed on keywords in the system prompt so each agent gets a plausible stub.

function mockResponse(systemPrompt) {
  const p = systemPrompt.toLowerCase();

  if (p.includes('pricing')) {
    return JSON.stringify({
      summary: 'Competitor reduced API pricing by 67% — aggressive race-to-the-bottom signal.',
      signals: [{ competitor: 'OpenAI', change: 'GPT-4o dropped from $0.03 to $0.005 per 1K tokens', delta_pct: -83, significance: 'high' }],
      confidence: 0.82,
      verdict: 'significant',
    });
  }

  if (p.includes('hiring')) {
    return JSON.stringify({
      summary: 'Competitors are scaling engineering headcount aggressively — signals pre-launch build-out.',
      signals: [{ competitor: 'OpenAI', change: 'Total openings increased from 87 to 143 (+64%)', delta_pct: 64, significance: 'high' }],
      confidence: 0.78,
      verdict: 'significant',
    });
  }

  if (p.includes('news') || p.includes('article')) {
    return JSON.stringify({
      summary: 'Three competitors had major press coverage driven by product announcements.',
      signals: [{ competitor: 'OpenAI', change: '12 articles vs 5 baseline — product launch detected', delta_pct: 140, significance: 'high' }],
      confidence: 0.75,
      verdict: 'significant',
    });
  }

  if (p.includes('patent')) {
    return JSON.stringify({
      summary: 'OpenAI filed 12 new patents in inference optimization — signals architectural direction.',
      signals: [{ competitor: 'OpenAI', change: '9 new patents vs 3 baseline, focus on inference efficiency', delta_pct: 200, significance: 'high' }],
      confidence: 0.70,
      verdict: 'significant',
    });
  }

  if (p.includes('analyst')) {
    return JSON.stringify({
      interpretations: [
        {
          competitor: 'OpenAI',
          dimension: 'pricing',
          signal: 'GPT-4o price cut 83%',
          interpretation: 'Commoditisation play — sacrificing margin to capture developer mindshare before alternatives gain traction.',
          implication: 'Pressure to match pricing or differentiate on quality/reliability',
        },
      ],
      hot_threads: ['OpenAI pricing strategy', 'Cohere enterprise pivot'],
      confidence: 0.72,
      verdict: 'significant',
    });
  }

  if (p.includes('strategist') || p.includes('synthesise') || p.includes('synthesize')) {
    return JSON.stringify({
      narrative: 'OpenAI and Cohere are executing a coordinated commoditisation strategy: slashing API prices while aggressively hiring to maintain execution speed. Mistral is holding pricing but building product surface (patents). The market is bifurcating into commodity inference and specialised models.',
      competitive_shifts: [
        {
          competitors: ['OpenAI', 'Cohere'],
          what_changed: 'Simultaneous 67-83% price cuts across API tiers',
          strategic_implication: 'API pricing floor is collapsing — revenue must shift to platform/enterprise lock-in',
          urgency: 'high',
        },
      ],
      recommendations: [
        { action: 'Accelerate enterprise SLA and support differentiation', rationale: 'Competing on price alone is a losing position', priority: 'high' },
        { action: 'Evaluate matching pricing on standard tiers within 30 days', rationale: 'Developer adoption is the top-of-funnel for enterprise deals', priority: 'high' },
      ],
      confidence: 0.76,
      verdict: 'significant',
    });
  }

  // Assembler / brief fallback
  return JSON.stringify({
    executive_summary: 'Significant competitive movement detected across pricing and hiring. OpenAI and Cohere are executing aggressive growth plays while Mistral strengthens its IP position.',
    cross_source_insights: [
      'Price cuts + hiring surge = pre-launch scale-up pattern (OpenAI, Cohere)',
      'Patent activity in inference efficiency aligns with Mistral\'s positioning as performance-per-dollar leader',
    ],
    strategic_recommendations: [
      { action: 'Review API pricing tiers against new market floor', rationale: 'Developer adoption at risk', priority: 'high' },
      { action: 'Monitor OpenAI hiring for enterprise sales roles', rationale: 'Early signal of enterprise push', priority: 'medium' },
    ],
    confidence: 0.74,
  });
}

module.exports = { reasonWithLLM };
