/* Charts · grids — punchcard heatmap, daily calendar, and table sparklines. */
(() => {
  const attachTip = Charts.attachTip;

  /**
   * Weekday × hour punchcard heatmap (sequential ramp, div grid).
   * values: 7×24 numbers (ms). rowLabels: 7. format(v) for tooltip.
   */
  Charts.punchcard = (container, values, rowLabels, format) => {
    const seq = Charts.theme().seq;
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
          cell.style.background = seq[Math.min(seq.length - 1, Math.floor(t * seq.length))];
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
      seq.map(cLr => `<i style="background:${cLr}"></i>`).join('') + `<span>more</span>`;
    container.appendChild(legend);
  };

  /** GitHub-style daily calendar for one year. dayMap: 'YYYY-MM-DD' -> {ms}. */
  Charts.calendar = (container, dayMap, yearNum, format) => {
    const seq = Charts.theme().seq;
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
            cell.style.background = seq[Math.min(seq.length - 1, Math.floor(t * seq.length))];
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
  };

  /** Tiny inline bar sparkline for table rows. Returns an HTML string. */
  Charts.sparklineHTML = (values, { w = 104, h = 24 } = {}) => {
    if (!values || !values.length) return '';
    const mark = Charts.MARK;
    const max = Math.max(...values, 1);
    const n = values.length;
    const slot = w / n;
    const bw = Math.max(1, Math.min(8, slot - 1));
    const bars = values.map((v, i) => {
      const bh = Math.max(v > 0 ? 1.5 : 0, (v / max) * (h - 2));
      if (!bh) return '';
      const x = (i * slot + (slot - bw) / 2).toFixed(1);
      return `<rect x="${x}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${mark}"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${bars}</svg>`;
  };
})();
