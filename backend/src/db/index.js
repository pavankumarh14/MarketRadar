'use strict';

const Database = require('better-sqlite3');
const path = require('path');

// Use Render persistent disk mount point in production, local path in development
const DATA_DIR = process.env.NODE_ENV === 'production' 
  ? '/opt/render/project/backend/data' 
  : path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'marketmind.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    // WAL mode: concurrent reads while a write is in progress — critical for
    // a multi-agent pipeline where scouts write findings simultaneously.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      competitors     TEXT NOT NULL,      -- JSON string[]
      dimensions      TEXT NOT NULL,      -- JSON string[] e.g. ["pricing","hiring","news","patents"]
      cadence_minutes INTEGER DEFAULT 60,
      status          TEXT DEFAULT 'active',  -- active | paused
      scan_cycle      INTEGER DEFAULT 0,
      created_at      TEXT NOT NULL
    );

    -- One row per competitor×dimension per mission, updated on each scan cycle.
    -- The scout reads the previous snapshot here to compute the delta.
    CREATE TABLE IF NOT EXISTS baselines (
      id          TEXT PRIMARY KEY,
      mission_id  TEXT NOT NULL,
      competitor  TEXT NOT NULL,
      dimension   TEXT NOT NULL,
      content     TEXT NOT NULL,   -- JSON: raw captured snapshot
      scan_cycle  INTEGER NOT NULL,
      created_at  TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES missions(id),
      UNIQUE (mission_id, competitor, dimension)  -- upsert target
    );

    -- One row per scan cycle. Stores the DAG node graph as JSON so the
    -- frontend can render live status updates without a separate state store.
    CREATE TABLE IF NOT EXISTS dags (
      id          TEXT PRIMARY KEY,
      mission_id  TEXT NOT NULL,
      scan_cycle  INTEGER NOT NULL,
      nodes       TEXT NOT NULL,    -- JSON DAGNode[]
      status      TEXT DEFAULT 'running',  -- running | completed | failed
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES missions(id)
    );

    -- One row per agent per scan cycle. Scouts write one finding per
    -- dimension; analyst and strategist each write one summary finding.
    CREATE TABLE IF NOT EXISTS findings (
      id          TEXT PRIMARY KEY,
      dag_id      TEXT NOT NULL,
      mission_id  TEXT NOT NULL,
      node_id     TEXT NOT NULL,
      capability  TEXT NOT NULL,   -- scout-pricing | scout-hiring | scout-news | scout-patents | analyst | strategist
      summary     TEXT NOT NULL,
      details     TEXT NOT NULL,   -- JSON: agent-specific payload
      confidence  REAL DEFAULT 0,
      verdict     TEXT DEFAULT 'neutral',  -- significant | minor | noise | neutral
      provenance  TEXT NOT NULL,   -- JSON: { agentId, model, durationMs }
      created_at  TEXT NOT NULL,
      FOREIGN KEY (dag_id) REFERENCES dags(id)
    );

    -- One row per scan cycle. Written by the assembler after the strategist
    -- completes. This is the "living brief" the React dashboard displays.
    CREATE TABLE IF NOT EXISTS briefs (
      id                       TEXT PRIMARY KEY,
      mission_id               TEXT NOT NULL,
      scan_cycle               INTEGER NOT NULL,
      executive_summary        TEXT NOT NULL,
      cross_source_insights    TEXT NOT NULL,  -- JSON string[]
      strategic_recommendations TEXT NOT NULL, -- JSON { action, rationale, priority }[]
      confidence               REAL DEFAULT 0,
      created_at               TEXT NOT NULL,
      FOREIGN KEY (mission_id) REFERENCES missions(id)
    );
  `);
}

// ── Missions ─────────────────────────────────────────────────────────────────

function saveMission(mission) {
  getDb().prepare(`
    INSERT OR REPLACE INTO missions
      (id, name, competitors, dimensions, cadence_minutes, status, scan_cycle, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    mission.id,
    mission.name,
    JSON.stringify(mission.competitors),
    JSON.stringify(mission.dimensions),
    mission.cadence_minutes ?? 60,
    mission.status ?? 'active',
    mission.scan_cycle ?? 0,
    mission.created_at,
  );
}

function updateMissionScanCycle(id, scan_cycle) {
  getDb().prepare('UPDATE missions SET scan_cycle = ? WHERE id = ?').run(scan_cycle, id);
}

function updateMissionStatus(id, status) {
  getDb().prepare('UPDATE missions SET status = ? WHERE id = ?').run(status, id);
}

function getMissions() {
  return getDb().prepare('SELECT * FROM missions ORDER BY created_at DESC').all().map(parseMission);
}

function getMissionById(id) {
  const row = getDb().prepare('SELECT * FROM missions WHERE id = ?').get(id);
  return row ? parseMission(row) : null;
}

