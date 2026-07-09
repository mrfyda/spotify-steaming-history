/* Report · highlights — the records wall and how your top artists rose
 * and faded over time. */
(() => {
  const { el, section, card, esc, MONTH_SHORT, shareChart } = Report._h;
  const { fmtInt, fmtMs, fmtMsLong, fmtPct, fmtDate, top } = Stats;

  /* "3.2×" — relative scale reads better than a second absolute number */
  const times = x => `${(Math.round(x * 10) / 10).toLocaleString('en-US')}×`;

  /* ---- records ---- */
  Report._sections.push((body, { a, currentYear, rangeLabel }) => {
    const grid = el('div', 'records');
    section(body, 'Records').appendChild(grid);
    const record = (title, value, sub) => grid.appendChild(el('div', 'record',
      `<div class="r-title">${esc(title)}</div>` +
      `<div class="r-value">${esc(value)}</div>${sub ? `<div class="r-sub">${esc(sub)}</div>` : ''}`));

    const avgDay = a.totalMs / Math.max(1, a.activeDays);
    if (a.peakDay) record('Biggest day', fmtDate(a.peakDay.day, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),
      `${fmtMsLong(a.peakDay.ms)} · ${times(a.peakDay.ms / avgDay)} your average day`);
    if (a.longestStreak?.days > 1) record('Longest streak', `${fmtInt(a.longestStreak.days)} days in a row`,
      `ending ${fmtDate(a.longestStreak.end)} · ${fmtPct(a.longestStreak.days / a.daySpan)} of ${currentYear ? 'the year' : 'your whole history'}`);
    if (a.sessions?.longest) record('Longest session', fmtMsLong(a.sessions.longest.ms),
      `${fmtInt(a.sessions.longest.tracks)} streams on ${fmtDate(a.sessions.longest.start)} · ${times(a.sessions.longest.ms / avgDay)} your average day`);
    if (a.loopRecord) record('Most loops in one day', `${a.loopRecord.count}× “${a.loopRecord.track}”`, `${a.loopRecord.artist} · ${fmtDate(a.loopRecord.day)}`);
    if (a.topReplay) record('Most rewound track', `“${a.topReplay.track}”`, `${a.topReplay.artist} · rewound ${fmtInt(a.topReplay.replays)} times`);
    if (a.evergreen) record('Longest-running favorite', `“${a.evergreen.track}”`, `${a.evergreen.artist} · in rotation for ${fmtInt(a.evergreen.span / 86_400_000 / 365 * 10) / 10} years`);
    if (a.comeback) record('Biggest comeback', a.comeback.artist, `${fmtInt(a.comeback.gap / 86_400_000 / 30)} months of silence, then back on ${fmtDate(a.comeback.end)}`);
    if (a.oneHit) record('One-song artist', a.oneHit.artist, `“${a.oneHit.track}” is ${fmtPct(a.oneHit.share)} of their ${fmtInt(a.oneHit.plays)} plays`);
    if (a.nightArtist) record('Late-night companion', a.nightArtist.artist, `${fmtMs(a.nightArtist.ms)} between midnight and 5am`);
    if (a.newArtists != null) record('New artists discovered', fmtInt(a.newArtists), a.topNewArtist ? `biggest: ${a.topNewArtist.artist}` : null);
    if (a.firstTrack) record(currentYear ? `First track of ${rangeLabel}` : 'First track on record', `“${a.firstTrack.track}”`, `${a.firstTrack.artist} · ${fmtDate(a.firstTrack.ts)}`);
  });

  /* ---- top artists over time ---- */
  Report._sections.push((body, { a, currentYear, rangeLabel }) => {
    const entries = top(a.byArtist, 'ms').filter(e => e.series).slice(0, 5);
    const seriesLen = entries[0]?.series.length || 0;
    if (entries.length < 2 || seriesLen < 2) return;

    const startYear = new Date(a.firstTs).getFullYear();
    const periods = currentYear == null
      ? Array.from({ length: seriesLen }, (_, i) => String(startYear + i))
      : MONTH_SHORT.slice(0, seriesLen);
    const COLORS = Charts.theme().cat;
    const series = entries.map((e, i) =>
      ({ label: e.key, color: COLORS[i], values: e.series.map(v => v / 3.6e6) }));

    const s = section(body, 'Artists over time',
      currentYear == null
        ? 'how your top five rose and faded across the years'
        : `your top five month by month, ${rangeLabel}`);
    const c = card(s);
    Charts.lineChart(c, periods, series, {
      formatValue: v => `${fmtInt(v)} h`,
      ariaLabel: 'Hours per period for your top artists',
      periodLabel: currentYear == null ? 'Year' : 'Month',
      tickEvery: currentYear == null && seriesLen > 16 ? (i, label) => (i % 2 === 0 ? label : null) : null,
    });
    shareChart(c, 'My artists over time', `hours per ${currentYear == null ? 'year' : 'month'} · ${rangeLabel}`);
  });
})();
