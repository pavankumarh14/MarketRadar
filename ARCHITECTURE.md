# MarketRadar — Architecture Document


## 1. System Overview

```
User creates Watch Mission (competitors + dimensions + cadence)
                │
                ▼
      POST /api/missions
                │
                ▼
  ┌─────────────────────────────────────────────────────────┐
  │                     Orchestrator                        │
  │  1. Builds a 6-node scan DAG                            │
  │  2. Schedules recurring scans via node-cron             │
  │  3. On each tick: fans out Phase 1, then 2, then 3      │
  │  4. Broadcasts live events via WebSocket                │
  └──────┬──────────────────────────────────────────────────┘
         │ Phase 1 — parallel (no dependencies)
  ┌──────┴────────────────────────────────────┐
  ▼          ▼              ▼            ▼
[Scout:  [Scout:       [Scout:      [Scout:
Pricing] Hiring]       News]        Patents]
  │          │              │            │
  └──────────┴──────────────┴────────────┘
                    │ all 4 complete
                    ▼
             [Analyst]              ← Phase 2  ⬜ CANDIDATE
                    │
                    ▼
             [Strategist]           ← Phase 3  ⬜ CANDIDATE
                    │
                    ▼
         Brief Assembler (LLM)      ← assembled from all findings
                    │
                    ▼
         React Intelligence Dashboard
```

---

## 2. What Is Built vs What Candidates Complete

### Built

| Component | Status | Location |
|-----------|--------|----------|
| Orchestrator + DAG runner | ✅ | `backend/src/orchestrator/` |
| node-cron scheduler | ✅ | `backend/src/orchestrator/scheduler.js` |
| Scout agent (all 4 variants) | ✅ **Reference** | `backend/src/agents/scout/` |
| Brief assembler | ✅ | `backend/src/orchestrator/assembler.js` |
| Express REST API + WebSocket | ✅ | `backend/src/server.js` |
| SQLite storage layer | ✅ | `backend/src/db/index.js` |
| Groq LLM client + mock | ✅ | `backend/src/shared/llm.js` |
| Mock competitor fixtures | ✅ | `backend/src/data/mock-competitors.js` |
| React app shell + CSS | ✅ | `frontend/src/App.jsx`, `App.css` |
| WebSocket hook | ✅ | `frontend/src/hooks/useWebSocket.js` |
| API service layer | ✅ | `frontend/src/services/api.js` |
| MissionBuilder component | ✅ | `frontend/src/components/MissionBuilder.jsx` |
| SignalList component | ✅ | `frontend/src/components/SignalList.jsx` |

### Candidates complete

| Component | Status | Location |
|-----------|--------|----------|
| Analyst agent | ⬜ Stub | `backend/src/agents/analyst/index.js` |
| Strategist agent | ⬜ Stub | `backend/src/agents/strategist/index.js` |
| DAGView (D3) | ⬜ Stub | `frontend/src/components/DAGView.jsx` |
| SignalTimeline (D3) | ⬜ Stub | `frontend/src/components/SignalTimeline.jsx` |
| BriefPanel | ⬜ Stub | `frontend/src/components/BriefPanel.jsx` |

---

## 3. Directory Layout

