import React, { useState } from 'react';

const DIMENSION_META = {
  'scout-pricing':  { icon: '💰', label: 'Pricing',  color: '#6366f1' },
  'scout-hiring':   { icon: '👥', label: 'Hiring',   color: '#0ea5e9' },
  'scout-news':     { icon: '📰', label: 'News',     color: '#f59e0b' },
  'scout-patents':  { icon: '🔬', label: 'Patents',  color: '#8b5cf6' },
};

const VERDICT_COLOR = {
  significant: '#16a34a',
  minor:       '#ca8a04',
  noise:       '#6b7280',
  neutral:     '#374151',
};

export function SignalList({ signals, activeMission }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!activeMission) {
    return (
      <div className="signal-list empty">
        <p>No mission selected</p>
        <p className="hint">Create a mission or select one to see live signals.</p>
      </div>
    );
  }

  const filtered = signals.filter(s => s.mission_id === activeMission.id);

  if (filtered.length === 0) {
    return (
      <div className="signal-list empty">
        <p>Waiting for first scan…</p>
        <p className="hint">Click "Run Scan" to trigger an immediate scan, or wait for the scheduled cadence.</p>
      </div>
    );
  }

  return (
    <div className="signal-list">
      {filtered.map(signal => {
        const meta = DIMENSION_META[signal.capability] ?? { icon: '📡', label: signal.capability, color: '#6b7280' };
        const confidence = Math.round(signal.confidence * 100);
        const verdictColor = VERDICT_COLOR[signal.verdict] ?? '#6b7280';
        const isExpanded = expandedId === signal.id;

        return (
          <div 
            key={signal.id} 
            className={`signal-card ${isExpanded ? 'expanded' : ''}`}
            style={{ borderLeftColor: meta.color, cursor: 'pointer' }}
            onClick={() => setExpandedId(isExpanded ? null : signal.id)}
          >
            <div className="signal-header">
              <span className="dim-badge" style={{ backgroundColor: meta.color + '22', color: meta.color }}>
                {meta.icon} {meta.label}
              </span>
              <span className="verdict-badge" style={{ color: verdictColor }}>
                ● {signal.verdict.charAt(0).toUpperCase() + signal.verdict.slice(1)}
              </span>
              <span className="signal-time">{formatRelative(signal.created_at)}</span>
              <span className="expand-icon" style={{ marginLeft: 'auto', fontSize: '14px' }}>
                {isExpanded ? '▼' : '▶'}
              </span>
            </div>

            <p className="signal-summary">{signal.summary}</p>

            <div className="confidence-row">
              <span className="conf-label">Confidence</span>
              <div className="conf-bar">
                <div className="conf-fill" style={{ width: `${confidence}%`, backgroundColor: meta.color }} />
              </div>
              <span className="conf-pct">{confidence}%</span>
            </div>

            <div className="signal-cycle">Cycle #{signal.details?.scan_cycle ?? '—'}</div>

            {isExpanded && (
              <div className="signal-details">
                {signal.details?.signals?.length > 0 && (
                  <div className="signals-list">
                    <h4>📊 Findings</h4>
                    {signal.details.signals.map((sig, idx) => (
                      <div key={idx} className="signal-item">
                        <strong>{sig.competitor}</strong>
                        <span style={{ marginLeft: 'auto', color: '#9ca3af', fontSize: '12px' }}>
                          {sig.change}
                          {sig.delta_pct !== undefined && sig.delta_pct !== 0 && (
                            <span style={{ 
                              marginLeft: '8px', 
                              color: sig.delta_pct > 0 ? '#16a34a' : '#dc2626',
                              fontWeight: 600
                            }}>
                              {sig.delta_pct > 0 ? '+' : ''}{sig.delta_pct}%
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {signal.details?.interpretations?.length > 0 && (
                  <div className="interpretations-list">
                    <h4>💡 Interpretations</h4>
                    {signal.details.interpretations.map((interp, idx) => (
                      <div key={idx} className="interpretation-item">
                        <strong>{interp.competitor} ({interp.dimension})</strong>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#d1d5db' }}>
                          {interp.interpretation}
                        </p>
                        <small style={{ color: '#9ca3af', marginTop: '4px', display: 'block' }}>
                          <em>Implication:</em> {interp.implication}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
                {signal.details?.narrative && (
                  <div className="narrative-item">
                    <h4>📝 Summary</h4>
                    <p>{signal.details.narrative}</p>
                  </div>
                )}
                {signal.details?.hot_threads?.length > 0 && (
                  <div className="hot-threads-list">
                    <h4>🔥 Hot Topics</h4>
                    <ul>
                      {signal.details.hot_threads.map((thread, idx) => (
                        <li key={idx}>{thread}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {signal.details?.competitive_shifts?.length > 0 && (
                  <div className="shifts-list">
                    <h4>⚠️ Competitive Shifts</h4>
                    {signal.details.competitive_shifts.map((shift, idx) => (
                      <div key={idx} className="shift-item">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <strong>{shift.competitors.join(', ')}</strong>
                          <span className={`urgency-badge urgency-${shift.urgency}`}>
                            {shift.urgency.charAt(0).toUpperCase() + shift.urgency.slice(1)}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#d1d5db' }}>
                          {shift.what_changed}
                        </p>
                        <small style={{ color: '#9ca3af', marginTop: '4px', display: 'block' }}>
                          <em>Strategic Implication:</em> {shift.strategic_implication}
                        </small>
                      </div>
                    ))}
                  </div>
                )}
                {signal.details?.recommendations?.length > 0 && (
                  <div className="recommendations-list">
                    <h4>🚀 Recommendations</h4>
                    {signal.details.recommendations.map((rec, idx) => (
                      <div key={idx} className="rec-item">
                        <span className={`rec-priority rec-${rec.priority}`}>
                          {rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1)}
                        </span>
                        <strong style={{ fontSize: '13px' }}>{rec.action}</strong>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#9ca3af' }}>
                          <em>Rationale:</em> {rec.rationale}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatRelative(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
