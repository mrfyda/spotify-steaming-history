/* Charts · radial — radar fingerprint, 24-hour clock dial, and ratio rings. */
(() => {
  const { esc, svgEl, mkSvg, figWrap, legendRow, tableTwin } = Charts.util;
  const attachTip = Charts.attachTip;

  /**
   * Radar with 0..1 axes. layers: [{label, color, values[]}] — the first
   * layer is the subject, later layers are de-emphasized references.
   */
  Charts.radar = (container, axes, layers, opts = {}) => {
    const th = Charts.theme();
    const W = 440, H = 310;
    const cx = W / 2, cy = H / 2 + 4, R = 108;
    const n = axes.length;
    const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pt = (v, i) => [cx + Math.cos(ang(i)) * R * v, cy + Math.sin(ang(i)) * R * v];
    const fmt = opts.formatValue || (v => v > 0 && v * 100 < 1 ? '<1%' : `${Math.round(v * 100)}%`);

    if (layers.length > 1) legendRow(container, layers);

    const svg = mkSvg(W, H, opts.ariaLabel);

    // recessive rings + spokes
    for (const rv of [0.5, 1]) {
      svg.appendChild(svgEl('circle', { cx, cy, r: R * rv, fill: 'none', stroke: th.grid, 'stroke-width': '1' }));
    }
    axes.forEach((_, i) => {
      const [x, y] = pt(1, i);
      svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: th.grid, 'stroke-width': '1' }));
    });

    // polygons, references first so the subject sits on top
    [...layers].reverse().forEach(l => {
      const pts = axes.map((_, i) => pt(Math.max(0.02, Math.min(1, l.values[i] || 0)), i));
      svg.appendChild(svgEl('path', {
        d: 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' L') + ' Z',
        fill: l.color, 'fill-opacity': '0.10',
        stroke: l.color, 'stroke-width': '2', 'stroke-linejoin': 'round',
      }));
    });

    // subject vertices: markers with a surface ring + generous hover targets
    const subject = layers[0];
    axes.forEach((axis, i) => {
      const v = Math.max(0.02, Math.min(1, subject.values[i] || 0));
      const [x, y] = pt(v, i);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: '4', fill: subject.color, stroke: th.surface, 'stroke-width': '2' }));
      const hit = svgEl('circle', { cx: x, cy: y, r: '14', fill: 'transparent' });
      attachTip(hit, () => [axis,
        layers.map(l => `${l.label}: ${fmt(l.values[i] || 0)}`).join('\n')]);
      svg.appendChild(hit);
    });

    // axis labels just outside the outer ring
    axes.forEach((axis, i) => {
      const c = Math.cos(ang(i)), sN = Math.sin(ang(i));
      const t = svgEl('text', {
        x: cx + c * (R + 14),
        y: cy + sN * (R + 14) + (sN > 0.5 ? 8 : sN < -0.5 ? -2 : 4),
        'text-anchor': Math.abs(c) < 0.35 ? 'middle' : c > 0 ? 'start' : 'end',
        fill: th.secondary, 'font-size': '12',
      });
      t.textContent = axis;
      svg.appendChild(t);
    });

    figWrap(container, svg, 'chart chart--radar');

    tableTwin(container,
      `<thead><tr><th></th>${layers.map(l => `<th class="num">${esc(l.label)}</th>`).join('')}</tr></thead>`,
      `<tbody>${axes.map((axis, i) => `<tr><td>${esc(axis)}</td>${layers.map(l => `<td class="num">${esc(fmt(l.values[i] || 0))}</td>`).join('')}</tr>`).join('')}</tbody>`);
  };

  /**
   * Radial 24-hour listening clock. hours: 24 × {ms, plays}.
   * Radius encodes time listened; midnight at the top.
   */
  Charts.radialClock = (container, hours, opts = {}) => {
    const th = Charts.theme();
    const W = 400, H = 320;
    const cx = W / 2, cy = H / 2, r0 = 42, R = 132;
    const maxV = Math.max(...hours.map(h => h.ms), 1);
    const fmt = opts.format || (h => `${h.ms}`);

    const svg = mkSvg(W, H, opts.ariaLabel || 'Listening by hour of day, radial clock');

    const arcPt = (r, aDeg) => {
      const a = ((aDeg - 90) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };

    // recessive rings
    for (const r of [r0, (r0 + R) / 2, R]) {
      svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke: th.grid, 'stroke-width': '1' }));
    }

    hours.forEach((h, i) => {
      const a0 = i * 15 + 1.2, a1 = (i + 1) * 15 - 1.2; // 15° per hour, ~2px gap
      const r1 = h.ms > 0 ? r0 + Math.max(2, (R - r0) * (h.ms / maxV)) : r0;
      if (h.ms > 0) {
        const [x0i, y0i] = arcPt(r0, a0), [x1i, y1i] = arcPt(r0, a1);
        const [x1o, y1o] = arcPt(r1, a1), [x0o, y0o] = arcPt(r1, a0);
        svg.appendChild(svgEl('path', {
          d: `M${x0i.toFixed(1)},${y0i.toFixed(1)} A${r0},${r0} 0 0 1 ${x1i.toFixed(1)},${y1i.toFixed(1)} ` +
             `L${x1o.toFixed(1)},${y1o.toFixed(1)} A${r1.toFixed(1)},${r1.toFixed(1)} 0 0 0 ${x0o.toFixed(1)},${y0o.toFixed(1)} Z`,
          fill: th.mark,
        }));
      }
      // full-height invisible wedge as the hover target
      const [hx0, hy0] = arcPt(r0, a0), [hx1, hy1] = arcPt(r0, a1);
      const [Hx1, Hy1] = arcPt(R, a1), [Hx0, Hy0] = arcPt(R, a0);
      const hit = svgEl('path', {
        d: `M${hx0},${hy0} A${r0},${r0} 0 0 1 ${hx1},${hy1} L${Hx1},${Hy1} A${R},${R} 0 0 0 ${Hx0},${Hy0} Z`,
        fill: 'transparent',
      });
      attachTip(hit, () => [opts.hourLabel ? opts.hourLabel(i) : String(i), fmt(h)]);
      svg.appendChild(hit);
    });

    // compass hour labels outside the dial
    [[0, '12am'], [6, '6am'], [12, '12pm'], [18, '6pm']].forEach(([hr, label]) => {
      const [x, y] = arcPt(R + 13, hr * 15);
      const t = svgEl('text', {
        x, y: y + (hr === 0 ? -2 : hr === 12 ? 10 : 4),
        'text-anchor': hr === 6 ? 'start' : hr === 18 ? 'end' : 'middle',
        fill: th.muted, 'font-size': '11',
      });
      t.textContent = label;
      svg.appendChild(t);
    });

    figWrap(container, svg, 'chart chart--radial');

    if (opts.tableCols) {
      tableTwin(container,
        `<thead><tr><th>${esc(opts.tableCols[0])}</th><th class="num">${esc(opts.tableCols[1])}</th></tr></thead>`,
        `<tbody>${hours.map((h, i) => `<tr><td>${esc(opts.hourLabel ? opts.hourLabel(i) : i)}</td><td class="num">${esc(fmt(h))}</td></tr>`).join('')}</tbody>`);
    }
  };

  /**
   * Concentric ratio rings: each entity's count as an arc vs its previous-
   * period value (the last.fm "music ratio"). rows: [{label, cur, prev, color}].
   */
  Charts.ratioRings = (container, rows, opts = {}) => {
    const th = Charts.theme();
    const size = 250;
    const cx = size / 2, cy = size / 2;
    const width = 16, gap = 7;
    const fmt = opts.formatValue || (v => String(v));

    const svg = mkSvg(size, size, opts.ariaLabel || 'Unique counts vs the previous period');
    svg.style.maxWidth = '250px';
    svg.style.margin = '0 auto';
    svg.style.display = 'block';

    rows.forEach((row, i) => {
      const r = size / 2 - 10 - i * (width + gap);
      const c = 2 * Math.PI * r;
      const frac = row.prev > 0 ? Math.min(1, row.cur / row.prev) : 1;
      svg.appendChild(svgEl('circle', { cx, cy, r, fill: 'none', stroke: th.track, 'stroke-width': width }));
      svg.appendChild(svgEl('circle', {
        cx, cy, r, fill: 'none', stroke: row.color, 'stroke-width': width,
        'stroke-linecap': frac < 1 ? 'round' : 'butt',
        'stroke-dasharray': `${(frac * c).toFixed(1)} ${c.toFixed(1)}`,
        transform: `rotate(-90 ${cx} ${cy})`,
      }));
      const hit = svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'transparent', 'stroke-width': width + gap });
      attachTip(hit, () => [row.label, `${fmt(row.cur)} vs ${fmt(row.prev)} ${opts.prevLabel || 'before'}`]);
      svg.appendChild(hit);
    });

    figWrap(container, svg);

    const stats = document.createElement('div');
    stats.className = 'ratio-stats';
    stats.innerHTML = rows.map(row => `
      <div>
        <div class="r-title"><i style="background:${row.color}"></i>${esc(row.label)}</div>
        <div class="r-value">${esc(fmt(row.cur))}</div>
        <div class="r-sub">vs ${esc(fmt(row.prev))} ${esc(opts.prevLabel || '')}</div>
      </div>`).join('');
    container.appendChild(stats);
  };
})();
