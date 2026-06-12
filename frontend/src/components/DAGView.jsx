import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

// ═════════════════════════════════════════════════════════════════════════════
// CANDIDATE TASK — DAG Visualisation
// ═════════════════════════════════════════════════════════════════════════════
//
// Render the live investigation pipeline as an animated SVG graph using D3.
// The DAG shows six nodes across three phases — scouts fan out, analyst
// consolidates, strategist synthesises — with live status colouring.
//
//
// PROPS
// ─────
// dag: {
//   id:     string,
//   status: 'running' | 'completed' | 'failed',
//   nodes: [{
//     id:           string,   e.g. 'scout-pricing'
//     capability:   string,   same as id
//     phase:        1 | 2 | 3,
//     status:       'pending' | 'running' | 'completed' | 'failed',
//     confidence:   number | null,
//     started_at:   string | null,
//     completed_at: string | null,
//   }]
// } | null
//
// findings: Finding[]   (use to show confidence badge on completed nodes)
//
//
// REQUIRED BEHAVIOURS
// ────────────────────
// 1. Node colours by status:
//      pending   → #374151 (grey)
//      running   → #2563eb (blue) with a CSS pulse animation
//      completed → #16a34a (green)
//      failed    → #dc2626 (red)
//
// 2. Edges:
//      scout-pricing  → analyst
//      scout-hiring   → analyst
//      scout-news     → analyst
//      scout-patents  → analyst
//      analyst        → strategist
//    Draw as SVG <line> or <path> with arrowhead markers.
//
// 3. Labels: display a readable name, not the raw id.
//    e.g. 'scout-pricing' → 'Scout: Pricing'
//
// 4. Confidence badge: on completed nodes, show the confidence % in the node.
//
// 5. Pulse animation: add a CSS keyframe that scales/glows running nodes.
//    @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.6 } }
//
//
// SUGGESTED LAYOUT (fixed positions — simpler than force simulation):
//
//   Phase 1 (scouts) — horizontal row, y = 80
//     scout-pricing:  x = 80
//     scout-hiring:   x = 230
//     scout-news:     x = 380
//     scout-patents:  x = 530
//
//   Phase 2 (analyst) — centred, y = 220
//     analyst:        x = 305
//
//   Phase 3 (strategist) — centred, y = 360
//     strategist:     x = 305
//
//   SVG viewBox: "0 0 620 440"
//
//
// D3 PATTERN TO USE
// ──────────────────
//   const svgRef = useRef(null);
//   useEffect(() => {
//     if (!dag || !svgRef.current) return;
//     const svg = d3.select(svgRef.current);
//     svg.selectAll('*').remove();          // clear on each update
//     // draw edges first (so nodes render on top)
//     // draw nodes as <circle> or <rect>
//     // draw labels as <text>
//   }, [dag, findings]);
//
// The useEffect re-runs on every dag/findings change — the WebSocket in App.jsx
// updates `dag` on every dag_update event, giving you live animation.
//
//
// REFERENCE COMPONENTS
// ─────────────────────
// SignalList.jsx  — shows how to consume props.findings
// ../hooks/useWebSocket.js — shows what events the WS emits
// ../services/api.js — getDAGFindings(dagId) if you need to fetch findings
//
// ═════════════════════════════════════════════════════════════════════════════

export function DAGView({ dag, findings = [] }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!dag || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Node positions (fixed layout)
    const nodePositions = {
      'scout-pricing': { x: 80, y: 80 },
      'scout-hiring': { x: 230, y: 80 },
      'scout-news': { x: 380, y: 80 },
      'scout-patents': { x: 530, y: 80 },
      'analyst': { x: 305, y: 220 },
      'strategist': { x: 305, y: 360 },
    };

    // Edges
    const edges = [
      { from: 'scout-pricing', to: 'analyst' },
      { from: 'scout-hiring', to: 'analyst' },
      { from: 'scout-news', to: 'analyst' },
      { from: 'scout-patents', to: 'analyst' },
      { from: 'analyst', to: 'strategist' },
    ];

    // Status colors
    const statusColors = {
      pending: '#374151',
      running: '#2563eb',
      completed: '#16a34a',
      failed: '#dc2626',
    };

    // Draw edges first (so nodes render on top)
    svg.append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#6b7280');

    edges.forEach(edge => {
      const from = nodePositions[edge.from];
      const to = nodePositions[edge.to];
      svg.append('line')
        .attr('x1', from.x + 40)
        .attr('y1', from.y)
        .attr('x2', to.x - 40)
        .attr('y2', to.y)
        .attr('stroke', '#6b7280')
        .attr('stroke-width', 2)
        .attr('marker-end', 'url(#arrowhead)');
    });

    // Draw nodes
    dag.nodes.forEach(node => {
      const pos = nodePositions[node.id];
      if (!pos) return;

      const g = svg.append('g')
        .attr('transform', `translate(${pos.x}, ${pos.y})`);

      // Node circle/rect
      const color = statusColors[node.status] || '#374151';
      g.append('rect')
        .attr('x', -40)
        .attr('y', -20)
        .attr('width', 80)
        .attr('height', 40)
        .attr('rx', 8)
        .attr('fill', color)
        .attr('class', node.status === 'running' ? 'pulse-node' : '');

      // Node label
      const label = node.id.replace('scout-', '').replace('-', ' ');
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 4)
        .attr('fill', 'white')
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .text(label.charAt(0).toUpperCase() + label.slice(1));

      // Confidence badge for completed nodes
      if (node.status === 'completed' && node.confidence !== null) {
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', 55)
          .attr('fill', '#9ca3af')
          .attr('font-size', '10px')
          .text(`${Math.round(node.confidence * 100)}%`);
      }
    });

  }, [dag, findings]);

  if (!dag) {
    return (
      <div className="dag-view empty">
        <p>No active scan</p>
        <p className="hint">Trigger a scan to see the investigation pipeline animate in real-time.</p>
      </div>
    );
  }

  return (
    <div className="dag-view">
      <svg ref={svgRef} viewBox="0 0 620 440" style={{ width: '100%', height: '100%' }} />
      <style>{`
        .pulse-node {
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
