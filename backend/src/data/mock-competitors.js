'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Mock competitive intelligence fixtures
//
// Scenario: three AI-platform companies in a pricing war.
// Three scan cycles show a clear progression:
//   Cycle 0 — baseline (first capture, no delta yet)
//   Cycle 1 — OpenAI and Cohere make aggressive moves; Mistral dips
//   Cycle 2 — race accelerates; Mistral recovers with new model
//
// These mocks play the role that Playwright scraping would play in production.
// The Scout agents compare cycle N against the stored baseline (cycle N-1).
// ─────────────────────────────────────────────────────────────────────────────

const PRICING = {
  OpenAI: {
    0: {
      tiers: [
        { name: 'GPT-3.5 Turbo',     price_per_1k_tokens: 0.002,   type: 'chat' },
        { name: 'GPT-4',             price_per_1k_tokens: 0.03,    type: 'chat' },
        { name: 'Embeddings ada-002', price_per_1k_tokens: 0.0001,  type: 'embedding' },
      ],
      free_tier: false,
      enterprise_plan: true,
      captured_url: 'https://openai.com/pricing',
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      tiers: [
        { name: 'GPT-3.5 Turbo',  price_per_1k_tokens: 0.0005,  type: 'chat' },    // -75%
        { name: 'GPT-4o',         price_per_1k_tokens: 0.005,   type: 'chat' },    // new, -83% vs GPT-4
        { name: 'Embeddings v3',   price_per_1k_tokens: 0.00002, type: 'embedding' },// -80%
      ],
      free_tier: false,
      enterprise_plan: true,
      captured_url: 'https://openai.com/pricing',
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      tiers: [
        { name: 'GPT-3.5 Turbo',       price_per_1k_tokens: 0.0005,  type: 'chat' },
        { name: 'GPT-4o',              price_per_1k_tokens: 0.005,   type: 'chat' },
        { name: 'GPT-4o Free (100K/mo)',price_per_1k_tokens: 0,       type: 'chat', monthly_cap: 100000 },
        { name: 'Embeddings v3',        price_per_1k_tokens: 0.00002, type: 'embedding' },
      ],
      free_tier: true,       // new in cycle 2
      enterprise_plan: true,
      captured_url: 'https://openai.com/pricing',
      captured_at: '2026-05-27T00:00:00Z',
    },
  },

  Cohere: {
    0: {
      tiers: [
        { name: 'Command',    price_per_1k_tokens: 0.015, type: 'chat' },
        { name: 'Embed',      price_per_1k_tokens: 0.0001,type: 'embedding' },
      ],
      free_tier: false,
      enterprise_plan: true,
      captured_url: 'https://cohere.com/pricing',
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      tiers: [
        { name: 'Command',    price_per_1k_tokens: 0.015,  type: 'chat' },
        { name: 'Command R+', price_per_1k_tokens: 0.003,  type: 'chat' },   // new model, -80% vs Command
        { name: 'Embed v3',   price_per_1k_tokens: 0.00005,type: 'embedding' },
      ],
      free_tier: false,
      enterprise_plan: true,
      captured_url: 'https://cohere.com/pricing',
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      tiers: [
        { name: 'Command',    price_per_1k_tokens: 0.015,  type: 'chat' },
        { name: 'Command R+', price_per_1k_tokens: 0.001,  type: 'chat' },   // further -67%
        { name: 'Command R',  price_per_1k_tokens: 0.0005, type: 'chat' },   // new lower tier
        { name: 'Embed v3',   price_per_1k_tokens: 0.00005,type: 'embedding' },
      ],
      free_tier: false,
      enterprise_plan: true,
      captured_url: 'https://cohere.com/pricing',
      captured_at: '2026-05-27T00:00:00Z',
    },
  },

  Mistral: {
    0: {
      tiers: [
        { name: 'Mixtral 8x7B', price_per_1k_tokens: 0.007, type: 'chat' },
        { name: 'Mistral 7B',   price_per_1k_tokens: 0.002, type: 'chat' },
      ],
      free_tier: false,
      enterprise_plan: false,
      captured_url: 'https://mistral.ai/pricing',
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      tiers: [
        { name: 'Mixtral 8x7B', price_per_1k_tokens: 0.007, type: 'chat' },
        { name: 'Mistral 7B',   price_per_1k_tokens: 0.002, type: 'chat' },
        // no price changes — holding position while competitors slash
      ],
      free_tier: false,
      enterprise_plan: false,
      captured_url: 'https://mistral.ai/pricing',
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      tiers: [
        { name: 'Mistral Large', price_per_1k_tokens: 0.004, type: 'chat' },  // new premium tier
        { name: 'Mixtral 8x7B', price_per_1k_tokens: 0.007, type: 'chat' },
        { name: 'Mistral 7B',   price_per_1k_tokens: 0.002, type: 'chat' },
      ],
      free_tier: false,
      enterprise_plan: true,   // now offering enterprise
      captured_url: 'https://mistral.ai/pricing',
      captured_at: '2026-05-27T00:00:00Z',
    },
  },
};

