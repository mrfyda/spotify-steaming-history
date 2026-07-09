/* Compare — side-by-side stats with a friend, entirely in this browser.
 * The friend's export is parsed locally just like yours; neither history
 * is uploaded anywhere. */
const Compare = (() => {

  const { fmtInt, fmtMs, fmtMsLong, fmtPct, fmtDate, top } = Stats;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let friendPlays = null;

  function reset() { friendPlays = null; }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function render(allPlays) {
    const root = document.getElementById('compare');
    root.innerHTML = '';
    if (!friendPlays) renderIntro(root, allPlays);
    else renderComparison(root, allPlays, friendPlays);
  }

  /* ---------- intro: drop the friend's export ---------- */
  function renderIntro(root, allPlays) {
    const sec = el('section', 'section');
    sec.appendChild(el('h2', null, 'Compare with a friend'));
    sec.appendChild(el('div', 'section-sub',
      'Drop a friend’s export to see your listening side by side — taste match, shared artists, and who out-listens whom.'));
    const c = el('div', 'card');
    c.innerHTML = `
      <div class="dropzone dropzone--mini" id="cmpDrop" tabindex="0" role="button" aria-label="Drop your friend's export here or click to browse">
        <div class="dz-inner">
          <div class="dz-icon">⬇</div>
          <div class="dz-title">Drop your friend's <strong>.zip</strong> here</div>
          <div class="dz-sub">Spotify or Apple Music export · or click to browse</div>
        </div>
        <input type="file" id="cmpInput" accept=".zip,.json,.csv,application/zip,application/json,text/csv" multiple hidden>
      </div>
      <div class="dz-progress" id="cmpProgress" hidden><div class="spinner"></div><div id="cmpProgressText"></div></div>
      <div class="dz-error" id="cmpError" hidden></div>
      <p class="privacy" style="margin-top:14px"><strong>Nothing leaves this browser.</strong>
      Both histories are processed on this page and forgotten on reload — nothing is uploaded, by either of you.</p>`;
    sec.appendChild(c);
    root.appendChild(sec);

    const drop = c.querySelector('#cmpDrop'), input = c.querySelector('#cmpInput');
    const progress = c.querySelector('#cmpProgress'), progressText = c.querySelector('#cmpProgressText');
    const errBox = c.querySelector('#cmpError');

    async function handle(files) {
      if (!files?.length) return;
      errBox.hidden = true;
      progress.hidden = false;
      drop.style.pointerEvents = 'none'; drop.style.opacity = .5;
      try {
        const { plays } = await Parser.parseFiles([...files], t => { progressText.textContent = t; });
        friendPlays = plays;
        render(allPlays);
      } catch (err) {
        errBox.textContent = err.message || 'Something went wrong reading that file.';
        errBox.hidden = false;
      } finally {
        progress.hidden = true;
        drop.style.pointerEvents = ''; drop.style.opacity = '';
      }
    }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => handle(input.files));
    ['dragenter', 'dragover'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', e => handle(e.dataTransfer.files));
  }

  /* ---------- the comparison ---------- */

  /* weighted overlap: how much of each library's listening time lands on
   * artists you both play. min(shareA, shareB) summed over shared artists. */
  function tasteMatch(a, b) {
    const total = m => { let s = 0; for (const e of m.values()) s += e.ms; return s || 1; };
    const ta = total(a.byArtist), tb = total(b.byArtist);
    let overlap = 0, shared = 0;
    for (const [artist, e] of a.byArtist) {
      const f = b.byArtist.get(artist);
      if (!f) continue;
      shared++;
      overlap += Math.min(e.ms / ta, f.ms / tb);
    }
    return { score: overlap, shared };
  }

  const verdictFor = score =>
    score >= 0.5 ? 'Musical twins — swap AirPods freely.' :
    score >= 0.25 ? 'Plenty of common ground.' :
    score >= 0.1 ? 'Some overlap, lots to trade.' :
    'Two different worlds. Playlist exchange overdue.';

  function renderComparison(root, youPlays, frPlays) {
    const a = Stats.aggregate(youPlays, {});
    const b = Stats.aggregate(frPlays, {});
    const { score, shared } = tasteMatch(a, b);

    const sec = el('section', 'section');
    sec.appendChild(el('h2', null, 'You vs your friend'));
    sec.appendChild(el('div', 'section-sub',
      `you: ${fmtDate(a.firstTs)} – ${fmtDate(a.lastTs)} · friend: ${fmtDate(b.firstTs)} – ${fmtDate(b.lastTs)}`));
    root.appendChild(sec);

    /* taste match hero */
    const hero = el('div', 'card cmp-hero');
    hero.innerHTML = `
      <div class="cmp-score">${esc(fmtPct(score))}</div>
      <div>
        <div class="cmp-verdict">${esc(verdictFor(score))}</div>
        <div class="card-sub" style="margin:4px 0 0">Taste match: how much of your listening time lands on the
        ${fmtInt(shared)} artists you both play. Ranges differ, so shares are compared, not hours.</div>
      </div>
      <button class="chip" id="cmpReset">Compare a different file</button>`;
    sec.appendChild(hero);
    hero.querySelector('#cmpReset').addEventListener('click', () => { friendPlays = null; render(youPlays); });

    /* face-off table */
    const face = el('div', 'card');
    face.style.marginTop = '12px';
    const row = (label, you, friend) => `<tr><td class="t-name">${esc(label)}</td><td class="num">${esc(you)}</td><td class="num">${esc(friend)}</td></tr>`;
    const rows = [
      row('Time listened', fmtMs(a.totalMs), fmtMs(b.totalMs)),
      row('Streams', fmtInt(a.streams), fmtInt(b.streams)),
      row('Artists', fmtInt(a.uniqueArtists), fmtInt(b.uniqueArtists)),
      row('Tracks', fmtInt(a.uniqueTracks), fmtInt(b.uniqueTracks)),
      row('Active days', fmtInt(a.activeDays), fmtInt(b.activeDays)),
      row('Per active day', fmtMsLong(a.totalMs / Math.max(1, a.activeDays)), fmtMsLong(b.totalMs / Math.max(1, b.activeDays))),
      row('Top artist', top(a.byArtist, 'ms', 1)[0]?.key || '—', top(b.byArtist, 'ms', 1)[0]?.key || '—'),
      a.discoveryRate != null && b.discoveryRate != null ? row('Discovery rate', fmtPct(a.discoveryRate), fmtPct(b.discoveryRate)) : '',
      a.skipRate != null && b.skipRate != null ? row('Skip rate', fmtPct(a.skipRate), fmtPct(b.skipRate)) : '',
      row('Night listening (10pm–4am)', fmtPct(a.nightShare), fmtPct(b.nightShare)),
    ].join('');
    face.innerHTML = `<table><thead><tr><th></th><th class="num">You</th><th class="num">Friend</th></tr></thead><tbody>${rows}</tbody></table>`;
    sec.appendChild(face);

    /* shared artists */
    const sharedRows = [];
    for (const [artist, e] of a.byArtist) {
      const f = b.byArtist.get(artist);
      if (f) sharedRows.push({ artist, you: e.ms, friend: f.ms });
    }
    sharedRows.sort((x, y) => Math.min(y.you, y.friend) - Math.min(x.you, x.friend));
    if (sharedRows.length) {
      const sh = el('section', 'section');
      sh.appendChild(el('h2', null, 'Artists you share'));
      sh.appendChild(el('div', 'section-sub', `${fmtInt(sharedRows.length)} artists appear in both histories — ranked by how deep you both go`));
      const c = el('div', 'card');
      c.innerHTML = `<table><thead><tr><th>Artist</th><th class="num">You</th><th class="num">Friend</th></tr></thead>
        <tbody>${sharedRows.slice(0, 12).map(r => `
          <tr><td class="t-name">${esc(r.artist)}</td><td class="num">${fmtMs(r.you)}</td><td class="num">${fmtMs(r.friend)}</td></tr>`).join('')}</tbody></table>`;
      sh.appendChild(c);
      root.appendChild(sh);
    }

    /* trade recommendations: each side's biggest artists the other hasn't heard */
    const onlyIn = (x, y) => top(x.byArtist, 'ms', 200).filter(e => !y.byArtist.has(e.key)).slice(0, 5);
    const yoursOnly = onlyIn(a, b), theirsOnly = onlyIn(b, a);
    if (yoursOnly.length || theirsOnly.length) {
      const tr = el('section', 'section');
      tr.appendChild(el('h2', null, 'Trade offers'));
      tr.appendChild(el('div', 'section-sub', 'each side’s heavy rotation the other hasn’t touched'));
      const grid = el('div', 'card-grid');
      tr.appendChild(grid);
      const list = (parent, title, entries, who) => {
        const c = el('div', 'card');
        c.appendChild(el('h3', null, esc(title)));
        c.innerHTML += `<table><tbody>${entries.map(e => `
          <tr><td class="t-name">${esc(e.key)}</td><td class="num">${fmtMs(e.ms)}</td></tr>`).join('') ||
          `<tr><td class="empty-note">Nothing left to recommend — ${who} has heard it all.</td></tr>`}</tbody></table>`;
        parent.appendChild(c);
      };
      list(grid, 'You should send them', yoursOnly, 'your friend');
      list(grid, 'They should send you', theirsOnly, 'you');
      root.appendChild(tr);
    }

    /* fingerprint overlay */
    if (a.fingerprint && b.fingerprint) {
      const fpAxes = Object.keys(a.fingerprint);
      const fp = el('section', 'section');
      fp.appendChild(el('h2', null, 'Listening fingerprints'));
      fp.appendChild(el('div', 'section-sub', 'the shape of two listening styles, overlaid'));
      const c = el('div', 'card');
      c.style.maxWidth = '620px';
      Charts.radar(c, fpAxes, [
        { label: 'You', color: Charts.MARK, values: fpAxes.map(k => a.fingerprint[k]) },
        { label: 'Friend', color: Charts.theme().cat[1], values: fpAxes.map(k => b.fingerprint[k]) },
      ], { ariaLabel: 'Listening fingerprints, you versus your friend' });
      fp.appendChild(c);
      root.appendChild(fp);
    }
  }

  return { render, reset };
})();
