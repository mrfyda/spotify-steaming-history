/* Charts — small SVG chart helpers following the dataviz mark specs:
 * thin marks, 4px rounded data-ends (square at baseline), hairline solid
 * gridlines, 2px surface gaps, hover tooltips, and a table-view twin.
 */
const Charts = (() => {

  /* theme tokens — both sets from the validated dataviz reference palette */
  const LIGHT = {
    mark: '#2a78d6', compare: '#d3d1c9',
    seq: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'], // light→dark = less→more
    cat: ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7'],
    grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', secondary: '#52514e',
    surface: '#fcfcfb', edge: '#b8b6ae', track: '#efeeea',
    gray: '#b0aea6', grayLine: '#8f8d86', otherBand: '#c9c7bf',
  };
  const DARK = {
    mark: '#3987e5', compare: '#4a4a47',
    seq: ['#0d366b', '#184f95', '#256abf', '#3987e5', '#5598e7', '#86b6ef'], // dark→bright = less→more
    cat: ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9'],
    grid: '#2c2c2a', axis: '#4a4a47', muted: '#898781', secondary: '#c3c2b7',
    surface: '#1a1a19', edge: '#4c4c49', track: '#2c2c2a',
    gray: '#6f6d67', grayLine: '#8f8d86', otherBand: '#3f3e3a',
  };
  let TH, MARK, COMPARE, SEQ, GRID, AXIS, MUTED, SECONDARY, SURFACE, EDGE, TRACK;
  function applyTheme() {
    const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    TH = dark ? DARK : LIGHT;
    MARK = TH.mark; COMPARE = TH.compare; SEQ = TH.seq;
    GRID = TH.grid; AXIS = TH.axis; MUTED = TH.muted; SECONDARY = TH.secondary;
    SURFACE = TH.surface; EDGE = TH.edge; TRACK = TH.track;
  }
  applyTheme();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch { /* old browsers */ }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- tooltip singleton ---------- */
  const tipEl = () => document.getElementById('tooltip');
  function showTip(evt, title, sub) {
    const el = tipEl();
    el.innerHTML = `<div class="tt-title">${esc(title)}</div>${sub ? `<div class="tt-sub">${esc(sub)}</div>` : ''}`;
    el.hidden = false;
    moveTip(evt);
  }
  function moveTip(evt) {
    const el = tipEl();
    const pad = 14;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const r = el.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  function hideTip() { tipEl().hidden = true; }

  function attachTip(node, getContent) {
    node.addEventListener('mouseenter', e => { const c = getContent(); showTip(e, c[0], c[1]); });
    node.addEventListener('mousemove', moveTip);
    node.addEventListener('mouseleave', hideTip);
  }

  /* nice round max for y axis */
  function niceMax(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
      if (v <= m * mag) return m * mag;
    }
    return 10 * mag;
  }

  /* rounded-top column path: 4px radius at the data end, square baseline */
  function colPath(x, y, w, h) {
    const r = Math.min(4, w / 2, h);
    if (h <= 0) return '';
    return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
  }

  /**
   * Column chart.
   * data: [{label, value, tipTitle, tipSub}]
   * opts: {height, formatValue, tickEvery(i,label)->string|null, ariaLabel, tableCols}
   */
  function columnChart(container, data, opts = {}) {
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

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    if (opts.ariaLabel) svg.setAttribute('aria-label', opts.ariaLabel);

    // gridlines + y ticks (hairline, solid, recessive)
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxV / ticks) * i;
      const y = padT + plotH - (v / maxV) * plotH;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', padL); line.setAttribute('x2', W - padR);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', i === 0 ? AXIS : GRID);
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      if (i > 0) {
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', padL - 6); t.setAttribute('y', y + 3.5);
        t.setAttribute('text-anchor', 'end');
        t.setAttribute('fill', MUTED); t.setAttribute('font-size', '10');
        t.textContent = fmt(v);
        svg.appendChild(t);
      }
    }

    data.forEach((d, i) => {
      const pairW = compare ? barW * 2 + 2 : barW;
      const x0 = padL + slot * i + (slot - pairW) / 2;
      const g = document.createElementNS(svgNS, 'g');

      if (compare && d.prev > 0) {
        const ph = (d.prev / maxV) * plotH;
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', colPath(x0, padT + plotH - ph, barW, ph));
        p.setAttribute('fill', COMPARE);
        g.appendChild(p);
      }
      const x = compare ? x0 + barW + 2 : x0;
      const h = maxV ? (d.value / maxV) * plotH : 0;
      const y = padT + plotH - h;
      if (h > 0) {
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', colPath(x, y, barW, h));
        p.setAttribute('fill', MARK);
        g.appendChild(p);
      }
      // full-height invisible hit target (never pinpoint hover)
      const hit = document.createElementNS(svgNS, 'rect');
      hit.setAttribute('x', padL + slot * i); hit.setAttribute('y', padT);
      hit.setAttribute('width', slot); hit.setAttribute('height', plotH);
      hit.setAttribute('fill', 'transparent');
      g.appendChild(hit);
      attachTip(g, () => [d.tipTitle ?? d.label, d.tipSub ?? fmt(d.value)]);
      svg.appendChild(g);

      const tick = opts.tickEvery ? opts.tickEvery(i, d.label) : d.label;
      if (tick != null) {
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', padL + slot * i + slot / 2);
        t.setAttribute('y', H - 8);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', MUTED); t.setAttribute('font-size', '10');
        t.textContent = tick;
        svg.appendChild(t);
      }
    });

    // two series → a legend is required
    if (compare && opts.compare.labels) {
      const [curLab, prevLab] = opts.compare.labels;
      const legend = document.createElement('div');
      legend.className = 'chart-legend';
      legend.innerHTML = `<span><i style="background:${MARK}"></i>${esc(curLab)}</span>` +
        `<span><i style="background:${COMPARE}"></i>${esc(prevLab)}</span>`;
      container.appendChild(legend);
    }

    const fig = document.createElement('figure');
    fig.className = 'chart';
    fig.appendChild(svg);
    container.appendChild(fig);

    // table-view twin — every value reachable without hover
    if (opts.tableCols) {
      const det = document.createElement('details');
      det.className = 'chart-table';
      det.innerHTML = `<summary>View as table</summary>`;
      const table = document.createElement('table');
      const prevHead = compare && opts.compare.labels ? `<th class="num">${esc(opts.compare.labels[1])}</th>` : '';
      table.innerHTML =
        `<thead><tr><th>${esc(opts.tableCols[0])}</th><th class="num">${esc(opts.tableCols[1])}</th>${prevHead}</tr></thead>` +
        `<tbody>${data.map(d => `<tr><td>${esc(d.tipTitle ?? d.label)}</td><td class="num">${esc(d.tipSub ?? fmt(d.value))}</td>${prevHead ? `<td class="num">${esc(fmt(d.prev || 0))}</td>` : ''}</tr>`).join('')}</tbody>`;
      det.appendChild(table);
      container.appendChild(det);
    }
  }

  /**
   * Weekday × hour punchcard heatmap (sequential green ramp, div grid).
   * values: 7×24 numbers (ms). rowLabels: 7. format(v) for tooltip.
   */
  function punchcard(container, values, rowLabels, format) {
    const max = Math.max(...values.flat(), 1);
    const wrap = document.createElement('div');
    wrap.className = 'punch';
    wrap.style.gridTemplateColumns = `44px repeat(24, 1fr)`;
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', 'Listening heatmap by weekday and hour of day');

    for (let r = 0; r < 7; r++) {
      const lab = document.createElement('div');
      lab.className = 'p-lab'; lab.textContent = rowLabels[r];
      wrap.appendChild(lab);
      for (let c = 0; c < 24; c++) {
        const v = values[r][c];
        const cell = document.createElement('div');
        cell.className = 'p-cell';
        if (v > 0) {
          const t = v / max; // 0..1
          const idx = Math.min(SEQ.length - 1, Math.floor(t * SEQ.length));
          cell.style.background = SEQ[idx];
        }
        attachTip(cell, () => [`${rowLabels[r]} · ${Stats.fmtHour(c)}`, format(v)]);
        wrap.appendChild(cell);
      }
    }
    // hour labels row
    wrap.appendChild(document.createElement('div'));
    for (let c = 0; c < 24; c++) {
      const lab = document.createElement('div');
      lab.className = 'p-clab';
      lab.textContent = (c % 6 === 0) ? Stats.fmtHour(c) : '';
      wrap.appendChild(lab);
    }
    container.appendChild(wrap);

    const legend = document.createElement('div');
    legend.className = 'punch-legend';
    legend.innerHTML = `<span>less</span>` +
      SEQ.map(cLr => `<i style="background:${cLr}"></i>`).join('') + `<span>more</span>`;
    container.appendChild(legend);
  }

  /**
   * Stacked columns for part-to-whole over time (e.g. genres per year).
   * periods: [label]; series: [{label, color, values[]}] parallel to periods.
   */
  function stackedColumns(container, periods, series, opts = {}) {
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

    // legend — required for two or more series
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    legend.innerHTML = series.map(s =>
      `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
    container.appendChild(legend);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    if (opts.ariaLabel) svg.setAttribute('aria-label', opts.ariaLabel);

    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxV / ticks) * i;
      const y = padT + plotH - (v / maxV) * plotH;
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', padL); line.setAttribute('x2', W - padR);
      line.setAttribute('y1', y); line.setAttribute('y2', y);
      line.setAttribute('stroke', i === 0 ? AXIS : GRID);
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      if (i > 0) {
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', padL - 6); t.setAttribute('y', y + 3.5);
        t.setAttribute('text-anchor', 'end');
        t.setAttribute('fill', MUTED); t.setAttribute('font-size', '10');
        t.textContent = fmt(v);
        svg.appendChild(t);
      }
    }

    periods.forEach((label, i) => {
      const x = padL + slot * i + (slot - barW) / 2;
      const g = document.createElementNS(svgNS, 'g');
      let cum = 0;
      const topIdx = [...series].reverse().find(s => (s.values[i] || 0) > 0);
      for (const s of series) {
        const v = s.values[i] || 0;
        if (v <= 0) { continue; }
        const segH = (v / maxV) * plotH;
        const yTop = padT + plotH - ((cum + v) / maxV) * plotH;
        const isTop = s === topIdx;
        const drawH = Math.max(1, segH - (isTop ? 0 : 2)); // 2px surface gap between segments
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', isTop
          ? colPath(x, yTop, barW, segH)
          : `M${x},${yTop + 2} h${barW} v${drawH} h${-barW} Z`);
        p.setAttribute('fill', s.color);
        g.appendChild(p);
        cum += v;
      }
      const hit = document.createElementNS(svgNS, 'rect');
      hit.setAttribute('x', padL + slot * i); hit.setAttribute('y', padT);
      hit.setAttribute('width', slot); hit.setAttribute('height', plotH);
      hit.setAttribute('fill', 'transparent');
      g.appendChild(hit);
      attachTip(g, () => [label,
        series.filter(s => (s.values[i] || 0) > 0)
          .map(s => `${s.label}: ${fmt(s.values[i])}`).join('\n') || 'nothing']);
      svg.appendChild(g);

      const tick = opts.tickEvery ? opts.tickEvery(i, label) : label;
      if (tick != null) {
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', padL + slot * i + slot / 2);
        t.setAttribute('y', H - 8);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', MUTED); t.setAttribute('font-size', '10');
        t.textContent = tick;
        svg.appendChild(t);
      }
    });

    const fig = document.createElement('figure');
    fig.className = 'chart';
    fig.appendChild(svg);
    container.appendChild(fig);

    // table-view twin
    const det = document.createElement('details');
    det.className = 'chart-table';
    det.innerHTML = `<summary>View as table</summary>`;
    const table = document.createElement('table');
    table.innerHTML =
      `<thead><tr><th>${esc(opts.periodLabel || 'Period')}</th>${series.map(s => `<th class="num">${esc(s.label)}</th>`).join('')}</tr></thead>` +
      `<tbody>${periods.map((label, i) => `<tr><td>${esc(label)}</td>${series.map(s => `<td class="num">${esc(fmt(s.values[i] || 0))}</td>`).join('')}</tr>`).join('')}</tbody>`;
    det.appendChild(table);
    container.appendChild(det);
  }

  /* Catmull-Rom → cubic bezier through points [[x,y],…] */
  function smoothPath(pts) {
    if (pts.length < 3) return 'M' + pts.map(p => p.join(',')).join(' L');
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  const hexLuma = hex => {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  };

  /**
   * Streamgraph (centered stacked area) for composition over time.
   * periods: [label]; series: [{label, color, values[]}] parallel to periods.
   * Values are only readable via tooltip + table twin, so both are built in.
   */
  function streamgraph(container, periods, series, opts = {}) {
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

    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    legend.innerHTML = series.map(s =>
      `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('');
    container.appendChild(legend);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    if (opts.ariaLabel) svg.setAttribute('aria-label', opts.ariaLabel);

    // bands, bottom to top
    series.forEach((s, k) => {
      const topPts = periods.map((_, i) => [xAt(i), yOf(k + 1, i)]);
      const botPts = periods.map((_, i) => [xAt(i), yOf(k, i)]).reverse();
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', `${smoothPath(topPts)} L${botPts[0][0]},${botPts[0][1]} ${smoothPath(botPts).replace(/^M[-\d.,]+/, '')} Z`);
      path.setAttribute('fill', s.color);
      svg.appendChild(path);
    });

    // 2px surface strokes on internal boundaries separate the bands
    for (let k = 1; k < series.length; k++) {
      const line = document.createElementNS(svgNS, 'path');
      line.setAttribute('d', smoothPath(periods.map((_, i) => [xAt(i), yOf(k, i)])));
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke', SURFACE);
      line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
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
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', x);
      t.setAttribute('y', (yOf(k, best) + yOf(k + 1, best)) / 2 + 4);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', hexLuma(s.color) > 0.6 ? '#0b0b0b' : '#ffffff');
      t.setAttribute('font-size', '12');
      t.setAttribute('font-weight', '600');
      t.textContent = s.label;
      svg.appendChild(t);
    });

    // per-period hover + x ticks
    periods.forEach((label, i) => {
      const slotW = plotW / Math.max(1, n - 1);
      const hit = document.createElementNS(svgNS, 'rect');
      hit.setAttribute('x', xAt(i) - slotW / 2); hit.setAttribute('y', padT);
      hit.setAttribute('width', slotW); hit.setAttribute('height', plotH);
      hit.setAttribute('fill', 'transparent');
      attachTip(hit, () => [label,
        series.filter(s => (s.values[i] || 0) > 0)
          .map(s => `${s.label}: ${fmt(s.values[i])}`).join('\n') || 'nothing']);
      svg.appendChild(hit);
      const tick = opts.tickEvery ? opts.tickEvery(i, label) : label;
      if (tick != null) {
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', xAt(i)); t.setAttribute('y', H - 8);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('fill', MUTED); t.setAttribute('font-size', '10');
        t.textContent = tick;
        svg.appendChild(t);
      }
    });

    const fig = document.createElement('figure');
    fig.className = 'chart';
    fig.appendChild(svg);
    container.appendChild(fig);

    // table-view twin — the honest numbers behind the pretty bands
    const det = document.createElement('details');
    det.className = 'chart-table';
    det.innerHTML = `<summary>View as table</summary>`;
    const table = document.createElement('table');
    table.innerHTML =
      `<thead><tr><th>${esc(opts.periodLabel || 'Period')}</th>${series.map(s => `<th class="num">${esc(s.label)}</th>`).join('')}</tr></thead>` +
      `<tbody>${periods.map((label, i) => `<tr><td>${esc(label)}</td>${series.map(s => `<td class="num">${esc(fmt(s.values[i] || 0))}</td>`).join('')}</tr>`).join('')}</tbody>`;
    det.appendChild(table);
    container.appendChild(det);
  }

  /**
   * Radar with 0..1 axes. layers: [{label, color, values[]}] — the first
   * layer is the subject, later layers are de-emphasized references.
   */
  function radar(container, axes, layers, opts = {}) {
    const W = 440, H = 310;
    const cx = W / 2, cy = H / 2 + 4, R = 108;
    const n = axes.length;
    const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (v, i) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
    const fmt = opts.formatValue || (v => v > 0 && v * 100 < 0.5 ? '<1%' : `${Math.round(v * 100)}%`);

    if (layers.length > 1) {
      const legend = document.createElement('div');
      legend.className = 'chart-legend';
      legend.innerHTML = layers.map(l =>
        `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`).join('');
      container.appendChild(legend);
    }

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    if (opts.ariaLabel) svg.setAttribute('aria-label', opts.ariaLabel);

    // recessive rings + spokes
    for (const rv of [0.5, 1]) {
      const ring = document.createElementNS(svgNS, 'circle');
      ring.setAttribute('cx', cx); ring.setAttribute('cy', cy);
      ring.setAttribute('r', R * rv);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', GRID);
      ring.setAttribute('stroke-width', '1');
      svg.appendChild(ring);
    }
    axes.forEach((_, i) => {
      const [x, y] = pt(1, i);
      const spoke = document.createElementNS(svgNS, 'line');
      spoke.setAttribute('x1', cx); spoke.setAttribute('y1', cy);
      spoke.setAttribute('x2', x); spoke.setAttribute('y2', y);
      spoke.setAttribute('stroke', GRID);
      spoke.setAttribute('stroke-width', '1');
      svg.appendChild(spoke);
    });

    // polygons, references first so the subject sits on top
    [...layers].reverse().forEach(l => {
      const pts = axes.map((_, i) => pt(Math.max(0.02, Math.min(1, l.values[i] || 0)), i));
      const poly = document.createElementNS(svgNS, 'path');
      poly.setAttribute('d', 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' L') + ' Z');
      poly.setAttribute('fill', l.color);
      poly.setAttribute('fill-opacity', '0.10');
      poly.setAttribute('stroke', l.color);
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);
    });

    // subject vertices: markers with a surface ring + generous hover targets
    const subject = layers[0];
    axes.forEach((axis, i) => {
      const v = Math.max(0.02, Math.min(1, subject.values[i] || 0));
      const [x, y] = pt(v, i);
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      dot.setAttribute('r', '4');
      dot.setAttribute('fill', subject.color);
      dot.setAttribute('stroke', SURFACE);
      dot.setAttribute('stroke-width', '2');
      svg.appendChild(dot);
      const hit = document.createElementNS(svgNS, 'circle');
      hit.setAttribute('cx', x); hit.setAttribute('cy', y);
      hit.setAttribute('r', '14');
      hit.setAttribute('fill', 'transparent');
      attachTip(hit, () => [axis,
        layers.map(l => `${l.label}: ${fmt(l.values[i] || 0)}`).join('\n')]);
      svg.appendChild(hit);
    });

    // axis labels just outside the outer ring
    axes.forEach((axis, i) => {
      const c = Math.cos(ang(i)), sN = Math.sin(ang(i));
      const [x, y] = [cx + c * (R + 14), cy + sN * (R + 14)];
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y + (sN > 0.5 ? 8 : sN < -0.5 ? -2 : 4));
      t.setAttribute('text-anchor', Math.abs(c) < 0.35 ? 'middle' : c > 0 ? 'start' : 'end');
      t.setAttribute('fill', SECONDARY);
      t.setAttribute('font-size', '12');
      t.textContent = axis;
      svg.appendChild(t);
    });

    const fig = document.createElement('figure');
    fig.className = 'chart chart--radar';
    fig.appendChild(svg);
    container.appendChild(fig);

    // table twin with the exact values
    const det = document.createElement('details');
    det.className = 'chart-table';
    det.innerHTML = `<summary>View as table</summary>`;
    const table = document.createElement('table');
    table.innerHTML =
      `<thead><tr><th></th>${layers.map(l => `<th class="num">${esc(l.label)}</th>`).join('')}</tr></thead>` +
      `<tbody>${axes.map((axis, i) => `<tr><td>${esc(axis)}</td>${layers.map(l => `<td class="num">${esc(fmt(l.values[i] || 0))}</td>`).join('')}</tr>`).join('')}</tbody>`;
    det.appendChild(table);
    container.appendChild(det);
  }

  /**
   * Radial 24-hour listening clock. hours: 24 × {ms, plays}.
   * Radius encodes time listened; midnight at the top.
   */
  function radialClock(container, hours, opts = {}) {
    const W = 400, H = 320;
    const cx = W / 2, cy = H / 2, r0 = 42, R = 132;
    const maxV = Math.max(...hours.map(h => h.ms), 1);
    const fmt = opts.format || (h => `${h.ms}`);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.ariaLabel || 'Listening by hour of day, radial clock');

    const arcPt = (r, aDeg) => {
      const a = ((aDeg - 90) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };

    // recessive rings
    for (const r of [r0, (r0 + R) / 2, R]) {
      const ring = document.createElementNS(svgNS, 'circle');
      ring.setAttribute('cx', cx); ring.setAttribute('cy', cy);
      ring.setAttribute('r', r);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', GRID);
      ring.setAttribute('stroke-width', '1');
      svg.appendChild(ring);
    }

    hours.forEach((h, i) => {
      const a0 = i * 15 + 1.2, a1 = (i + 1) * 15 - 1.2; // 15° per hour, ~2px gap
      const val = h.ms / maxV;
      const r1 = h.ms > 0 ? r0 + Math.max(2, (R - r0) * val) : r0;
      if (h.ms > 0) {
        const [x0i, y0i] = arcPt(r0, a0), [x1i, y1i] = arcPt(r0, a1);
        const [x1o, y1o] = arcPt(r1, a1), [x0o, y0o] = arcPt(r1, a0);
        const wedge = document.createElementNS(svgNS, 'path');
        wedge.setAttribute('d',
          `M${x0i.toFixed(1)},${y0i.toFixed(1)} A${r0},${r0} 0 0 1 ${x1i.toFixed(1)},${y1i.toFixed(1)} ` +
          `L${x1o.toFixed(1)},${y1o.toFixed(1)} A${r1.toFixed(1)},${r1.toFixed(1)} 0 0 0 ${x0o.toFixed(1)},${y0o.toFixed(1)} Z`);
        wedge.setAttribute('fill', MARK);
        svg.appendChild(wedge);
      }
      // full-height invisible wedge as the hover target
      const [hx0, hy0] = arcPt(r0, a0), [hx1, hy1] = arcPt(r0, a1);
      const [Hx1, Hy1] = arcPt(R, a1), [Hx0, Hy0] = arcPt(R, a0);
      const hit = document.createElementNS(svgNS, 'path');
      hit.setAttribute('d',
        `M${hx0},${hy0} A${r0},${r0} 0 0 1 ${hx1},${hy1} L${Hx1},${Hy1} A${R},${R} 0 0 0 ${Hx0},${Hy0} Z`);
      hit.setAttribute('fill', 'transparent');
      attachTip(hit, () => [opts.hourLabel ? opts.hourLabel(i) : String(i), fmt(h)]);
      svg.appendChild(hit);
    });

    // compass hour labels outside the dial
    [[0, '12am'], [6, '6am'], [12, '12pm'], [18, '6pm']].forEach(([hr, label]) => {
      const [x, y] = arcPt(R + 13, hr * 15 + 7.5 - 7.5); // at the hour line
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', x); t.setAttribute('y', y + (hr === 0 ? -2 : hr === 12 ? 10 : 4));
      t.setAttribute('text-anchor', hr === 6 ? 'start' : hr === 18 ? 'end' : 'middle');
      t.setAttribute('fill', MUTED);
      t.setAttribute('font-size', '11');
      t.textContent = label;
      svg.appendChild(t);
    });

    const fig = document.createElement('figure');
    fig.className = 'chart chart--radial';
    fig.appendChild(svg);
    container.appendChild(fig);

    if (opts.tableCols) {
      const det = document.createElement('details');
      det.className = 'chart-table';
      det.innerHTML = `<summary>View as table</summary>`;
      const table = document.createElement('table');
      table.innerHTML =
        `<thead><tr><th>${esc(opts.tableCols[0])}</th><th class="num">${esc(opts.tableCols[1])}</th></tr></thead>` +
        `<tbody>${hours.map((h, i) => `<tr><td>${esc(opts.hourLabel ? opts.hourLabel(i) : i)}</td><td class="num">${esc(fmt(h))}</td></tr>`).join('')}</tbody>`;
      det.appendChild(table);
      container.appendChild(det);
    }
  }

  /**
   * Concentric ratio rings: each entity's count as an arc vs its previous-
   * period value (the last.fm "music ratio"). rows: [{label, cur, prev, color}].
   */
  function ratioRings(container, rows, opts = {}) {
    const size = 250;
    const cx = size / 2, cy = size / 2;
    const width = 16, gap = 7;
    const fmt = opts.formatValue || (v => String(v));

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.ariaLabel || 'Unique counts vs the previous period');
    svg.style.maxWidth = '250px';
    svg.style.margin = '0 auto';
    svg.style.display = 'block';

    rows.forEach((row, i) => {
      const r = size / 2 - 10 - i * (width + gap);
      const c = 2 * Math.PI * r;
      const frac = row.prev > 0 ? Math.min(1, row.cur / row.prev) : 1;
      const track = document.createElementNS(svgNS, 'circle');
      track.setAttribute('cx', cx); track.setAttribute('cy', cy); track.setAttribute('r', r);
      track.setAttribute('fill', 'none');
      track.setAttribute('stroke', TRACK);
      track.setAttribute('stroke-width', width);
      svg.appendChild(track);
      const arc = document.createElementNS(svgNS, 'circle');
      arc.setAttribute('cx', cx); arc.setAttribute('cy', cy); arc.setAttribute('r', r);
      arc.setAttribute('fill', 'none');
      arc.setAttribute('stroke', row.color);
      arc.setAttribute('stroke-width', width);
      arc.setAttribute('stroke-linecap', frac < 1 ? 'round' : 'butt');
      arc.setAttribute('stroke-dasharray', `${(frac * c).toFixed(1)} ${c.toFixed(1)}`);
      arc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
      svg.appendChild(arc);
      const hit = document.createElementNS(svgNS, 'circle');
      hit.setAttribute('cx', cx); hit.setAttribute('cy', cy); hit.setAttribute('r', r);
      hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', width + gap);
      attachTip(hit, () => [row.label, `${fmt(row.cur)} vs ${fmt(row.prev)} ${opts.prevLabel || 'before'}`]);
      svg.appendChild(hit);
    });

    const fig = document.createElement('figure');
    fig.className = 'chart';
    fig.appendChild(svg);
    container.appendChild(fig);

    const stats = document.createElement('div');
    stats.className = 'ratio-stats';
    stats.innerHTML = rows.map(row => `
      <div>
        <div class="r-title"><i style="background:${row.color}"></i>${esc(row.label)}</div>
        <div class="r-value">${esc(fmt(row.cur))}</div>
        <div class="r-sub">vs ${esc(fmt(row.prev))} ${esc(opts.prevLabel || '')}</div>
      </div>`).join('');
    container.appendChild(stats);
  }

  /**
   * Artist constellation: force-directed graph of artists linked by how often
   * they play back to back. nodes: [{id, ms, color}]; edges: [{a, b, w}] as
   * node indices. Layout is deterministic (no randomness) so it's stable.
   */
  function constellation(container, nodes, edges, opts = {}) {
    const W = 800, H = 500, PAD = 56;
    const N = nodes.length;
    const fmt = opts.format || (n => String(n.ms));

    // deterministic sunflower init
    const pos = nodes.map((_, i) => {
      const a = i * 2.39996; const r = 40 + 150 * Math.sqrt((i + 1) / N);
      return [W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r];
    });

    // Fruchterman–Reingold with edge weights
    const k = Math.sqrt((W * H) / N) * 0.7;
    const maxW = Math.max(...edges.map(e => e.w), 1);
    for (let it = 0; it < 260; it++) {
      const temp = 24 * (1 - it / 260) + 1.5;
      const disp = pos.map(() => [0, 0]);
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
          const d = Math.max(12, Math.hypot(dx, dy));
          const f = (k * k) / d / d;
          disp[i][0] += dx * f; disp[i][1] += dy * f;
          disp[j][0] -= dx * f; disp[j][1] -= dy * f;
        }
      }
      for (const e of edges) {
        const dx = pos[e.a][0] - pos[e.b][0], dy = pos[e.a][1] - pos[e.b][1];
        const d = Math.max(12, Math.hypot(dx, dy));
        const f = (d * d) / k * (0.35 + 0.65 * (e.w / maxW)) / d * 0.02;
        disp[e.a][0] -= dx * f; disp[e.a][1] -= dy * f;
        disp[e.b][0] += dx * f; disp[e.b][1] += dy * f;
      }
      for (let i = 0; i < N; i++) {
        const d = Math.max(1, Math.hypot(disp[i][0], disp[i][1]));
        const step = Math.min(d, temp);
        pos[i][0] += (disp[i][0] / d) * step;
        pos[i][1] += (disp[i][1] / d) * step;
        // gentle centering
        pos[i][0] += (W / 2 - pos[i][0]) * 0.004;
        pos[i][1] += (H / 2 - pos[i][1]) * 0.004;
      }
    }

    // fit to the viewport
    const xs = pos.map(p => p[0]), ys = pos.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (W - PAD * 2) / Math.max(1, maxX - minX);
    const sy = (H - PAD * 2) / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    pos.forEach(p => {
      p[0] = PAD + (p[0] - minX) * s + (W - PAD * 2 - (maxX - minX) * s) / 2;
      p[1] = PAD + (p[1] - minY) * s + (H - PAD * 2 - (maxY - minY) * s) / 2;
    });

    const maxMs = Math.max(...nodes.map(n => n.ms), 1);
    const radius = n => 5 + 15 * Math.sqrt(n.ms / maxMs);

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.ariaLabel || 'Artist constellation');

    for (const e of edges) {
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', pos[e.a][0].toFixed(1)); line.setAttribute('y1', pos[e.a][1].toFixed(1));
      line.setAttribute('x2', pos[e.b][0].toFixed(1)); line.setAttribute('y2', pos[e.b][1].toFixed(1));
      line.setAttribute('stroke', EDGE);
      line.setAttribute('stroke-width', (1 + 3 * (e.w / maxW)).toFixed(1));
      line.setAttribute('stroke-opacity', (0.25 + 0.5 * (e.w / maxW)).toFixed(2));
      svg.appendChild(line);
    }

    const strongest = i => {
      let best = null;
      for (const e of edges) {
        if (e.a !== i && e.b !== i) continue;
        if (!best || e.w > best.w) best = e;
      }
      return best ? nodes[best.a === i ? best.b : best.a].id : null;
    };

    nodes.forEach((n, i) => {
      const r = radius(n);
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('cx', pos[i][0].toFixed(1)); dot.setAttribute('cy', pos[i][1].toFixed(1));
      dot.setAttribute('r', r.toFixed(1));
      dot.setAttribute('fill', n.color || MARK);
      dot.setAttribute('stroke', SURFACE);
      dot.setAttribute('stroke-width', '2');
      svg.appendChild(dot);
      const hit = document.createElementNS(svgNS, 'circle');
      hit.setAttribute('cx', pos[i][0].toFixed(1)); hit.setAttribute('cy', pos[i][1].toFixed(1));
      hit.setAttribute('r', Math.max(14, r + 4).toFixed(1));
      hit.setAttribute('fill', 'transparent');
      attachTip(hit, () => {
        const pal = strongest(i);
        return [n.id, fmt(n) + (pal ? `\nmost played alongside: ${pal}` : '')];
      });
      svg.appendChild(hit);
    });

    // labels for the biggest nodes only; the rest are reachable by hover
    const labelIdx = nodes.map((n, i) => [n.ms, i]).sort((x, y) => y[0] - x[0])
      .slice(0, opts.maxLabels || 14).map(([, i]) => i);
    for (const i of labelIdx) {
      const t = document.createElementNS(svgNS, 'text');
      t.setAttribute('x', pos[i][0].toFixed(1));
      t.setAttribute('y', (pos[i][1] - radius(nodes[i]) - 5).toFixed(1));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', SECONDARY);
      t.setAttribute('font-size', '11');
      t.setAttribute('font-weight', '600');
      t.setAttribute('paint-order', 'stroke');
      t.setAttribute('stroke', SURFACE);
      t.setAttribute('stroke-width', '3');
      t.textContent = nodes[i].id;
      svg.appendChild(t);
    }

    const fig = document.createElement('figure');
    fig.className = 'chart';
    fig.appendChild(svg);
    container.appendChild(fig);

    // the pairs behind the picture
    const det = document.createElement('details');
    det.className = 'chart-table';
    det.innerHTML = `<summary>Most-paired artists</summary>`;
    const table = document.createElement('table');
    const topPairs = [...edges].sort((x, y) => y.w - x.w).slice(0, 20);
    table.innerHTML =
      `<thead><tr><th>Pair</th><th class="num">Back-to-back plays</th></tr></thead>` +
      `<tbody>${topPairs.map(e => `<tr><td>${esc(nodes[e.a].id)} ↔ ${esc(nodes[e.b].id)}</td><td class="num">${e.w.toLocaleString('en-US')}</td></tr>`).join('')}</tbody>`;
    det.appendChild(table);
    container.appendChild(det);
  }

  /** Tiny inline bar sparkline for table rows. Returns an HTML string. */
  function sparklineHTML(values, { w = 104, h = 24 } = {}) {
    if (!values || !values.length) return '';
    const max = Math.max(...values, 1);
    const n = values.length;
    const slot = w / n;
    const bw = Math.max(1, Math.min(8, slot - 1));
    const bars = values.map((v, i) => {
      const bh = Math.max(v > 0 ? 1.5 : 0, (v / max) * (h - 2));
      if (!bh) return '';
      const x = (i * slot + (slot - bw) / 2).toFixed(1);
      return `<rect x="${x}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${MARK}"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${bars}</svg>`;
  }

  /** GitHub-style daily calendar for one year. dayMap: 'YYYY-MM-DD' -> {ms}. */
  function calendar(container, dayMap, yearNum, format) {
    const jan1 = new Date(yearNum, 0, 1);
    const offset = (jan1.getDay() + 6) % 7; // Mon=0
    const dec31 = new Date(yearNum, 11, 31);
    const daysInYear = Math.round((dec31 - jan1) / 86_400_000) + 1;
    const weeks = Math.ceil((daysInYear + offset) / 7);

    let max = 1;
    const vals = [];
    for (let i = 0; i < daysInYear; i++) {
      const d = new Date(yearNum, 0, 1 + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const ms = dayMap.get(key)?.ms || 0;
      vals.push({ d, key, ms });
      if (ms > max) max = ms;
    }

    const scroll = document.createElement('div');
    scroll.style.overflowX = 'auto';
    const wrap = document.createElement('div');
    wrap.className = 'cal';
    wrap.style.gridTemplateColumns = `30px repeat(${weeks}, 1fr)`;
    wrap.style.minWidth = '660px';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', `Daily listening calendar for ${yearNum}`);

    // month labels row
    const mlabs = new Array(weeks).fill('');
    ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].forEach((name, m) => {
      const wk = Math.floor(((new Date(yearNum, m, 1) - jan1) / 86_400_000 + offset) / 7);
      if (wk < weeks && !mlabs[wk]) mlabs[wk] = name;
    });
    wrap.appendChild(document.createElement('div'));
    for (let w = 0; w < weeks; w++) {
      const lab = document.createElement('div');
      lab.className = 'cal-mlab';
      lab.textContent = mlabs[w];
      wrap.appendChild(lab);
    }

    const DAY_LABS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
    for (let r = 0; r < 7; r++) {
      const lab = document.createElement('div');
      lab.className = 'p-lab';
      lab.textContent = DAY_LABS[r];
      wrap.appendChild(lab);
      for (let w = 0; w < weeks; w++) {
        const idx = w * 7 + r - offset;
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        if (idx >= 0 && idx < daysInYear) {
          const { d, ms } = vals[idx];
          if (ms > 0) {
            const t = ms / max;
            cell.style.background = SEQ[Math.min(SEQ.length - 1, Math.floor(t * SEQ.length))];
          }
          attachTip(cell, () => [
            d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            format(ms),
          ]);
        } else {
          cell.style.visibility = 'hidden';
        }
        wrap.appendChild(cell);
      }
    }
    scroll.appendChild(wrap);
    container.appendChild(scroll);
  }

  return { columnChart, stackedColumns, streamgraph, radar, radialClock, ratioRings, constellation, punchcard, sparklineHTML, calendar, attachTip, theme: () => TH, get MARK() { return TH.mark; } };
})();
