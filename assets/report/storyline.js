/* Report · storyline — when your favorites entered your life, who arrived
 * recently, and who quietly faded out. Always computed from the FULL
 * history (a year filter would make "first listen" meaningless), so it
 * only renders on the all-time view. */
(() => {
  const { el, section, card, esc } = Report._h;
  const { fmtInt, fmtMs, fmtDate } = Stats;

  const YEAR = 365 * 86_400_000;

  /* one full-history pass per dataset: artist -> {first, last, ms, plays} */
  let cache = new WeakMap();
  document.addEventListener('lh:shed', () => { cache = new WeakMap(); }); // rebuilt on next render
  function artistSpans(allPlays) {
    let m = cache.get(allPlays);
    if (m) return m;
    m = new Map();
    for (const p of allPlays) {
      if (p.kind !== 'music' || p.ms < Stats.STREAM_MS) continue;
      let e = m.get(p.artist);
      if (!e) { e = { first: p.ts, last: p.ts, ms: 0, plays: 0 }; m.set(p.artist, e); }
      e.last = p.ts; e.ms += p.ms; e.plays++;
    }
    cache.set(allPlays, m);
    return m;
  }

  Report._sections.push((body, { allPlays, currentYear }) => {
    if (currentYear != null) return;
    const spans = artistSpans(allPlays);
    if (spans.size < 8) return;
    const minTs = allPlays.firstTs, maxTs = allPlays.lastTs;
    if (maxTs - minTs < YEAR) return; // too short for a storyline

    const ranked = [...spans.entries()]
      .map(([artist, e]) => ({ artist, ...e }))
      .sort((x, y) => y.ms - x.ms);

    const s = section(body, 'Artist storyline',
      'when your favorites entered your life — and who quietly slipped out of it');

    /* ---- arrivals timeline: top artists placed by first-ever listen ---- */
    const arrivals = ranked.slice(0, 8).sort((x, y) => x.first - y.first);
    const arrCard = card(s, 'When your favorites arrived', 'first listen of each of your top artists');
    const pos = ts => Math.min(100, Math.max(0, ((ts - minTs) / Math.max(1, maxTs - minTs)) * 100));
    arrCard.innerHTML += `
      <div class="tl-head"><span>${esc(fmtDate(minTs, { year: 'numeric', month: 'short' }))}</span><span>${esc(fmtDate(maxTs, { year: 'numeric', month: 'short' }))}</span></div>
      ${arrivals.map(e => `
        <div class="tl-row">
          <div class="tl-name" title="${esc(e.artist)}">${esc(e.artist)}</div>
          <div class="tl-track"><i style="left:${pos(e.first).toFixed(1)}%"></i></div>
          <div class="tl-date">${esc(fmtDate(e.first, { year: 'numeric', month: 'short' }))}</div>
        </div>`).join('')}`;

    /* ---- new favorites & faded favorites ---- */
    const grid = el('div', 'card-grid');
    grid.style.marginTop = '12px';
    s.appendChild(grid);

    const rowTable = rows => `<table><tbody>${rows.map(r => `
      <tr>
        <td><div class="t-name">${esc(r.name)}</div><div class="t-sub">${esc(r.sub)}</div></td>
        <td class="num">${esc(r.value)}</td>
      </tr>`).join('')}</tbody></table>`;

    const fresh = ranked
      .filter(e => maxTs - e.first <= YEAR && e.ms >= 30 * 60_000)
      .slice(0, 5);
    if (fresh.length) {
      const c = card(grid, 'New favorites', 'discovered in the last twelve months, already on repeat');
      c.innerHTML += rowTable(fresh.map(e => ({
        name: e.artist,
        sub: `arrived ${fmtDate(e.first, { year: 'numeric', month: 'short' })} · ${fmtInt(e.plays)} streams since`,
        value: fmtMs(e.ms),
      })));
    }

    if (maxTs - minTs >= 2 * YEAR) {
      const faded = ranked.slice(0, 40)
        .filter(e => maxTs - e.last > YEAR && e.ms >= 60 * 60_000)
        .sort((x, y) => y.ms - x.ms)
        .slice(0, 5);
      if (faded.length) {
        const c = card(grid, 'Faded favorites', 'once heavy rotation, now quiet for over a year');
        c.innerHTML += rowTable(faded.map(e => ({
          name: e.artist,
          sub: `quiet since ${fmtDate(e.last, { year: 'numeric', month: 'short' })}`,
          value: fmtMs(e.ms),
        })));
      }
    }
  });
})();
