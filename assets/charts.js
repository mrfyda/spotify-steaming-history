/* Charts — small SVG chart helpers following the dataviz mark specs:
 * thin marks, 4px rounded data-ends (square at baseline), hairline solid
 * gridlines, 2px surface gaps, hover tooltips, and a table-view twin.
 */
const Charts = (() => {

  const MARK = '#2a78d6';
  const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']; // light→dark blue ramp (light surface)
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
    const maxV = niceMax(Math.max(...data.map(d => d.value), 0));
    const fmt = opts.formatValue || (v => v.toLocaleString('en-US'));

    const slot = plotW / n;
    const gap = Math.max(2, Math.min(6, slot * 0.25));          // ≥2px surface gap
    const barW = Math.max(1.5, Math.min(24, slot - gap));       // ≤24px thick

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
      line.setAttribute('stroke', i === 0 ? '#c3c2b7' : '#e1e0d9');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      if (i > 0) {
        const t = document.createElementNS(svgNS, 'text');
        t.setAttribute('x', padL - 6); t.setAttribute('y', y + 3.5);
        t.setAttribute('text-anchor', 'end');
        t.setAttribute('fill', '#898781'); t.setAttribute('font-size', '10');
        t.textContent = fmt(v);
        svg.appendChild(t);
      }
    }

    data.forEach((d, i) => {
      const x = padL + slot * i + (slot - barW) / 2;
      const h = maxV ? (d.value / maxV) * plotH : 0;
      const y = padT + plotH - h;

      const g = document.createElementNS(svgNS, 'g');
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
        t.setAttribute('fill', '#898781'); t.setAttribute('font-size', '10');
        t.textContent = tick;
        svg.appendChild(t);
      }
    });

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
      table.innerHTML =
        `<thead><tr><th>${esc(opts.tableCols[0])}</th><th class="num">${esc(opts.tableCols[1])}</th></tr></thead>` +
        `<tbody>${data.map(d => `<tr><td>${esc(d.tipTitle ?? d.label)}</td><td class="num">${esc(d.tipSub ?? fmt(d.value))}</td></tr>`).join('')}</tbody>`;
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

  return { columnChart, punchcard, sparklineHTML, calendar, attachTip, MARK };
})();