```
MarketRadar/
├── backend/
│   ├── src/
│   │   ├── server.js                 ← Express + WebSocket entry point
│   │   ├── db/
│   │   │   └── index.js              ← SQLite: schema, all read/write fns
│   │   ├── shared/
│   │   │   └── llm.js                ← Groq client + mock fallback
│   │   ├── data/
│   │   │   └── mock-competitors.js   ← Pricing, hiring, patents fixtures (3 cycles)
│   │   ├── orchestrator/
│   │   │   ├── index.js              ← runScan() — main pipeline entry point
│   │   │   ├── dag-runner.js         ← State machine: pending→running→completed|failed
│   │   │   ├── dag-builder.js        ← Builds a fresh 6-node DAG per scan cycle
│   │   │   ├── scheduler.js          ← node-cron per-mission scheduling
│   │   │   └── assembler.js          ← Assembles brief from all findings
│   │   └── agents/
│   │       ├── scout/
│   │       │   ├── index.js          ← ✅ REFERENCE — read this first
│   │       │   ├── pricing.js        ← Mock snapshot + diff logic
│   │       │   ├── hiring.js         ← Mock snapshot + diff logic
│   │       │   ├── news.js           ← Live HN API + mock fallback
│   │       │   └── patents.js        ← Mock snapshot + diff logic
│   │       ├── analyst/
│   │       │   └── index.js          ← ⬜ CANDIDATE TASK
│   │       └── strategist/
│   │           └── index.js          ← ⬜ CANDIDATE TASK
│   ├── data/
│   │   └── marketmind.db             ← SQLite DB (auto-created at first run)
│   ├── .env                          ← GROQ_API_KEY (gitignored)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx                   ← ✅ App shell — all state lives here
│   │   ├── App.css                   ← Dark intelligence-console theme
│   │   ├── hooks/
│   │   │   └── useWebSocket.js       ← ✅ Auto-reconnect WS hook
│   │   ├── services/
│   │   │   └── api.js                ← ✅ Typed REST client
│   │   └── components/
│   │       ├── MissionBuilder.jsx    ← ✅ Mission creation form
│   │       ├── SignalList.jsx        ← ✅ Live scout signal feed
│   │       ├── DAGView.jsx           ← ⬜ D3 pipeline graph
│   │       ├── SignalTimeline.jsx    ← ⬜ D3 confidence chart
│   │       └── BriefPanel.jsx        ← ⬜ Intelligence brief layout
│   ├── vite.config.js
│   └── package.json
├── ARCHITECTURE.md
├── README.md
├── .nvmrc                            ← Node 22
└── .gitignore
```

---

## 4. Data Model (SQLite)

**Why SQLite over JSON files:**  
MarketRadar is a continuous pipeline — the scheduler runs every N minutes and each run must compare the current snapshot against the previous one. This requires persistent baselines across process restarts, concurrent-safe writes during the parallel scout phase (WAL mode), and queryable history for the D3 charts. JSON files cannot safely handle concurrent writes and have no query layer.

### Schema

```sql
missions (
  id              TEXT PK,
  name            TEXT,
  competitors     TEXT,  -- JSON string[]
  dimensions      TEXT,  -- JSON string[]
  cadence_minutes INTEGER,
  status          TEXT,  -- active | paused
  scan_cycle      INTEGER DEFAULT 0,
  created_at      TEXT
)

-- One row per competitor × dimension per mission.
-- The scout reads this, computes the delta, then upserts with the new snapshot.
-- UNIQUE constraint enables SQLite's ON CONFLICT(mission_id, competitor, dimension) DO UPDATE.
baselines (
  id          TEXT PK,
  mission_id  TEXT FK → missions,
  competitor  TEXT,
  dimension   TEXT,
  content     TEXT,  -- JSON: raw captured snapshot
  scan_cycle  INTEGER,
  created_at  TEXT,
  UNIQUE (mission_id, competitor, dimension)
)

-- One row per scan cycle.
-- Nodes serialised as a JSON array so the frontend gets full DAG state.
dags (
  id          TEXT PK,
  mission_id  TEXT FK → missions,
  scan_cycle  INTEGER,
  nodes       TEXT,  -- JSON DAGNode[]
  status      TEXT,  -- running | completed | failed
  created_at  TEXT,
  updated_at  TEXT
)

-- One row per agent per scan cycle.
-- Scouts write 4 (one per dimension); analyst and strategist write 1 each.
findings (
  id          TEXT PK,
  dag_id      TEXT FK → dags,
  mission_id  TEXT,
  node_id     TEXT,
  capability  TEXT,  -- scout-pricing | scout-hiring | scout-news | scout-patents | analyst | strategist
  summary     TEXT,
  details     TEXT,  -- JSON: agent-specific payload
  confidence  REAL,
  verdict     TEXT,  -- significant | minor | noise | neutral
  provenance  TEXT,  -- JSON: { agentId, model, durationMs }
  created_at  TEXT
)

-- One row per scan cycle. The "living brief" — written by assembler.js.
briefs (
  id                        TEXT PK,
  mission_id                TEXT FK → missions,
  scan_cycle                INTEGER,
  executive_summary         TEXT,
  cross_source_insights     TEXT,  -- JSON string[]
  strategic_recommendations TEXT,  -- JSON { action, rationale, priority }[]
  confidence                REAL,
  created_at                TEXT
)
```

