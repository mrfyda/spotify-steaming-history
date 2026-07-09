/* Charts · core — shared plumbing for every chart type: theme tokens, the
 * tooltip singleton, and SVG/table builders. Each chart lives in its own
 * file under assets/charts/ and attaches itself to this object.
 *
 * Mark specs (dataviz reference): thin marks, 4px rounded data-ends (square
 * at baseline), hairline solid gridlines, 2px surface gaps, hover tooltips,
 * and a table-view twin so every value is reachable without hover.
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
    grid: '#34332f', axis: '#4f4e49', muted: '#98968e', secondary: '#c3c2b7',
    surface: '#1e1e1d', edge: '#57554f', track: '#32312e',
    gray: '#6f6d67', grayLine: '#8f8d86', otherBand: '#3f3e3a',
  };
  let TH;
  function applyTheme() {
    const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    TH = dark ? DARK : LIGHT;
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

  /* ---------- geometry helpers ---------- */

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

  /* ---------- SVG + DOM builders ---------- */
  const svgNS = 'http://www.w3.org/2000/svg';

  function svgEl(name, attrs = {}) {
    const n = document.createElementNS(svgNS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  }

  function mkSvg(W, H, ariaLabel) {
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
    if (ariaLabel) svg.setAttribute('aria-label', ariaLabel);
    return svg;
  }

  /* hairline gridlines + y tick labels; the baseline gets the axis color */
  function yGrid(svg, { W, padL, padR, padT, plotH, maxV, fmt }) {
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxV / ticks) * i;
      const y = padT + plotH - (v / maxV) * plotH;
      svg.appendChild(svgEl('line', {
        x1: padL, x2: W - padR, y1: y, y2: y,
        stroke: i === 0 ? TH.axis : TH.grid, 'stroke-width': '1',
      }));
      if (i > 0) {
        const t = svgEl('text', { x: padL - 6, y: y + 3.5, 'text-anchor': 'end', fill: TH.muted, 'font-size': '10' });
        t.textContent = fmt(v);
        svg.appendChild(t);
      }
    }
  }

  function xTickLabel(svg, x, y, text) {
    const t = svgEl('text', { x, y, 'text-anchor': 'middle', fill: TH.muted, 'font-size': '10' });
    t.textContent = text;
    svg.appendChild(t);
  }

  function figWrap(container, svg, cls = 'chart') {
    const fig = document.createElement('figure');
    fig.className = cls;
    fig.appendChild(svg);
    container.appendChild(fig);
  }

  /* legends are required for two or more series */
  function legendRow(container, items) {
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    legend.innerHTML = items.map(it => `<span><i style="background:${it.color}"></i>${esc(it.label)}</span>`).join('');
    container.appendChild(legend);
  }

  function tableTwin(container, headHTML, bodyHTML, summary = 'View as table') {
    const det = document.createElement('details');
    det.className = 'chart-table';
    det.innerHTML = `<summary>${esc(summary)}</summary>`;
    const table = document.createElement('table');
    table.innerHTML = headHTML + bodyHTML;
    det.appendChild(table);
    container.appendChild(det);
  }

  /* table twin for period × series data (stacked columns, streamgraph) */
  function seriesTable(container, periods, series, fmt, periodLabel) {
    tableTwin(container,
      `<thead><tr><th>${esc(periodLabel || 'Period')}</th>${series.map(s => `<th class="num">${esc(s.label)}</th>`).join('')}</tr></thead>`,
      `<tbody>${periods.map((label, i) => `<tr><td>${esc(label)}</td>${series.map(s => `<td class="num">${esc(fmt(s.values[i] || 0))}</td>`).join('')}</tr>`).join('')}</tbody>`);
  }

  return {
    theme: () => TH,
    get MARK() { return TH.mark; },
    attachTip,
    util: {
      esc, niceMax, colPath, smoothPath, hexLuma,
      svgEl, mkSvg, yGrid, xTickLabel, figWrap, legendRow, tableTwin, seriesTable,
    },
  };
})();
