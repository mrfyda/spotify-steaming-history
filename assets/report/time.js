/* Report · time — the listening-over-time charts: months, music vs podcasts,
 * clock, weekday, dial, ratio rings, punchcard, and the daily calendar. */
(() => {
  const { el, section, card, esc, WEEKDAYS } = Report._h;
  const { fmtInt, fmtMs, fmtMsLong, fmtHour } = Stats;

  Report._sections.push((body, { a, prev, hasPrev, rangeLabel, currentYear, monthData }) => {
    const time = section(body, 'Listening over time');
    const grid1 = el('div', 'card-grid');
    time.appendChild(grid1);

    const monthsCard = card(grid1, currentYear == null ? 'Hours per month' : `Hours per month, ${rangeLabel}`);
    monthsCard.style.gridColumn = '1 / -1';
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
          { label: 'Music', color: Charts.theme().cat[0], values: monthData.map(m => m.musicMs / 3.6e6) },
          { label: 'Podcasts', color: Charts.theme().cat[1], values: monthData.map(m => m.podcastMs / 3.6e6) },
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
        { label: 'Tracks', cur: a.uniqueTracks, prev: prev.uniqueTracks, color: Charts.theme().cat[0] },
        { label: 'Albums', cur: a.uniqueAlbums, prev: prev.uniqueAlbums, color: Charts.theme().cat[1] },
        { label: 'Artists', cur: a.uniqueArtists, prev: prev.uniqueArtists, color: Charts.theme().cat[4] },
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
  });
})();
