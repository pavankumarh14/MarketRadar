import React, { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { getMissions, getMissionSignals, getMissionBriefs, getMissionDAGs, triggerScan } from './services/api';
import { MissionBuilder } from './components/MissionBuilder';
import { SignalList }     from './components/SignalList';
import { DAGView }        from './components/DAGView';
import { SignalTimeline } from './components/SignalTimeline';
import { BriefPanel }     from './components/BriefPanel';

export default function App() {
  const [missions, setMissions]       = useState([]);
  const [activeMission, setActive]    = useState(null);
  const [signals, setSignals]         = useState([]);
  const [briefs, setBriefs]           = useState([]);
  const [activeBrief, setActiveBrief] = useState(null);
  const [activeDAG, setActiveDAG]     = useState(null);
  const [dagFindings, setDAGFindings] = useState([]);
  const [view, setView]               = useState('brief');  // brief | dag | timeline
  const [scanLoading, setScanLoading] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [eventCount, setEventCount]   = useState(0);

  const { lastMessage, isConnected } = useWebSocket();

  useEffect(() => {
    getMissions()
      .then(ms => {
        setMissions(ms);
        if (ms.length > 0 && !activeMission) setActive(ms[0]);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!activeMission) return;

    Promise.all([
      getMissionSignals(activeMission.id),
      getMissionBriefs(activeMission.id),
      getMissionDAGs(activeMission.id),
    ]).then(([sigs, briefs, dags]) => {
      setSignals(sigs);
      setBriefs(briefs);
      setActiveBrief(briefs[0] ?? null);
      setActiveDAG(dags[0] ?? null);
    }).catch(console.error);
  }, [activeMission?.id]);

  // ── WebSocket: update state on live events ────────────────────────────────
  useEffect(() => {
    if (!lastMessage || !activeMission) return;
    setEventCount(c => c + 1);

    const { type, data } = lastMessage;

    if (type === 'finding' && data.mission_id === activeMission.id) {
      // Only scout findings land in the signal list
      if (data.capability?.startsWith('scout-')) {
        setSignals(prev => [data, ...prev.filter(s => s.id !== data.id)]);
      }
    }

    if (type === 'dag_update' && data.mission_id === activeMission.id) {
      setActiveDAG(data);
    }

    if (type === 'brief_ready' && data.mission_id === activeMission.id) {
      setBriefs(prev => [data, ...prev.filter(b => b.id !== data.id)]);
      setActiveBrief(data);
    }
  }, [lastMessage]);

  async function handleTriggerScan() {
    if (!activeMission) return;
    setScanLoading(true);
    try {
      await triggerScan(activeMission.id);
    } catch (e) {
      console.error('Scan trigger failed:', e);
    } finally {
      setTimeout(() => setScanLoading(false), 1500);
    }
  }

  function handleMissionCreated(mission) {
    setMissions(prev => [mission, ...prev]);
    setActive(mission);
    setShowBuilder(false);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <span className="logo">🧠 MarketRadar</span>
          <span className={`ws-dot ${isConnected ? 'connected' : 'disconnected'}`} title={isConnected ? 'Live' : 'Reconnecting…'} />
          <span className="event-count">{eventCount} events</span>
        </div>
        <div className="header-right">
          {activeMission && (
            <button
              className="btn-scan"
              onClick={handleTriggerScan}
              disabled={scanLoading}
            >
              {scanLoading ? '⏳ Scanning…' : '▶ Run Scan'}
            </button>
          )}
          <button className="btn-ghost" onClick={() => setShowBuilder(v => !v)}>
            {showBuilder ? '✕ Cancel' : '+ New Mission'}
          </button>
        </div>
      </header>

      <div className="app-body">
        {/* ── Left: mission list + signal feed */}
        <aside className="sidebar">
          {/* Mission selector */}
          <div className="mission-list">
            {missions.map(m => (
              <button
                key={m.id}
                className={`mission-item ${activeMission?.id === m.id ? 'active' : ''}`}
                onClick={() => setActive(m)}
              >
                <span className="mission-name">{m.name}</span>
                <span className={`mission-status status-${m.status}`}>{m.status}</span>
              </button>
            ))}
            {missions.length === 0 && (
              <p className="no-missions">No missions yet — create one above.</p>
            )}
          </div>

          {/* Signal feed */}
          <div className="sidebar-section-header">
            Live Signals
            {activeMission && (
              <span className="signal-count">
                {signals.filter(s => s.mission_id === activeMission.id).length}
              </span>
            )}
          </div>
          <SignalList
            signals={signals}
            activeMission={activeMission}
          />
        </aside>

        {/* ── Main: builder or dashboard */}
        <main className="main-panel">
          {showBuilder ? (
            <MissionBuilder onMissionCreated={handleMissionCreated} />
          ) : (
            <>
              {/* View tabs */}
              <div className="view-tabs">
                {[
                  { id: 'brief',    label: '📋 Brief' },
                  { id: 'dag',      label: '🕸 Pipeline' },
                  { id: 'timeline', label: '📈 Timeline' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    className={`tab ${view === tab.id ? 'active' : ''}`}
                    onClick={() => setView(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {view === 'brief' && (
                <BriefPanel
                  brief={activeBrief}
                  allBriefs={briefs}
                  onSelectBrief={setActiveBrief}
                />
              )}
              {view === 'dag' && (
                <DAGView dag={activeDAG} findings={dagFindings} />
              )}
              {view === 'timeline' && (
                <SignalTimeline
                  signals={activeMission ? signals.filter(s => s.mission_id === activeMission.id) : []}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
