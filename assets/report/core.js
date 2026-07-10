/* Report · core — the exhaustive, last.fm-style view.
 *
 * This file owns the year filter, the render loop, and the shared helpers.
 * The sections themselves live in assets/report/*.js: each file pushes a
 * renderer onto Report._sections at load time, and renderBody calls them
 * in script order with (body, ctx). ctx carries everything a section needs:
 *   a          aggregate for the current range      (Stats.aggregate)
 *   prev       aggregate for the previous year, or null
 *   hasPrev    prev exists and is non-empty
 *   delta      (cur, before) -> "↑ 12% vs 2023" or null
 *   monthData  month series padded to the full range
 *   rangeLabel 'all time' or '2024' · rangePlays: plays in range
 *   currentYear, allPlays
 */
const Report = (() => {

  const { fmtInt, fmtMs, fmtPct } = Stats;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let currentYear = null; // null = all time

  function render(allPlays) {
    renderFilters(allPlays);
    renderBody(allPlays);

    // keep the UI in sync with a background enrichment run:
    // re-render on start (instant feedback), after the quick burst (artwork
    // appears within seconds), then periodically and at the end
    Enrich.setOnUpdate(s => {
      if (document.hidden) return; // shed while backgrounded; re-rendered on return
      if (document.getElementById('report').hidden) return;
      const milestone = !s.running || s.done === s.total || s.done === 0 || s.done === 12 || s.done % 120 === 0;
      if (milestone) {
        const y = window.scrollY;
        renderBody(allPlays);
        window.scrollTo(0, y);
      } else {
        document.querySelectorAll('.enrich-counter').forEach(n => { n.textContent = `${s.done}/${s.total}`; });
      }
    });
  }

  function renderFilters(allPlays) {
    const el = document.getElementById('reportFilters');
    el.innerHTML = '';
    const mk = (label, year) => {
      const b = document.createElement('button');
      b.className = 'chip' + ((year === currentYear) ? ' active' : '');
      b.textContent = label;
      b.onclick = () => { currentYear = year; render(allPlays); window.scrollTo({ top: 0 }); };
      el.appendChild(b);
    };
    mk('All time', null);
    for (const y of Stats.years(allPlays).slice().reverse()) mk(String(y), y);
  }

  function renderBody(allPlays) {
    const body = document.getElementById('reportBody');
    body.innerHTML = '';
    const a = Stats.aggregate(allPlays, { year: currentYear });
    if (a.empty) { body.appendChild(el('p', 'empty-note', 'No plays in this range.')); return; }

    const rangeLabel = currentYear == null ? 'all time' : String(currentYear);
    const rangePlays = currentYear == null ? allPlays
      : allPlays.filter(p => new Date(p.ts).getFullYear() === currentYear);

    // previous year, for last.fm-style vs-comparisons
    const prev = currentYear != null ? Stats.aggregate(allPlays, { year: currentYear - 1 }) : null;
    const hasPrev = prev && !prev.empty;
    const delta = (cur, before) => {
      if (!hasPrev || !before) return null;
      const pct = (cur - before) / before;
      if (!isFinite(pct)) return null;
      const arrow = pct >= 0 ? '↑' : '↓';
      return `${arrow} ${fmtPct(Math.abs(pct))} vs ${currentYear - 1}`;
    };

    const ctx = {
      allPlays, a, prev, hasPrev, delta,
      rangeLabel, rangePlays, currentYear,
      monthData: buildMonthSeries(a),
    };
    for (const renderSection of Report._sections) renderSection(body, ctx);
  }

  /* ---------- DOM helpers ---------- */

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function section(parent, title, sub) {
    const s = el('section', 'section');
    s.appendChild(el('h2', null, esc(title)));
    if (sub) s.appendChild(el('div', 'section-sub', esc(sub)));
    parent.appendChild(s);
    return s;
  }

  function card(parent, title, sub) {
    const c = el('div', 'card');
    if (title) c.appendChild(el('h3', null, esc(title)));
    if (sub) c.appendChild(el('div', 'card-sub', esc(sub)));
    parent.appendChild(c);
    return c;
  }

  /* month series padded to full range so gaps show */
  function buildMonthSeries(a) {
    const out = [];
    const start = new Date(a.firstTs); start.setDate(1);
    const end = new Date(a.lastTs);
    const d = new Date(start.getFullYear(), start.getMonth(), 1);
    const manyYears = (end.getFullYear() - start.getFullYear()) >= 2;
    while (d <= end) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const e = a.byMonth.get(key) || { ms: 0, plays: 0 };
      out.push({
        key,
        short: MONTH_SHORT[d.getMonth()],
        long: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`,
        tick: manyYears
          ? (d.getMonth() === 0 ? String(d.getFullYear()) : null)
          : MONTH_SHORT[d.getMonth()],
        ms: e.ms, plays: e.plays,
        musicPlays: e.musicPlays || 0, newTracks: e.newTracks || 0,
        musicMs: e.musicMs || 0, podcastMs: e.podcastMs || 0,
      });
      d.setMonth(d.getMonth() + 1);
    }
    // if only one year is shown, label every 2nd month at most for space
    if (!manyYears) out.forEach((m, i) => { m.tick = (out.length > 14 && i % 2) ? null : m.short; });
    return out;
  }

  /* ---------- shared table builders ---------- */

  /* generic searchable, expandable top list */
  function topList(parent, title, entries, { name, sub, sortBy = 'ms', rangeLabel, spark, sparkTitle, art }) {
    const s = section(parent, title, `${fmtInt(entries.length)} total · ${rangeLabel}`);
    const c = card(s);

    const tools = el('div', 'list-tools');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = `Search ${title.toLowerCase()}…`;
    search.setAttribute('aria-label', `Search ${title}`);
    tools.appendChild(search);
    c.appendChild(tools);

    const tableWrap = el('div');
    c.appendChild(tableWrap);
    const more = el('button', 'show-more', 'Show more');
    c.appendChild(more);

    let shown = 10;
    let filtered = entries;

    const maxMs = entries[0] ? entries[0][sortBy] : 1;
    // search results keep their overall rank — that's the answer being looked up
    const rankOf = new Map(entries.map((e, i) => [e, i + 1]));

    function draw() {
      const cols = 5 + (spark ? 1 : 0);
      // once any row has artwork, every row reserves the slot so names stay aligned
      const anyArt = art && filtered.slice(0, shown).some(e => art(e));
      const artCell = e => {
        if (!anyArt) return '';
        const src = art(e);
        return src
          ? `<img class="t-art" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
          : '<div class="t-art t-art--ph"></div>';
      };
      const rows = filtered.slice(0, shown).map(e => `
        <tr>
          <td class="rank">${rankOf.get(e)}</td>
          <td><div class="t-cell">${artCell(e)}<div><div class="t-name">${esc(name(e))}</div>${sub ? `<div class="t-sub">${esc(sub(e))}</div>` : ''}</div></div></td>
          ${spark ? `<td class="spark-cell">${Charts.sparklineHTML(spark(e))}</td>` : ''}
          <td class="t-bar-wrap"><div class="t-bar-track"><div class="t-bar" style="width:${Math.max(1, Math.round((e[sortBy] / maxMs) * 100))}%"></div></div></td>
          <td class="num">${fmtInt(e.plays)}</td>
          <td class="num">${fmtMs(e.ms)}</td>
        </tr>`).join('');
      tableWrap.innerHTML = `<table>
        <thead><tr><th></th><th>Name</th>${spark ? `<th class="spark-cell">${esc(sparkTitle || '')}</th>` : ''}<th class="t-bar-wrap"></th><th class="num">Streams</th><th class="num">Time</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="${cols}" class="empty-note">No matches.</td></tr>`}</tbody>
      </table>`;
      more.hidden = shown >= filtered.length;
      more.textContent = `Show more (${fmtInt(Math.min(50, filtered.length - shown))} of ${fmtInt(filtered.length - shown)} remaining)`;
    }

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      filtered = q
        ? entries.filter(e => (name(e) || '').toLowerCase().includes(q) || (sub && (sub(e) || '').toLowerCase().includes(q)))
        : entries;
      shown = 10;
      draw();
    });
    more.addEventListener('click', () => { shown += 50; draw(); });
    draw();

    Share.button(c, `${title} ${rangeLabel}`, () => Share.listCard({
      title,
      sub: rangeLabel,
      rows: entries.slice(0, 10).map(e => ({
        name: name(e),
        sub: sub ? sub(e) : '',
        value: sortBy === 'plays' ? `${fmtInt(e.plays)} plays` : fmtMs(e.ms),
      })),
    }));
    return s;
  }

  /* share button for a card whose figure holds a single SVG chart;
   * the card's HTML legend (if any) is re-drawn onto the image */
  function shareChart(cardEl, title, sub) {
    const svg = cardEl.querySelector('figure.chart svg');
    if (!svg) return;
    Share.button(cardEl, title, () => {
      const legend = [...cardEl.querySelectorAll('.chart-legend span')].map(sp => ({
        label: sp.textContent,
        color: sp.querySelector('i')?.style.background || '#888',
      }));
      return Share.chartCard({ title, sub, legend }, svg);
    });
  }

  function shareTable(entries, totalMs, label) {
    const t = document.createElement('table');
    t.innerHTML = `<thead><tr><th>Name</th><th class="t-bar-wrap"></th><th class="num">Share</th><th class="num">Time</th></tr></thead>
      <tbody>${entries.map(e => `
        <tr>
          <td class="t-name">${esc(label(e.key))}</td>
          <td class="t-bar-wrap"><div class="t-bar-track"><div class="t-bar" style="width:${Math.max(1, Math.round((e.ms / (entries[0].ms || 1)) * 100))}%"></div></div></td>
          <td class="num">${fmtPct(e.ms / (totalMs || 1))}</td>
          <td class="num">${fmtMs(e.ms)}</td>
        </tr>`).join('')}</tbody>`;
    return t;
  }

  /* small share table for labelled counts */
  function countTable(rows) {
    const shown = rows.filter(([, cnt]) => cnt > 0);
    const total = shown.reduce((sum, [, cnt]) => sum + cnt, 0) || 1;
    const max = Math.max(...shown.map(([, cnt]) => cnt), 1);
    return `<table><tbody>${shown.map(([label, cnt]) => `
      <tr>
        <td class="t-name">${esc(label)}</td>
        <td class="t-bar-wrap"><div class="t-bar-track"><div class="t-bar" style="width:${Math.max(1, Math.round((cnt / max) * 100))}%"></div></div></td>
        <td class="num">${fmtPct(cnt / total)}</td>
        <td class="num">${fmtInt(cnt)}</td>
      </tr>`).join('')}</tbody></table>`;
  }

  /* take ranked entries until they cover `share` of listening time (bounded) */
  function coverageSlice(entries, share, min, cap) {
    const total = entries.reduce((sum, e) => sum + e.ms, 0) || 1;
    const out = [];
    let acc = 0;
    for (const e of entries) {
      out.push(e);
      acc += e.ms;
      if (out.length >= cap) break;
      if (out.length >= min && acc / total >= share) break;
    }
    return out;
  }

  function countryName(code) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
    } catch { return code; }
  }

  return {
    render,
    _sections: [],
    _h: { el, section, card, esc, WEEKDAYS, MONTH_SHORT, topList, shareTable, countTable, coverageSlice, countryName, shareChart },
  };
})();
