import React, { useState } from 'react';

// ═════════════════════════════════════════════════════════════════════════════
// CANDIDATE TASK — Intelligence Brief Panel
// ═════════════════════════════════════════════════════════════════════════════
//
// Render the latest intelligence brief produced by the Strategist + Assembler.
// This is the final output of the scan pipeline — the "living brief" that a
// strategy team reads to understand the competitive landscape.
//
//
// PROPS
// ─────
// brief: {
//   id:                      string,
//   mission_id:              string,
//   scan_cycle:              number,
//   executive_summary:       string,
//   cross_source_insights:   string[],
//   strategic_recommendations: [{
//     action:    string,
//     rationale: string,
//     priority:  'high' | 'medium' | 'low',
//   }],
//   confidence:  number,
//   created_at:  string,
// } | null
//
// allBriefs: Brief[]    (history — show a cycle selector so the user can view past briefs)
// onSelectBrief: (brief) => void
//
//
// REQUIRED SECTIONS (render in this order):
// ──────────────────────────────────────────
// 1. HEADER
//    - Mission name / scan cycle number
//    - Overall confidence bar (same style as SignalList confidence bar)
//    - "Generated at" timestamp
//    - If strategist stub is still in place (confidence === 0), show a prominent
//      warning: "Analyst & Strategist not yet implemented — brief is partial"
//
// 2. EXECUTIVE SUMMARY
//    - brief.executive_summary as a styled paragraph
//
// 3. COMPETITIVE SHIFTS / CROSS-SOURCE INSIGHTS
//    - brief.cross_source_insights as a bulleted list
//    - Each item should be a distinct card or styled list item
//
// 4. STRATEGIC RECOMMENDATIONS
//    - brief.strategic_recommendations[] as cards
//    - Each card: action (bold), rationale (muted), priority badge
//    - Priority colours: high=#dc2626, medium=#ca8a04, low=#16a34a
//    - Sort high → medium → low
//
// 5. BRIEF HISTORY (optional but encouraged)
//    - Cycle selector: show allBriefs as a horizontal tab row
//    - Clicking a cycle switches the displayed brief
//
//
// UX NOTES
// ─────────
// • This panel is the "money shot" of the demo — make it clean and readable.
// • Use the dark theme colours from App.css: --bg-card, --text-primary, --text-muted.
// • Keep the layout scannable — a strategy exec reads this in 90 seconds.
//
//
// STUB WARNING BEHAVIOUR
// ───────────────────────
// When brief.confidence === 0 (both stubs unimplemented):
//   Show a yellow banner: "⚠️ Analyst and Strategist not yet implemented.
//   This brief is assembled from Scout signals only. Implement the agents
//   in backend/src/agents/ to see the full synthesis."
//
// When brief.confidence > 0 but < 0.4 (analyst done, strategist stub):
//   Show: "⚠️ Strategist not yet implemented. Recommendations are partial."
//
// ═════════════════════════════════════════════════════════════════════════════

const PRIORITY_COLOR = { high: '#dc2626', medium: '#ca8a04', low: '#16a34a' };

export function BriefPanel({ brief, allBriefs = [], onSelectBrief }) {
  const [selectedCycle, setSelectedCycle] = useState(null);

  const activeBrief = selectedCycle 
    ? allBriefs.find(b => b.scan_cycle === selectedCycle) 
    : brief;

  if (!activeBrief) {
    return (
      <div className="brief-panel empty">
        <p>No brief available yet</p>
        <p className="hint">Run a scan to generate the first intelligence brief.</p>
      </div>
    );
  }

  const recs = [...(activeBrief.strategic_recommendations ?? [])].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
  });

  // Stub warning logic
  const showStubWarning = activeBrief.confidence === 0;
  const showPartialWarning = activeBrief.confidence > 0 && activeBrief.confidence < 0.4;

  return (
    <div className="brief-panel">
      {/* ── Stub Warning Banner ──────────────────────────────────────────────── */}
      {showStubWarning && (
        <div className="stub-warning">
          ⚠️ Analyst and Strategist not yet implemented. This brief is assembled from Scout signals only.
        </div>
      )}
      {showPartialWarning && (
        <div className="stub-warning partial">
          ⚠️ Strategist not yet implemented. Recommendations are partial.
        </div>
      )}

      {/* ── Brief History Selector ───────────────────────────────────────────── */}
      {allBriefs.length > 1 && (
        <div className="brief-history">
          <span className="history-label">Cycle:</span>
          {allBriefs.map(b => (
            <button
              key={b.id}
              className={`cycle-tab ${activeBrief.id === b.id ? 'active' : ''}`}
              onClick={() => {
                setSelectedCycle(b.scan_cycle);
                onSelectBrief?.(b);
              }}
            >
              #{b.scan_cycle}
            </button>
          ))}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="brief-header">
        <h2>Intelligence Brief — Cycle #{activeBrief.scan_cycle}</h2>
        <div className="header-meta">
          <span className="conf-pct">{Math.round(activeBrief.confidence * 100)}% confidence</span>
          <span className="timestamp">
            {new Date(activeBrief.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Executive Summary ─────────────────────────────────────────────────── */}
      <section className="brief-section">
        <h3>Executive Summary</h3>
        <p className="executive-summary">{activeBrief.executive_summary || 'No summary available'}</p>
      </section>

      {/* ── Cross-Source Insights ─────────────────────────────────────────────── */}
      <section className="brief-section">
        <h3>Cross-Source Insights ({activeBrief.cross_source_insights?.length ?? 0})</h3>
        {activeBrief.cross_source_insights?.length > 0 ? (
          <div className="insights-list">
            {activeBrief.cross_source_insights.map((insight, i) => (
              <div key={i} className="insight-card">
                <span className="insight-bullet">•</span>
                <span>{insight}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-hint">No insights available</p>
        )}
      </section>

      {/* ── Strategic Recommendations ─────────────────────────────────────────── */}
      <section className="brief-section">
        <h3>Strategic Recommendations ({recs.length})</h3>
        {recs.length > 0 ? (
          <div className="recommendations-list">
            {recs.map((r, i) => (
              <div key={i} className="rec-card">
                <div className="rec-header">
                  <span 
                    className="priority-badge" 
                    style={{ 
                      backgroundColor: PRIORITY_COLOR[r.priority] ?? '#6b7280',
                      color: 'white'
                    }}
                  >
                    {r.priority?.toUpperCase()}
                  </span>
                  <strong className="rec-action">{r.action}</strong>
                </div>
                <p className="rec-rationale">{r.rationale}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-hint">No recommendations available</p>
        )}
      </section>
    </div>
  );
}
