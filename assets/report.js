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

    // keep the UI in sync with a background enrichment run:
    // re-render on start (instant feedback), after the quick burst (artwork
    // appears within seconds), then periodically and at the end
    Enrich.setOnUpdate(s => {
      if (document.getElementById('report').hidden) return;
      const milestone = !s.running || s.done === s.total || s.done === 0 || s.done === 12 || s.done % 120 === 0;
      if (milestone) {
        const y = window.scrollY;
        renderBody(allPlays);
        window.scrollTo(0, y);
      } else {
        const counter = document.querySelector('.enrich-bar b');
        if (counter) counter.textContent = `Fetching genres & artwork… ${s.done}/${s.total}`;
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

    /* ---- overview KPIs ---- */
    const ov = section(body, 'Overview',
      `${fmtDate(a.firstTs)} – ${fmtDate(a.lastTs)} · streams are plays of 30 seconds or more`);
    const kpis = el('div', 'kpis');
    const kpi = (label, value, sub) => kpis.appendChild(el('div', 'kpi',
      `<div class="k-label">${esc(label)}</div><div class="k-value">${esc(value)}</div>${sub ? `<div class="k-sub">${esc(sub)}</div>` : ''}`));
    kpi('Time listened', fmtMs(a.totalMs), delta(a.totalMs, prev?.totalMs) || fmtMsLong(a.totalMs));
    kpi('Streams', fmtInt(a.streams), delta(a.streams, prev?.streams) || `${fmtInt(Math.round(a.streams / Math.max(1, a.activeDays)))} per active day`);
    kpi('Artists', fmtInt(a.uniqueArtists), delta(a.uniqueArtists, prev?.uniqueArtists));
    kpi('Tracks', fmtInt(a.uniqueTracks), delta(a.uniqueTracks, prev?.uniqueTracks));
    kpi('Albums', fmtInt(a.uniqueAlbums), delta(a.uniqueAlbums, prev?.uniqueAlbums));
    kpi('Active days', fmtInt(a.activeDays), delta(a.activeDays, prev?.activeDays) || `of ${fmtInt(a.daySpan)} in range`);
    if (a.podcastMs > 0) kpi('Podcast time', fmtMs(a.podcastMs), delta(a.podcastMs, prev?.podcastMs) || `${a.uniqueShows} shows`);
    ov.appendChild(kpis);

    /* ---- listening over time ---- */
    const time = section(body, 'Listening over time');
    const grid1 = el('div', 'card-grid');
    time.appendChild(grid1);

    const monthsCard = card(grid1, currentYear == null ? 'Hours per month' : `Hours per month, ${rangeLabel}`);
    monthsCard.style.gridColumn = '1 / -1';
    const monthData = buildMonthSeries(a);
    const prevByMonth = m => hasPrev ? (prev.byMonth.get(`${currentYear - 1}-${m.key.slice(5)}`)?.ms || 0) / 3.6e6 : null;
    Charts.columnChart(monthsCard, monthData.map(m => ({
      label: m.short,
      value: m.ms / 3.6e6,
      prev: prevByMonth(m),
      tipTitle: m.long,
      tipSub: `${fmtMs(m.ms)} · ${fmtInt(m.plays)} streams` +
        (hasPrev ? ` · ${currentYear - 1}: ${fmtMs((prevByMonth(m) || 0) * 3.6e6)}` : ''),
    })), {
      formatValue: v => fmtInt(v),
      tickEvery: (i, label) => monthData[i].tick,
      ariaLabel: 'Hours listened per month',
      tableCols: ['Month', 'Listening'],
      compare: hasPrev ? { labels: [String(currentYear), String(currentYear - 1)] } : null,
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

    if (currentYear != null) {
      const calCard = card(time, `Every day of ${rangeLabel}`, 'daily listening calendar');
      calCard.style.marginTop = '12px';
      Charts.calendar(calCard, a.byDay, currentYear, ms => ms ? fmtMsLong(ms) : 'nothing');
    }

    /* ---- discovery ---- */
    if (a.discoveryRate != null && monthData.length > 1) {
      const disc = section(body, 'Discovery',
        `${fmtPct(a.discoveryRate)} of your streams were tracks you'd never played before` +
        (currentYear == null ? '' : ` · ${fmtInt(a.newArtists ?? 0)} new artists` +
          (a.newArtistShare != null ? ` · ${fmtPct(a.newArtistShare)} of streams went to artists discovered this year` : '')));
      const dCard = card(disc, 'New music over time', 'share of each month’s streams that were first-time tracks');
      Charts.columnChart(dCard, monthData.map(m => ({
        label: m.short,
        value: m.musicPlays ? (m.newTracks / m.musicPlays) * 100 : 0,
        tipTitle: m.long,
        tipSub: `${fmtInt(m.newTracks)} first-time tracks · ${fmtPct(m.musicPlays ? m.newTracks / m.musicPlays : 0)} of streams`,
      })), {
        height: 170,
        formatValue: v => `${Math.round(v)}%`,
        tickEvery: (i) => monthData[i].tick,
        ariaLabel: 'Share of first-time tracks per month',
        tableCols: ['Month', 'First-time tracks'],
      });
    }

    /* ---- eras timeline ---- */
    if (a.eras.length > 1) {
      const erasSec = section(body, currentYear == null ? 'Your eras' : `${rangeLabel}, month by month`,
        currentYear == null ? 'the artist who defined each year' : 'the artist who defined each month');
      const eCard = card(erasSec);
      const maxEra = Math.max(...a.eras.map(e => e.ms), 1);
      eCard.innerHTML += `<table><thead><tr><th>${currentYear == null ? 'Year' : 'Month'}</th><th>Artist</th><th class="t-bar-wrap"></th><th class="num">Time</th></tr></thead>
        <tbody>${a.eras.map(e => `
          <tr>
            <td class="rank" style="width:60px">${currentYear == null ? esc(e.period) : esc(MONTH_SHORT[Number(e.period.slice(5)) - 1])}</td>
            <td class="t-name">${esc(e.artist)}</td>
            <td class="t-bar-wrap"><div class="t-bar-track"><div class="t-bar" style="width:${Math.max(1, Math.round((e.ms / maxEra) * 100))}%"></div></div></td>
            <td class="num">${fmtMs(e.ms)}</td>
          </tr>`).join('')}</tbody></table>`;
    }

    /* ---- top lists ---- */
    const artistEntries = top(a.byArtist, 'ms');
    const artistSection = topList(body, 'Top artists', artistEntries, {
      name: e => e.key,
      sub: e => [Enrich.get(e.key)?.g, `${fmtInt(e.tracks || 0)} tracks`].filter(Boolean).join(' · '),
      art: e => Enrich.get(e.key)?.a,
      spark: e => e.series,
      sparkTitle: currentYear == null ? 'Trend by year' : 'Trend by month',
      rangeLabel,
    });
    enrichControls(artistSection, artistEntries, allPlays);
    genresSection(body, artistEntries);
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

    /* ---- records & habits ---- */
    const mkRecords = (sec) => {
      const grid = el('div', 'records');
      sec.appendChild(grid);
      return (title, value, sub) => grid.appendChild(el('div', 'record',
        `<div class="r-title">${esc(title)}</div>` +
        `<div class="r-value">${esc(value)}</div>${sub ? `<div class="r-sub">${esc(sub)}</div>` : ''}`));
    };

    const record = mkRecords(section(body, 'Records'));
    if (a.peakDay) record('Biggest day', fmtDate(a.peakDay.day, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }), `${fmtMsLong(a.peakDay.ms)} · ${fmtInt(a.peakDay.plays)} streams`);
    if (a.longestStreak?.days > 1) record('Longest streak', `${fmtInt(a.longestStreak.days)} days in a row`, `ending ${fmtDate(a.longestStreak.end)}`);
    if (a.sessions?.longest) record('Longest session', fmtMsLong(a.sessions.longest.ms), `${fmtInt(a.sessions.longest.tracks)} streams · ${fmtDate(a.sessions.longest.start)}`);
    if (a.loopRecord) record('Most loops in one day', `${a.loopRecord.count}× “${a.loopRecord.track}”`, `${a.loopRecord.artist} · ${fmtDate(a.loopRecord.day)}`);
    if (a.topReplay) record('Most rewound track', `“${a.topReplay.track}”`, `${a.topReplay.artist} · rewound ${fmtInt(a.topReplay.replays)} times`);
    if (a.evergreen) record('Longest-running favorite', `“${a.evergreen.track}”`, `${a.evergreen.artist} · in rotation for ${fmtInt(a.evergreen.span / 86_400_000 / 365 * 10) / 10} years`);
    if (a.comeback) record('Biggest comeback', a.comeback.artist, `${fmtInt(a.comeback.gap / 86_400_000 / 30)} months of silence, then back on ${fmtDate(a.comeback.end)}`);
    if (a.oneHit) record('One-song artist', a.oneHit.artist, `“${a.oneHit.track}” is ${fmtPct(a.oneHit.share)} of their ${fmtInt(a.oneHit.plays)} plays`);
    if (a.nightArtist) record('Late-night companion', a.nightArtist.artist, `${fmtMs(a.nightArtist.ms)} between midnight and 5am`);
    if (a.newArtists != null) record('New artists discovered', fmtInt(a.newArtists), a.topNewArtist ? `biggest: ${a.topNewArtist.artist}` : null);
    if (a.firstTrack) record(currentYear ? `First track of ${rangeLabel}` : 'First track on record', `“${a.firstTrack.track}”`, `${a.firstTrack.artist} · ${fmtDate(a.firstTrack.ts)}`);

    const habit = mkRecords(section(body, 'Habits'));
    habit('Average per active day', fmtMsLong(a.totalMs / Math.max(1, a.activeDays)), `${fmtPct(a.activeDays / a.daySpan)} of days had listening`);
    habit('Busiest hour', `${fmtHour(a.peakHour)}–${fmtHour((a.peakHour + 1) % 24)}`, `${fmtPct(a.byHour[a.peakHour].ms / Math.max(1, a.totalMs))} of all listening`);
    if (a.sessions?.count > 1) habit('Listening sessions', fmtInt(a.sessions.count), `about ${fmtMsLong(a.sessions.avgMs)} each`);
    if (a.startChosenRate != null) habit('Plays you started yourself', fmtPct(a.startChosenRate), 'the rest flowed in from autoplay and queues');
    if (a.skipRate != null) habit('Skip rate', fmtPct(a.skipRate), a.mostSkipped ? `most skipped: “${a.mostSkipped.track}” (${a.mostSkipped.skips}×)` : null);
    if (a.completionRate != null) habit('Tracks played to the end', fmtPct(a.completionRate), 'of plays with a known ending');
    if (a.shuffleRate != null) habit('Shuffle', fmtPct(a.shuffleRate), 'of plays with shuffle on');
    if (a.offlineRate != null && a.offlineRate > 0) habit('Offline listening', fmtPct(a.offlineRate), 'of plays while offline');
    if (a.incognitoCount > 0) habit('Private sessions', fmtInt(a.incognitoCount) + ' plays', 'listened in incognito mode');

    /* ---- recently played ---- */
    const rangePlays = currentYear == null ? allPlays
      : allPlays.filter(p => new Date(p.ts).getFullYear() === currentYear);
    const recent = rangePlays.filter(p => p.ms >= Stats.STREAM_MS).slice(-15).reverse();
    if (recent.length) {
      const rs = section(body, 'Recently played', currentYear == null ? 'your last 15 streams' : `the last 15 streams of ${rangeLabel}`);
      const c = card(rs);
      c.innerHTML += `<table><tbody>${recent.map(p => `
        <tr>
          <td><div class="t-name">${esc(p.track || p.episode)}</div><div class="t-sub">${esc(p.kind === 'music' ? p.artist : p.show)}</div></td>
          <td class="num">${fmtMs(p.ms)}</td>
          <td class="num t-sub">${esc(new Date(p.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} ${esc(new Date(p.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase())}</td>
        </tr>`).join('')}</tbody></table>`;
    }

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
        musicPlays: e.musicPlays || 0, newTracks: e.newTracks || 0,
      });
      d.setMonth(d.getMonth() + 1);
    }
    // if only one year is shown, label every 2nd month at most for space
    if (!manyYears) out.forEach((m, i) => { m.tick = (out.length > 14 && i % 2) ? null : m.short; });
    return out;
  }

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

    let shown = 20;
    let filtered = entries;

    const maxMs = entries[0] ? entries[0][sortBy] : 1;

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
      const rows = filtered.slice(0, shown).map((e, i) => `
        <tr>
          <td class="rank">${filtered === entries ? i + 1 : ''}</td>
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
      shown = 20;
      draw();
    });
    more.addEventListener('click', () => { shown += 50; draw(); });
    draw();
    return s;
  }

  /* opt-in iTunes enrichment (genre + artwork), scaled to the whole library */
  function enrichControls(sectionEl, artistEntries, allPlays) {
    // rank order; skip one-off artists that would dominate a long run for little coverage
    const names = artistEntries.filter(e => e.plays >= 3 || e.ms >= 10 * 60_000).map(e => e.key);
    const pendingCount = Enrich.pending(names).length;
    if (!pendingCount && !Enrich.state.running) return;

    const bar = el('div', 'enrich-bar');
    sectionEl.insertBefore(bar, sectionEl.querySelector('.card'));
    const s = Enrich.state;
    if (s.running) {
      const remaining = s.total - s.done;
      const eta = remaining > 15 ? ` · about ${Math.ceil(remaining * 3.2 / 60)} min left` : '';
      bar.innerHTML = `<span class="enrich-note"><b>Fetching genres &amp; artwork… ${s.done}/${s.total}</b>${eta}
        · keep browsing, progress is saved as it goes</span>
        <button class="chip" id="enrichStop">Stop</button>`;
      bar.querySelector('#enrichStop').addEventListener('click', () => Enrich.stop());
    } else {
      bar.innerHTML = `<button class="chip" id="enrichBtn">Add genres &amp; artwork</button>
        <span class="enrich-note">${s.error ? `<b>${esc(s.error)}</b> ` : ''}Looks up ${fmtInt(pendingCount)} artists on
        Apple's iTunes Search API. The first 30 are quick; the rest keep loading in the background
        (Apple allows about 20 lookups a minute). Only artist names are sent; nothing about your
        listening leaves the browser, and you can stop or resume anytime.</span>`;
      bar.querySelector('#enrichBtn').addEventListener('click', () => Enrich.run(names));
    }

    // copyable diagnostic trace, for when lookups fail
    if (Enrich.hasLog()) {
      const details = el('details', 'enrich-log',
        `<summary>Lookup log${s.error ? ' (something went wrong — copy this if reporting a bug)' : ''}</summary>
         <button class="chip" id="copyLog">Copy log</button>
         <pre>${esc(Enrich.getLog())}</pre>`);
      if (s.error) details.open = true;
      bar.after(details);
      const copyBtn = details.querySelector('#copyLog');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(Enrich.getLog());
          copyBtn.textContent = 'Copied ✓';
          setTimeout(() => { copyBtn.textContent = 'Copy log'; }, 1600);
        } catch {
          // clipboard blocked: select the text so a manual copy works
          const range = document.createRange();
          range.selectNodeContents(details.querySelector('pre'));
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
          copyBtn.textContent = 'Select + copy manually';
        }
      });
    }
  }

  /* genre share across ALL enriched artists, weighted by listening time */
  function genresSection(parent, artistEntries) {
    const byGenre = new Map();
    let coveredMs = 0, coveredArtists = 0, totalMs = 0;
    for (const e of artistEntries) {
      totalMs += e.ms;
      const g = Enrich.get(e.key)?.g;
      if (!g) continue;
      byGenre.set(g, (byGenre.get(g) || 0) + e.ms);
      coveredMs += e.ms; coveredArtists++;
    }
    if (byGenre.size < 2) return;
    const s = section(parent, 'Genres',
      `from ${fmtInt(coveredArtists)} artists covering ${fmtPct(coveredMs / Math.max(1, totalMs))} of your listening, via iTunes`);
    const c = card(s);
    let rows = [...byGenre.entries()].sort((x, y) => y[1] - x[1]);
    if (rows.length > 13) {
      const tail = rows.slice(12);
      rows = rows.slice(0, 12);
      rows.push([`Other (${fmtInt(tail.length)} genres)`, tail.reduce((sum, [, ms]) => sum + ms, 0)]);
    }
    const maxMs = rows[0][1];
    c.innerHTML += `<table><thead><tr><th>Genre</th><th class="t-bar-wrap"></th><th class="num">Share</th><th class="num">Time</th></tr></thead>
      <tbody>${rows.map(([g, ms]) => `
        <tr>
          <td class="t-name">${esc(g)}</td>
          <td class="t-bar-wrap"><div class="t-bar-track"><div class="t-bar" style="width:${Math.max(1, Math.round((ms / maxMs) * 100))}%"></div></div></td>
          <td class="num">${fmtPct(ms / coveredMs)}</td>
          <td class="num">${fmtMs(ms)}</td>
        </tr>`).join('')}</tbody></table>`;
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

  function countryName(code) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
    } catch { return code; }
  }

  return { render };
})();
