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

    /* --- top artist --- */
    const topArtists = top(a.byArtist, 'ms', 5);
    if (topArtists.length) {
      const t1 = topArtists[0];
      const share = a.musicMs ? t1.ms / a.musicMs : 0;
      slide('c', `
        <div class="s-lead">Nobody came close to</div>
        <div class="s-hero">${esc(t1.key)}</div>
        <p class="s-sub">Your top artist. ${fmtMs(t1.ms)} together, ${fmtInt(t1.plays)} streams,
        and <b>${fmtPct(share)}</b> of all your music time.</p>`);

      slide('d', `
        <div class="s-lead">The rest of the podium held its ground.</div>
        <div class="top5">
          ${topArtists.map((e, i) => `
            <div class="t5"><span class="n">${i + 1}</span><span class="name">${esc(e.key)}</span>
            <span class="meta">${fmtMs(e.ms)}</span></div>`).join('')}
        </div>`);
    }

    /* --- top tracks --- */
    const topTracks = top(a.byTrack, 'plays', 5);
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
        <button class="btn" id="downloadCard">Download image</button>
        <button class="btn secondary" id="shareCard" hidden>Share…</button>
      </div>`);

    const canvas = drawShareCard(a, topArtists, top(a.byTrack, 'plays', 5), p);
    const preview = shareSlide.querySelector('#sharePreview');
    preview.src = canvas.toDataURL('image/png');

    shareSlide.querySelector('#downloadCard').addEventListener('click', () => {
      const link = document.createElement('a');
      link.download = `spotify-wrapped-${selectedYear}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

    const shareBtn = shareSlide.querySelector('#shareCard');
    if (navigator.share && navigator.canShare) {
      canvas.toBlob(blob => {
        const file = new File([blob], `wrapped-${selectedYear}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          shareBtn.hidden = false;
          shareBtn.addEventListener('click', () =>
            navigator.share({ files: [file], title: `My ${selectedYear} in music` }).catch(() => {}));
        }
      });
    }
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

  /* ---- 1080×1920 share card ---- */
  function drawShareCard(a, topArtists, topTracks, p) {
    const W = 1080, H = 1920;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#123c22');
    bg.addColorStop(0.55, '#0d0d0d');
    bg.addColorStop(1, '#0d0d0d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 180, 50, W / 2, 180, 700);
    glow.addColorStop(0, 'rgba(29,185,84,0.35)');
    glow.addColorStop(1, 'rgba(29,185,84,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 900);

    const sans = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    const ellipsize = (text, maxW) => {
      let t = String(text);
      while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -2) + '…';
      return t;
    };

    // header
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `600 40px ${sans}`;
    ctx.fillText('My year in music', W / 2, 140);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 190px ${sans}`;
    ctx.fillText(String(a.year), W / 2, 330);

    // minutes
    ctx.fillStyle = '#1DB954';
    ctx.font = `800 96px ${sans}`;
    ctx.fillText(`${fmtInt(a.totalMs / 60000)} minutes`, W / 2, 480);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `500 38px ${sans}`;
    ctx.fillText(`${fmtInt(a.streams)} streams · ${fmtInt(a.uniqueArtists)} artists · ${fmtInt(a.activeDays)} days`, W / 2, 545);

    // two columns of top-5s
    const colY = 680, lineH = 78;
    const drawList = (title, items, x, colW) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = `600 32px ${sans}`;
      ctx.fillText(title, x, colY);
      items.slice(0, 5).forEach((label, i) => {
        const y = colY + 70 + i * lineH;
        ctx.fillStyle = i === 0 ? '#1DB954' : 'rgba(255,255,255,0.45)';
        ctx.font = `800 40px ${sans}`;
        ctx.fillText(String(i + 1), x, y);
        ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,0.85)';
        ctx.font = `${i === 0 ? 800 : 600} 40px ${sans}`;
        ctx.fillText(ellipsize(label, colW - 60), x + 48, y);
      });
    };
    drawList('Top artists', topArtists.map(e => e.key), 90, 450);
    drawList('Top songs', topTracks.map(e => e.track), 560, 450);

    // personality
    const py = 1250;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `600 32px ${sans}`;
    ctx.fillText('Listening personality', W / 2, py);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 72px ${sans}`;
    ctx.fillText(`${p.emoji} ${p.name}`, W / 2, py + 90);

    // headline facts
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `500 36px ${sans}`;
    const lines = [];
    const t1 = topTracks[0];
    if (t1) lines.push(`#1 song: “${t1.track}” · ${fmtInt(t1.plays)} plays`);
    if (a.peakDay) lines.push(`Biggest day: ${fmtDate(a.peakDay.day, { month: 'long', day: 'numeric' })} (${fmtMs(a.peakDay.ms)})`);
    if (a.longestStreak?.days > 1) lines.push(`Longest streak: ${a.longestStreak.days} days in a row`);
    lines.forEach((l, i) => ctx.fillText(ellipsize(l, W - 160), W / 2, py + 190 + i * 62));

    // footer
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `500 30px ${sans}`;
    ctx.fillText('made with my real streaming history · not an official Spotify thing', W / 2, H - 80);

    return canvas;
  }

  function reset() { selectedYear = null; }

  return { render, reset };
})();