const HIRING = {
  OpenAI: {
    0: {
      total_openings: 87,
      by_category: { engineering: 45, research: 22, product: 12, sales: 8 },
      key_roles: ['ML Research Engineer', 'Safety Engineer', 'Inference Engineer'],
      new_locations: [],
      locations: ['San Francisco', 'New York', 'London'],
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      total_openings: 143,   // +64%
      by_category: { engineering: 78, research: 31, product: 18, sales: 16 },
      key_roles: ['Inference Engineer (×8 openings)', 'Enterprise AE', 'Solutions Engineer', 'ML Research Engineer'],
      new_locations: ['Singapore'],
      locations: ['San Francisco', 'New York', 'London', 'Singapore'],
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      total_openings: 198,   // +38%
      by_category: { engineering: 105, research: 38, product: 25, sales: 30 },
      key_roles: ['Enterprise Sales Director', 'Solutions Engineer', 'ML Research Engineer', 'Developer Relations'],
      new_locations: ['Dublin'],
      locations: ['San Francisco', 'New York', 'London', 'Singapore', 'Dublin'],
      captured_at: '2026-05-27T00:00:00Z',
    },
  },

  Cohere: {
    0: {
      total_openings: 44,
      by_category: { engineering: 28, research: 8, product: 5, sales: 3 },
      key_roles: ['ML Engineer', 'Backend Engineer', 'Research Scientist'],
      new_locations: [],
      locations: ['Toronto', 'San Francisco', 'London'],
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      total_openings: 67,    // +52%
      by_category: { engineering: 40, research: 12, product: 8, sales: 7 },
      key_roles: ['Enterprise AE', 'ML Engineer', 'Research Scientist'],
      new_locations: ['New York'],
      locations: ['Toronto', 'San Francisco', 'London', 'New York'],
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      total_openings: 89,    // +33%
      by_category: { engineering: 51, research: 14, product: 11, sales: 13 },
      key_roles: ['Enterprise AE (×5)', 'Solutions Architect', 'ML Engineer'],
      new_locations: ['Tokyo'],
      locations: ['Toronto', 'San Francisco', 'London', 'New York', 'Tokyo'],
      captured_at: '2026-05-27T00:00:00Z',
    },
  },

  Mistral: {
    0: {
      total_openings: 31,
      by_category: { engineering: 20, research: 8, product: 2, sales: 1 },
      key_roles: ['Research Engineer', 'Backend Engineer'],
      new_locations: [],
      locations: ['Paris'],
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      total_openings: 27,    // -13% — slight pullback
      by_category: { engineering: 18, research: 7, product: 1, sales: 1 },
      key_roles: ['Research Engineer', 'Infrastructure Engineer'],
      new_locations: [],
      locations: ['Paris'],
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      total_openings: 38,    // +41% recovery — new model, new expansion
      by_category: { engineering: 22, research: 8, product: 4, sales: 4 },
      key_roles: ['Enterprise Sales (new!)', 'Solutions Engineer', 'Research Engineer'],
      new_locations: ['London'],
      locations: ['Paris', 'London'],
      captured_at: '2026-05-27T00:00:00Z',
    },
  },
};

