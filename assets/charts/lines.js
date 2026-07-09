/* Charts · lines — multi-series line chart for rise-and-fall stories
 * (e.g. hours per year for your all-time top artists). */
(() => {
  const { niceMax, smoothPath, svgEl, mkSvg, yGrid, xTickLabel, figWrap, legendRow, seriesTable } = Charts.util;
  const attachTip = Charts.attachTip;

  /**
   * periods: [label]; series: [{label, color, values[]}] parallel to periods.
   * opts: {height, formatValue, tickEvery, ariaLabel, periodLabel}
   */
  Charts.lineChart = (container, periods, series, opts = {}) => {
    const th = Charts.theme();
    const H = opts.height || 260;
    const W = 800;
    const padL = 44, padR = 8, padT = 12, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = periods.length;
    const fmt = opts.formatValue || (v => v.toLocaleString('en-US'));
    const maxV = niceMax(Math.max(...series.flatMap(s => s.values), 0));

    const xAt = i => padL + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));
    const yAt = v => padT + plotH - (v / maxV) * plotH;

    legendRow(container, series);

    const svg = mkSvg(W, H, opts.ariaLabel);
    yGrid(svg, { W, padL, padR, padT, plotH, maxV, fmt });

    // one gently smoothed line per series, with markers at each point
    for (const s of series) {
      const pts = periods.map((_, i) => [xAt(i), yAt(s.values[i] || 0)]);
      svg.appendChild(svgEl('path', {
        d: smoothPath(pts.map(p => [Number(p[0].toFixed(1)), Number(p[1].toFixed(1))])),
        fill: 'none', stroke: s.color, 'stroke-width': '2',
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      }));
      pts.forEach(([x, y], i) => {
        if ((s.values[i] || 0) <= 0) return;
        svg.appendChild(svgEl('circle', {
          cx: x.toFixed(1), cy: y.toFixed(1), r: '3',
          fill: s.color, stroke: th.surface, 'stroke-width': '1.5',
        }));
      });
    }

    // per-period hover: a guide column showing every series' value
    periods.forEach((label, i) => {
      const slotW = plotW / Math.max(1, n - 1);
      const hit = svgEl('rect', { x: xAt(i) - slotW / 2, y: padT, width: slotW, height: plotH, fill: 'transparent' });
      attachTip(hit, () => [label,
        [...series]
          .map(s => ({ s, v: s.values[i] || 0 }))
          .sort((a, b) => b.v - a.v)
          .map(({ s, v }) => `${s.label}: ${fmt(v)}`).join('\n')]);
      svg.appendChild(hit);
      const tick = opts.tickEvery ? opts.tickEvery(i, label) : label;
      // pull the edge ticks inward so they don't clip at the viewBox
      if (tick != null) xTickLabel(svg, Math.min(Math.max(xAt(i), padL + 14), W - padR - 14), H - 8, tick);
    });

    figWrap(container, svg);
    seriesTable(container, periods, series, fmt, opts.periodLabel);
  };
})();
