/* Report — the exhaustive, last.fm-style view. */
const Report = (() => {

  const { fmtInt, fmtMs, fmtMsLong, fmtPct, fmtDate, fmtHour, top } = Stats;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let currentYear = null; // null = all time

  function render(allPlays) {
    renderFilters(allPlays);
    renderBody(allPlays);
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

  function renderBody(allPlays) {
    const body = document.getElementById('reportBody');
    body.innerHTML = '';
    const a = Stats.aggregate(allPlays, { year: currentYear });
    if (a.empty) { body.appendChild(el('p', 'empty-note', 'No plays in this range.')); return; }
    const rangeLabel = currentYear == null ? 'all time' : String(currentYear);

    /* ---- overview KPIs ---- */
    const ov = section(body, 'Overview',
      `${fmtDate(a.firstTs)} – ${fmtDate(a.lastTs)} · streams are plays of 30 seconds or more`);
    const kpis = el('div', 'kpis');
    const kpi = (label, value, sub) => kpis.appendChild(el('div', 'kpi',
      `<div class="k-label">${esc(label)}</div><div class="k-value">${esc(value)}</div>${sub ? `<div class="k-sub">${esc(sub)}</div>` : ''}`));
    kpi('Time listened', fmtMs(a.totalMs), fmtMsLong(a.totalMs));
    kpi('Streams', fmtInt(a.streams), `${fmtInt(Math.round(a.streams / Math.max(1, a.activeDays)))} per active day`);
    kpi('Artists', fmtInt(a.uniqueArtists));
    kpi('Tracks', fmtInt(a.uniqueTracks));
    kpi('Albums', fmtInt(a.uniqueAlbums));
    kpi('Active days', fmtInt(a.activeDays), `of ${fmtInt(a.daySpan)} in range`);
    if (a.podcastMs > 0) kpi('Podcast time', fmtMs(a.podcastMs), `${a.uniqueShows} shows`);
    ov.appendChild(kpis);

    /* ---- listening over time ---- */
    const time = section(body, 'Listening over time');
    const grid1 = el('div', 'card-grid');
    time.appendChild(grid1);

    const monthsCard = card(grid1, currentYear == null ? 'Hours per month' : `Hours per month, ${rangeLabel}`);
    monthsCard.style.gridColumn = '1 / -1';
    const monthData = buildMonthSeries(a);
    Charts.columnChart(monthsCard, monthData.map(m => ({
      label: m.short,
      value: m.ms / 3.6e6,
      tipTitle: m.long,
      tipSub: `${fmtMs(m.ms)} · ${fmtInt(m.plays)} streams`,
    })), {
      formatValue: v => fmtInt(v),
      tickEvery: (i, label) => monthData[i].tick,
      ariaLabel: 'Hours listened per month',
      tableCols: ['Month', 'Listening'],
    });

    const clockCard = card(grid1, 'Listening clock', 'hours listened by time of day');
    Charts.columnChart(clockCard, a.byHour.map((e, h) => ({
      label: String(h),
      value: e.ms / 3.6e6,
      tipTitle: `${fmtHour(h)}–${fmtHour((h + 1) % 24)}`,
      tipSub: `${fmtMs(e.ms)} · ${fmtInt(e.plays)} streams`,
    })), {
      height: 190,
      formatValue: v => fmtInt(v),
      tickEvery: (i) => i % 3 === 0 ? fmtHour(i) : null,
      ariaLabel: 'Hours listened by hour of day',
      tableCols: ['Hour', 'Listening'],
    });

    const wdCard = card(grid1, 'By weekday', 'hours listened per day of week');
    Charts.columnChart(wdCard, a.byWeekday.map((e, i) => ({
      label: WEEKDAYS[i],
      value: e.ms / 3.6e6,
      tipTitle: WEEKDAYS[i],
      tipSub: `${fmtMs(e.ms)} · ${fmtInt(e.plays)} streams`,
    })), {
      height: 190,
      formatValue: v => fmtInt(v),
      ariaLabel: 'Hours listened by weekday',
      tableCols: ['Weekday', 'Listening'],
    });

    const punchCard = card(time, 'When you listen', 'weekday × hour heatmap');
    punchCard.style.marginTop = '12px';
    Charts.punchcard(punchCard, a.punch, WEEKDAYS, v => v ? fmtMs(v) : 'nothing');

    /* ---- top lists ---- */
    topList(body, 'Top artists', top(a.byArtist, 'ms'), {
      name: e => e.key,
      sub: e => `${fmtInt(e.tracks || 0)} tracks`,
      rangeLabel,
    });
    topList(body, 'Top tracks', top(a.byTrack, 'plays'), {
      name: e => e.track,
      sub: e => e.artist,
      sortBy: 'plays',
      rangeLabel,
    });
    topList(body, 'Top albums', top(a.byAlbum, 'ms'), {
      name: e => e.album,
      sub: e => e.artist,
      rangeLabel,
    });
    if (a.byShow.size) {
      topList(body, 'Top podcasts & audiobooks', top(a.byShow, 'ms'), {
        name: e => e.key,
        sub: e => e.kind === 'audiobook' ? 'audiobook' : 'podcast',
        rangeLabel,
      });
    }

    /* ---- records ---- */
    const rec = section(body, 'Records & habits');
    const records = el('div', 'records');
    rec.appendChild(records);
    const record = (icon, title, value, sub) => records.appendChild(el('div', 'record',
      `<div class="r-icon">${icon}</div><div class="r-title">${esc(title)}</div>` +
      `<div class="r-value">${esc(value)}</div>${sub ? `<div class="r-sub">${esc(sub)}</div>` : ''}`));

    if (a.peakDay) record('📅', 'Biggest day', fmtDate(a.peakDay.day, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }), `${fmtMsLong(a.peakDay.ms)} · ${fmtInt(a.peakDay.plays)} streams`);
    if (a.longestStreak?.days > 1) record('🔥', 'Longest streak', `${fmtInt(a.longestStreak.days)} days in a row`, `ending ${fmtDate(a.longestStreak.end)}`);
    if (a.loopRecord) record('🔁', 'Most loops in one day', `${a.loopRecord.count}× “${a.loopRecord.track}”`, `${a.loopRecord.artist} · ${fmtDate(a.loopRecord.day)}`);
    record('⏱️', 'Average per active day', fmtMsLong(a.totalMs / Math.max(1, a.activeDays)), `${fmtPct(a.activeDays / a.daySpan)} of days had listening`);
    if (a.skipRate != null) record('⏭️', 'Skip rate', fmtPct(a.skipRate), a.mostSkipped ? `most skipped: “${a.mostSkipped.track}” (${a.mostSkipped.skips}×)` : null);
    if (a.completionRate != null) record('🏁', 'Tracks played to the end', fmtPct(a.completionRate), 'of plays with a known ending');
    if (a.shuffleRate != null) record('🔀', 'Shuffle', fmtPct(a.shuffleRate), 'of plays with shuffle on');
    if (a.offlineRate != null && a.offlineRate > 0) record('✈️', 'Offline listening', fmtPct(a.offlineRate), 'of plays while offline');
    if (a.newArtists != null) record('🌱', 'New artists discovered', fmtInt(a.newArtists), a.topNewArtist ? `biggest: ${a.topNewArtist.artist}` : null);
    if (a.firstTrack) record('🎬', currentYear ? `First track of ${rangeLabel}` : 'First track on record', `“${a.firstTrack.track}”`, `${a.firstTrack.artist} · ${fmtDate(a.firstTrack.ts)}`);

    /* ---- platforms & countries ---- */
    if (a.platforms.size || a.countries.size) {
      const ctx = section(body, 'Where & how');
      const grid = el('div', 'card-grid');
      ctx.appendChild(grid);
      if (a.platforms.size) {
        const c = card(grid, 'Platforms', 'share of listening time');
        c.appendChild(shareTable(top(a.platforms, 'ms', 8), a.totalMs, k => k));
      }
      if (a.countries.size) {
        const c = card(grid, 'Countries', 'where you streamed from');
        c.appendChild(shareTable(top(a.countries, 'ms', 8), a.totalMs, countryName));
      }
    }
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
      });
      d.setMonth(d.getMonth() + 1);
    }
    // if only one year is shown, label every 2nd month at most for space
    if (!manyYears) out.forEach((m, i) => { m.tick = (out.length > 14 && i % 2) ? null : m.short; });
    return out;
  }

  /* generic searchable, expandable top list */
  function topList(parent, title, entries, { name, sub, sortBy = 'ms', rangeLabel }) {
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

    let shown = 20;
    let filtered = entries;

    const maxMs = entries[0] ? entries[0][sortBy] : 1;

    function draw() {
      const rows = filtered.slice(0, shown).map((e, i) => `
        <tr>
          <td class="rank">${filtered === entries ? i + 1 : ''}</td>
          <td><div class="t-name">${esc(name(e))}</div>${sub ? `<div class="t-sub">${esc(sub(e))}</div>` : ''}</td>
          <td class="t-bar-wrap"><div class="t-bar-track"><div class="t-bar" style="width:${Math.max(1, Math.round((e[sortBy] / maxMs) * 100))}%"></div></div></td>
          <td class="num">${fmtInt(e.plays)}</td>
          <td class="num">${fmtMs(e.ms)}</td>
        </tr>`).join('');
      tableWrap.innerHTML = `<table>
        <thead><tr><th></th><th>Name</th><th></th><th class="num">Streams</th><th class="num">Time</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="empty-note">No matches.</td></tr>`}</tbody>
      </table>`;
      more.hidden = shown >= filtered.length;
      more.textContent = `Show more (${fmtInt(Math.min(50, filtered.length - shown))} of ${fmtInt(filtered.length - shown)} remaining)`;
    }

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      filtered = q
        ? entries.filter(e => (name(e) || '').toLowerCase().includes(q) || (sub && (sub(e) || '').toLowerCase().includes(q)))
        : entries;
      shown = 20;
      draw();
    });
    more.addEventListener('click', () => { shown += 50; draw(); });
    draw();
  }

  function shareTable(entries, totalMs, label) {
    const t = document.createElement('table');
    t.innerHTML = `<thead><tr><th>Name</th><th></th><th class="num">Share</th><th class="num">Time</th></tr></thead>
      <tbody>${entries.map(e => `
        <tr>
          <td class="t-name">${esc(label(e.key))}</td>
          <td class="t-bar-wrap"><div class="t-bar-track"><div class="t-bar" style="width:${Math.max(1, Math.round((e.ms / (entries[0].ms || 1)) * 100))}%"></div></div></td>
          <td class="num">${fmtPct(e.ms / (totalMs || 1))}</td>
          <td class="num">${fmtMs(e.ms)}</td>
        </tr>`).join('')}</tbody>`;
    return t;
  }

  function countryName(code) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
    } catch { return code; }
  }

  return { render };
})();