function parseMission(row) {
  return { ...row, competitors: JSON.parse(row.competitors), dimensions: JSON.parse(row.dimensions) };
}

// ── Baselines ─────────────────────────────────────────────────────────────────

function upsertBaseline({ id, mission_id, competitor, dimension, content, scan_cycle }) {
  getDb().prepare(`
    INSERT INTO baselines (id, mission_id, competitor, dimension, content, scan_cycle, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(mission_id, competitor, dimension) DO UPDATE SET
      id = excluded.id,
      content = excluded.content,
      scan_cycle = excluded.scan_cycle,
      created_at = excluded.created_at
  `).run(id, mission_id, competitor, dimension, JSON.stringify(content), scan_cycle, new Date().toISOString());
}

function getBaseline(mission_id, competitor, dimension) {
  const row = getDb().prepare(
    'SELECT * FROM baselines WHERE mission_id = ? AND competitor = ? AND dimension = ?'
  ).get(mission_id, competitor, dimension);
  return row ? { ...row, content: JSON.parse(row.content) } : null;
}

// ── DAGs ──────────────────────────────────────────────────────────────────────

function saveDAG(dag) {
  getDb().prepare(`
    INSERT OR REPLACE INTO dags (id, mission_id, scan_cycle, nodes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    dag.id,
    dag.mission_id,
    dag.scan_cycle,
    JSON.stringify(dag.nodes),
    dag.status ?? 'running',
    dag.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
  );
}

function getDAGById(id) {
  const row = getDb().prepare('SELECT * FROM dags WHERE id = ?').get(id);
  return row ? { ...row, nodes: JSON.parse(row.nodes) } : null;
}

function getDAGsByMissionId(mission_id, limit = 10) {
  return getDb()
    .prepare('SELECT * FROM dags WHERE mission_id = ? ORDER BY scan_cycle DESC LIMIT ?')
    .all(mission_id, limit)
    .map(r => ({ ...r, nodes: JSON.parse(r.nodes) }));
}

// ── Findings ─────────────────────────────────────────────────────────────────

function saveFinding(finding) {
  getDb().prepare(`
    INSERT OR REPLACE INTO findings
      (id, dag_id, mission_id, node_id, capability, summary, details, confidence, verdict, provenance, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    finding.id,
    finding.dag_id,
    finding.mission_id,
    finding.node_id,
    finding.capability,
    finding.summary,
    JSON.stringify(finding.details),
    finding.confidence,
    finding.verdict,
    JSON.stringify(finding.provenance),
    finding.created_at ?? new Date().toISOString(),
  );
}

function getFindingsByDagId(dag_id) {
  return getDb()
    .prepare('SELECT * FROM findings WHERE dag_id = ? ORDER BY created_at ASC')
    .all(dag_id)
    .map(parseFinding);
}

// Signals = scout findings only — shown in the sidebar signal feed.
function getSignalsByMissionId(mission_id, limit = 100) {
  return getDb()
    .prepare("SELECT * FROM findings WHERE mission_id = ? AND capability LIKE 'scout-%' ORDER BY created_at DESC LIMIT ?")
    .all(mission_id, limit)
    .map(parseFinding);
}

function parseFinding(row) {
  return { ...row, details: JSON.parse(row.details), provenance: JSON.parse(row.provenance) };
}

// ── Briefs ────────────────────────────────────────────────────────────────────

function saveBrief(brief) {
  getDb().prepare(`
    INSERT OR REPLACE INTO briefs
      (id, mission_id, scan_cycle, executive_summary, cross_source_insights, strategic_recommendations, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    brief.id,
    brief.mission_id,
    brief.scan_cycle,
    brief.executive_summary,
    JSON.stringify(brief.cross_source_insights),
    JSON.stringify(brief.strategic_recommendations),
    brief.confidence,
    brief.created_at ?? new Date().toISOString(),
  );
}

function getBriefsByMissionId(mission_id, limit = 10) {
  return getDb()
    .prepare('SELECT * FROM briefs WHERE mission_id = ? ORDER BY scan_cycle DESC LIMIT ?')
    .all(mission_id, limit)
    .map(r => ({
      ...r,
      cross_source_insights: JSON.parse(r.cross_source_insights),
      strategic_recommendations: JSON.parse(r.strategic_recommendations),
    }));
}

module.exports = {
  getDb,
  // missions
  saveMission, updateMissionScanCycle, updateMissionStatus,
  getMissions, getMissionById,
  // baselines
  upsertBaseline, getBaseline,
  // dags
  saveDAG, getDAGById, getDAGsByMissionId,
  // findings
  saveFinding, getFindingsByDagId, getSignalsByMissionId,
  // briefs
  saveBrief, getBriefsByMissionId,
};
