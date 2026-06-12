# MarketRadar — Continuous Multi-Agent Competitive Intelligence Swarm

> Theme 05 — Agent Swarms

---

## Problem Statement

### The Blind-Spot Problem: Why Companies Learn About Competitor Moves Weeks After They Happen

**Problem Background**

A competitor's edge accumulates quietly — a pricing change, a hiring spree, a patent filing, a partnership announcement. By the time these signals reach a strategy team through a quarterly report or a Google Alert, the rival has already moved. Watching a competitive landscape thoroughly is a permanently parallel problem: many sources, each needing continuous monitoring, each change needing interpretation against all the others.

One analyst checking sources one by one cannot keep an entire landscape under watch — nor connect a Monday hiring spike to a pricing change three weeks later. The bottleneck is not access to data; it is the parallel attention and synthesis required to watch many sources simultaneously and connect weak signals into a strong one.

**Why It Matters**

Response speed compounds. Detecting a rival's move in days instead of weeks gives more shots at responding before the market shifts. The tools that exist today — Crayon, Klue, Kompyte — cost $50–200K per year, require manual curation, and still deliver a snapshot, not a live feed. For teams that can't afford them, the alternative is a spreadsheet refreshed once a quarter.

**Expected Impact**

- Detect competitor moves in **days, not weeks** via continuous parallel monitoring across pricing, hiring, news, and patents
- Connect weak signals across sources into interpreted intelligence — not raw alerts
- A **living brief** that updates on every scan cycle, not a stale quarterly snapshot
- Full provenance on every claim — every signal traced to its source and scan cycle

---

## What MarketRadar Does

A user defines a **watch mission**: a set of competitors, the dimensions to monitor (pricing, hiring, news, patents), and a scan cadence. MarketRadar then runs a swarm of specialist agents on that schedule — Scout agents capture each source and detect changes against a stored baseline, an Analyst interprets what those changes mean, and a Strategist synthesises them into a cross-source intelligence brief.

The output is a **living brief**: not a stale quarterly snapshot, but a continuously updated view of what competitors are doing and what to do about it.

---

## What Is Built vs What Candidates Implement

### Built (infrastructure + Scout reference agent)

| Component | Details |
|-----------|---------|
| Orchestrator + DAG runner | 6-node scan pipeline, phase-based fan-out |
| Scheduler | `node-cron` per-mission scheduling, pause/resume |
| **Scout agent — all 4 variants** | Pricing, hiring, news (live HN API), patents |
| Baseline diff engine | Per-competitor change detection stored in SQLite |
| SQLite storage layer | WAL mode, 5 tables, full query layer |
| Express REST API | All endpoints, envelope pattern, error handling |
| WebSocket server | Live events: `dag_update`, `finding`, `brief_ready` |
| Brief assembler | LLM synthesis fallback when stubs are in place |
| React shell | App layout, mission selector, tab navigation |
| **MissionBuilder component** | Full mission creation form |
| **SignalList component** | Live scout signal feed with confidence bars |
| Groq LLM client | Native `fetch`, retry logic, realistic mock fallback |

### ⬜ Candidate tasks

| File | What to build | Dimension tested |
|------|--------------|-----------------|
| `backend/src/agents/analyst/index.js` | LLM interpretation of scout signals — **what each change means** | AI Integration |
| `backend/src/agents/strategist/index.js` | Cross-source synthesis — **so what do we DO about this?** | AI Integration |
| `backend/src/orchestrator/signal-ranker.js` | Ranking + dedup algorithm — score signals, suppress recurring ones | System Architecture + Scalability |
| `frontend/src/components/DAGView.jsx` | D3 animated pipeline graph — 6 nodes, live status colours, edge arrows | System Arch visualisation + UX |
| `frontend/src/components/SignalTimeline.jsx` | D3 time-series — confidence across scan cycles per dimension | UX |
| `frontend/src/components/BriefPanel.jsx` | Full brief layout — exec summary, insights, recommendations, cycle history | UX + Prototype Readiness |

