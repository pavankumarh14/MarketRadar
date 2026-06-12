'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// DAGRunner — explicit state machine over a single scan-cycle DAG.
//
// Node lifecycle:  pending → running → completed | failed
//
// Rules:
//   A node becomes ready when ALL its declared dependencies are 'completed'.
//   The orchestrator polls getReadyNodes() after each Promise.all phase and
//   fans them out concurrently. This mirrors AegisSwarm's investigation DAG
//   but is adapted for the scout → analyst → strategist pipeline.
//
// Design choice: DAGRunner is a pure in-memory object. The orchestrator is
// responsible for calling saveDAG() after every state transition so the
// React frontend receives live updates via WebSocket.
// ─────────────────────────────────────────────────────────────────────────────

class DAGRunner {
  /**
   * @param {object} dag  Initial DAG as returned by dag-builder.js or loaded from DB.
   */
  constructor(dag) {
    // Deep-clone so mutations don't affect the caller's reference.
    this._dag = JSON.parse(JSON.stringify(dag));
  }

  /** Returns nodes whose dependencies are all completed and status is 'pending'. */
  getReadyNodes() {
    return this._dag.nodes.filter(node => {
      if (node.status !== 'pending') return false;
      return node.dependencies.every(depId => {
        const dep = this._dag.nodes.find(n => n.id === depId);
        return dep && dep.status === 'completed';
      });
    });
  }

  /** pending → running */
  markNodeRunning(nodeId) {
    const node = this._getNode(nodeId);
    if (node.status !== 'pending') throw new Error(`Node ${nodeId} is not pending (status: ${node.status})`);
    node.status = 'running';
    node.started_at = new Date().toISOString();
    this._dag.updated_at = new Date().toISOString();
  }

  /** running → completed; stores the finding result on the node for downstream context. */
  markNodeCompleted(nodeId, finding) {
    const node = this._getNode(nodeId);
    node.status = 'completed';
    node.completed_at = new Date().toISOString();
    node.finding_id = finding?.id ?? null;
    node.confidence = finding?.confidence ?? null;
    this._dag.updated_at = new Date().toISOString();
  }

  /** running → failed */
  markNodeFailed(nodeId, error) {
    const node = this._getNode(nodeId);
    node.status = 'failed';
    node.error = error?.message ?? String(error);
    node.failed_at = new Date().toISOString();
    this._dag.updated_at = new Date().toISOString();
  }

  /** True when every node has reached a terminal state (completed or failed). */
  isDone() {
    return this._dag.nodes.every(n => n.status === 'completed' || n.status === 'failed');
  }

  /** True when all nodes are completed (none failed). */
  isSuccess() {
    return this._dag.nodes.every(n => n.status === 'completed');
  }

  getDAG() {
    return this._dag;
  }

  _getNode(id) {
    const node = this._dag.nodes.find(n => n.id === id);
    if (!node) throw new Error(`Node not found: ${id}`);
    return node;
  }
}

module.exports = { DAGRunner };
