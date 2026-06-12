'use strict';

const { buildScanDAG }             = require('./dag-builder');
const { DAGRunner }                = require('./dag-runner');
const { assembleBrief }            = require('./assembler');
const { runScout }                 = require('../agents/scout');
const { runAnalyst }               = require('../agents/analyst');
const { runStrategist }            = require('../agents/strategist');
const {
  getMissionById,
  updateMissionScanCycle,
  saveDAG,
  getFindingsByDagId,
} = require('../db');

// Injected at startup by server.js — avoids circular requires.
let broadcast = () => {};
function setBroadcast(fn) { broadcast = fn; }

/**
 * Execute one full scan cycle for a mission.
 * Called by the scheduler (recurring) or the manual-trigger API endpoint.
 *
 * Pipeline:
 *   Phase 1 — scout-pricing, scout-hiring, scout-news, scout-patents (parallel)
 *   Phase 2 — analyst (sequential, depends on all scouts)
 *   Phase 3 — strategist (sequential, depends on analyst)
 *   Post    — assemble brief from all findings
 *
 * @param {string} missionId
 * @returns {Promise<{ dag: object, brief: object }>}
 */
async function runScan(missionId) {
  const mission = getMissionById(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);

  const nextCycle = mission.scan_cycle + 1;
  updateMissionScanCycle(missionId, nextCycle);

  // ── Build and persist the DAG ─────────────────────────────────────────────
  const dag = buildScanDAG(missionId, nextCycle);
  const runner = new DAGRunner(dag);
  saveDAG(runner.getDAG());
  broadcast({ type: 'dag_update', data: runner.getDAG() });

  const taskBase = {
    dagId: dag.id,
    missionId,
    competitors: mission.competitors,
    dimensions: mission.dimensions,
    scanCycle: nextCycle,
    context: {},
  };

  // ── Phase 1: scouts run concurrently ─────────────────────────────────────
  const scoutNodes = runner.getReadyNodes();  // all 4 scouts have no deps

  const scoutFindings = await Promise.all(
    scoutNodes.map(async node => {
      runner.markNodeRunning(node.id);
      saveDAG(runner.getDAG());
      broadcast({ type: 'dag_update', data: runner.getDAG() });

      try {
        const finding = await runScout({ taskId: `task-${Date.now()}`, nodeId: node.id, ...taskBase });
        runner.markNodeCompleted(node.id, finding);
        broadcast({ type: 'finding', data: finding });
        return finding;
      } catch (err) {
        console.error(`[orchestrator] Scout ${node.id} failed:`, err.message);
        runner.markNodeFailed(node.id, err);
        return null;
      } finally {
        saveDAG(runner.getDAG());
        broadcast({ type: 'dag_update', data: runner.getDAG() });
      }
    })
  );

  // ── Phase 2: analyst (ready once all scouts complete) ────────────────────
  const [analystNode] = runner.getReadyNodes();  // should be exactly one node: 'analyst'

  let analystFinding = null;
  if (analystNode) {
    runner.markNodeRunning(analystNode.id);
    saveDAG(runner.getDAG());
    broadcast({ type: 'dag_update', data: runner.getDAG() });

    try {
      analystFinding = await runAnalyst({
        taskId: `task-${Date.now()}`,
        nodeId: 'analyst',
        ...taskBase,
        context: { scoutFindings: scoutFindings.filter(Boolean) },
      });
      runner.markNodeCompleted(analystNode.id, analystFinding);
      broadcast({ type: 'finding', data: analystFinding });
    } catch (err) {
      console.error('[orchestrator] Analyst failed:', err.message);
      runner.markNodeFailed(analystNode.id, err);
    } finally {
      saveDAG(runner.getDAG());
      broadcast({ type: 'dag_update', data: runner.getDAG() });
    }
  }

  // ── Phase 3: strategist ───────────────────────────────────────────────────
  const [strategistNode] = runner.getReadyNodes();

  let strategistFinding = null;
  if (strategistNode) {
    runner.markNodeRunning(strategistNode.id);
    saveDAG(runner.getDAG());
    broadcast({ type: 'dag_update', data: runner.getDAG() });

    try {
      strategistFinding = await runStrategist({
        taskId: `task-${Date.now()}`,
        nodeId: 'strategist',
        ...taskBase,
        context: { analystFinding },
      });
      runner.markNodeCompleted(strategistNode.id, strategistFinding);
      broadcast({ type: 'finding', data: strategistFinding });
    } catch (err) {
      console.error('[orchestrator] Strategist failed:', err.message);
      runner.markNodeFailed(strategistNode.id, err);
    } finally {
      saveDAG(runner.getDAG());
      broadcast({ type: 'dag_update', data: runner.getDAG() });
    }
  }

  // Mark DAG done regardless of individual failures
  runner.getDAG().status = runner.isSuccess() ? 'completed' : 'failed';
  saveDAG(runner.getDAG());
  broadcast({ type: 'dag_update', data: runner.getDAG() });

  // ── Assemble brief ────────────────────────────────────────────────────────
  const allFindings = getFindingsByDagId(dag.id);
  const brief = await assembleBrief(missionId, nextCycle, allFindings);
  broadcast({ type: 'brief_ready', data: brief });

  console.log(`[orchestrator] Scan cycle ${nextCycle} complete for mission ${missionId}`);
  return { dag: runner.getDAG(), brief };
}

module.exports = { runScan, setBroadcast };
