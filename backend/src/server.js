'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { WebSocketServer } = require('ws');
const { v4: uuidv4 }      = require('uuid');
const path    = require('path');

const {
  initDb,
  getDb,
  saveMission, getMissions, getMissionById, updateMissionStatus,
  getDAGsByMissionId, getDAGById,
  getSignalsByMissionId, getFindingsByDagId,
  getBriefsByMissionId,
} = require('./db');
const { runScan, setBroadcast }        = require('./orchestrator');
const { startScheduler, stopScheduler } = require('./orchestrator/scheduler');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

const PORT            = process.env.PORT ?? 3001;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';
const NODE_ENV        = process.env.NODE_ENV ?? 'development';

// Allow multiple origins for production (Render frontend + local development)
const allowedOrigins = FRONTEND_ORIGIN.split(',').map(o => o.trim());
app.use(cors({ 
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Serve frontend static files in production
if (NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  
  // Serve index.html for all non-API routes (SPA support)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

wss.on('connection', ws => {
  ws.send(JSON.stringify({ type: 'connected', data: { message: 'MarketRadar live feed connected' } }));
  // Absorb per-client errors (ECONNRESET on browser refresh/close).
  // Unhandled 'error' events on an EventEmitter crash the process.
  ws.on('error', () => {});
});

// Broadcast to all connected clients — injected into the orchestrator.
function broadcast(event) {
  const msg = JSON.stringify(event);
  wss.clients.forEach(ws => {
    if (ws.readyState !== ws.OPEN) return;
    try {
      ws.send(msg);
    } catch {
      // Client disconnected between readyState check and send — harmless.
    }
  });
}

setBroadcast(broadcast);

// ── API Routes ────────────────────────────────────────────────────────────────

// All responses follow the envelope: { success, data, timestamp } | { success, error, timestamp }
const ok  = (res, data, status = 200) => res.status(status).json({ success: true,  data, timestamp: new Date().toISOString() });
const err = (res, msg, status = 500) => res.status(status).json({ success: false, error: msg, timestamp: new Date().toISOString() });

app.get('/health', (_req, res) => ok(res, { status: 'ok', db: !!getDb() }));

// ── Missions ──────────────────────────────────────────────────────────────────

app.get('/api/missions', (_req, res) => ok(res, getMissions()));

app.get('/api/missions/:id', (req, res) => {
  const mission = getMissionById(req.params.id);
  if (!mission) return err(res, 'Mission not found', 404);
  ok(res, mission);
});

app.post('/api/missions', async (req, res) => {
  const { name, competitors, dimensions, cadence_minutes = 60 } = req.body;

  if (!name || typeof name !== 'string') return err(res, 'name is required', 400);
  if (!Array.isArray(competitors) || competitors.length === 0) return err(res, 'competitors must be a non-empty array', 400);
  if (!Array.isArray(dimensions) || dimensions.length === 0) return err(res, 'dimensions must be a non-empty array', 400);

  const validDimensions = ['pricing', 'hiring', 'news', 'patents'];
  const badDims = dimensions.filter(d => !validDimensions.includes(d));
  if (badDims.length) return err(res, `Unknown dimensions: ${badDims.join(', ')}. Valid: ${validDimensions.join(', ')}`, 400);

  const mission = {
    id: `mission-${uuidv4()}`,
    name,
    competitors,
    dimensions,
    cadence_minutes,
    status: 'active',
    scan_cycle: 0,
    created_at: new Date().toISOString(),
  };

  saveMission(mission);

  // Schedule recurring scans
  startScheduler(mission.id, cadence_minutes, () => runScan(mission.id));

  ok(res, mission, 201);
});

app.post('/api/missions/:id/pause', (req, res) => {
  const mission = getMissionById(req.params.id);
  if (!mission) return err(res, 'Mission not found', 404);
  updateMissionStatus(req.params.id, 'paused');
  stopScheduler(req.params.id);
  ok(res, { id: req.params.id, status: 'paused' });
});

app.post('/api/missions/:id/resume', (req, res) => {
  const mission = getMissionById(req.params.id);
  if (!mission) return err(res, 'Mission not found', 404);
  updateMissionStatus(req.params.id, 'active');
  startScheduler(mission.id, mission.cadence_minutes, () => runScan(mission.id));
  ok(res, { id: req.params.id, status: 'active' });
});

// Manual scan trigger — critical for demo so you don't wait for the cron.
app.post('/api/missions/:id/scan', async (req, res) => {
  const mission = getMissionById(req.params.id);
  if (!mission) return err(res, 'Mission not found', 404);

  // Respond immediately — scan runs in background and broadcasts via WebSocket
  res.status(202).json({ success: true, data: { message: 'Scan started', mission_id: mission.id }, timestamp: new Date().toISOString() });

  runScan(mission.id).catch(e => console.error('[scan] Error:', e.message));
});

// ── DAGs ──────────────────────────────────────────────────────────────────────

app.get('/api/missions/:id/dags', (req, res) => {
  const mission = getMissionById(req.params.id);
  if (!mission) return err(res, 'Mission not found', 404);
  ok(res, getDAGsByMissionId(req.params.id));
});

app.get('/api/dags/:dagId', (req, res) => {
  const dag = getDAGById(req.params.dagId);
  if (!dag) return err(res, 'DAG not found', 404);
  ok(res, dag);
});

app.get('/api/dags/:dagId/findings', (req, res) => {
  ok(res, getFindingsByDagId(req.params.dagId));
});

// ── Signals & Briefs ──────────────────────────────────────────────────────────

app.get('/api/missions/:id/signals', (req, res) => {
  const mission = getMissionById(req.params.id);
  if (!mission) return err(res, 'Mission not found', 404);
  ok(res, getSignalsByMissionId(req.params.id));
});

app.get('/api/missions/:id/briefs', (req, res) => {
  const mission = getMissionById(req.params.id);
  if (!mission) return err(res, 'Mission not found', 404);
  ok(res, getBriefsByMissionId(req.params.id));
});

// ── Boot ──────────────────────────────────────────────────────────────────────

async function startServer() {
  await initDb();
  server.listen(PORT, () => {
    const host = NODE_ENV === 'production' ? 'Render.com' : `localhost:${PORT}`;
    console.log(`\n🧠 MarketRadar backend → http://${host}`);
    console.log(`   WebSocket          → ws://${host}/ws`);
    console.log(`   Environment        → ${NODE_ENV}`);
    console.log(`   LLM mode           → ${process.env.GROQ_API_KEY ? 'Groq (live)' : 'mock'}\n`);

    // Re-start schedulers for any active missions that survived a server restart.
    const missions = getMissions().filter(m => m.status === 'active');
    for (const m of missions) {
      startScheduler(m.id, m.cadence_minutes, () => runScan(m.id));
      console.log(`   Resumed scheduler for mission "${m.name}" (every ${m.cadence_minutes} min)`);
    }
  });
}

startServer();
