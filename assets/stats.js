/* Stats — aggregates normalized plays into everything both views need.
 * A "stream" follows Spotify's convention: counted when played ≥ 30s.
 * Time totals always sum every millisecond, including sub-30s plays.
 */
const Stats = (() => {

  const STREAM_MS = 30_000;

  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

  function bump(map, key, ms, counted) {
    let e = map.get(key);
    if (!e) { e = { plays: 0, ms: 0 }; map.set(key, e); }
    if (counted) e.plays++;
    e.ms += ms;
    return e;
  }

  /** First-ever stream timestamps per track/artist across the FULL dataset,
   *  cached per plays array so year-filter switches don't recompute. */
  const firstsCache = new WeakMap();
  function globalFirsts(plays) {
    let f = firstsCache.get(plays);
    if (f) return f;
    const trackFirst = new Map(), artistFirst = new Map();
    for (const p of plays) {
      if (p.kind !== 'music' || p.ms < STREAM_MS) continue;
      const tk = p.artist + '\u0000' + p.track;
      if (!trackFirst.has(tk)) trackFirst.set(tk, p.ts); // plays are sorted by ts
      if (!artistFirst.has(p.artist)) artistFirst.set(p.artist, p.ts);
    }
    f = { trackFirst, artistFirst };
    firstsCache.set(plays, f);
    return f;
  }

  const SESSION_GAP = 30 * 60_000; // a >30min silence starts a new session

  function years(plays) {
    const ys = new Set();
    for (const p of plays) ys.add(new Date(p.ts).getFullYear());
    return [...ys].sort((a, b) => a - b);
  }

  /**
   * aggregate(plays, {year}) — year is a number or null for all-time.
   * `allPlays` (full dataset) is only used for discovery ("new artists this year").
   */
  function aggregate(allPlays, { year = null } = {}) {
    const plays = year == null ? allPlays
      : allPlays.filter(p => new Date(p.ts).getFullYear() === year);

    const a = {
      year, empty: plays.length === 0,
      totalEntries: plays.length,
      streams: 0, musicStreams: 0,
      totalMs: 0, musicMs: 0, podcastMs: 0,
      firstTs: null, lastTs: null,
      byArtist: new Map(), byTrack: new Map(), byAlbum: new Map(), byShow: new Map(),
      byMonth: new Map(), byDay: new Map(),
      byHour: Array.from({ length: 24 }, () => ({ plays: 0, ms: 0 })),
      byWeekday: Array.from({ length: 7 }, () => ({ plays: 0, ms: 0 })),
      punch: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)), // ms
      platforms: new Map(), countries: new Map(),
      skippable: 0, skipped: 0, shuffleKnown: 0, shuffleOn: 0,
      trackDone: 0, trackDoneKnown: 0,
      offlineKnown: 0, offlineOn: 0,
      startKnown: 0, startChosen: 0, replays: 0, incognitoCount: 0,
      newTracksTotal: 0,
      discoveryHow: { chosen: 0, flowed: 0, shuffled: 0, other: 0 },
      discoveryDoorway: { dive: 0, another: 0, podcast: 0, opener: 0 },
    };
    if (a.empty) return a;

    const { trackFirst, artistFirst } = globalFirsts(allPlays);
    const trackSets = new Map(); // artist -> Set of track keys
    const dayTrackCounts = new Map(); // `${day}|${trackKey}` -> count (for loop record)
    const eras = new Map(); // period (year, or month in year view) -> Map(artist -> ms)

    // per-artist sparkline buckets: years for all-time, months for a year view
    const startYear = new Date(plays[0].ts).getFullYear();
    const seriesLen = year == null
      ? new Date(plays[plays.length - 1].ts).getFullYear() - startYear + 1
      : 12;

    // session accumulator
    let sessionCount = 0, sessionMsTotal = 0, prevEnd = null, prevItem = null;
    let curStart = null, curMs = 0, curTracks = 0, longest = null;
    const closeSession = () => {
      if (curStart == null) return;
      sessionMsTotal += curMs;
      if (!longest || curMs > longest.ms) longest = { ms: curMs, start: curStart, tracks: curTracks };
    };

    for (const p of plays) {
      const d = new Date(p.ts);
      const counted = p.ms >= STREAM_MS;
      a.totalMs += p.ms;
      if (counted) a.streams++;
      if (a.firstTs == null) a.firstTs = p.ts;
      a.lastTs = p.ts;

      const isSessionStart = prevEnd == null || p.ts - prevEnd > SESSION_GAP;
      if (isSessionStart) {
        closeSession();
        curStart = p.ts - p.ms; curMs = 0; curTracks = 0; sessionCount++;
      }
      curMs += p.ms;
      if (counted) curTracks++;
      prevEnd = p.ts;

      const monthE = bump(a.byMonth, monthKey(d), p.ms, counted);
      bump(a.byDay, dayKey(d), p.ms, counted);
      const h = d.getHours(), wd = (d.getDay() + 6) % 7; // Mon=0
      a.byHour[h].ms += p.ms; if (counted) a.byHour[h].plays++;
      a.byWeekday[wd].ms += p.ms; if (counted) a.byWeekday[wd].plays++;
      a.punch[wd][h] += p.ms;

      if (p.platform && p.platform !== 'Unknown') bump(a.platforms, p.platform, p.ms, counted);
      if (p.country && p.country !== 'ZZ') bump(a.countries, p.country, p.ms, counted);
      if (p.shuffle != null) { a.shuffleKnown++; if (p.shuffle) a.shuffleOn++; }
      if (p.offline != null) { a.offlineKnown++; if (p.offline) a.offlineOn++; }

      if (p.kind === 'music') {
        a.musicMs += p.ms;
        if (counted) a.musicStreams++;
        if (p.skipped != null) { a.skippable++; if (p.skipped) a.skipped++; }
        if (p.reasonEnd != null) { a.trackDoneKnown++; if (p.reasonEnd === 'trackdone') a.trackDone++; }
        if (p.reasonStart != null) {
          a.startKnown++;
          if (p.reasonStart === 'clickrow' || p.reasonStart === 'playbtn' || p.reasonStart === 'backbtn') a.startChosen++;
        }
        if (p.incognito) a.incognitoCount++;
        if (counted) monthE.musicPlays = (monthE.musicPlays || 0) + 1;
        monthE.musicMs = (monthE.musicMs || 0) + p.ms;

        const artistE = bump(a.byArtist, p.artist, p.ms, counted);
        if (!artistE.series) artistE.series = new Array(seriesLen).fill(0);
        artistE.series[year == null ? d.getFullYear() - startYear : d.getMonth()] += p.ms;
        if (h < 5) artistE.nightMs = (artistE.nightMs || 0) + p.ms;
        if (artistE.lastPlayTs != null) {
          const gap = p.ts - artistE.lastPlayTs;
          if (gap > (artistE.maxGap || 0)) { artistE.maxGap = gap; artistE.maxGapEnd = p.ts; }
        }
        artistE.lastPlayTs = p.ts;

        const periodKey = year == null ? String(d.getFullYear()) : monthKey(d);
        let eraMap = eras.get(periodKey);
        if (!eraMap) { eraMap = new Map(); eras.set(periodKey, eraMap); }
        eraMap.set(p.artist, (eraMap.get(p.artist) || 0) + p.ms);

        const trackKey = p.artist + '\u0000' + p.track;
        const tE = bump(a.byTrack, trackKey, p.ms, counted);
        tE.track = p.track; tE.artist = p.artist;
        if (!tE.firstTs) tE.firstTs = p.ts;
        tE.lastTs = p.ts;
        if (p.skipped) tE.skips = (tE.skips || 0) + 1;
        if (p.reasonStart === 'backbtn') { a.replays++; tE.replays = (tE.replays || 0) + 1; }
        if (counted && trackFirst.get(trackKey) === p.ts) {
          a.newTracksTotal++;
          monthE.newTracks = (monthE.newTracks || 0) + 1;

          // HOW the discovery started (from reason_start + shuffle)…
          if (p.reasonStart === 'clickrow' || p.reasonStart === 'playbtn') a.discoveryHow.chosen++;
          else if (p.reasonStart === 'trackdone') a.discoveryHow[p.shuffle ? 'shuffled' : 'flowed']++;
          else if (p.reasonStart != null) a.discoveryHow.other++;
          // …and the doorway it came through (what played right before)
          if (isSessionStart || !prevItem) a.discoveryDoorway.opener++;
          else if (prevItem.kind !== 'music') a.discoveryDoorway.podcast++;
          else if (prevItem.artist === p.artist) a.discoveryDoorway.dive++;
          else a.discoveryDoorway.another++;
        }

        let set = trackSets.get(p.artist);
        if (!set) { set = new Set(); trackSets.set(p.artist, set); }
        set.add(trackKey);
        artistE.tracks = set.size;

        if (p.album) {
          const alKey = p.artist + '\u0000' + p.album;
          const alE = bump(a.byAlbum, alKey, p.ms, counted);
          alE.album = p.album; alE.artist = p.artist;
        }
        if (counted) {
          const k = dayKey(d) + '|' + trackKey;
          dayTrackCounts.set(k, (dayTrackCounts.get(k) || 0) + 1);
        }
      } else {
        a.podcastMs += p.ms;
        monthE.podcastMs = (monthE.podcastMs || 0) + p.ms;
        const sE = bump(a.byShow, p.show, p.ms, counted);
        sE.kind = p.kind;
      }

      if (counted) prevItem = p;
    }

    closeSession();

    // ---- derived ----
    a.uniqueArtists = a.byArtist.size;
    a.uniqueTracks = a.byTrack.size;
    a.uniqueAlbums = a.byAlbum.size;
    a.uniqueShows = a.byShow.size;
    a.activeDays = a.byDay.size;
    a.daySpan = Math.max(1, Math.round((a.lastTs - a.firstTs) / 86_400_000) + 1);

    // peak day
    let peak = null;
    for (const [day, e] of a.byDay) if (!peak || e.ms > peak.ms) peak = { day, ...e };
    a.peakDay = peak;

    // longest streak of consecutive listening days
    const days = [...a.byDay.keys()].sort();
    let best = 0, bestEnd = null, cur = 0, prev = null;
    for (const day of days) {
      const t = Date.parse(day + 'T12:00:00');
      cur = (prev != null && t - prev === 86_400_000) ? cur + 1 : 1;
      prev = t;
      if (cur > best) { best = cur; bestEnd = day; }
    }
    a.longestStreak = { days: best, end: bestEnd };

    // biggest one-day loop
    let loop = null;
    for (const [k, count] of dayTrackCounts) {
      if (!loop || count > loop.count) {
        const [day, trackKey] = k.split('|');
        loop = { count, day, trackKey };
      }
    }
    if (loop) {
      const t = a.byTrack.get(loop.trackKey);
      a.loopRecord = { count: loop.count, day: loop.day, track: t?.track, artist: t?.artist };
    }

    // most skipped track (with enough plays to be fair)
    let sk = null;
    for (const e of a.byTrack.values()) {
      if ((e.skips || 0) >= 3 && e.plays + (e.skips || 0) >= 5) {
        if (!sk || e.skips > sk.skips) sk = e;
      }
    }
    a.mostSkipped = sk;

    a.skipRate = a.skippable ? a.skipped / a.skippable : null;
    a.shuffleRate = a.shuffleKnown ? a.shuffleOn / a.shuffleKnown : null;
    a.completionRate = a.trackDoneKnown ? a.trackDone / a.trackDoneKnown : null;
    a.offlineRate = a.offlineKnown ? a.offlineOn / a.offlineKnown : null;

    // sessions
    a.sessions = {
      count: sessionCount,
      avgMs: sessionCount ? sessionMsTotal / sessionCount : 0,
      longest,
    };

    // eras: top artist per period (year, or month within a year view)
    a.eras = [...eras.entries()]
      .map(([period, m]) => {
        let best = null;
        let total = 0;
        for (const [artist, ms] of m) {
          total += ms;
          if (!best || ms > best.ms) best = { artist, ms };
        }
        return { period, artist: best.artist, ms: best.ms, share: total ? best.ms / total : 0 };
      })
      .sort((x, y) => x.period.localeCompare(y.period));

    // intent & discovery
    a.startChosenRate = a.startKnown ? a.startChosen / a.startKnown : null;
    a.discoveryRate = a.musicStreams ? a.newTracksTotal / a.musicStreams : null;

    // share of music streams that went to artists first discovered in this range
    if (year != null) {
      let newArtistStreams = 0;
      for (const [artist, e] of a.byArtist) {
        const first = artistFirst.get(artist);
        if (first != null && new Date(first).getFullYear() === year) newArtistStreams += e.plays;
      }
      a.newArtistShare = a.musicStreams ? newArtistStreams / a.musicStreams : null;
    }

    // most-rewound track (reason_start === backbtn)
    let replay = null;
    for (const e of a.byTrack.values()) {
      if ((e.replays || 0) >= 2 && (!replay || e.replays > replay.replays)) replay = e;
    }
    a.topReplay = replay;

    // comeback: biggest silence inside an artist you kept coming back to
    let comeback = null;
    for (const [artist, e] of a.byArtist) {
      if (e.plays >= 10 && (e.maxGap || 0) > 365 * 86_400_000) {
        if (!comeback || e.maxGap > comeback.gap) comeback = { artist, gap: e.maxGap, end: e.maxGapEnd };
      }
    }
    a.comeback = comeback;

    // longest-running favorite: biggest first-to-last span among well-played tracks
    let evergreen = null;
    for (const e of a.byTrack.values()) {
      if (e.plays >= 15) {
        const span = e.lastTs - e.firstTs;
        if (span > 365 * 86_400_000 && (!evergreen || span > evergreen.span)) {
          evergreen = { track: e.track, artist: e.artist, span, plays: e.plays };
        }
      }
    }
    a.evergreen = evergreen;

    // one-hit wonder: an artist you only ever really play one song of
    const artistTrackTop = new Map();
    for (const e of a.byTrack.values()) {
      const acc = artistTrackTop.get(e.artist) || { total: 0, best: 0, bestTrack: null };
      acc.total += e.plays;
      if (e.plays > acc.best) { acc.best = e.plays; acc.bestTrack = e.track; }
      artistTrackTop.set(e.artist, acc);
    }
    let oneHit = null;
    for (const [artist, acc] of artistTrackTop) {
      if (acc.total >= 30 && acc.best / acc.total >= 0.8 && (!oneHit || acc.total > oneHit.plays)) {
        oneHit = { artist, track: acc.bestTrack, plays: acc.total, share: acc.best / acc.total };
      }
    }
    a.oneHit = oneHit;

    // late-night companion: most-heard artist between midnight and 5am
    let night = null;
    for (const [artist, e] of a.byArtist) {
      if ((e.nightMs || 0) > 30 * 60_000 && (!night || e.nightMs > night.ms)) night = { artist, ms: e.nightMs };
    }
    a.nightArtist = night;

    // listening fingerprint — five 0..1 axes for the radar
    const artistsByMs = [...a.byArtist.values()].sort((x, y) => y.ms - x.ms);
    const top10Ms = artistsByMs.slice(0, 10).reduce((sum, e) => sum + e.ms, 0);
    let heavyPlays = 0;
    for (const e of a.byTrack.values()) if (e.plays >= 10) heavyPlays += e.plays;
    a.fingerprint = {
      Consistency: Math.min(1, a.activeDays / a.daySpan),
      Discovery: a.discoveryRate || 0,
      Replay: a.musicStreams ? heavyPlays / a.musicStreams : 0,
      Concentration: a.musicMs ? top10Ms / a.musicMs : 0,
      Variety: Math.min(1, (a.uniqueArtists / Math.max(1, a.musicStreams)) / 0.25),
    };

    // time-of-day shares (by ms)
    const hourMs = a.byHour.map(e => e.ms);
    const msTotal = hourMs.reduce((s, v) => s + v, 0) || 1;
    const share = (from, to) => { // [from, to) hours, wrapping
      let s = 0;
      for (let h = from; h !== to; h = (h + 1) % 24) s += hourMs[h];
      return s / msTotal;
    };
    a.nightShare = share(22, 4);     // 22:00–03:59
    a.morningShare = share(5, 9);    // 05:00–08:59
    a.peakHour = hourMs.indexOf(Math.max(...hourMs));

    // discovery: artists whose first-ever play falls inside this range
    if (year != null) {
      let n = 0; let earliest = null;
      for (const [artist, ts] of artistFirst) {
        if (new Date(ts).getFullYear() === year) {
          n++;
          if (a.byArtist.has(artist)) {
            const e = a.byArtist.get(artist);
            if (!earliest || e.ms > earliest.ms) earliest = { artist, ms: e.ms };
          }
        }
      }
      a.newArtists = n;
      a.topNewArtist = earliest;
    }

    // first & last played track in range
    const firstMusic = plays.find(p => p.kind === 'music' && p.ms >= STREAM_MS);
    if (firstMusic) a.firstTrack = { track: firstMusic.track, artist: firstMusic.artist, ts: firstMusic.ts };

    return a;
  }

  function top(map, by = 'ms', n = Infinity) {
    return [...map.entries()]
      .map(([key, e]) => ({ key, ...e }))
      .sort((x, y) => (y[by] - x[by]) || (y.ms - x.ms))
      .slice(0, n);
  }

  /* ---- formatting helpers ---- */
  const fmtInt = n => Math.round(n).toLocaleString('en-US');

  function fmtMs(ms, { compact = false } = {}) {
    const min = ms / 60000;
    if (min < 60) return `${Math.round(min)} min`;
    const h = min / 60;
    if (h < 100) return `${(Math.round(h * 10) / 10).toLocaleString('en-US')} h`;
    if (compact && h >= 24 * 30) return `${fmtInt(h / 24)} days`;
    return `${fmtInt(h)} h`;
  }

  function fmtMsLong(ms) {
    const totalMin = Math.floor(ms / 60000);
    const d = Math.floor(totalMin / 1440), h = Math.floor((totalMin % 1440) / 60), m = totalMin % 60;
    if (d > 0) return `${fmtInt(d)}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const fmtPct = x => {
    const pct = x * 100;
    if (x > 0 && pct < 1) return '<1%'; // anything real below 1% reads <1%, never 0% or a rounded-up 1%
    return `${Math.round(pct)}%`;
  };

  function fmtDate(tsOrKey, opts = { year: 'numeric', month: 'short', day: 'numeric' }) {
    const d = typeof tsOrKey === 'string' ? new Date(tsOrKey + 'T12:00:00') : new Date(tsOrKey);
    return d.toLocaleDateString('en-US', opts);
  }

  const fmtHour = h => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

  return { STREAM_MS, aggregate, top, years, fmtInt, fmtMs, fmtMsLong, fmtPct, fmtDate, fmtHour };
})();
