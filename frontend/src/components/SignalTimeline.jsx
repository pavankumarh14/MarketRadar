import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

export function SignalTimeline({ signals = [] }) {
  const svgRef = useRef(null);
  const [hoveredData, setHoveredData] = useState(null);

  useEffect(() => {
    if (!signals.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 700;
    const height = 340;
    const margin = { top: 70, right: 30, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Filter scout signals only
    const scoutSignals = signals.filter(s => s.capability?.startsWith('scout-'));

    if (scoutSignals.length === 0) return;

    // Group by scan cycle and then by capability
    const groupedByCycle = d3.group(scoutSignals, s => s.details?.scan_cycle || 0);
    const scanCycles = Array.from(groupedByCycle.keys()).sort((a, b) => a - b);

    const capabilities = ['scout-pricing', 'scout-hiring', 'scout-news', 'scout-patents'];
    const colorMap = {
      'scout-pricing': '#6366f1',
      'scout-hiring': '#0ea5e9',
      'scout-news': '#f59e0b',
      'scout-patents': '#8b5cf6',
    };
    const labelMap = {
      'scout-pricing': 'Pricing',
      'scout-hiring': 'Hiring',
      'scout-news': 'News',
      'scout-patents': 'Patents',
    };

    // Scales
    const xScale = d3.scaleBand()
      .domain(scanCycles)
      .range([0, innerWidth])
      .padding(0.3);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Grid lines
    g.append('g')
      .attr('class', 'grid')
      .selectAll('line')
      .data(yScale.ticks(5))
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#374151')
      .attr('stroke-opacity', 0.3);

    // X axis
    g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat(d => `Cycle ${d}`))
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('font-size', '12px')
      .attr('fill', '#9ca3af');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${Math.round(d * 100)}%`))
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('font-size', '12px')
      .attr('fill', '#9ca3af');

    // Y axis label
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -50)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '14px')
      .attr('font-weight', '500')
      .text('Confidence Level');

    // X axis label
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 45)
      .attr('text-anchor', 'middle')
      .attr('fill', '#9ca3af')
      .attr('font-size', '14px')
      .attr('font-weight', '500')
      .text('Scan Cycles');

    // Draw bars
    const barWidth = (xScale.bandwidth() / capabilities.length) - 6;

    const barGroups = g.selectAll('.bar-group')
      .data(scanCycles)
      .join('g')
      .attr('class', 'bar-group')
      .attr('transform', cycle => `translate(${xScale(cycle)}, 0)`);

    capabilities.forEach((capability, i) => {
      barGroups.each(function(cycle) {
        const cycleSignals = groupedByCycle.get(cycle);
        const signal = cycleSignals?.find(s => s.capability === capability);
        if (!signal) return;

        const x = i * (barWidth + 6);
        const y = yScale(signal.confidence || 0);
        const barHeight = innerHeight - y;
        const isNoise = signal.verdict === 'noise';

        d3.select(this)
          .append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', barWidth)
          .attr('height', barHeight)
          .attr('fill', colorMap[capability])
          .attr('opacity', isNoise ? 0.3 : 0.9)
          .attr('rx', 4)
          .style('cursor', 'pointer')
          .on('mouseenter', () => setHoveredData({ signal, capability, cycle }))
          .on('mouseleave', () => setHoveredData(null));
      });
    });

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left}, 20)`);

    capabilities.forEach((capability, i) => {
      const gItem = legend.append('g')
        .attr('transform', `translate(${i * 120}, 0)`);

      gItem.append('rect')
        .attr('width', 16)
        .attr('height', 16)
        .attr('fill', colorMap[capability])
        .attr('rx', 4);

      gItem.append('text')
        .attr('x', 24)
        .attr('y', 13)
        .attr('fill', '#9ca3af')
        .attr('font-size', '13px')
        .attr('font-weight', '500')
        .text(labelMap[capability]);
    });

  }, [signals]);

  if (signals.length === 0) {
    return (
      <div className="signal-timeline empty">
        <p>No signal history yet</p>
        <p className="hint">Run multiple scans to see trends across time.</p>
      </div>
    );
  }

  return (
    <div className="signal-timeline" style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" height="340" />
      
      {hoveredData && (
        <div style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 16px',
          maxWidth: 300,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '18px' }}>
              {hoveredData.capability === 'scout-pricing' ? '💰' :
               hoveredData.capability === 'scout-hiring' ? '👥' :
               hoveredData.capability === 'scout-news' ? '📰' : '🔬'}
            </span>
            <strong style={{ fontSize: '14px' }}>
              {hoveredData.capability.replace('scout-', '').charAt(0).toUpperCase() +
               hoveredData.capability.replace('scout-', '').slice(1).replace('-', ' ')}
            </strong>
          </div>
          <div style={{
            marginBottom: '6px',
            fontSize: '12px',
            color: '#9ca3af',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Cycle {hoveredData.cycle}
          </div>
          <div style={{
            marginBottom: '8px',
            fontSize: '13px',
            lineHeight: '1.4'
          }}>
            {hoveredData.signal.summary}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <span style={{
                color: '#9ca3af',
                fontSize: '12px'
              }}>Confidence: </span>
              <span style={{
                fontWeight: 600,
                color: '#16a34a'
              }}>
                {Math.round(hoveredData.signal.confidence * 100)}%
              </span>
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 6,
              background: hoveredData.signal.verdict === 'significant' ? '#16a34a22' :
                         hoveredData.signal.verdict === 'minor' ? '#ca8a0422' :
                         hoveredData.signal.verdict === 'noise' ? '#374151' : '#374151',
              color: hoveredData.signal.verdict === 'significant' ? '#16a34a' :
                    hoveredData.signal.verdict === 'minor' ? '#ca8a04' :
                    hoveredData.signal.verdict === 'noise' ? '#6b7280' : '#6b7280'
            }}>
              {hoveredData.signal.verdict}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
