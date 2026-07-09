/* Charts · streamgraph — centered stacked area for composition over time. */
(() => {
  const { smoothPath, hexLuma, svgEl, mkSvg, xTickLabel, figWrap, legendRow, seriesTable } = Charts.util;
  const attachTip = Charts.attachTip;

  /**
   * periods: [label]; series: [{label, color, values[]}] parallel to periods.
   * Values are only readable via tooltip + table twin, so both are built in.
   */
  Charts.streamgraph = (container, periods, series, opts = {}) => {
    const th = Charts.theme();
    const H = opts.height || 240;
    const W = 800;
    const padL = 10, padR = 10, padT = 14, padB = 26;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = periods.length;
    const fmt = opts.formatValue || (v => v.toLocaleString('en-US'));

    const totals = periods.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
    const maxTotal = Math.max(...totals, 1);
    const scale = plotH / maxTotal;
    const centerY = padT + plotH / 2;
    const xAt = i => padL + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1));

    // silhouette baseline: boundaries[k][i] in value units, boundaries[0] = -total/2
    const boundaries = [periods.map((_, i) => -totals[i] / 2)];
    series.forEach((s, k) => {
      boundaries.push(periods.map((_, i) => boundaries[k][i] + (s.values[i] || 0)));
    });
    const yOf = (k, i) => centerY - boundaries[k][i] * scale;

    legendRow(container, series);

    const svg = mkSvg(W, H, opts.ariaLabel);

    // bands, bottom to top
    series.forEach((s, k) => {
      const topPts = periods.map((_, i) => [xAt(i), yOf(k + 1, i)]);
      const botPts = periods.map((_, i) => [xAt(i), yOf(k, i)]).reverse();
      svg.appendChild(svgEl('path', {
        d: `${smoothPath(topPts)} L${botPts[0][0]},${botPts[0][1]} ${smoothPath(botPts).replace(/^M[-\d.,]+/, '')} Z`,
        fill: s.color,
      }));
    });

    // 2px surface strokes on internal boundaries separate the bands
    for (let k = 1; k < series.length; k++) {
      svg.appendChild(svgEl('path', {
        d: smoothPath(periods.map((_, i) => [xAt(i), yOf(k, i)])),
        fill: 'none', stroke: th.surface, 'stroke-width': '2',
      }));
    }

    // direct labels inside each band at its widest point (when it fits)
    series.forEach((s, k) => {
      let best = -1, bestPx = 0;
      periods.forEach((_, i) => {
        const px = (s.values[i] || 0) * scale;
        if (px > bestPx) { bestPx = px; best = i; }
      });
      if (best < 0 || bestPx < 17) return;
      const approxW = s.label.length * 7.5;
      const x = Math.min(Math.max(xAt(best), padL + approxW / 2), W - padR - approxW / 2);
      const t = svgEl('text', {
        x, y: (yOf(k, best) + yOf(k + 1, best)) / 2 + 4,
        'text-anchor': 'middle',
        fill: hexLuma(s.color) > 0.6 ? '#0b0b0b' : '#ffffff',
        'font-size': '12', 'font-weight': '600',
      });
      t.textContent = s.label;
      svg.appendChild(t);
    });

    // per-period hover + x ticks
    periods.forEach((label, i) => {
      const slotW = plotW / Math.max(1, n - 1);
      const hit = svgEl('rect', { x: xAt(i) - slotW / 2, y: padT, width: slotW, height: plotH, fill: 'transparent' });
      attachTip(hit, () => [label,
        series.filter(s => (s.values[i] || 0) > 0)
          .map(s => `${s.label}: ${fmt(s.values[i])}`).join('\n') || 'nothing']);
      svg.appendChild(hit);
      const tick = opts.tickEvery ? opts.tickEvery(i, label) : label;
      if (tick != null) xTickLabel(svg, xAt(i), H - 8, tick);
    });

    figWrap(container, svg);
    // the honest numbers behind the pretty bands
    seriesTable(container, periods, series, fmt, opts.periodLabel);
  };
})();
