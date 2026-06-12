'use strict';

const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────────────────────────
// DAG shape for one MarketRadar scan cycle:
//
//  Phase 1 — parallel scouts (no dependencies):
//    scout-pricing, scout-hiring, scout-news, scout-patents
//
//  Phase 2 — analyst (depends on ALL scouts completing):
//    analyst
//
//  Phase 3 — strategist (depends on analyst):
//    strategist
//
// The analyst and strategist stubs are candidate tasks. With stubs in place
// the DAG still reaches 'completed' so the assembler can run and the frontend
// shows the full pipeline flow — just with lower confidence scores.
// ─────────────────────────────────────────────────────────────────────────────

const SCOUT_NODE_IDS = ['scout-pricing', 'scout-hiring', 'scout-news', 'scout-patents'];

/**
 * Build a fresh DAG for a single scan cycle.
 *
 * @param {string} mission_id
 * @param {number} scan_cycle
 * @returns {object} DAG ready to be handed to DAGRunner and saved to SQLite.
 */
function buildScanDAG(mission_id, scan_cycle) {
  const now = new Date().toISOString();

  const nodes = [
    // ── Phase 1: scouts run concurrently ────────────────────────────────────
    ...SCOUT_NODE_IDS.map(id => ({
      id,
      capability: id,
      phase: 1,
      status: 'pending',
      dependencies: [],      // no deps — all start immediately
      started_at: null,
      completed_at: null,
      failed_at: null,
      finding_id: null,
      confidence: null,
      error: null,
    })),

    // ── Phase 2: analyst waits for all 4 scouts ──────────────────────────────
    {
      id: 'analyst',
      capability: 'analyst',
      phase: 2,
      status: 'pending',
      dependencies: SCOUT_NODE_IDS,
      started_at: null,
      completed_at: null,
      failed_at: null,
      finding_id: null,
      confidence: null,
      error: null,
    },

    // ── Phase 3: strategist waits for analyst ────────────────────────────────
    {
      id: 'strategist',
      capability: 'strategist',
      phase: 3,
      status: 'pending',
      dependencies: ['analyst'],
      started_at: null,
      completed_at: null,
      failed_at: null,
      finding_id: null,
      confidence: null,
      error: null,
    },
  ];

  return {
    id: `dag-${uuidv4()}`,
    mission_id,
    scan_cycle,
    nodes,
    status: 'running',
    created_at: now,
    updated_at: now,
  };
}

module.exports = { buildScanDAG };
