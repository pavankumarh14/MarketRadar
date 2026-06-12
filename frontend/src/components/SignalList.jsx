import React from 'react';

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

export function SignalList({ signals, activeMission, onSelectMission }) {
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

        return (
          <div key={signal.id} className="signal-card" style={{ borderLeftColor: meta.color }}>
            <div className="signal-header">
              <span className="dim-badge" style={{ backgroundColor: meta.color + '22', color: meta.color }}>
                {meta.icon} {meta.label}
              </span>
              <span className="verdict-badge" style={{ color: verdictColor }}>
                ● {signal.verdict}
              </span>
              <span className="signal-time">{formatRelative(signal.created_at)}</span>
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
  return `${h}h ago`;
}