---

## 5. DAG Structure Per Scan Cycle

```
Nodes:
  scout-pricing   phase=1  deps=[]
  scout-hiring    phase=1  deps=[]
  scout-news      phase=1  deps=[]
  scout-patents   phase=1  deps=[]
  analyst         phase=2  deps=[scout-pricing, scout-hiring, scout-news, scout-patents]
  strategist      phase=3  deps=[analyst]

Node lifecycle:  pending → running → completed | failed
```

**Phase execution (orchestrator/index.js):**
1. `runner.getReadyNodes()` returns all 4 scouts (no deps) → `Promise.all(scouts)` — true parallelism
2. After scouts complete: `runner.getReadyNodes()` returns `[analyst]` → `await runAnalyst()`
3. After analyst: `runner.getReadyNodes()` returns `[strategist]` → `await runStrategist()`
4. Assembler reads all 6 findings from SQLite → assembles brief → `brief_ready` broadcast

---

## 6. Agent Contract

Every agent receives a **TaskPayload** and must return a **Finding**.

### TaskPayload
```javascript
{
  taskId:      string,
  dagId:       string,
  missionId:   string,
  nodeId:      string,          // 'scout-pricing' | 'analyst' | 'strategist' | etc.
  competitors: string[],
  dimensions:  string[],
  scanCycle:   number,
  context: {
    scoutFindings:  Finding[],  // populated for analyst
    analystFinding: Finding,    // populated for strategist
  }
}
```

### Finding (what every agent must return and persist)
```javascript
{
  id:          'finding-<uuid>',
  dag_id:      string,
  mission_id:  string,
  node_id:     string,
  capability:  string,
  summary:     string,           // one sentence
  details:     object,           // agent-specific — see each agent's contract
  confidence:  number,           // 0.0–1.0
  verdict:     'significant' | 'minor' | 'noise' | 'neutral',
  provenance:  { agentId, model, durationMs },
  created_at:  ISO string
}
```

**Every agent must call `saveFinding(finding)` before returning.** The orchestrator does not persist findings — each agent owns its output.

---

## 7. Scout Agent Deep-Dive (Reference Implementation)

The Scout is the only fully-built specialist agent. Candidates should read `agents/scout/index.js` before implementing anything.

**Per-competitor loop:**
1. `capture(competitor, scanCycle)` → current snapshot (mock or live)
2. `getBaseline(missionId, competitor, dimension)` → previous snapshot from SQLite
3. `diff(current, baseline)` → structured change list
4. If `delta.changes.length > 0`: call `reasonWithLLM(systemPrompt, userPrompt, true)` to interpret
5. `upsertBaseline(...)` → save current as the new baseline for next cycle
6. Accumulate signals into one Finding for the dimension

**Why one Finding per dimension (not per competitor):** The orchestrator's DAG has one node per dimension, not one per `(competitor, dimension)`. This keeps the DAG to 6 nodes regardless of how many competitors a mission has. The Finding's `details.signals[]` lists per-competitor changes.

---

## 8. News Scout — Real External Data

The news scout (`agents/scout/news.js`) is the only agent that fetches live data. It calls the **Hacker News Algolia API** (free, no auth, JSON):

```
GET https://hn.algolia.com/api/v1/search?query=OpenAI&tags=story&numericFilters=created_at_i>1748736000&hitsPerPage=15
```

