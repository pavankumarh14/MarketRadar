import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

export function DAGView({ dag, findings = [] }) {
  const svgRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  useEffect(() => {
    if (!dag || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Node positions (fixed layout)
    const nodePositions = {
      'scout-pricing': { x: 80, y: 60, label: 'Scout: Pricing', icon: '💰' },
      'scout-hiring': { x: 230, y: 60, label: 'Scout: Hiring', icon: '👥' },
      'scout-news': { x: 380, y: 60, label: 'Scout: News', icon: '📰' },
      'scout-patents': { x: 530, y: 60, label: 'Scout: Patents', icon: '🔬' },
      'analyst': { x: 305, y: 200, label: 'Analyst', icon: '🔍' },
      'strategist': { x: 305, y: 340, label: 'Strategist', icon: '🎯' },
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
        .attr('transform', `translate(${pos.x}, ${pos.y})`)
        .style('cursor', 'pointer')
        .on('mouseenter', () => setHoveredNode(node))
        .on('mouseleave', () => setHoveredNode(null));

      // Node background
      const color = statusColors[node.status] || '#374151';
      g.append('rect')
        .attr('x', -60)
        .attr('y', -35)
        .attr('width', 120)
        .attr('height', 70)
        .attr('rx', 12)
        .attr('fill', color)
        .attr('class', node.status === 'running' ? 'pulse-node' : '')
        .style('transition', 'all 0.3s ease');

      // Node icon
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', -10)
        .attr('fill', 'white')
        .attr('font-size', '24px')
        .text(pos.icon);

      // Node label
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', 20)
        .attr('fill', 'white')
        .attr('font-size', '12px')
        .attr('font-weight', '600')
        .text(pos.label);

      // Confidence badge for completed nodes
      if (node.status === 'completed' && node.confidence !== null) {
        g.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', 58)
          .attr('fill', '#9ca3af')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .text(`${Math.round(node.confidence * 100)}% confidence`);
      }
    });

  }, [dag, findings]);

  // Find finding for hovered node
  const hoveredFinding = hoveredNode 
    ? findings.find(f => f.node_id === hoveredNode.id) 
    : null;

  if (!dag) {
    return (
      <div className="dag-view empty">
        <p>No active scan</p>
        <p className="hint">Trigger a scan to see the investigation pipeline animate in real-time.</p>
      </div>
    );
  }

  return (
    <div className="dag-view" style={{ position: 'relative', height: '440px' }}>
      <svg ref={svgRef} viewBox="0 0 620 440" style={{ width: '100%', height: '100%' }} />
      <style>{`
        .pulse-node {
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.02); }
        }
        .dag-tooltip {
          position: absolute;
          top: 20px;
          right: 20px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px;
          max-width: 320px;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
        }
      `}</style>

      {hoveredNode && (
        <div className="dag-tooltip">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>
              {hoveredNode.id.includes('scout-pricing') ? '💰' :
               hoveredNode.id.includes('scout-hiring') ? '👥' :
               hoveredNode.id.includes('scout-news') ? '📰' :
               hoveredNode.id.includes('scout-patents') ? '🔬' :
               hoveredNode.id === 'analyst' ? '🔍' : '🎯'}
            </span>
            <strong style={{ fontSize: '16px' }}>
              {hoveredNode.id.replace('scout-', '').charAt(0).toUpperCase() +
               hoveredNode.id.replace('scout-', '').slice(1).replace('-', ' ')}
            </strong>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#9ca3af', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Status: 
            </span>
            <span style={{ 
              color: hoveredNode.status === 'running' ? '#2563eb' :
                     hoveredNode.status === 'completed' ? '#16a34a' :
                     hoveredNode.status === 'failed' ? '#dc2626' : '#6b7280',
              fontWeight: 600,
              marginLeft: '6px'
            }}>
              {hoveredNode.status.charAt(0).toUpperCase() + hoveredNode.status.slice(1)}
            </span>
          </div>
          {hoveredFinding && (
            <div style={{ fontSize: '13px', color: '#e5e7eb', lineHeight: '1.5' }}>
              {hoveredFinding.summary}
              {hoveredFinding.confidence !== undefined && hoveredFinding.confidence !== null && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>Confidence: </span>
                  <span style={{ fontWeight: 600, color: '#16a34a' }}>
                    {Math.round(hoveredFinding.confidence * 100)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DAG Status Header */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '12px 16px'
      }}>
        <div style={{
          color: '#9ca3af',
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '4px'
        }}>
          Pipeline Status
        </div>
        <div style={{
          fontSize: '18px',
          fontWeight: 600,
          color: dag.status === 'completed' ? '#16a34a' :
                 dag.status === 'failed' ? '#dc2626' :
                 dag.status === 'running' ? '#2563eb' : '#e5e7eb'
        }}>
          {dag.status.charAt(0).toUpperCase() + dag.status.slice(1)}
        </div>
      </div>
    </div>
  );
}
