// Use environment variable for production, proxy for development
const BASE = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body:    body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.data;
}

// Missions
export const getMissions          = ()         => request('GET',  '/missions');
export const getMission           = id         => request('GET',  `/missions/${id}`);
export const createMission        = body       => request('POST', '/missions', body);
export const pauseMission         = id         => request('POST', `/missions/${id}/pause`);
export const resumeMission        = id         => request('POST', `/missions/${id}/resume`);
export const triggerScan          = id         => request('POST', `/missions/${id}/scan`);

// Signals (scout findings)
export const getMissionSignals    = id         => request('GET',  `/missions/${id}/signals`);

// Briefs
export const getMissionBriefs     = id         => request('GET',  `/missions/${id}/briefs`);

// DAGs
export const getMissionDAGs       = id         => request('GET',  `/missions/${id}/dags`);
export const getDAG               = dagId      => request('GET',  `/dags/${dagId}`);
export const getDAGFindings       = dagId      => request('GET',  `/dags/${dagId}/findings`);