Read the `// CANDIDATE TASK` block at the top of each stub file before starting — every contract, required field, and implementation pattern is documented there.

---

## Prerequisites

- **Node.js 22** — use nvm
- A free [Groq API key](https://console.groq.com) — optional, mock mode works without it

```bash
nvm install 22
nvm use 22
node --version   # v22.x.x
```

---

## Quick Start

### 1. Install dependencies

```bash
# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure environment

```bash
# Create backend/.env — paste your GROQ_API_KEY
# Leave blank for mock mode (pipeline still runs fully)
```

### 3. Run — two terminals

**Terminal 1 — Backend (start first):**
```bash
cd backend
npm run dev
# → 🧠 MarketRadar backend → http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# → VITE ready → http://localhost:5173
```

### 4. Create your first mission

1. Open **http://localhost:5173**
2. Click **+ New Mission**
3. Add competitors (default: OpenAI, Cohere, Mistral)
4. Select dimensions and cadence
5. Click **Start Mission**
6. Click **▶ Run Scan** for an immediate scan (don't wait for the cron)
7. Watch signals appear in the left sidebar in real-time
8. Click the **📋 Brief** tab to see the assembled report

### 5. Reset between runs

```bash
# Wipe the database and start fresh
rm backend/data/marketmind.db
# The DB is recreated automatically on next backend start
```

---

## Deploying to Render.com

MarketRadar can be deployed to Render.com for production hosting. The project includes a `render.yaml` configuration file for automatic deployment.

### Prerequisites

- A Render.com account (free tier available)
- GitHub repository with your MarketRadar code
- (Optional) Groq API key for live LLM calls

### Deployment Steps

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Ready for Render deployment"
   git push origin main
   ```

2. **Create a new Render.com web service**
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` configuration

3. **Configure environment variables**
   - In your Render service settings, add:
     - `GROQ_API_KEY`: Your Groq API key (optional - mock mode works without it)
     - `FRONTEND_ORIGIN`: Your frontend URL (e.g., `https://marketradar-frontend.onrender.com`)
     - `NODE_ENV`: `production`

4. **Deploy**
   - Render will automatically build and deploy both backend and frontend services
   - The backend uses a persistent disk (1GB) for SQLite database storage
   - Frontend is built as a static site and served via Vite preview server

### Important Notes

- **Database Persistence**: The SQLite database is stored on a Render persistent disk (1GB) to survive redeployments
- **WebSocket Support**: WebSockets are fully supported on Render.com
- **Free Tier Limitations**: Render free tier has spin-down times; consider upgrading for production use
- **Environment Variables**: Make sure to set `FRONTEND_ORIGIN` to match your deployed frontend URL for CORS

### Manual Deployment (Alternative)

If you prefer manual deployment without `render.yaml`:

1. **Backend Service**
   - Runtime: Node
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Add persistent disk mounted at `/opt/render/project/backend/data`

2. **Frontend Service**
   - Runtime: Node
   - Build Command: `cd frontend && npm install && npm run build`
   - Start Command: `cd frontend && npm run preview`
   - Set `VITE_API_URL` environment variable to backend URL

---

## Environment Variables

Set in `backend/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | No | — | Groq API key. Without it, realistic mocks are used — the full pipeline still runs. |
| `PORT` | No | `3001` | Backend port |
| `FRONTEND_ORIGIN` | No | `http://localhost:5173` | CORS allowed origin |
| `NODE_ENV` | No | `development` | |

---

## API Reference

All responses: `{ success: boolean, data?: T, error?: string, timestamp: string }`

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Health check |
| `GET`  | `/api/missions` | All missions |
| `POST` | `/api/missions` | Create mission. Body: `{ name, competitors[], dimensions[], cadence_minutes }` |
| `GET`  | `/api/missions/:id` | Single mission |
| `POST` | `/api/missions/:id/scan` | **Trigger immediate scan** (202 — runs async, broadcasts via WS) |
| `POST` | `/api/missions/:id/pause` | Pause scheduler |
| `POST` | `/api/missions/:id/resume` | Resume scheduler |
| `GET`  | `/api/missions/:id/signals` | Scout findings for mission |
| `GET`  | `/api/missions/:id/briefs` | Intelligence briefs for mission |
| `GET`  | `/api/missions/:id/dags` | DAG history for mission |
| `GET`  | `/api/dags/:dagId` | Single DAG with nodes |
| `GET`  | `/api/dags/:dagId/findings` | All findings for a DAG |

---

## WebSocket Events

Connect to `ws://localhost:3001/ws`

| Type | Payload | When |
|------|---------|------|
| `connected` | `{ message }` | On connect |
| `dag_update` | DAG object | Every node status change |
| `finding` | Finding object | When any agent completes |
| `brief_ready` | Brief object | When the assembler finishes |

---

## Candidate Implementation Guide

### Before you start

1. **Read `docs/sample-output.txt` first** — shows the exact JSON output every agent should produce for an OpenAI/Cohere/Mistral scan, including the Signal-Ranker scores, Analyst interpretations, and Strategist narrative. Use it as your target before writing a single line.
2. Run the project end-to-end — `npm run dev` both terminals, create a mission, click Run Scan
3. Watch the SQLite DB: `sqlite3 backend/data/marketmind.db "SELECT capability, verdict, confidence FROM findings ORDER BY created_at DESC LIMIT 20"`
4. Read `backend/src/agents/scout/index.js` completely — it is the reference implementation

### Implementing the Analyst (`backend/src/agents/analyst/index.js`)

The analyst receives `task.context.scoutFindings[]` — the 4 scout findings from the current scan. Use the LLM to interpret what each significant signal means strategically. Pattern is identical to the scout: build a system prompt, call `reasonWithLLM(systemPrompt, userPrompt, true)`, parse JSON, fall back gracefully, call `saveFinding(finding)`, return the finding.

Expected output shape is fully documented in the `// CANDIDATE TASK` block at the top of the file.

### Implementing the Strategist (`backend/src/agents/strategist/index.js`)

The strategist receives `task.context.analystFinding` — a single finding from the analyst. Connect the dots across sources into a cross-source competitive narrative with concrete recommendations. The assembler reads `finding.details.narrative`, `finding.details.competitive_shifts[]`, and `finding.details.recommendations[]` — these must be present.

### Implementing DAGView (`frontend/src/components/DAGView.jsx`)

Fixed-position SVG layout (no force simulation needed). Six nodes across three rows. Colour by status, arrowhead edges, pulse animation on running nodes. Re-renders on every `dag_update` WebSocket event via the `dag` prop. Full spec in the `// CANDIDATE TASK` block.

### Implementing SignalTimeline (`frontend/src/components/SignalTimeline.jsx`)

D3 grouped bar chart (recommended) or scatter plot. X-axis: scan cycle, Y-axis: confidence, grouped by dimension. Same `signals` array as SignalList.jsx.

### Implementing BriefPanel (`frontend/src/components/BriefPanel.jsx`)

Five sections: header, executive summary, cross-source insights, strategic recommendations, cycle history. Show stub warnings when confidence is 0 (agents not yet implemented). Full spec in the `// CANDIDATE TASK` block.

### Testing without a Groq key

Mock responses in `backend/src/shared/llm.js` are keyed on system-prompt keywords — each agent gets a realistic stub response. You can develop and demo the full pipeline offline.

### Debugging

```bash
# Watch all findings as they arrive
sqlite3 backend/data/marketmind.db "SELECT capability, verdict, confidence, summary FROM findings ORDER BY created_at DESC LIMIT 10"

# Check DAG node statuses
sqlite3 backend/data/marketmind.db "SELECT id, status FROM dags ORDER BY created_at DESC LIMIT 1" | xargs -I{} sqlite3 backend/data/marketmind.db "SELECT json_extract(nodes, '$[*].id'), json_extract(nodes, '$[*].status') FROM dags WHERE id='{}'"

# See latest brief
sqlite3 backend/data/marketmind.db "SELECT executive_summary, confidence FROM briefs ORDER BY created_at DESC LIMIT 1"
```
