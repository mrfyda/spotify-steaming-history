/* Charts · constellation — force-directed graph of artists linked by how
 * often they play back to back. Layout is deterministic (no randomness)
 * so the same data always draws the same picture. */
(() => {
  const { esc, svgEl, mkSvg, figWrap, tableTwin } = Charts.util;
  const attachTip = Charts.attachTip;

  const W = 800, H = 500, PAD = 56;

  /* Fruchterman–Reingold with edge weights, from a sunflower-seed start */
  function layout(nodes, edges) {
    const N = nodes.length;
    const pos = nodes.map((_, i) => {
      const a = i * 2.39996; const r = 40 + 150 * Math.sqrt((i + 1) / N);
      return [W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r];
    });

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
    const s = Math.min((W - PAD * 2) / Math.max(1, maxX - minX), (H - PAD * 2) / Math.max(1, maxY - minY));
    pos.forEach(p => {
      p[0] = PAD + (p[0] - minX) * s + (W - PAD * 2 - (maxX - minX) * s) / 2;
      p[1] = PAD + (p[1] - minY) * s + (H - PAD * 2 - (maxY - minY) * s) / 2;
    });
    return pos;
  }

  /**
   * nodes: [{id, ms, color}]; edges: [{a, b, w}] as node indices.
   */
  Charts.constellation = (container, nodes, edges, opts = {}) => {
    const th = Charts.theme();
    const fmt = opts.format || (n => String(n.ms));
    const pos = layout(nodes, edges);
    const maxW = Math.max(...edges.map(e => e.w), 1);
    const maxMs = Math.max(...nodes.map(n => n.ms), 1);
    const radius = n => 5 + 15 * Math.sqrt(n.ms / maxMs);

    const svg = mkSvg(W, H, opts.ariaLabel || 'Artist constellation');

    for (const e of edges) {
      svg.appendChild(svgEl('line', {
        x1: pos[e.a][0].toFixed(1), y1: pos[e.a][1].toFixed(1),
        x2: pos[e.b][0].toFixed(1), y2: pos[e.b][1].toFixed(1),
        stroke: th.edge,
        'stroke-width': (1 + 3 * (e.w / maxW)).toFixed(1),
        'stroke-opacity': (0.25 + 0.5 * (e.w / maxW)).toFixed(2),
      }));
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
      svg.appendChild(svgEl('circle', {
        cx: pos[i][0].toFixed(1), cy: pos[i][1].toFixed(1), r: r.toFixed(1),
        fill: n.color || th.mark, stroke: th.surface, 'stroke-width': '2',
      }));
      const hit = svgEl('circle', {
        cx: pos[i][0].toFixed(1), cy: pos[i][1].toFixed(1),
        r: Math.max(14, r + 4).toFixed(1), fill: 'transparent',
      });
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
      const t = svgEl('text', {
        x: pos[i][0].toFixed(1),
        y: (pos[i][1] - radius(nodes[i]) - 5).toFixed(1),
        'text-anchor': 'middle',
        fill: th.secondary, 'font-size': '11', 'font-weight': '600',
        'paint-order': 'stroke', stroke: th.surface, 'stroke-width': '3',
      });
      t.textContent = nodes[i].id;
      svg.appendChild(t);
    }

    figWrap(container, svg);

    // the pairs behind the picture
    const topPairs = [...edges].sort((x, y) => y.w - x.w).slice(0, 20);
    tableTwin(container,
      `<thead><tr><th>Pair</th><th class="num">Back-to-back plays</th></tr></thead>`,
      `<tbody>${topPairs.map(e => `<tr><td>${esc(nodes[e.a].id)} ↔ ${esc(nodes[e.b].id)}</td><td class="num">${e.w.toLocaleString('en-US')}</td></tr>`).join('')}</tbody>`,
      'Most-paired artists');
  };
})();
