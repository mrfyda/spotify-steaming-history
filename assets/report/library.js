/* Report · library — the top lists, the opt-in MusicBrainz enrichment
 * controls, and the sections enrichment unlocks (genres, decades, and the
 * artist constellation). */
(() => {
  const { el, section, card, esc, topList, coverageSlice, MONTH_SHORT, shareChart } = Report._h;
  const { fmtInt, fmtMs, fmtPct, top } = Stats;

  Report._sections.push((body, { a, rangeLabel, rangePlays }) => {
    const artistEntries = top(a.byArtist, 'ms');
    const albumEntries = top(a.byAlbum, 'ms');
    const enrich = buildEnrichQueue(artistEntries, albumEntries);

    const artistSection = topList(body, 'Top artists', artistEntries, {
      name: e => e.key,
      sub: e => [Enrich.get(e.key)?.g, `${fmtInt(e.tracks || 0)} tracks`].filter(Boolean).join(' · '),
      art: e => Enrich.get(e.key)?.a,
      spark: e => e.series,
      sparkTitle: a.year == null ? 'Trend by year' : 'Trend by month',
      rangeLabel,
    });
    enrichBar(artistSection, enrich);
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
    genresSection(body, artistEntries, a, enrich);
    decadesSection(body, albumEntries, enrich);
    constellationSection(body, artistEntries, rangePlays);
  });

  /* the artists and albums that make up the bulk of the listening time,
   * as one queue ordered by listening time with both types interleaved —
   * stopping early still fills genres AND decades for what matters most */
  function buildEnrichQueue(artistEntries, albumEntries) {
    const artistCand = coverageSlice(artistEntries.filter(e => e.plays >= 2), 0.9, 50, 400);
    const albumCand = coverageSlice(albumEntries.filter(e => e.plays >= 2), 0.85, 40, 250);
    const pendA = new Set(Enrich.pendingArtists(artistCand.map(e => e.key)));
    const pendAl = new Set(Enrich.pendingAlbums(albumCand.map(e => [e.artist, e.album])).map(p => p.join('\t')));
    const queue = [
      ...artistCand.filter(e => pendA.has(e.key)).map(e => ({ type: 'artist', name: e.key, ms: e.ms })),
      ...albumCand.filter(e => pendAl.has(`${e.artist}\t${e.album}`)).map(e => ({ type: 'album', artist: e.artist, album: e.album, ms: e.ms })),
    ].sort((x, y) => y.ms - x.ms);
    return { queue, artistCount: pendA.size, albumCount: pendAl.size };
  }

  /* opt-in MusicBrainz enrichment: the progress/start bar in Top artists */
  function enrichBar(sectionEl, { queue, artistCount, albumCount }) {
    if (!queue.length && !Enrich.state.running) return;

    const bar = el('div', 'enrich-bar');
    sectionEl.insertBefore(bar, sectionEl.querySelector('.card'));
    const s = Enrich.state;
    if (s.running) {
      const remaining = s.total - s.done;
      const msPerItem = s.done >= 8 ? (Date.now() - s.startedAt) / s.done : null;
      const eta = msPerItem && remaining > 10 ? ` · about ${Math.max(1, Math.ceil((remaining * msPerItem) / 60000))} min left` : '';
      bar.innerHTML = `<span class="enrich-note"><b>Fetching genres &amp; decades… ${s.done}/${s.total}</b>${eta}
        · keep browsing, progress is saved as it goes</span>
        <button class="chip" id="enrichStop">Stop</button>`;
      bar.querySelector('#enrichStop').addEventListener('click', () => Enrich.stop());
    } else {
      const mins = Enrich.estimateMinutes(artistCount, albumCount);
      bar.innerHTML = `<button class="chip enrich-start">Add genres &amp; decades</button>
        <span class="enrich-note">${s.error ? `<b>${esc(s.error)}</b> ` : ''}Looks up the ${fmtInt(artistCount)} artists
        and ${fmtInt(albumCount)} albums that make up most of your listening on MusicBrainz, most-played
        first in batched requests (about ${mins} min; runs in the background). Only artist and album names
        are sent; nothing about your listening leaves the browser. Stop or resume anytime.</span>`;
      bar.querySelector('.enrich-start').addEventListener('click', () => Enrich.run(queue));
    }
  }

  /* when a MusicBrainz-backed section has no data yet, show it anyway with
   * the CTA (or live progress) in its empty state instead of hiding it */
  function enrichEmptyState(parent, title, blurb, { queue }) {
    const s = Enrich.state;
    if (!queue.length && !s.running) return; // nothing left to fetch — data is just too thin
    const sec = section(parent, title, 'via MusicBrainz, if you opt in');
    const c = card(sec);
    if (s.running) {
      c.appendChild(el('p', 'empty-note', `Fetching from MusicBrainz… ${s.done}/${s.total}. This section fills in as results arrive.`));
    } else {
      const wrap = el('div', 'enrich-cta');
      wrap.appendChild(el('p', 'empty-note', esc(blurb)));
      const btn = el('button', 'chip', 'Add genres &amp; decades');
      btn.addEventListener('click', () => Enrich.run(queue));
      wrap.appendChild(btn);
      c.appendChild(wrap);
    }
  }

  /* genre share across ALL enriched artists, weighted by listening time */
  function genresSection(parent, artistEntries, a, enrich) {
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
    if (byGenre.size < 2) {
      enrichEmptyState(parent, 'Genres',
        'What do you actually listen to? One click looks up your top artists on MusicBrainz and breaks your listening down by genre — only artist and album names are sent, nothing about your listening leaves the browser.',
        enrich);
      return;
    }
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

    /* genres over time — the last.fm "top tags" chart, flowing bands */
    if (genreSeries.size >= 2 && seriesLen > 1) {
      const sum = arr => arr.reduce((acc, v) => acc + v, 0);
      const ranked = [...genreSeries.entries()].sort((x, y) => sum(y[1]) - sum(x[1]));
      // validated categorical palette, fixed slot order; tail folds into gray "Other"
      const COLORS = Charts.theme().cat;
      const chartSeries = ranked.slice(0, 5).map(([g, vals], i) =>
        ({ label: g, color: COLORS[i], values: vals.map(v => v / 3.6e6) }));
      const rest = ranked.slice(5);
      if (rest.length) {
        const other = new Array(seriesLen).fill(0);
        for (const [, vals] of rest) vals.forEach((v, i) => { other[i] += v; });
        chartSeries.push({ label: `Other (${fmtInt(rest.length)})`, color: Charts.theme().otherBand, values: other.map(v => v / 3.6e6) });
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
      shareChart(chartCard, 'My genres over time', `hours per ${a.year == null ? 'year' : 'month'} by genre, via MusicBrainz`);
    }
  }

  /* listening time by album release decade, from enriched albums */
  function decadesSection(parent, albumEntries, enrich) {
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
    if (byDecade.size < 2) {
      enrichEmptyState(parent, 'Music by decade',
        'Are you stuck in the 90s or living in the present? One click looks up your top albums on MusicBrainz and maps your listening to release decades — only artist and album names are sent, nothing about your listening leaves the browser.',
        enrich);
      return;
    }
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
    const COLORS = Charts.theme().cat;
    const topGenres = [...genreTotals.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([g]) => g);
    const colorOf = name => {
      const g = Enrich.get(name)?.g;
      const gi = g ? topGenres.indexOf(g) : -1;
      return gi >= 0 ? COLORS[gi] : (genreTotals.size ? Charts.theme().gray : Charts.MARK);
    };
    const nodes = topArtists.map(e => ({ id: e.key, ms: e.ms, color: colorOf(e.key) }));

    const s = section(parent, 'Artist constellation',
      'your top artists, linked when you play them back to back — related projects cluster together');
    const c = card(s);
    if (topGenres.length) {
      c.innerHTML += `<div class="chart-legend">${topGenres.map((g, i) =>
        `<span><i style="background:${COLORS[i]}"></i>${esc(g)}</span>`).join('')}<span><i style="background:${Charts.theme().gray}"></i>Other / unknown</span></div>`;
    }
    Charts.constellation(c, nodes, edges, {
      format: n => fmtMs(n.ms),
      ariaLabel: 'Artist constellation: artists linked by back-to-back plays',
    });
    shareChart(c, 'My artist constellation', 'top artists, linked when played back to back');
  }
})();
