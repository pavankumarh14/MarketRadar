## **MarketMind** 

## _Detect competitor moves in days, not weeks_ 

Theme: Theme 05 — Agent Swarms  ·  Function: AI-Powered Competitive Intelligence 

Suggested stack: Node.js 22 · Groq (Llama 3.1) · SQLite · React 18 + D3.js · node-cron · WebSocket 

## **Problem Statement** 

## **Problem Background** 

A competitor's edge accumulates quietly — a pricing change, a hiring spree, a patent filing, a partnership announcement. By the time these signals reach a strategy team through a quarterly report or a Google Alert, the rival has already moved. Watching a competitive landscape thoroughly is a permanently parallel problem: many sources, each needing continuous monitoring, each change needing interpretation against the others. One analyst checking sources one by one cannot keep an entire landscape under watch — nor connect a Monday hiring spike to a pricing change three weeks later. 

## **Why It Matters** 

Response speed compounds. Detecting a rival's move in days instead of weeks gives more shots at responding before the market shifts. The tools that exist today — Crayon, Klue, Kompyte — cost $50–200K per year, require manual curation, and still deliver a snapshot, not a live feed. The bottleneck is not access to data; it is the parallel attention and synthesis required to watch many sources simultaneously and connect weak signals into a strong one. 

## **Solution Summary** 

## **Why This Problem Was Chosen** 

Competitive intelligence is a self-organising swarm problem: different sources need different handling, a signal in one should trigger deeper digging, and the whole landscape needs continuous (not one-off) watching. The swarm model is structurally correct for the problem. 

## **Proposed Solution** 

A user sets a watch mission — competitors, dimensions (pricing, hiring, news, patents), and scan cadence. Four Scout agents monitor each dimension in parallel, detecting changes against a stored baseline in SQLite. An Analyst agent interprets what each signal means strategically. A Strategist agent synthesises cross-source implications into a living 

intelligence brief. A Signal-Ranker algorithm scores and deduplicates signals across scan cycles. The output is a continuously updated brief with full provenance, streamed to a React dashboard over WebSocket. 

## **Expected Impact** 

- Detect competitor moves in days not weeks via continuous parallel monitoring 

- Connect weak signals across sources into interpreted intelligence, not raw alerts 

- A living brief updated every scan cycle — not a stale quarterly snapshot 

- Full provenance on every claim — every signal traced to its source and cycle 

## **Technical Approach & Implementation** 

## **Solution Workflow** 

- User creates a watch mission with competitors, dimensions, and cadence 

- Scheduler (node-cron) triggers scans on the configured interval — or manually on demand 

- Phase 1: four Scout agents run in parallel — pricing, hiring, news (live HN API), patents 

- Each Scout compares current snapshot to stored baseline in SQLite and detects deltas 

- Signal-Ranker algorithm scores signals by significance × confidence × recency and deduplicates recurring ones 

- Phase 2: Analyst agent interprets what each significant signal means strategically 

- Phase 3: Strategist agent synthesises cross-source narrative and actionable recommendations 

- Brief assembled and streamed to React dashboard via WebSocket 

## **Key Features** 

- Continuous monitoring via node-cron — scans run on schedule, not just on demand 

- Baseline-aware change detection — a change is only a signal relative to stored history 

- Signal-Ranker — scores and deduplicates signals so the brief stays clean across many cycles 

- Cross-source correlation — Strategist connects hiring, pricing, news, and patent signals into one narrative 

- Source-specialist scouts — pricing scout reads differently from a hiring scout; sharper signals 

## **Technology Stack** 

Frontend: React 18 + plain JS, D3.js (signal timeline + DAG visualisation), WebSocket Backend: Node.js 22 + Express, node-cron scheduler, Groq (Llama 3.1) reasoning, WebSocket (ws) 

AI/ML: Llama 3.1-8b-instant via Groq free tier, mock fallback for offline dev Data: SQLite with WAL mode (missions, baselines, dags, findings, briefs) — zero infrastructure 

## **Models & Algorithms** 

Signal-Ranker: deterministic scoring — SIGNIFICANCE_WEIGHT[verdict] × confidence × recency_decay, with 0.6× multiplier for recurring signals. Baseline diff engine: per-competitor snapshot comparison with percentage delta calculation. Custom DAG runner: 6-node dependency graph (4 scouts → analyst → strategist). LLM JSON mode for all agent calls — forces structured output and reduces parse failures. 

## **Innovation** 

- Signal-triggered self-organisation — significant signals resurface through ranking, not manual filtering 

- Source-specialist scouting — each dimension analysed with domain-appropriate prompts 

- Cross-source weak-signal correlation — Strategist joins signals the Analyst sees in isolation 

- Living brief replacing the quarterly snapshot — updates on every scan cycle with full provenance 

## **Future Scope** 

## **Near-term** 

- Mission templates for common competitive scenarios 

- Real web scraping with Playwright replacing mock fixtures 

- Cadence and cost estimator per mission 

## **Medium-term** 

- Source-discovery sub-agents that find new monitoring targets automatically 

- Cross-mission learning from signal patterns 

- Managed infrastructure for multi-tenant scale 

## **Long-term** 

- Federated competitive intelligence sharing across partner organisations 

- Predictive competitor-move forecasting from signal trends 

- Always-on war-room mode with real-time analyst collaboration 

## **Scalability & Larger Vision** 

## **How It Scales** 

The pipeline is event-driven: a cron tick triggers a scan, and scouts run in parallel as async Node.js tasks. Adding more competitors or dimensions scales linearly. SQLite with WAL mode handles concurrent scout writes safely. 

## **How It Expands** 

Near term: Playwright scrapers for real pricing and hiring pages. Medium term: sub-agents that discover new sources and mission templates. Long term: predictive forecasting from historical signal trends and federated sharing across organisations. 

## **The Larger Vision** 

Competitive intelligence stops being a quarterly exercise and becomes a continuous system that surfaces the right signal at the right time. Strategy teams stop being surprised by competitor moves and start anticipating them — with full provenance on every claim and a ranked action list ready to act on. 

## **Potential Impact** 

For a product team, MarketMind compresses a week of competitive research into an automated brief updated on every scan. At org scale, every team watching every competitor simultaneously — with cross-source synthesis that no individual analyst could maintain — turns competitive intelligence from a luxury into standard operating procedure. 

