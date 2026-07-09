/* Report · insights — records, habits, the listening fingerprint,
 * recently played, and where & how. */
(() => {
  const { el, section, card, esc, shareTable, countryName } = Report._h;
  const { fmtInt, fmtMs, fmtMsLong, fmtPct, fmtDate, fmtHour, top } = Stats;

  const mkRecords = (sec) => {
    const grid = el('div', 'records');
    sec.appendChild(grid);
    return (title, value, sub) => grid.appendChild(el('div', 'record',
      `<div class="r-title">${esc(title)}</div>` +
      `<div class="r-value">${esc(value)}</div>${sub ? `<div class="r-sub">${esc(sub)}</div>` : ''}`));
  };

  /* ---- records ---- */
  Report._sections.push((body, { a, currentYear, rangeLabel }) => {
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
  });

  /* ---- habits ---- */
  Report._sections.push((body, { a }) => {
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
  });

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
  });

  /* ---- recently played ---- */
  Report._sections.push((body, { currentYear, rangeLabel, rangePlays }) => {
    const recent = rangePlays.filter(p => p.ms >= Stats.STREAM_MS).slice(-15).reverse();
    if (!recent.length) return;
    const rs = section(body, 'Recently played', currentYear == null ? 'your last 15 streams' : `the last 15 streams of ${rangeLabel}`);
    const c = card(rs);
    c.innerHTML += `<table><tbody>${recent.map(p => `
      <tr>
        <td><div class="t-name">${esc(p.track || p.episode)}</div><div class="t-sub">${esc(p.kind === 'music' ? p.artist : p.show)}</div></td>
        <td class="num">${fmtMs(p.ms)}</td>
        <td class="num t-sub">${esc(new Date(p.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} ${esc(new Date(p.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase())}</td>
      </tr>`).join('')}</tbody></table>`;
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
