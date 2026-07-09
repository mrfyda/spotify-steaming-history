/* Report · insights — the listening fingerprint, habits, and where & how. */
(() => {
  const { el, section, card, esc, shareTable, countryName, shareChart } = Report._h;
  const { fmtInt, fmtMsLong, fmtPct, fmtHour, top } = Stats;

  /* ---- listening fingerprint ---- */
  Report._sections.push((body, { a, prev, hasPrev, currentYear, rangeLabel }) => {
    if (!a.fingerprint) return;
    const fpAxes = Object.keys(a.fingerprint);
    const fpLayers = [{
      label: currentYear == null ? 'All time' : rangeLabel,
      color: Charts.MARK,
      values: fpAxes.map(k => a.fingerprint[k]),
    }];
    if (hasPrev && prev.fingerprint) {
      fpLayers.push({ label: String(currentYear - 1), color: Charts.theme().grayLine, values: fpAxes.map(k => prev.fingerprint[k]) });
    }
    const fpSec = section(body, 'Listening fingerprint',
      hasPrev ? `the shape of your listening, ${rangeLabel} vs ${currentYear - 1}` : 'the shape of your listening');
    const fpCard = card(fpSec);
    fpCard.style.maxWidth = '620px';
    Charts.radar(fpCard, fpAxes, fpLayers, { ariaLabel: 'Listening fingerprint' });
    fpCard.appendChild(el('div', 'card-sub',
      'Consistency: days with listening · Discovery: first-time tracks · Replay: streams of tracks you play 10+ times · ' +
      'Concentration: time in your top 10 artists · Variety: distinct artists per stream'));
    shareChart(fpCard, 'My listening fingerprint', currentYear == null ? 'all time' : rangeLabel);
  });

  /* ---- habits ---- */
  Report._sections.push((body, { a }) => {
    const grid = el('div', 'records');
    section(body, 'Habits').appendChild(grid);
    const habit = (title, value, sub) => grid.appendChild(el('div', 'record',
      `<div class="r-title">${esc(title)}</div>` +
      `<div class="r-value">${esc(value)}</div>${sub ? `<div class="r-sub">${esc(sub)}</div>` : ''}`));

    habit('Average per active day', fmtMsLong(a.totalMs / Math.max(1, a.activeDays)), `${fmtPct(a.activeDays / a.daySpan)} of days had listening`);
    habit('Busiest hour', `${fmtHour(a.peakHour)}–${fmtHour((a.peakHour + 1) % 24)}`, `${fmtPct(a.byHour[a.peakHour].ms / Math.max(1, a.totalMs))} of all listening`);
    if (a.sessions?.count > 1) habit('Listening sessions', fmtInt(a.sessions.count), `about ${fmtMsLong(a.sessions.avgMs)} each`);
    if (a.startChosenRate != null) habit('Plays you started yourself', fmtPct(a.startChosenRate), 'the rest flowed in from autoplay and queues');
    if (a.skipRate != null) habit('Skip rate', fmtPct(a.skipRate), a.mostSkipped ? `most skipped: “${a.mostSkipped.track}” (${a.mostSkipped.skips}×)` : null);
    if (a.completionRate != null) habit('Tracks played to the end', fmtPct(a.completionRate), 'of plays with a known ending');
    if (a.shuffleRate != null) habit('Shuffle', fmtPct(a.shuffleRate), 'of plays with shuffle on');
    if (a.offlineRate != null && a.offlineRate > 0) habit('Offline listening', fmtPct(a.offlineRate), 'of plays while offline');
    if (a.incognitoCount > 0) habit('Private sessions', fmtInt(a.incognitoCount) + ' plays', 'listened in incognito mode');
  });

  /* ---- platforms & countries ---- */
  Report._sections.push((body, { a }) => {
    if (!a.platforms.size && !a.countries.size) return;
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
  });
})();
