import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

// ═════════════════════════════════════════════════════════════════════════════
// CANDIDATE TASK — Signal Timeline (D3 time-series chart)
// ═════════════════════════════════════════════════════════════════════════════
//
// Render a time-series chart showing signal activity across scan cycles.
// This is the "living" view — as new scans run, the chart extends to the right.
//
//
// PROPS
// ─────
// signals: Finding[]   (scout findings only — capability starts with 'scout-')
//   Each signal has:
//     capability:   'scout-pricing' | 'scout-hiring' | 'scout-news' | 'scout-patents'
//     confidence:   number (0–1)
//     verdict:      'significant' | 'minor' | 'noise' | 'neutral'
//     created_at:   ISO string
//     details.scan_cycle: number
//
//
// WHAT TO BUILD
// ─────────────
// Option A (simpler): Grouped bar chart by scan cycle.
//   X-axis: scan_cycle (1, 2, 3…)
//   Y-axis: confidence (0–1)
//   Bars grouped by dimension (4 bars per cycle, each a different colour)
//   Bars for 'noise' verdict are muted/transparent
//
// Option B (richer): Scatter plot + trend lines.
//   X-axis: created_at timestamp
//   Y-axis: confidence
//   Each point coloured by dimension, sized by verdict (significant = larger)
//   One smooth trend line per dimension (d3.line + curveMonotoneX)
//
// Either is acceptable. Option A is 2–3× faster to build.
//
//
// COLOUR MAP (match DAGView for consistency):
//   scout-pricing:  #6366f1
//   scout-hiring:   #0ea5e9
//   scout-news:     #f59e0b
//   scout-patents:  #8b5cf6
//
//
// D3 PATTERN:
//   const svgRef = useRef(null);
//   useEffect(() => {
//     if (!signals.length || !svgRef.current) return;
//     const svg = d3.select(svgRef.current);
//     svg.selectAll('*').remove();
//     const width = svgRef.current.clientWidth || 600;
//     const height = 260;
//     const margin = { top: 20, right: 20, bottom: 40, left: 45 };
//     // ... your scales, axes, bars/lines
//   }, [signals]);
//
//
// REFERENCE: SignalList.jsx — same props.signals, shows the raw card view.
// You're building the charted version of the same data.
//
// ═════════════════════════════════════════════════════════════════════════════

export function SignalTimeline({ signals = [] }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!signals.length || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 600;
    const height = 260;
    const margin = { top: 20, right: 20, bottom: 40, left: 45 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Filter scout signals only
    const scoutSignals = signals.filter(s => s.capability?.startsWith('scout-'));

    if (scoutSignals.length === 0) return;

    // Group by scan cycle
    const groupedData = d3.group(scoutSignals, d => d.details?.scan_cycle || 0);
    const scanCycles = Array.from(groupedData.keys()).sort((a, b) => a - b);

    // Color map
    const colorMap = {
      'scout-pricing': '#6366f1',
      'scout-hiring': '#0ea5e9',
      'scout-news': '#f59e0b',
      'scout-patents': '#8b5cf6',
    };

    // Scales
    const xScale = d3.scaleBand()
      .domain(scanCycles)
      .range([0, innerWidth])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);

    // Create main group
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // X axis
    g.append('g')
      .attr('transform', `translate(0, ${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat(d => `Cycle ${d}`))
      .attr('color', '#6b7280');

    // Y axis
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => `${Math.round(d * 100)}%`))
      .attr('color', '#6b7280');

    // Draw bars
    scanCycles.forEach(cycle => {
      const cycleSignals = groupedData.get(cycle) || [];
      const dimensions = ['scout-pricing', 'scout-hiring', 'scout-news', 'scout-patents'];
      const barWidth = (xScale.bandwidth() / dimensions.length) - 2;

      dimensions.forEach((dim, i) => {
        const signal = cycleSignals.find(s => s.capability === dim);
        if (!signal) return;

        const x = xScale(cycle) + (i * (barWidth + 2));
        const y = yScale(signal.confidence || 0);
        const barHeight = innerHeight - y;

        // Mute noise verdict
        const isNoise = signal.verdict === 'noise';
        const opacity = isNoise ? 0.3 : 0.8;

        g.append('rect')
          .attr('x', x)
          .attr('y', y)
          .attr('width', barWidth)
          .attr('height', barHeight)
          .attr('fill', colorMap[dim] || '#6b7280')
          .attr('opacity', opacity)
          .attr('rx', 2);
      });
    });

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left}, 10)`);

    const legendItems = [
      { label: 'Pricing', color: colorMap['scout-pricing'] },
      { label: 'Hiring', color: colorMap['scout-hiring'] },
      { label: 'News', color: colorMap['scout-news'] },
      { label: 'Patents', color: colorMap['scout-patents'] },
    ];

    legendItems.forEach((item, i) => {
      const g = legend.append('g')
        .attr('transform', `translate(${i * 80}, 0)`);

      g.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', item.color)
        .attr('rx', 2);

      g.append('text')
        .attr('x', 16)
        .attr('y', 10)
        .attr('fill', '#9ca3af')
        .attr('font-size', '11px')
        .text(item.label);
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
    <div className="signal-timeline">
      <svg ref={svgRef} width="100%" height="260" />
    </div>
  );
}
