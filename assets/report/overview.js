/* Report · overview — the KPI row. */
(() => {
  const { el, section, esc } = Report._h;
  const { fmtInt, fmtMs, fmtMsLong, fmtDate } = Stats;

  Report._sections.push((body, { a, prev, delta }) => {
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
  });
})();
