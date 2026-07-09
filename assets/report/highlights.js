/* Report · highlights — the records wall and the eras timeline. */
(() => {
  const { el, section, card, esc, MONTH_SHORT } = Report._h;
  const { fmtInt, fmtMs, fmtMsLong, fmtPct, fmtDate } = Stats;

  /* ---- records ---- */
  Report._sections.push((body, { a, currentYear, rangeLabel }) => {
    const grid = el('div', 'records');
    section(body, 'Records').appendChild(grid);
    const record = (title, value, sub) => grid.appendChild(el('div', 'record',
      `<div class="r-title">${esc(title)}</div>` +
      `<div class="r-value">${esc(value)}</div>${sub ? `<div class="r-sub">${esc(sub)}</div>` : ''}`));

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

  /* ---- eras timeline ---- */
  Report._sections.push((body, { a, currentYear, rangeLabel }) => {
    if (a.eras.length <= 1) return;
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
  });
})();
