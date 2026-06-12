'use strict';

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Use Render persistent disk mount point in production, local path in development
const DATA_DIR = process.env.NODE_ENV === 'production' 
  ? '/opt/render/project/src/backend/data' 
  : path.join(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'marketmind.db');

let db;
let SQL;

async function getDb() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  
  if (!db) {
    // Ensure directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Load existing database if available
    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(DB_PATH);
    } catch (e) {
      // File doesn't exist, create new
    }
    
    db = new SQL.Database(fileBuffer);
    initSchema();
    saveDatabase();
  }
  return db;
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

function initSchema() {
  db.run(`
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
      updated_at  TEXT NOT NULL
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
      created_at  TEXT NOT NULL
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
      created_at               TEXT NOT NULL
    );
  `);

  // Seed sample mission if none exist
  seedSampleMission();
}

function seedSampleMission() {
  const existingMissions = getMissions();
  if (existingMissions.length > 0) return;

  const sampleMission = {
    id: `mission-${uuidv4()}`,
    name: 'AI Platform Pricing War Demo',
    competitors: ['OpenAI', 'Cohere', 'Mistral'],
    dimensions: ['pricing', 'hiring', 'patents'],
    cadence_minutes: 60,
    status: 'active',
    scan_cycle: 0,
    created_at: new Date().toISOString(),
  };

  saveMission(sampleMission);
  console.log('   Seeded sample mission:', sampleMission.name);
}

// ── Missions ─────────────────────────────────────────────────────────────────

function saveMission(mission) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO missions
      (id, name, competitors, dimensions, cadence_minutes, status, scan_cycle, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    mission.id,
    mission.name,
    JSON.stringify(mission.competitors),
    JSON.stringify(mission.dimensions),
    mission.cadence_minutes ?? 60,
    mission.status ?? 'active',
    mission.scan_cycle ?? 0,
    mission.created_at,
  ]);
  stmt.free();
  saveDatabase();
}

function updateMissionScanCycle(id, scan_cycle) {
  const stmt = db.prepare('UPDATE missions SET scan_cycle = ? WHERE id = ?');
  stmt.run([scan_cycle, id]);
  stmt.free();
  saveDatabase();
}

function updateMissionStatus(id, status) {
  const stmt = db.prepare('UPDATE missions SET status = ? WHERE id = ?');
  stmt.run([status, id]);
  stmt.free();
  saveDatabase();
}

function getMissions() {
  const stmt = db.prepare('SELECT * FROM missions ORDER BY created_at DESC');
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(parseMission);
}

function getMissionById(id) {
  const stmt = db.prepare('SELECT * FROM missions WHERE id = ?');
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row ? parseMission(row) : null;
}

function parseMission(row) {
  return { ...row, competitors: JSON.parse(row.competitors), dimensions: JSON.parse(row.dimensions) };
}

// ── Baselines ─────────────────────────────────────────────────────────────────

function upsertBaseline({ id, mission_id, competitor, dimension, content, scan_cycle }) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO baselines (id, mission_id, competitor, dimension, content, scan_cycle, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    id,
    mission_id,
    competitor,
    dimension,
    JSON.stringify(content),
    scan_cycle,
    new Date().toISOString()
  ]);
  stmt.free();
  saveDatabase();
}

function getBaseline(mission_id, competitor, dimension) {
  const stmt = db.prepare('SELECT * FROM baselines WHERE mission_id = ? AND competitor = ? AND dimension = ?');
  stmt.bind([mission_id, competitor, dimension]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row ? { ...row, content: JSON.parse(row.content) } : null;
}

// ── DAGs ──────────────────────────────────────────────────────────────────────

function saveDAG(dag) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO dags (id, mission_id, scan_cycle, nodes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    dag.id,
    dag.mission_id,
    dag.scan_cycle,
    JSON.stringify(dag.nodes),
    dag.status ?? 'running',
    dag.created_at ?? new Date().toISOString(),
    new Date().toISOString(),
  ]);
  stmt.free();
  saveDatabase();
}

function getDAGById(id) {
  const stmt = db.prepare('SELECT * FROM dags WHERE id = ?');
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row ? { ...row, nodes: JSON.parse(row.nodes) } : null;
}

function getDAGsByMissionId(mission_id, limit = 10) {
  const stmt = db.prepare('SELECT * FROM dags WHERE mission_id = ? ORDER BY scan_cycle DESC LIMIT ?');
  stmt.bind([mission_id, limit]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(r => ({ ...r, nodes: JSON.parse(r.nodes) }));
}

// ── Findings ─────────────────────────────────────────────────────────────────

function saveFinding(finding) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO findings
      (id, dag_id, mission_id, node_id, capability, summary, details, confidence, verdict, provenance, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
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
  ]);
  stmt.free();
  saveDatabase();
}

function getFindingsByDagId(dag_id) {
  const stmt = db.prepare('SELECT * FROM findings WHERE dag_id = ? ORDER BY created_at ASC');
  stmt.bind([dag_id]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(parseFinding);
}

// Signals = scout findings only — shown in the sidebar signal feed.
function getSignalsByMissionId(mission_id, limit = 100) {
  const stmt = db.prepare("SELECT * FROM findings WHERE mission_id = ? AND capability LIKE 'scout-%' ORDER BY created_at DESC LIMIT ?");
  stmt.bind([mission_id, limit]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(parseFinding);
}

function parseFinding(row) {
  return { ...row, details: JSON.parse(row.details), provenance: JSON.parse(row.provenance) };
}

// ── Briefs ────────────────────────────────────────────────────────────────────

function saveBrief(brief) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO briefs
      (id, mission_id, scan_cycle, executive_summary, cross_source_insights, strategic_recommendations, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([
    brief.id,
    brief.mission_id,
    brief.scan_cycle,
    brief.executive_summary,
    JSON.stringify(brief.cross_source_insights),
    JSON.stringify(brief.strategic_recommendations),
    brief.confidence,
    brief.created_at ?? new Date().toISOString(),
  ]);
  stmt.free();
  saveDatabase();
}

function getBriefsByMissionId(mission_id, limit = 10) {
  const stmt = db.prepare('SELECT * FROM briefs WHERE mission_id = ? ORDER BY scan_cycle DESC LIMIT ?');
  stmt.bind([mission_id, limit]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows.map(r => ({
    ...r,
    cross_source_insights: JSON.parse(r.cross_source_insights),
    strategic_recommendations: JSON.parse(r.strategic_recommendations),
  }));
}

// Since getDb is async now, we need to export an async init
async function initDb() {
  await getDb();
}

module.exports = {
  initDb,
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
