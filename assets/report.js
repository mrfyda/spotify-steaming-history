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

    if (a.podcastMs > 0) {
      const splitCard = card(grid1, 'Music vs podcasts', 'hours per month by type');
      splitCard.style.gridColumn = '1 / -1';
      Charts.stackedColumns(splitCard,
        monthData.map(m => m.long),
        [
          { label: 'Music', color: '#2a78d6', values: monthData.map(m => m.musicMs / 3.6e6) },
          { label: 'Podcasts', color: '#1baf7a', values: monthData.map(m => m.podcastMs / 3.6e6) },
        ], {
          height: 180,
          formatValue: v => `${fmtInt(v)} h`,
          tickEvery: (i) => monthData[i].tick,
          ariaLabel: 'Hours per month, music versus podcasts',
          periodLabel: 'Month',
        });
    }

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

    const radialCard = card(grid1, 'Around the clock', 'the same day, as a dial');
    Charts.radialClock(radialCard, a.byHour, {
      format: h => `${fmtMs(h.ms)} · ${fmtInt(h.plays)} streams`,
      hourLabel: i => `${fmtHour(i)}–${fmtHour((i + 1) % 24)}`,
      ariaLabel: 'Radial listening clock',
      tableCols: ['Hour', 'Listening'],
    });
    radialCard.insertAdjacentHTML('beforeend', `
      <div class="clock-stats">
        <div><div class="r-title">Busiest hour</div><div class="r-value">${esc(fmtHour(a.peakHour))}</div></div>
        <div><div class="r-title">In that hour</div><div class="r-value">${esc(fmtMs(a.byHour[a.peakHour].ms))}</div></div>
      </div>`);

    if (hasPrev) {
      const ratioCard = card(grid1, 'Music ratio', `unique tracks, albums and artists vs ${currentYear - 1}`);
      Charts.ratioRings(ratioCard, [
        { label: 'Tracks', cur: a.uniqueTracks, prev: prev.uniqueTracks, color: '#2a78d6' },
        { label: 'Albums', cur: a.uniqueAlbums, prev: prev.uniqueAlbums, color: '#1baf7a' },
        { label: 'Artists', cur: a.uniqueArtists, prev: prev.uniqueArtists, color: '#4a3aa7' },
      ], { formatValue: fmtInt, prevLabel: `in ${currentYear - 1}`, ariaLabel: `Unique counts vs ${currentYear - 1}` });
    }

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

      /* how discoveries began, and what played right before them */
      const how = a.discoveryHow, door = a.discoveryDoorway;
      const howTotal = how.chosen + how.flowed + how.shuffled + how.other;
      const doorTotal = door.dive + door.another + door.podcast + door.opener;
      if (howTotal >= 20 || doorTotal >= 20) {
        const dGrid = el('div', 'card-grid');
        dGrid.style.marginTop = '12px';
        disc.appendChild(dGrid);
        if (howTotal >= 20) {
          const c1 = card(dGrid, 'How discoveries started', 'the press-play moment of each first listen');
          c1.innerHTML += countTable([
            ['You picked it yourself', how.chosen],
            ['Autoplay / queue flowed into it', how.flowed],
            ['Shuffle served it', how.shuffled],
            ['Other', how.other],
          ]);
        }
        if (doorTotal >= 20) {
          const c2 = card(dGrid, 'The doorway', 'what was playing right before each first listen');
          c2.innerHTML += countTable([
            ['Deep in that artist already', door.dive],
            ['Hopping from another artist', door.another],
            ['Right after a podcast', door.podcast],
            ['First play of the session', door.opener],
          ]);
        }
      }
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
    const albumEntries = top(a.byAlbum, 'ms');
    enrichControls(artistSection, artistEntries, albumEntries, allPlays);
    genresSection(body, artistEntries, a);
    decadesSection(body, albumEntries);
    constellationSection(body, artistEntries, rangePlays);
    topList(body, 'Top tracks', top(a.byTrack, 'plays'), {
      name: e => e.track,
      sub: e => e.artist,
      sortBy: 'plays',
      rangeLabel,
    });
    topList(body, 'Top albums', albumEntries, {
      name: e => e.album,
      sub: e => [Enrich.getAlbum(e.artist, e.album)?.y, e.artist].filter(Boolean).join(' · '),
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

    /* ---- listening fingerprint ---- */
    if (a.fingerprint) {
      const fpAxes = Object.keys(a.fingerprint);
      const fpLayers = [{
        label: currentYear == null ? 'All time' : rangeLabel,
        color: Charts.MARK,
        values: fpAxes.map(k => a.fingerprint[k]),
      }];
      if (hasPrev && prev.fingerprint) {
        fpLayers.push({ label: String(currentYear - 1), color: '#8f8d86', values: fpAxes.map(k => prev.fingerprint[k]) });
      }
      const fpSec = section(body, 'Listening fingerprint',
        hasPrev ? `the shape of your listening, ${rangeLabel} vs ${currentYear - 1}` : 'the shape of your listening');
      const fpCard = card(fpSec);
      fpCard.style.maxWidth = '620px';
      Charts.radar(fpCard, fpAxes, fpLayers, { ariaLabel: 'Listening fingerprint' });
      fpCard.appendChild(el('div', 'card-sub',
        'Consistency: days with listening · Discovery: first-time tracks · Replay: streams of tracks you play 10+ times · ' +
        'Concentration: time in your top 10 artists · Variety: distinct artists per stream'));
    }

    /* ---- recently played ---- */
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
        musicMs: e.musicMs || 0, podcastMs: e.podcastMs || 0,
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

  /* opt-in MusicBrainz enrichment: genres for the artists and release years
   * for the albums that make up the bulk of the listening time */
  function enrichControls(sectionEl, artistEntries, albumEntries, allPlays) {
    const artistNames = coverageSlice(artistEntries.filter(e => e.plays >= 2), 0.9, 50, 400).map(e => e.key);
    const albumPairs = coverageSlice(albumEntries.filter(e => e.plays >= 2), 0.85, 40, 250).map(e => [e.artist, e.album]);
    const pendingA = Enrich.pendingArtists(artistNames);
    const pendingAl = Enrich.pendingAlbums(albumPairs);
    const pendingCount = pendingA.length + pendingAl.length;
    if (!pendingCount && !Enrich.state.running) return;

    const bar = el('div', 'enrich-bar');
    sectionEl.insertBefore(bar, sectionEl.querySelector('.card'));
    const s = Enrich.state;
    if (s.running) {
      const remaining = s.total - s.done;
      const eta = remaining > 15 ? ` · about ${Math.ceil(remaining * 1.2 / 60)} min left` : '';
      bar.innerHTML = `<span class="enrich-note"><b>Fetching genres &amp; decades… ${s.done}/${s.total}</b>${eta}
        · keep browsing, progress is saved as it goes</span>
        <button class="chip" id="enrichStop">Stop</button>`;
      bar.querySelector('#enrichStop').addEventListener('click', () => Enrich.stop());
    } else {
      const mins = Math.max(1, Math.ceil(pendingCount * 1.2 / 60));
      bar.innerHTML = `<button class="chip" id="enrichBtn">Add genres &amp; decades</button>
        <span class="enrich-note">${s.error ? `<b>${esc(s.error)}</b> ` : ''}Looks up the ${fmtInt(pendingA.length)} artists
        and ${fmtInt(pendingAl.length)} albums that make up most of your listening on MusicBrainz
        (about ${mins} min at their 1-request-per-second limit; runs in the background). Only artist and
        album names are sent; nothing about your listening leaves the browser. Stop or resume anytime.</span>`;
      bar.querySelector('#enrichBtn').addEventListener('click', () => Enrich.run([
        ...pendingA.map(name => ({ type: 'artist', name })),
        ...pendingAl.map(([artist, album]) => ({ type: 'album', artist, album })),
      ]));
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
  function genresSection(parent, artistEntries, a) {
    const byGenre = new Map();
    const genreSeries = new Map();
    const seriesLen = artistEntries.find(e => e.series)?.series.length || 0;
    let coveredMs = 0, coveredArtists = 0, totalMs = 0;
    for (const e of artistEntries) {
      totalMs += e.ms;
      const g = Enrich.get(e.key)?.g;
      if (!g) continue;
      byGenre.set(g, (byGenre.get(g) || 0) + e.ms);
      coveredMs += e.ms; coveredArtists++;
      if (e.series) {
        let arr = genreSeries.get(g);
        if (!arr) { arr = new Array(seriesLen).fill(0); genreSeries.set(g, arr); }
        e.series.forEach((v, i) => { arr[i] += v; });
      }
    }
    if (byGenre.size < 2) return;
    const s = section(parent, 'Genres',
      `from ${fmtInt(coveredArtists)} artists covering ${fmtPct(coveredMs / Math.max(1, totalMs))} of your listening, via MusicBrainz`);
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

    /* genres over time — the last.fm "top tags" chart, as readable stacked columns */
    if (genreSeries.size >= 2 && seriesLen > 1) {
      const sum = arr => arr.reduce((acc, v) => acc + v, 0);
      const ranked = [...genreSeries.entries()].sort((x, y) => sum(y[1]) - sum(x[1]));
      // validated categorical palette (light), fixed slot order; tail folds into gray "Other"
      const COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7'];
      const chartSeries = ranked.slice(0, 5).map(([g, vals], i) =>
        ({ label: g, color: COLORS[i], values: vals.map(v => v / 3.6e6) }));
      const rest = ranked.slice(5);
      if (rest.length) {
        const other = new Array(seriesLen).fill(0);
        for (const [, vals] of rest) vals.forEach((v, i) => { other[i] += v; });
        chartSeries.push({ label: `Other (${fmtInt(rest.length)})`, color: '#c9c7bf', values: other.map(v => v / 3.6e6) });
      }
      const startYear = new Date(a.firstTs).getFullYear();
      const periods = a.year == null
        ? Array.from({ length: seriesLen }, (_, i) => String(startYear + i))
        : MONTH_SHORT.slice(0, seriesLen);
      const chartCard = card(s, 'Genres over time', `hours per ${a.year == null ? 'year' : 'month'} by genre`);
      chartCard.style.marginTop = '12px';
      const chartOpts = {
        formatValue: v => `${fmtInt(v)} h`,
        ariaLabel: 'Listening hours by genre over time',
        periodLabel: a.year == null ? 'Year' : 'Month',
        tickEvery: a.year == null && seriesLen > 16 ? (i, label) => (i % 2 === 0 ? label : null) : null,
      };
      // the streamgraph needs a few points to flow; fall back to columns below that
      if (seriesLen >= 3) Charts.streamgraph(chartCard, periods, chartSeries, chartOpts);
      else Charts.stackedColumns(chartCard, periods, chartSeries, chartOpts);
    }
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

  /* listening time by album release decade, from enriched albums */
  function decadesSection(parent, albumEntries) {
    const byDecade = new Map();
    let coveredMs = 0, coveredAlbums = 0, totalMs = 0;
    for (const e of albumEntries) {
      totalMs += e.ms;
      const y = Enrich.getAlbum(e.artist, e.album)?.y;
      if (!y) continue;
      const decade = Math.floor(y / 10) * 10;
      byDecade.set(decade, (byDecade.get(decade) || 0) + e.ms);
      coveredMs += e.ms; coveredAlbums++;
    }
    if (byDecade.size < 2) return;
    const s = section(parent, 'Music by decade',
      `by album release year · ${fmtInt(coveredAlbums)} albums covering ${fmtPct(coveredMs / Math.max(1, totalMs))} of your listening, via MusicBrainz`);
    const c = card(s);
    const rows = [...byDecade.entries()].sort((x, y2) => x[0] - y2[0]);
    const maxMs = Math.max(...rows.map(r => r[1]));
    c.innerHTML += `<table><thead><tr><th>Decade</th><th class="t-bar-wrap"></th><th class="num">Share</th><th class="num">Time</th></tr></thead>
      <tbody>${rows.map(([decade, ms]) => `
        <tr>
          <td class="t-name" style="width:70px">${decade}s</td>
          <td class="t-bar-wrap"><div class="t-bar-track"><div class="t-bar" style="width:${Math.max(1, Math.round((ms / maxMs) * 100))}%"></div></div></td>
          <td class="num">${fmtPct(ms / coveredMs)}</td>
          <td class="num">${fmtMs(ms)}</td>
        </tr>`).join('')}</tbody></table>`;
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

  /* artists that appear back to back in the same session, as a graph */
  function constellationSection(parent, artistEntries, rangePlays) {
    const topArtists = artistEntries.slice(0, 30).filter(e => e.plays >= 5);
    if (topArtists.length < 8) return;
    const idx = new Map(topArtists.map((e, i) => [e.key, i]));

    const pairs = new Map();
    let prevArtist = null, prevTs = 0;
    for (const p of rangePlays) {
      if (p.kind !== 'music' || p.ms < Stats.STREAM_MS) continue;
      if (prevArtist && p.ts - prevTs <= 30 * 60_000 && prevArtist !== p.artist) {
        const i = idx.get(prevArtist), j = idx.get(p.artist);
        if (i != null && j != null) {
          const key = i < j ? `${i}|${j}` : `${j}|${i}`;
          pairs.set(key, (pairs.get(key) || 0) + 1);
        }
      }
      prevArtist = p.artist; prevTs = p.ts;
    }
    const edges = [...pairs.entries()]
      .map(([k, w]) => { const [i, j] = k.split('|').map(Number); return { a: i, b: j, w }; })
      .filter(e => e.w >= 2)
      .sort((x, y) => y.w - x.w)
      .slice(0, 70);
    if (edges.length < 5) return;

    // color nodes by genre when enrichment has run
    const genreTotals = new Map();
    for (const e of topArtists) {
      const g = Enrich.get(e.key)?.g;
      if (g) genreTotals.set(g, (genreTotals.get(g) || 0) + e.ms);
    }
    const COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7'];
    const topGenres = [...genreTotals.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([g]) => g);
    const colorOf = name => {
      const g = Enrich.get(name)?.g;
      const gi = g ? topGenres.indexOf(g) : -1;
      return gi >= 0 ? COLORS[gi] : (genreTotals.size ? '#b0aea6' : Charts.MARK);
    };
    const nodes = topArtists.map(e => ({ id: e.key, ms: e.ms, color: colorOf(e.key) }));

    const s = section(parent, 'Artist constellation',
      'your top artists, linked when you play them back to back — related projects cluster together');
    const c = card(s);
    if (topGenres.length) {
      c.innerHTML += `<div class="chart-legend">${topGenres.map((g, i) =>
        `<span><i style="background:${COLORS[i]}"></i>${esc(g)}</span>`).join('')}<span><i style="background:#b0aea6"></i>Other / unknown</span></div>`;
    }
    Charts.constellation(c, nodes, edges, {
      format: n => fmtMs(n.ms),
      ariaLabel: 'Artist constellation: artists linked by back-to-back plays',
    });
  }

  function countryName(code) {
    try {
      return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
    } catch { return code; }
  }

  return { render };
})();
