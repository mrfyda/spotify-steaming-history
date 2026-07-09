/* Report · discovery — first-time listening over time, how discoveries
 * started, and the eras timeline. */
(() => {
  const { el, section, card, esc, countTable, MONTH_SHORT } = Report._h;
  const { fmtInt, fmtMs, fmtPct } = Stats;

  /* ---- discovery ---- */
  Report._sections.push((body, { a, currentYear, monthData }) => {
    if (a.discoveryRate == null || monthData.length <= 1) return;
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
