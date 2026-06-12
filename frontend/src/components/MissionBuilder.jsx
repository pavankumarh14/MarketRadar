import React, { useState } from 'react';
import { createMission } from '../services/api';

const DIMENSION_OPTIONS = [
  { id: 'pricing', label: '💰 Pricing',  desc: 'API tiers, price cuts, free-tier launches' },
  { id: 'hiring',  label: '👥 Hiring',   desc: 'Headcount, role mix, new locations' },
  { id: 'news',    label: '📰 News',     desc: 'Press coverage, product launches, HN signal' },
  { id: 'patents', label: '🔬 Patents',  desc: 'IP filings, R&D direction indicators' },
];

const CADENCE_OPTIONS = [
  { value: 15,  label: 'Every 15 min' },
  { value: 30,  label: 'Every 30 min' },
  { value: 60,  label: 'Every hour' },
  { value: 240, label: 'Every 4 hours' },
];

export function MissionBuilder({ onMissionCreated }) {
  const [name, setName]             = useState('');
  const [competitorInput, setCI]    = useState('');
  const [competitors, setComp]      = useState(['OpenAI', 'Cohere', 'Mistral']);
  const [dimensions, setDims]       = useState(['pricing', 'hiring', 'news', 'patents']);
  const [cadence, setCadence]       = useState(60);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  function addCompetitor() {
    const c = competitorInput.trim();
    if (c && !competitors.includes(c)) {
      setComp(prev => [...prev, c]);
      setCI('');
    }
  }

  function removeCompetitor(c) {
    setComp(prev => prev.filter(x => x !== c));
  }

  function toggleDimension(id) {
    setDims(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!name.trim()) return setError('Mission name is required');
    if (competitors.length === 0) return setError('Add at least one competitor');
    if (dimensions.length === 0) return setError('Select at least one dimension');

    setLoading(true);
    try {
      const mission = await createMission({ name: name.trim(), competitors, dimensions, cadence_minutes: cadence });
      onMissionCreated(mission);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="mission-builder" onSubmit={handleSubmit}>
      <h2>New Watch Mission</h2>

      <label className="field">
        <span>Mission name</span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. AI Platform Competitive Watch"
          autoFocus
        />
      </label>

      <div className="field">
        <span>Competitors <small>({competitors.length} added)</small></span>
        <div className="tag-row">
          {competitors.map(c => (
            <span key={c} className="tag">
              {c}
              <button type="button" onClick={() => removeCompetitor(c)}>×</button>
            </span>
          ))}
        </div>
        <div className="inline-input">
          <input
            value={competitorInput}
            onChange={e => setCI(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCompetitor())}
            placeholder="Type name + Enter"
          />
          <button type="button" className="btn-ghost" onClick={addCompetitor}>Add</button>
        </div>
      </div>

      <div className="field">
        <span>Dimensions to monitor</span>
        <div className="dimension-grid">
          {DIMENSION_OPTIONS.map(d => (
            <label key={d.id} className={`dim-card ${dimensions.includes(d.id) ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={dimensions.includes(d.id)}
                onChange={() => toggleDimension(d.id)}
              />
              <strong>{d.label}</strong>
              <small>{d.desc}</small>
            </label>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Scan cadence</span>
        <select value={cadence} onChange={e => setCadence(Number(e.target.value))}>
          {CADENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-primary" type="submit" disabled={loading}>
        {loading ? 'Starting…' : '🚀 Start Mission'}
      </button>
    </form>
  );
}