const PATENTS = {
  OpenAI: {
    0: {
      total_recent_filings: 3,
      patents: [
        { title: 'Reinforcement learning from human feedback with variance reduction', category: 'Training', filed: '2025-12-10' },
        { title: 'Token compression for transformer inference', category: 'Efficiency', filed: '2026-01-15' },
        { title: 'Multi-agent coordination protocol for LLM task decomposition', category: 'Agents', filed: '2026-02-08' },
      ],
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      total_recent_filings: 9,   // +200% surge
      patents: [
        { title: 'Speculative decoding with adaptive draft model selection', category: 'Efficiency', filed: '2026-03-01' },
        { title: 'Continuous batching for high-throughput LLM serving', category: 'Infrastructure', filed: '2026-03-14' },
        { title: 'Context cache eviction policy for long-context windows', category: 'Infrastructure', filed: '2026-03-22' },
        { title: 'Sparse mixture-of-experts routing with load balancing', category: 'Architecture', filed: '2026-04-05' },
        { title: 'Tool-use schema validation for function-calling LLMs', category: 'Agents', filed: '2026-04-18' },
        { title: 'Multimodal embedding alignment for vision-language models', category: 'Multimodal', filed: '2026-04-29' },
      ],
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      total_recent_filings: 14,
      patents: [
        { title: 'Real-time personalisation via low-rank adapter switching', category: 'Fine-tuning', filed: '2026-05-03' },
        { title: 'Latency-aware routing across heterogeneous GPU clusters', category: 'Infrastructure', filed: '2026-05-10' },
        { title: 'Enterprise data isolation in shared LLM inference pools', category: 'Security', filed: '2026-05-17' },
        { title: 'Dynamic context window extension via KV cache merging', category: 'Architecture', filed: '2026-05-21' },
        { title: 'Privacy-preserving fine-tuning with differential noise injection', category: 'Security', filed: '2026-05-24' },
      ],
      captured_at: '2026-05-27T00:00:00Z',
    },
  },

  Cohere: {
    0: {
      total_recent_filings: 2,
      patents: [
        { title: 'Retrieval-augmented generation with provenance tracking', category: 'RAG', filed: '2026-01-20' },
        { title: 'Domain-adaptive instruction tuning with curriculum ordering', category: 'Training', filed: '2026-02-14' },
      ],
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      total_recent_filings: 5,
      patents: [
        { title: 'Hybrid dense-sparse retrieval for enterprise knowledge bases', category: 'RAG', filed: '2026-03-11' },
        { title: 'Re-ranking with cross-encoder calibration at inference time', category: 'Retrieval', filed: '2026-04-02' },
        { title: 'Grounding verification for hallucination detection in RAG pipelines', category: 'Safety', filed: '2026-04-22' },
      ],
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      total_recent_filings: 7,
      patents: [
        { title: 'Structured citation extraction from retrieval-augmented outputs', category: 'RAG', filed: '2026-05-08' },
        { title: 'Incremental index updates for real-time enterprise RAG', category: 'Retrieval', filed: '2026-05-19' },
      ],
      captured_at: '2026-05-27T00:00:00Z',
    },
  },

  Mistral: {
    0: {
      total_recent_filings: 1,
      patents: [
        { title: 'Grouped-query attention with dynamic head allocation', category: 'Architecture', filed: '2026-02-28' },
      ],
      captured_at: '2026-05-06T00:00:00Z',
    },
    1: {
      total_recent_filings: 2,
      patents: [
        { title: 'Sliding window attention for unbounded context length', category: 'Architecture', filed: '2026-04-10' },
        { title: 'Expert-selection regularisation in sparse MoE training', category: 'Training', filed: '2026-04-25' },
      ],
      captured_at: '2026-05-20T00:00:00Z',
    },
    2: {
      total_recent_filings: 4,
      patents: [
        { title: 'Instruction-following evaluation benchmark with adversarial probes', category: 'Evaluation', filed: '2026-05-05' },
        { title: 'Quantisation-aware training for 4-bit model deployment', category: 'Efficiency', filed: '2026-05-16' },
      ],
      captured_at: '2026-05-27T00:00:00Z',
    },
  },
};

/**
 * Returns the mock snapshot for a competitor + dimension at a given scan cycle.
 * Caps at cycle 2 — cycles beyond that repeat the final state (no new changes detected).
 *
 * @param {string} competitor
 * @param {'pricing'|'hiring'|'patents'} dimension
 * @param {number} scanCycle
 * @returns {object}
 */
function getMockSnapshot(competitor, dimension, scanCycle) {
  const store = { pricing: PRICING, hiring: HIRING, patents: PATENTS };
  const bucket = store[dimension];
  if (!bucket) throw new Error(`No mock data for dimension "${dimension}"`);
  const data = bucket[competitor];
  if (!data) throw new Error(`No mock data for competitor "${competitor}"`);
  const cycle = Math.min(scanCycle, 2);
  return data[cycle] ?? data[0];
}

module.exports = { getMockSnapshot };