A 6-second timeout + graceful mock fallback means the pipeline never hangs if the network is down. In production, you'd supplement with NewsAPI, Google News RSS, or a scraper targeting the competitor's own press/blog page.

---

## 9. Frontend Architecture

### Component Tree
```
App.jsx                         (all state lives here — no external state library)
├── Header                      (status dot, scan button, new mission button)
├── Sidebar
│   ├── Mission selector        (list of missions, click to activate)
│   └── SignalList.jsx          ✅ — live scout signal feed
└── Main Panel
    ├── MissionBuilder.jsx      ✅ — mission creation form
    ├── DAGView.jsx             ⬜ — D3 animated pipeline graph
    ├── SignalTimeline.jsx      ⬜ — D3 confidence time-series
    └── BriefPanel.jsx          ⬜ — intelligence brief layout
```

### State (App.jsx — no Redux, no Context needed)

| State | Updated by |
|-------|-----------|
| `missions[]` | REST on mount |
| `activeMission` | Sidebar click |
| `signals[]` | REST on mount + WS `finding` events |
| `briefs[]` | REST on mount + WS `brief_ready` events |
| `activeBrief` | WS `brief_ready` (auto-select latest) + history click |
| `activeDAG` | WS `dag_update` |
| `eventCount` | Every WS message |

### WebSocket hook (`hooks/useWebSocket.js`)
- Connects to `/ws` (proxied by Vite to `ws://localhost:3001/ws`)
- Reconnects with exponential backoff: 1s → 2s → 4s → max 30s
- Returns `{ messages, lastMessage, isConnected }`
- `lastMessage` triggers the `useEffect` in App.jsx that updates state

---

## 10. LLM Client (`shared/llm.js`)

Single function: `reasonWithLLM(systemPrompt, userPrompt, jsonMode?)`
- Model: `llama-3.1-8b-instant` (Groq free tier, ~200ms per call)
- `jsonMode = true` → `response_format: { type: 'json_object' }` — forces valid JSON output
- 3 retries on 429 rate-limit errors (2s, 4s, 6s backoff)
- **No API key → mock mode**: returns realistic responses keyed on system prompt keywords (`pricing`, `hiring`, `news`, `patent`, `analyst`, `strategist`). The full pipeline runs and produces real-looking output with no API key.

---

## 11. Mock Competitor Fixtures

`backend/src/data/mock-competitors.js` contains 3 scan cycles for 3 competitors (OpenAI, Cohere, Mistral) across pricing, hiring, and patents. The news scout uses live HN API data instead.

**Scenario:** An aggressive pricing war — OpenAI and Cohere slash API costs while scaling headcount; Mistral holds pricing but builds IP. By cycle 2 the market is bifurcating between commodity inference and specialised models. This gives the Analyst and Strategist rich, believable material to synthesise.

---

## 12. Key Design Decisions

| Decision | Reason |
|----------|--------|
| SQLite over JSON files | Continuous pipeline needs baseline persistence, concurrent-safe writes (WAL mode), and queryable history — JSON files have none of these |
| SQLite over MongoDB | Zero infrastructure — runs with just `npm install`. No connection string, no cloud account, no schema migration tooling |
| In-process `Promise.all` for scouts | No Redis queue needed for a demo. True async parallelism within a single Node.js process. Replace with Redis BRPOP for production scale |
| Custom DAG runner (not LangGraph) | Node.js-native, explicit state transitions, no Python dependency, no framework lock-in |
| LLM JSON mode for all agents | Structured output at the API level — model retries on parse failure. More reliable than post-processing free text |
| Groq over OpenAI | Free tier is fast (~200ms) and requires no billing setup — critical for a hackathon with many concurrent participants |
| `node --watch` (no nodemon) | Node 22 ships this natively. Zero extra dependency |
| Mock fallback in LLM client | Candidates can develop and demo the full pipeline on a plane with no internet. Also makes CI easy |
| Live HN news scout | Shows real external data flowing through the pipeline. No API key, no scraping, 6s timeout with graceful fallback |
