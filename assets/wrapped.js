/* Wrapped — the shareable, story-style recap with fun facts. */
const Wrapped = (() => {

  const { fmtInt, fmtMs, fmtMsLong, fmtPct, fmtDate, fmtHour, top } = Stats;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let selectedYear = null;

  function pickDefaultYear(allPlays) {
    const ys = Stats.years(allPlays);
    return ys[ys.length - 1];
  }

  function render(allPlays) {
    if (selectedYear == null) selectedYear = pickDefaultYear(allPlays);
    const root = document.getElementById('wrapped');
    root.innerHTML = '';

    const a = Stats.aggregate(allPlays, { year: selectedYear });
    const slides = document.createElement('div');
    slides.className = 'slides';
    root.appendChild(slides);

    const slide = (variant, html, { hint = false } = {}) => {
      const s = document.createElement('section');
      s.className = `slide slide-${variant}`;
      s.innerHTML = `<div class="s-inner">${html}</div>${hint ? '<div class="s-foot">scroll ↓</div>' : ''}`;
      slides.appendChild(s);
      return s;
    };

    /* --- intro / year picker --- */
    const years = Stats.years(allPlays).slice().reverse();
    const intro = slide('a', `
      <div class="s-lead">Your listening, wrapped.</div>
      <div class="s-hero">${selectedYear}</div>
      <p class="s-sub">Everything you streamed in ${selectedYear}, ending in a card you can share.</p>
      <div class="year-pick" role="toolbar" aria-label="Pick a year">
        ${years.map(y => `<button class="chip ${y === selectedYear ? 'active' : ''}" data-year="${y}">${y}</button>`).join('')}
      </div>`, { hint: true });
    intro.querySelectorAll('[data-year]').forEach(b =>
      b.addEventListener('click', () => { selectedYear = Number(b.dataset.year); render(allPlays); }));

    if (a.empty) {
      slide('b', `<div class="s-hero">Silence.</div><p class="s-sub">No plays in ${selectedYear}. Pick another year above.</p>`);
      return;
    }

    /* --- minutes --- */
    const minutes = Math.round(a.totalMs / 60000);
    slide('b', `
      <div class="s-lead">You listened for</div>
      <div class="s-hero">${fmtInt(minutes)} minutes</div>
      <p class="s-sub">of music${a.podcastMs > 0 ? ' and podcasts' : ''} in ${selectedYear}.
      That's <b>${fmtMsLong(a.totalMs)}</b>, spread across ${fmtInt(a.activeDays)} different days.</p>`);

    const art = url => url
      ? `<img class="w-art" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
      : '';

    /* --- top artist --- */
    const topArtists = top(a.byArtist, 'ms', 5);
    const covers = artistCovers(a, topArtists);
    if (topArtists.length) {
      const t1 = topArtists[0];
      const share = a.musicMs ? t1.ms / a.musicMs : 0;
      slide('c', `
        <div class="s-lead">Nobody came close to</div>
        ${covers.get(t1.key) ? `<img class="w-hero-art" src="${esc(covers.get(t1.key))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        <div class="s-hero">${esc(t1.key)}</div>
        <p class="s-sub">Your top artist. ${fmtMs(t1.ms)} together, ${fmtInt(t1.plays)} streams,
        and <b>${fmtPct(share)}</b> of all your music time.</p>`);

      slide('d', `
        <div class="s-lead">The rest of the podium held its ground.</div>
        <div class="top5">
          ${topArtists.map((e, i) => `
            <div class="t5"><span class="n">${i + 1}</span>${art(covers.get(e.key))}<span class="name">${esc(e.key)}</span>
            <span class="meta">${fmtMs(e.ms)}</span></div>`).join('')}
        </div>`);
    }

    /* --- artist sprint: the monthly race for #1 (Wrapped 2025's Top Artist
     * Sprint) — each line is an artist's rank among your top 5, per month --- */
    const sprint = sprintSvg(topArtists);
    if (sprint) {
      slide('b', `
        <div class="s-lead">The race for #1, month by month.</div>
        ${sprint}
        <p class="s-sub">Each line is one of your top five artists, ranked by that month's listening.</p>`);
    }

    /* --- quiz before the reveal (Wrapped 2025's Top Song Quiz) --- */
    const topTracks = top(a.byTrack, 'plays', 5);
    const quizPool = top(a.byTrack, 'plays', 8);
    if (quizPool.length >= 4) {
      const decoys = quizPool.slice(1).sort(() => Math.random() - 0.5).slice(0, 3);
      const options = [quizPool[0], ...decoys].sort(() => Math.random() - 0.5);
      const quiz = slide('a', `
        <div class="s-lead">Before the reveal — which song defined your year?</div>
        <div class="quiz">
          ${options.map((t, i) => `
            <button class="quiz-opt" data-i="${i}" data-ok="${t === quizPool[0] ? 1 : 0}">
              <b>${esc(t.track)}</b><span>${esc(t.artist)}</span>
            </button>`).join('')}
        </div>
        <p class="s-sub" id="quizResult" hidden></p>`);
      quiz.querySelectorAll('.quiz-opt').forEach(btn => btn.addEventListener('click', () => {
        quiz.querySelectorAll('.quiz-opt').forEach(b => {
          b.disabled = true;
          if (b.dataset.ok === '1') b.classList.add('quiz-opt--yes');
          else if (b === btn) b.classList.add('quiz-opt--no');
        });
        const res = quiz.querySelector('#quizResult');
        res.hidden = false;
        res.innerHTML = btn.dataset.ok === '1'
          ? `Nailed it. <b>${fmtInt(quizPool[0].plays)} plays</b> — keep scrolling for the damage.`
          : `It was “<b>${esc(quizPool[0].track)}</b>” — ${fmtInt(quizPool[0].plays)} plays. Scroll for the full story.`;
      }));
    }

    /* --- top tracks --- */
    if (topTracks.length) {
      const t1 = topTracks[0];
      slide('e', `
        <div class="s-lead">One song refused to leave the queue.</div>
        <div class="s-hero" style="font-size:clamp(1.8rem,6vw,3.6rem)">“${esc(t1.track)}”</div>
        <p class="s-sub">${esc(t1.artist)}. You played it <b>${fmtInt(t1.plays)} times</b>, ${fmtMs(t1.ms)} in total.</p>
        <div class="top5" style="margin-top:34px">
          ${topTracks.slice(1).map((e, i) => `
            <div class="t5"><span class="n">${i + 2}</span><span class="name">${esc(e.track)}</span>
            <span class="meta">${fmtInt(e.plays)} plays</span></div>`).join('')}
        </div>`);
    }

    /* --- top albums (Wrapped 2025 added these; ours carry covers) --- */
    const topAlbums = top(a.byAlbum, 'ms', 5);
    if (topAlbums.length >= 3) {
      slide('c', `
        <div class="s-lead">The albums you kept coming back to.</div>
        <div class="top5">
          ${topAlbums.map((e, i) => `
            <div class="t5"><span class="n">${i + 1}</span>${art(Enrich.albumArtUrl(e.artist, e.album))}
            <span class="name">${esc(e.album)}<span class="t5-sub">${esc(e.artist)}</span></span>
            <span class="meta">${fmtMs(e.ms)}</span></div>`).join('')}
        </div>`);
    }

    /* --- listening age (Wrapped 2025) — from enriched album release years --- */
    const age = listeningAge(a);
    if (age) {
      const years = a.year - age.median;
      slide('d', `
        <div class="s-lead">Half your listening is music from</div>
        <div class="s-hero">${age.median} or earlier</div>
        <p class="s-sub">${years <= 2
          ? 'You live firmly in the present — the ink is barely dry on your library.'
          : `On a typical day you were listening <b>${fmtInt(years)} years</b> into the past.`}
        Based on the release years of ${fmtPct(age.share)} of your album listening.</p>`);
    }

    /* --- top podcasts --- */
    const topShows = top(a.byShow, 'ms', 5);
    if (topShows.length >= 2) {
      slide('e', `
        <div class="s-lead">Between the songs, the talkers.</div>
        <div class="top5">
          ${topShows.map((e, i) => `
            <div class="t5"><span class="n">${i + 1}</span><span class="name">${esc(e.key)}<span class="t5-sub">${e.kind === 'audiobook' ? 'audiobook' : 'podcast'}</span></span>
            <span class="meta">${fmtMs(e.ms)}</span></div>`).join('')}
        </div>`);
    }

    /* --- personality --- */
    const p = personality(a);
    slide('a', `
      <div class="s-lead">All of it adds up to a type. This year, you were</div>
      <div class="s-hero">${p.emoji} ${p.name}</div>
      <p class="s-sub">${p.blurb}</p>`);

    /* --- fun facts --- */
    const facts = funFacts(a);
    slide('c', `
      <div class="s-lead">A few things you probably didn't notice about yourself:</div>
      <div style="margin-top:8px">${facts.map(f => `<div class="wfact">${f}</div>`).join('')}</div>`);

    /* --- share card --- */
    const shareSlide = slide('e', `
      <div class="s-hero" style="font-size:clamp(2rem,7vw,4rem)">That's a wrap.</div>
      <p class="s-sub">Your ${selectedYear}, as one image. Save it, or send it to the group chat.</p>
      <img class="share-preview" id="sharePreview" alt="Preview of your shareable recap card">
      <div class="share-actions">
        <button class="btn" id="downloadCard">Download story</button>
        <button class="btn secondary" id="downloadSquare">Download square</button>
        <button class="btn secondary" id="shareCard" hidden>Share…</button>
        <button class="btn secondary" id="copyLink">Copy link</button>
      </div>`);

    let canvas = drawShareCard(a, topArtists, top(a.byTrack, 'plays', 5), p, 'story');
    let squareCanvas = drawShareCard(a, topArtists, top(a.byTrack, 'plays', 5), p, 'square');
    const preview = shareSlide.querySelector('#sharePreview');
    preview.src = canvas.toDataURL('image/png');

    // progressively enhance the cards with covers once they load — CAA sends
    // CORS headers on every hop, so drawing them doesn't taint the canvas
    loadCovers(covers).then(imgs => {
      if (!imgs.size || !document.body.contains(shareSlide)) return;
      canvas = drawShareCard(a, topArtists, top(a.byTrack, 'plays', 5), p, 'story', imgs);
      squareCanvas = drawShareCard(a, topArtists, top(a.byTrack, 'plays', 5), p, 'square', imgs);
      preview.src = canvas.toDataURL('image/png');
      refreshShareFile();
    });

    const download = (cv, name) => {
      const link = document.createElement('a');
      link.download = name;
      link.href = cv.toDataURL('image/png');
      link.click();
    };
    shareSlide.querySelector('#downloadCard').addEventListener('click', () =>
      download(canvas, `my-${selectedYear}-in-music-story.png`));
    shareSlide.querySelector('#downloadSquare').addEventListener('click', () =>
      download(squareCanvas, `my-${selectedYear}-in-music.png`));

    const copyBtn = shareSlide.querySelector('#copyLink');
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(
          `My ${selectedYear} in music. Make yours at ${location.origin + location.pathname}`);
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => { copyBtn.textContent = 'Copy link'; }, 1600);
      } catch { copyBtn.textContent = location.origin + location.pathname; }
    });

    const shareBtn = shareSlide.querySelector('#shareCard');
    let shareFile = null;
    // kept as a ready File so the click handler can call navigator.share
    // synchronously (Safari invalidates the tap gesture across async work)
    function refreshShareFile() {
      if (!navigator.share || !navigator.canShare) return;
      canvas.toBlob(blob => {
        if (!blob) return;
        const file = new File([blob], `wrapped-${selectedYear}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          shareFile = file;
          shareBtn.hidden = false;
        }
      });
    }
    refreshShareFile();
    shareBtn.addEventListener('click', () => shareFile && navigator.share({
      files: [shareFile],
      title: `My ${selectedYear} in music`,
      text: `My ${selectedYear} in music. Make yours at ${location.origin + location.pathname}`,
    }).catch(() => {}));
  }

  /* bump chart of the top five artists' monthly ranks — a line per artist,
   * a point only for months they were actually played. Needs a few active
   * months and at least 3 artists to be a race at all. */
  function sprintSvg(topArtists) {
    const runners = topArtists.filter(e => e.series);
    if (runners.length < 3) return null;
    const months = runners[0].series.length;
    const activeMonths = [...Array(months).keys()].filter(m => runners.some(e => (e.series[m] || 0) > 0));
    if (activeMonths.length < 4) return null;

    const lastActive = Math.max(...activeMonths); // an in-progress year ends where the data does
    const W = 620, TOP = 16, LX = 44, RX = W - 20, ROW = 30;
    const H = TOP + runners.length * ROW + 34;
    const x = m => LX + (m / Math.max(1, lastActive)) * (RX - LX);
    const y = rank => TOP + rank * ROW + ROW / 2;
    const COLORS = Charts.theme().cat;

    // rank per artist per month (null when not played that month)
    const pos = runners.map(() => new Array(months).fill(null));
    for (let m = 0; m < months; m++) {
      [...runners.keys()]
        .sort((i, j) => (runners[j].series[m] || 0) - (runners[i].series[m] || 0))
        .forEach((idx, rank) => { if ((runners[idx].series[m] || 0) > 0) pos[idx][m] = rank; });
    }

    const lines = runners.map((e, i) => {
      const pts = [];
      let seg = [];
      for (let m = 0; m < months; m++) {
        if (pos[i][m] == null) { if (seg.length > 1) pts.push(seg); seg = []; continue; }
        seg.push(`${x(m).toFixed(1)},${y(pos[i][m]).toFixed(1)}`);
      }
      if (seg.length > 1) pts.push(seg);
      const dots = pos[i].map((r, m) => r == null ? '' :
        `<circle cx="${x(m).toFixed(1)}" cy="${y(r).toFixed(1)}" r="3.5" fill="${COLORS[i]}"/>`).join('');
      return pts.map(seg =>
        `<polyline points="${seg.join(' ')}" fill="none" stroke="${COLORS[i]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>`
      ).join('') + dots;
    }).join('');

    const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    const labels = [...Array(lastActive + 1).keys()].map(m =>
      `<text x="${x(m).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${Charts.theme().muted}">${MONTHS[m] || m + 1}</text>`).join('');
    const rankLabels = runners.map((_, r) =>
      `<text x="${LX - 14}" y="${y(r) + 4}" text-anchor="middle" font-size="11" fill="${Charts.theme().muted}">#${r + 1}</text>`).join('');
    const legend = runners.map((e, i) =>
      `<span><i style="background:${COLORS[i]}"></i>${esc(e.key)}</span>`).join('');

    return `<div class="sprint"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly rank of your top artists">
      ${rankLabels}${lines}${labels}</svg>
      <div class="chart-legend" style="justify-content:center">${legend}</div></div>`;
  }

  /* weighted-median release year of the year's album listening —
   * only meaningful once enrichment covers a decent share of it */
  function listeningAge(a) {
    const dated = [];
    let covered = 0, total = 0;
    for (const e of top(a.byAlbum, 'ms')) {
      total += e.ms;
      const y = Enrich.getAlbum(e.artist, e.album)?.y;
      if (y) { dated.push([y, e.ms]); covered += e.ms; }
    }
    if (!total || covered / total < 0.3 || dated.length < 10) return null;
    dated.sort((p, q) => p[0] - q[0]);
    let acc = 0;
    for (const [year, ms] of dated) {
      acc += ms;
      if (acc >= covered / 2) return { median: year, share: covered / total };
    }
    return null;
  }

  /* covers for the top artists: their own artwork if the old cache has it,
   * else the cover of their most-played album (via the opt-in enrichment) */
  function artistCovers(a, artists) {
    const covers = new Map();
    const wanted = new Set(artists.map(e => e.key));
    for (const e of artists) {
      const own = Enrich.get(e.key)?.a;
      if (own) covers.set(e.key, own);
    }
    for (const e of top(a.byAlbum, 'ms')) {
      if (covers.size >= wanted.size) break;
      if (!wanted.has(e.artist) || covers.has(e.artist)) continue;
      const url = Enrich.albumArtUrl(e.artist, e.album);
      if (url) covers.set(e.artist, url);
    }
    return covers;
  }

  /* preload covers with CORS so they can be drawn onto the share canvas
   * without tainting it. Resolves with whatever loaded; failures just drop. */
  function loadCovers(urls) {
    const jobs = [...urls.entries()].map(([artist, url]) => new Promise(res => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      setTimeout(() => res(null), 8000);
      img.onload = () => res([artist, img]);
      img.onerror = () => res(null);
      img.src = url;
    }));
    return Promise.all(jobs).then(rs => new Map(rs.filter(Boolean)));
  }

  function personality(a) {
    const topA = top(a.byArtist, 'ms', 1)[0];
    const topShare = topA && a.musicMs ? topA.ms / a.musicMs : 0;
    const variety = a.musicStreams ? a.uniqueArtists / a.musicStreams : 0;

    if (a.nightShare > 0.35) return {
      emoji: '🦉', name: 'The Night Owl',
      blurb: `${fmtPct(a.nightShare)} of your listening happened between 10pm and 4am. The night shift suits you.`,
    };
    if (a.morningShare > 0.3) return {
      emoji: '🐦', name: 'The Early Bird',
      blurb: `${fmtPct(a.morningShare)} of your listening happened before 9am. Sunrise soundtrack, every day.`,
    };
    if (topShare > 0.25 && topA) return {
      emoji: '💘', name: 'The Devotee',
      blurb: `${fmtPct(topShare)} of your music time went to ${topA.key} alone. When you love, you love hard.`,
    };
    if (variety > 0.12) return {
      emoji: '🧭', name: 'The Explorer',
      blurb: `${fmtInt(a.uniqueArtists)} different artists this year. You rarely play the same thing twice.`,
    };
    if (a.longestStreak?.days >= 30) return {
      emoji: '🔥', name: 'The Everyday Listener',
      blurb: `A ${fmtInt(a.longestStreak.days)}-day listening streak. Music runs in the background of your entire life.`,
    };
    return {
      emoji: '⚖️', name: 'The Balanced Listener',
      blurb: `Old favorites, new finds, day and night: ${fmtInt(a.uniqueArtists)} artists in healthy rotation.`,
    };
  }

  function funFacts(a) {
    const facts = [];
    if (a.peakDay) facts.push(`Your biggest day was <b>${fmtDate(a.peakDay.day, { weekday: 'long', month: 'long', day: 'numeric' })}</b>: ${fmtMsLong(a.peakDay.ms)} of listening. What happened there?`);
    if (a.loopRecord && a.loopRecord.count >= 5) facts.push(`On ${fmtDate(a.loopRecord.day, { month: 'long', day: 'numeric' })} you played <b>“${esc(a.loopRecord.track)}”</b> ${a.loopRecord.count} times. In one day.`);
    if (a.longestStreak?.days > 3) facts.push(`You listened <b>${fmtInt(a.longestStreak.days)} days in a row</b> at your longest streak.`);
    facts.push(`Your golden hour is <b>${fmtHour(a.peakHour)}</b>, busier than any other time of day.`);
    if (a.newArtists) facts.push(`You discovered <b>${fmtInt(a.newArtists)} artists</b> you'd never played before${a.topNewArtist ? `, and ${esc(a.topNewArtist.artist)} stuck the hardest` : ''}.`);
    if (a.skipRate != null) facts.push(a.skipRate > 0.25
      ? `You skipped <b>${fmtPct(a.skipRate)}</b> of tracks. Ruthless. DJs fear you.`
      : `You only skipped <b>${fmtPct(a.skipRate)}</b> of tracks. Patience of a saint.`);
    if (a.firstTrack) facts.push(`Your year opened with <b>“${esc(a.firstTrack.track)}”</b> by ${esc(a.firstTrack.artist)}.`);
    if (a.podcastMs > 3.6e6) facts.push(`Plus <b>${fmtMs(a.podcastMs)}</b> of podcasts on the side.`);
    return facts.slice(0, 6);
  }

  /* host + path without protocol, e.g. "mrfyda.github.io/spotify-steaming-history" */
  function siteUrl() {
    return (location.host + location.pathname).replace(/\/$/, '');
  }

  /* draw a cover as a rounded square */
  function drawCover(ctx, img, x, y, size, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  }

  /* ---- share cards: 1080×1920 story, 1080×1080 square ----
   * covers: Map artist -> preloaded CORS-safe Image (optional) */
  function drawShareCard(a, topArtists, topTracks, p, format = 'story', covers = null) {
    if (format === 'square') return drawSquareCard(a, topArtists, topTracks, p, covers);
    const W = 1080, H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // quiet paper background with a hairline frame
    const INK = '#0b0b0b', SECONDARY = '#52514e', MUTED = '#898781', ACCENT = '#1c5cab';
    ctx.fillStyle = '#fcfcfb';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(11,11,11,0.14)';
    ctx.lineWidth = 3;
    ctx.strokeRect(30, 30, W - 60, H - 60);

    const sans = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const ellipsize = (text, maxW) => {
      let t = String(text);
      while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…';
      return t;
    };

    // header
    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED;
    ctx.font = `600 40px ${sans}`;
    ctx.fillText('My year in music', W / 2, 150);
    ctx.fillStyle = INK;
    ctx.font = `800 190px ${sans}`;
    ctx.fillText(String(a.year), W / 2, 340);

    // minutes
    ctx.fillStyle = ACCENT;
    ctx.font = `800 92px ${sans}`;
    ctx.fillText(`${fmtInt(a.totalMs / 60000)} minutes`, W / 2, 485);
    ctx.fillStyle = SECONDARY;
    ctx.font = `500 38px ${sans}`;
    ctx.fillText(`${fmtInt(a.streams)} streams · ${fmtInt(a.uniqueArtists)} artists · ${fmtInt(a.activeDays)} days`, W / 2, 548);

    // two columns of top-5s; artist rows carry covers when they loaded
    const colY = 680, lineH = 78;
    const drawList = (title, items, x, colW, arts) => {
      const hasArt = !!arts?.some(Boolean);
      ctx.textAlign = 'left';
      ctx.fillStyle = MUTED;
      ctx.font = `600 32px ${sans}`;
      ctx.fillText(title, x, colY);
      items.slice(0, 5).forEach((label, i) => {
        const y = colY + 70 + i * lineH;
        ctx.fillStyle = i === 0 ? ACCENT : '#b0aea6';
        ctx.font = `800 40px ${sans}`;
        ctx.fillText(String(i + 1), x, y);
        if (hasArt && arts[i]) drawCover(ctx, arts[i], x + 48, y - 44, 58, 10);
        const nameX = x + 48 + (hasArt ? 74 : 0);
        ctx.fillStyle = i === 0 ? INK : SECONDARY;
        ctx.font = `${i === 0 ? 800 : 600} 40px ${sans}`;
        ctx.fillText(ellipsize(label, colW - 60 - (hasArt ? 74 : 0)), nameX, y);
      });
    };
    drawList('Top artists', topArtists.map(e => e.key), 90, 450, covers && topArtists.map(e => covers.get(e.key)));
    drawList('Top songs', topTracks.map(e => e.track), 560, 450);

    // personality
    const py = 1250;
    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED;
    ctx.font = `600 32px ${sans}`;
    ctx.fillText('Listening personality', W / 2, py);
    ctx.fillStyle = INK;
    ctx.font = `800 72px ${sans}`;
    ctx.fillText(`${p.emoji} ${p.name}`, W / 2, py + 90);

    // headline facts
    ctx.fillStyle = SECONDARY;
    ctx.font = `500 36px ${sans}`;
    const lines = [];
    const t1 = topTracks[0];
    if (t1) lines.push(`#1 song: “${t1.track}” · ${fmtInt(t1.plays)} plays`);
    if (a.peakDay) lines.push(`Biggest day: ${fmtDate(a.peakDay.day, { month: 'long', day: 'numeric' })} (${fmtMs(a.peakDay.ms)})`);
    if (a.longestStreak?.days > 1) lines.push(`Longest streak: ${a.longestStreak.days} days in a row`);
    lines.forEach((l, i) => ctx.fillText(ellipsize(l, W - 160), W / 2, py + 190 + i * 62));

    // footer
    ctx.fillStyle = MUTED;
    ctx.font = `500 30px ${sans}`;
    ctx.fillText('made from my full streaming history', W / 2, H - 124);
    ctx.fillStyle = ACCENT;
    ctx.font = `600 32px ${sans}`;
    ctx.fillText(siteUrl(), W / 2, H - 76);

    return canvas;
  }

  function drawSquareCard(a, topArtists, topTracks, p, covers = null) {
    const W = 1080, H = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const INK = '#0b0b0b', SECONDARY = '#52514e', MUTED = '#898781', ACCENT = '#1c5cab';
    ctx.fillStyle = '#fcfcfb';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(11,11,11,0.14)';
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, W - 52, H - 52);

    const sans = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const ellipsize = (text, maxW) => {
      let t = String(text);
      while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…';
      return t;
    };

    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED;
    ctx.font = `600 34px ${sans}`;
    ctx.fillText('My year in music', W / 2, 118);
    ctx.fillStyle = INK;
    ctx.font = `800 150px ${sans}`;
    ctx.fillText(String(a.year), W / 2, 265);
    ctx.fillStyle = ACCENT;
    ctx.font = `800 72px ${sans}`;
    ctx.fillText(`${fmtInt(a.totalMs / 60000)} minutes`, W / 2, 375);
    ctx.fillStyle = SECONDARY;
    ctx.font = `500 32px ${sans}`;
    ctx.fillText(`${fmtInt(a.streams)} streams · ${fmtInt(a.uniqueArtists)} artists · ${fmtInt(a.activeDays)} days`, W / 2, 428);

    const colY = 540, lineH = 60;
    const drawList = (title, items, x, colW, arts) => {
      const hasArt = !!arts?.some(Boolean);
      ctx.textAlign = 'left';
      ctx.fillStyle = MUTED;
      ctx.font = `600 28px ${sans}`;
      ctx.fillText(title, x, colY);
      items.slice(0, 4).forEach((label, i) => {
        const y = colY + 58 + i * lineH;
        ctx.fillStyle = i === 0 ? ACCENT : '#b0aea6';
        ctx.font = `800 34px ${sans}`;
        ctx.fillText(String(i + 1), x, y);
        if (hasArt && arts[i]) drawCover(ctx, arts[i], x + 42, y - 34, 44, 8);
        const nameX = x + 42 + (hasArt ? 58 : 0);
        ctx.fillStyle = i === 0 ? INK : SECONDARY;
        ctx.font = `${i === 0 ? 800 : 600} 34px ${sans}`;
        ctx.fillText(ellipsize(label, colW - 50 - (hasArt ? 58 : 0)), nameX, y);
      });
    };
    drawList('Top artists', topArtists.map(e => e.key), 90, 450, covers && topArtists.map(e => covers.get(e.key)));
    drawList('Top songs', topTracks.map(e => e.track), 560, 450);

    ctx.textAlign = 'center';
    ctx.fillStyle = MUTED;
    ctx.font = `600 28px ${sans}`;
    ctx.fillText('Listening personality', W / 2, 890);
    ctx.fillStyle = INK;
    ctx.font = `800 56px ${sans}`;
    ctx.fillText(`${p.emoji} ${p.name}`, W / 2, 958);

    ctx.fillStyle = ACCENT;
    ctx.font = `600 28px ${sans}`;
    ctx.fillText(siteUrl(), W / 2, H - 62);

    return canvas;
  }

  function reset() { selectedYear = null; }

  return { render, reset };
})();
