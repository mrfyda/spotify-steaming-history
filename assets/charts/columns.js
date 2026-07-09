/* Charts · columns — plain and stacked column charts. */
(() => {
  const { esc, niceMax, colPath, svgEl, mkSvg, yGrid, xTickLabel, figWrap, legendRow, tableTwin, seriesTable } = Charts.util;
  const attachTip = Charts.attachTip;

  /**
   * Column chart.
   * data: [{label, value, prev?, tipTitle, tipSub}]
   * opts: {height, formatValue, tickEvery(i,label)->string|null, ariaLabel,
   *        tableCols, compare: {labels: [cur, prev]}}
   */
  Charts.columnChart = (container, data, opts = {}) => {
    const th = Charts.theme();
    const H = opts.height || 220;
    const W = 800;
    const padL = 44, padR = 8, padT = 12, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = data.length || 1;
    const compare = !!opts.compare && data.some(d => d.prev != null);
    const maxV = niceMax(Math.max(...data.map(d => Math.max(d.value, d.prev || 0)), 0));
    const fmt = opts.formatValue || (v => v.toLocaleString('en-US'));

    const slot = plotW / n;
    const gap = Math.max(2, Math.min(6, slot * 0.25));          // ≥2px surface gap
    const barW = compare
      ? Math.max(1.5, Math.min(11, (slot - gap) / 2 - 1))
      : Math.max(1.5, Math.min(24, slot - gap));                // ≤24px thick

    const svg = mkSvg(W, H, opts.ariaLabel);
    yGrid(svg, { W, padL, padR, padT, plotH, maxV, fmt });

    data.forEach((d, i) => {
      const pairW = compare ? barW * 2 + 2 : barW;
      const x0 = padL + slot * i + (slot - pairW) / 2;
      const g = svgEl('g');

      if (compare && d.prev > 0) {
        const ph = (d.prev / maxV) * plotH;
        g.appendChild(svgEl('path', { d: colPath(x0, padT + plotH - ph, barW, ph), fill: th.compare }));
      }
      const x = compare ? x0 + barW + 2 : x0;
      const h = maxV ? (d.value / maxV) * plotH : 0;
      if (h > 0) {
        g.appendChild(svgEl('path', { d: colPath(x, padT + plotH - h, barW, h), fill: th.mark }));
      }
      // full-height invisible hit target (never pinpoint hover)
      g.appendChild(svgEl('rect', { x: padL + slot * i, y: padT, width: slot, height: plotH, fill: 'transparent' }));
      attachTip(g, () => [d.tipTitle ?? d.label, d.tipSub ?? fmt(d.value)]);
      svg.appendChild(g);

      const tick = opts.tickEvery ? opts.tickEvery(i, d.label) : d.label;
      if (tick != null) xTickLabel(svg, padL + slot * i + slot / 2, H - 8, tick);
    });

    if (compare && opts.compare.labels) {
      const [curLab, prevLab] = opts.compare.labels;
      legendRow(container, [{ color: th.mark, label: curLab }, { color: th.compare, label: prevLab }]);
    }
    figWrap(container, svg);

    if (opts.tableCols) {
      const prevHead = compare && opts.compare.labels ? `<th class="num">${esc(opts.compare.labels[1])}</th>` : '';
      tableTwin(container,
        `<thead><tr><th>${esc(opts.tableCols[0])}</th><th class="num">${esc(opts.tableCols[1])}</th>${prevHead}</tr></thead>`,
        `<tbody>${data.map(d => `<tr><td>${esc(d.tipTitle ?? d.label)}</td><td class="num">${esc(d.tipSub ?? fmt(d.value))}</td>${prevHead ? `<td class="num">${esc(fmt(d.prev || 0))}</td>` : ''}</tr>`).join('')}</tbody>`);
    }
  };

  /**
   * Stacked columns for part-to-whole over time (e.g. genres per year).
   * periods: [label]; series: [{label, color, values[]}] parallel to periods.
   */
  Charts.stackedColumns = (container, periods, series, opts = {}) => {
    const H = opts.height || 230;
    const W = 800;
    const padL = 44, padR = 8, padT = 12, padB = 24;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const n = periods.length || 1;
    const totals = periods.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] || 0), 0));
    const maxV = niceMax(Math.max(...totals, 0));
    const fmt = opts.formatValue || (v => v.toLocaleString('en-US'));

    const slot = plotW / n;
    const gap = Math.max(2, Math.min(6, slot * 0.25));
    const barW = Math.max(1.5, Math.min(24, slot - gap));

    legendRow(container, series);

    const svg = mkSvg(W, H, opts.ariaLabel);
    yGrid(svg, { W, padL, padR, padT, plotH, maxV, fmt });

    periods.forEach((label, i) => {
      const x = padL + slot * i + (slot - barW) / 2;
      const g = svgEl('g');
      let cum = 0;
      const topSeg = [...series].reverse().find(s => (s.values[i] || 0) > 0);
      for (const s of series) {
        const v = s.values[i] || 0;
        if (v <= 0) { continue; }
        const segH = (v / maxV) * plotH;
        const yTop = padT + plotH - ((cum + v) / maxV) * plotH;
        const isTop = s === topSeg;
        const drawH = Math.max(1, segH - (isTop ? 0 : 2)); // 2px surface gap between segments
        g.appendChild(svgEl('path', {
          d: isTop ? colPath(x, yTop, barW, segH) : `M${x},${yTop + 2} h${barW} v${drawH} h${-barW} Z`,
          fill: s.color,
        }));
        cum += v;
      }
      g.appendChild(svgEl('rect', { x: padL + slot * i, y: padT, width: slot, height: plotH, fill: 'transparent' }));
      attachTip(g, () => [label,
        series.filter(s => (s.values[i] || 0) > 0)
          .map(s => `${s.label}: ${fmt(s.values[i])}`).join('\n') || 'nothing']);
      svg.appendChild(g);

      const tick = opts.tickEvery ? opts.tickEvery(i, label) : label;
      if (tick != null) xTickLabel(svg, padL + slot * i + slot / 2, H - 8, tick);
    });

    figWrap(container, svg);
    seriesTable(container, periods, series, fmt, opts.periodLabel);
  };
})();
