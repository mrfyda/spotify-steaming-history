/* Compare — side-by-side stats with a friend, entirely in this browser.
 * Three ways to get the friend's side, none of which involve a server of ours:
 *   · live room: both browsers meet through a room code and swap compact
 *     summaries over an encrypted WebRTC data channel (Trystero handles the
 *     handshake via public nostr relays; relays never see listening data)
 *   · summary file: a ~100 KB .json of artist totals, swapped over any chat
 *   · full export: the original flow — drop their zip, parse it locally
 * The comparison itself always runs on two aggregate-shaped objects, so all
 * three paths render identically, and both friends see the same view. */
const Compare = (() => {

  const { fmtInt, fmtMs, fmtMsLong, fmtPct, fmtDate, top } = Stats;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let friendAgg = null;          // aggregate-shaped, whatever path it came from
  let live = null;               // { room, code, status } while a room is open
  let lastPlays = null;          // your plays, kept for re-renders from handlers

  function stopLive() {
    if (!live) return;
    try { live.room.leave(); } catch { /* already gone */ }
    live = null;
  }

  // when the app is backgrounded, a friend aggregate that came from a full
  // export still carries byTrack/byAlbum maps the comparison never reads —
  // slim it to its summary equivalent (what renders is identical)
  document.addEventListener('lh:shed', () => {
    if (friendAgg) friendAgg = CmpSummary.toAggregate(CmpSummary.build(friendAgg));
  });

  function reset() { friendAgg = null; stopLive(); }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function render(allPlays) {
    lastPlays = allPlays;
    const root = document.getElementById('compare');
    root.innerHTML = '';
    const youAgg = Stats.aggregate(allPlays, {});
    if (!friendAgg) renderIntro(root, allPlays, youAgg);
    else renderComparison(root, youAgg, friendAgg);
  }

  /* ---------- live rooms ---------- */

  const roomCode = () => {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/i lookalikes
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
  };

  const roomFromUrl = () => {
    const code = new URLSearchParams(location.search).get('room');
    return code && /^[a-z2-9]{6,32}$/.test(code) ? code : null;
  };

  const inviteLink = code => `${location.origin}${location.pathname}?room=${code}`;

  /** Open (or reuse) the room and wire the symmetric summary exchange.
   *  Both sides run exactly this; whoever hears the other's summary first
   *  renders — and tells main.js to bring the Compare tab forward. */
  function joinLive(code, allPlays, youAgg, setStatus) {
    if (live && live.code === code) { setStatus(live.status); return; } // re-render, not re-join
    stopLive();
    if (typeof Trystero === 'undefined') {
      setStatus('Live compare failed to load — swap summary files below instead.', true);
      return;
    }
    const status = (text, isError) => {
      if (live) live.status = text;
      setStatus(text, isError);
    };
    let room;
    try {
      room = Trystero.joinRoom({ appId: 'listening-history-compare', password: 'lh1-' + code }, code);
    } catch (err) {
      setStatus('Could not open a room (' + (err.message || 'unknown error') + ') — swap summary files below instead.', true);
      return;
    }
    live = { room, code, status: 'Waiting for your friend to open the link…' };
    const summaries = room.makeAction('summary');
    room.onPeerJoin = peerId => {
      status('Friend connected — exchanging summaries…');
      summaries.send(CmpSummary.build(youAgg), { target: peerId });
    };
    room.onPeerLeave = () => {
      if (live && !friendAgg) status('Your friend disconnected. Leave this open and they can rejoin with the same link.');
    };
    summaries.onMessage = data => {
      if (friendAgg) return; // two's company — ignore any extra joiners
      try {
        friendAgg = CmpSummary.toAggregate(data);
      } catch (err) {
        status(err.message || 'Your friend sent something this page could not read.', true);
        return;
      }
      stopLive();
      render(allPlays);
      document.dispatchEvent(new CustomEvent('compare:ready'));
    };
    // nostr relays + WebRTC usually connect in seconds; past a minute
    // something is off (link unopened, or a NAT no relay-free setup can cross)
    setTimeout(() => {
      if (live && live.code === code && !friendAgg && live.status.startsWith('Waiting')) {
        status('Still waiting… make sure your friend opened the link and loaded their history. '
          + 'If this never connects, swap summary files below instead.');
      }
    }, 60_000);
    setStatus(live.status);
  }

  /* ---------- intro: three ways in ---------- */
  function renderIntro(root, allPlays, youAgg) {
    const sec = el('section', 'section');
    sec.appendChild(el('h2', null, 'Compare with a friend'));
    sec.appendChild(el('div', 'section-sub',
      'See your listening side by side — taste match, shared artists, and who out-listens whom.'));
    root.appendChild(sec);

    /* live room card */
    const liveCard = el('div', 'card');
    liveCard.innerHTML = `
      <h3>Compare live</h3>
      <div class="card-sub">Send a link, both load your histories, and the comparison appears on both
      screens at once. Only a compact summary travels — artist totals and headline stats, sent directly
      between your two browsers over an encrypted connection. No account, no upload, no server of ours.</div>
      <div class="cmp-live" id="cmpLive"></div>`;
    sec.appendChild(liveCard);
    const liveBox = liveCard.querySelector('#cmpLive');

    const setStatus = (text, isError) => {
      const st = liveBox.querySelector('.cmp-status');
      if (st) { st.textContent = text; st.classList.toggle('cmp-status--err', !!isError); }
    };

    const showRoom = code => {
      liveBox.innerHTML = `
        <div class="cmp-link">
          <input type="text" readonly value="${esc(inviteLink(code))}" aria-label="Invite link">
          <button class="chip" id="cmpCopy">Copy link</button>
          <button class="chip" id="cmpCancel">Cancel</button>
        </div>
        <div class="cmp-status" role="status"></div>`;
      liveBox.querySelector('#cmpCopy').addEventListener('click', async e => {
        const input = liveBox.querySelector('input');
        try { await navigator.clipboard.writeText(input.value); } catch { input.select(); document.execCommand('copy'); }
        e.target.textContent = 'Copied!';
        setTimeout(() => { e.target.textContent = 'Copy link'; }, 1500);
      });
      liveBox.querySelector('#cmpCancel').addEventListener('click', () => { stopLive(); render(allPlays); });
      joinLive(code, allPlays, youAgg, setStatus);
    };

    const urlCode = roomFromUrl();
    if (live) {
      showRoom(live.code);            // re-render (theme flip, tab switch) — keep the open room
    } else if (urlCode) {
      showRoom(urlCode);              // invited: auto-join the room from the link
    } else {
      liveBox.innerHTML = `<button class="chip" id="cmpInvite">Create an invite link</button>`;
      liveBox.querySelector('#cmpInvite').addEventListener('click', () => showRoom(roomCode()));
    }

    /* file card: their export or summary in, your summary out */
    const c = el('div', 'card');
    c.style.marginTop = '12px';
    c.innerHTML = `
      <h3>Or swap files</h3>
      <div class="dropzone dropzone--mini" id="cmpDrop" tabindex="0" role="button" aria-label="Drop your friend's export or summary here or click to browse">
        <div class="dz-inner">
          <div class="dz-icon">⬇</div>
          <div class="dz-title">Drop your friend's <strong>.zip</strong> or <strong>summary</strong> here</div>
          <div class="dz-sub">Spotify or Apple Music export, or a summary from this page · or click to browse</div>
        </div>
        <input type="file" id="cmpInput" accept=".zip,.json,.csv,application/zip,application/json,text/csv" multiple hidden>
      </div>
      <div class="dz-progress" id="cmpProgress" hidden><div class="spinner"></div><div id="cmpProgressText"></div></div>
      <div class="dz-error" id="cmpError" hidden></div>
      <p class="privacy" style="margin-top:14px"><strong>Nothing leaves this browser.</strong>
      Files are processed on this page and forgotten on reload — nothing is uploaded, by either of you.</p>
      <p class="cmp-export">Rather send yours? <button class="linkish" id="cmpExport">Download your summary
      (~${CmpSummary.sizeKB(youAgg)} KB)</button> — artist totals and headline stats only, no play-by-play.</p>`;
    sec.appendChild(c);

    c.querySelector('#cmpExport').addEventListener('click', () => CmpSummary.download(youAgg));

    const drop = c.querySelector('#cmpDrop'), input = c.querySelector('#cmpInput');
    const progress = c.querySelector('#cmpProgress'), progressText = c.querySelector('#cmpProgressText');
    const errBox = c.querySelector('#cmpError');

    /** A dropped .json might be a summary from this page rather than an
     *  export — sniff the content, not the extension (exports are .json too). */
    async function trySummary(files) {
      if (files.length !== 1 || !/\.json$/i.test(files[0].name) || files[0].size > 32 * 1024 * 1024) return false;
      let parsed;
      try { parsed = JSON.parse(await files[0].text()); } catch { return false; }
      if (!CmpSummary.looksLike(parsed)) return false;
      friendAgg = CmpSummary.toAggregate(parsed); // throws a readable message on a mangled file
      return true;
    }

    async function handle(files) {
      if (!files?.length) return;
      files = [...files];
      errBox.hidden = true;
      progress.hidden = false;
      drop.style.pointerEvents = 'none'; drop.style.opacity = .5;
      try {
        if (!await trySummary(files)) {
          progressText.textContent = 'Reading files…';
          const { plays } = await Parser.parseFiles(files, t => { progressText.textContent = t; });
          friendAgg = Stats.aggregate(plays, {});
        }
        stopLive();
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

  function renderComparison(root, a, b) {
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
      <button class="chip" id="cmpReset">Compare someone else</button>`;
    sec.appendChild(hero);
    hero.querySelector('#cmpReset').addEventListener('click', () => {
      friendAgg = null;
      render(lastPlays);
    });

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
