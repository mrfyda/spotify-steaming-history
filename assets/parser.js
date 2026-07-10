/* Parser — turns Spotify and Apple Music export files into normalized
 * play records.
 *
 * Supported inputs:
 *  - Spotify extended streaming history zip: "Streaming_History_Audio_*.json",
 *    "Streaming_History_Video_*.json" (schema per Spotify's ReadMeFirst PDF),
 *    older exports named "endsong_*.json"
 *  - Spotify account data zip: "StreamingHistory*.json" ({endTime, artistName, trackName, msPlayed})
 *  - Apple Music (privacy.apple.com "Apple Media Services information"):
 *    "Apple Music - Play Activity.csv" / "Apple Music Play Activity.csv"
 *    (per-play events with timestamps) and, as a coarser fallback,
 *    "Apple Music - Play History Daily Tracks.csv" (daily totals only)
 *  - The same .json / .csv files dropped directly (unzipped)
 *
 * Normalized record:
 *  { ts, ms, kind: 'music'|'podcast'|'audiobook',
 *    track, artist, album, uri, show, episode,
 *    platform, country, reasonStart, reasonEnd,
 *    shuffle, skipped, offline, incognito }
 * skipped is true/false when the export provides it, otherwise null.
 *
 * parseFiles returns the records as a PlayStore (columnar, ~35 B/play), not
 * an object array — a decade of history would otherwise hold hundreds of MB
 * of heap, which gets the tab evicted on mobile. Records exist as objects
 * only one file at a time, on their way into the store; uri and episode are
 * used for dedupe here but not retained (nothing downstream reads them).
 */
const Parser = (() => {

  const HISTORY_FILE_RE = /(streaming[ _]?history|endsong).*\.json$/i;
  const APPLE_ACTIVITY_RE = /play[ _]?activity.*\.csv$/i;
  const APPLE_DAILY_RE = /play[ _]?history[ _]?daily[ _]?tracks.*\.csv$/i;

  function looksLikeHistoryJson(name) {
    return HISTORY_FILE_RE.test(name.replace(/^.*\//, '')) && !/__MACOSX/.test(name);
  }
  const baseName = name => name.replace(/^.*\//, '');
  const isAppleActivity = name => APPLE_ACTIVITY_RE.test(baseName(name)) && !/__MACOSX/.test(name);
  const isAppleDaily = name => APPLE_DAILY_RE.test(baseName(name)) && !/__MACOSX/.test(name);

  function normalizePlatform(p) {
    if (!p) return 'Unknown';
    const s = String(p).toLowerCase();
    if (s.includes('ios') || s.includes('iphone') || s.includes('ipad')) return 'iOS';
    if (s.includes('android')) return 'Android';
    if (s.includes('windows')) return 'Windows';
    if (s.includes('os x') || s.includes('osx') || s.includes('macos') || s.includes('mac ')) return 'Mac';
    if (s.includes('linux')) return 'Linux';
    if (s.includes('web') || s.includes('browser')) return 'Web player';
    if (s.includes('sonos') || s.includes('cast') || s.includes('chromecast')) return 'Speakers / cast';
    if (s.includes('ps3') || s.includes('ps4') || s.includes('ps5') || s.includes('xbox')) return 'Game console';
    if (s.includes('tv')) return 'TV';
    if (s.includes('partner') || s.includes('embedded') || s.includes('watch') || s.includes('garmin')) return 'Other devices';
    return 'Other';
  }

  function fromExtended(r) {
    const ts = Date.parse(r.ts || r.offline_timestamp || '');
    if (!isFinite(ts)) return null;
    const ms = Number(r.ms_played) || 0;

    let kind = 'music', track = null, artist = null, album = null, uri = null, show = null, episode = null;
    if (r.master_metadata_track_name) {
      track  = r.master_metadata_track_name;
      artist = r.master_metadata_album_artist_name || 'Unknown artist';
      album  = r.master_metadata_album_album_name || null;
      uri    = r.spotify_track_uri || null;
    } else if (r.episode_name || r.episode_show_name) {
      kind = 'podcast';
      episode = r.episode_name || 'Unknown episode';
      show    = r.episode_show_name || 'Unknown show';
      uri     = r.spotify_episode_uri || null;
    } else if (r.audiobook_title || r.audiobook_chapter_title) {
      kind = 'audiobook';
      episode = r.audiobook_chapter_title || 'Unknown chapter';
      show    = r.audiobook_title || 'Unknown audiobook';
      uri     = r.audiobook_uri || null;
    } else {
      return null; // no metadata at all (rare deleted-content rows)
    }

    return {
      ts, ms, kind, track, artist, album, uri, show, episode,
      platform: normalizePlatform(r.platform),
      country: r.conn_country || null,
      reasonStart: r.reason_start || null,
      reasonEnd: r.reason_end || null,
      shuffle: typeof r.shuffle === 'boolean' ? r.shuffle : null,
      skipped: typeof r.skipped === 'boolean' ? r.skipped : null,
      offline: typeof r.offline === 'boolean' ? r.offline : null,
      incognito: typeof r.incognito_mode === 'boolean' ? r.incognito_mode : null,
    };
  }

  function fromAccountData(r) {
    // {endTime: "2023-11-05 14:03", artistName, trackName, msPlayed}
    const ts = Date.parse(String(r.endTime).replace(' ', 'T'));
    if (!isFinite(ts)) return null;
    const isPodcast = !r.trackName && !!r.episodeName;
    return {
      ts, ms: Number(r.msPlayed) || 0,
      kind: isPodcast ? 'podcast' : 'music',
      track: r.trackName || null,
      artist: r.artistName || (isPodcast ? null : 'Unknown artist'),
      album: null, uri: null,
      show: isPodcast ? (r.artistName || 'Unknown show') : null,
      episode: isPodcast ? r.episodeName : null,
      platform: 'Unknown', country: null,
      reasonStart: null, reasonEnd: null,
      shuffle: null, skipped: null, offline: null, incognito: null,
    };
  }

  function normalizeArray(arr) {
    const out = [];
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      const rec = ('endTime' in r) ? fromAccountData(r) : fromExtended(r);
      if (rec) out.push(rec);
    }
    return out;
  }

  /* ---------- Apple Music ---------- */

  /** Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas,
   *  quotes and newlines. Returns an array of row arrays. */
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /** CSV text -> array of header-keyed objects. */
  function csvObjects(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).map(cells => {
      const o = {};
      headers.forEach((h, i) => { o[h] = cells[i] ?? ''; });
      return o;
    });
  }

  const DAY_MS = 86_400_000;

  /* "Apple Music Play Activity.csv": one row per playback event, with real
   * timestamps. Column names drift across export vintages, so read leniently. */
  function fromAppleActivity(r) {
    if (r['Event Type'] && r['Event Type'] !== 'PLAY_END') return null;
    const track = r['Song Name'] || r['Content Name'];
    if (!track) return null;
    const ts = Date.parse(r['Event Start Timestamp'] || r['Event End Timestamp'] || r['Event Received Timestamp'] || '');
    if (!isFinite(ts)) return null;
    let ms = Number(r['Play Duration Milliseconds']);
    if (!isFinite(ms) || ms < 0) ms = 0;               // scrubbing produces negatives
    ms = Math.min(ms, 6 * 3_600_000);                  // and the odd absurd outlier
    const end = r['End Reason Type'] || null;
    return {
      ts, ms, kind: 'music',
      track,
      artist: r['Artist Name'] || 'Unknown artist',
      album: r['Album Name'] || null,
      uri: null, show: null, episode: null,
      platform: 'Unknown',
      country: null,
      reasonStart: null,
      reasonEnd: end === 'NATURAL_END_OF_TRACK' ? 'trackdone' : end ? end.toLowerCase() : null,
      shuffle: null,
      skipped: end === 'TRACK_SKIPPED_FORWARDS' ? true : end === 'NATURAL_END_OF_TRACK' ? false : null,
      offline: r['Offline'] === 'TRUE' ? true : r['Offline'] === 'FALSE' ? false : null,
      incognito: null,
    };
  }

  /* "Apple Music - Play History Daily Tracks.csv": one row per track per day,
   * no time of day. "Track Description" is "Artist - Track". */
  function fromAppleDaily(r) {
    const desc = r['Track Description'];
    const dp = String(r['Date Played'] || '');
    if (!desc || !/^\d{8}$/.test(dp)) return null;
    const ts = Date.parse(`${dp.slice(0, 4)}-${dp.slice(4, 6)}-${dp.slice(6, 8)}T12:00:00`);
    if (!isFinite(ts)) return null;
    const di = desc.indexOf(' - ');
    const artist = di > 0 ? desc.slice(0, di) : 'Unknown artist';
    const track = di > 0 ? desc.slice(di + 3) : desc;
    const totalMs = Math.max(0, Number(r['Play Duration Milliseconds']) || 0);
    const count = Math.max(1, Math.min(200, Number(r['Play Count']) || 1));
    // spread the day's plays out so each survives dedupe as its own record
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push({
        ts: ts + i * 60_000, ms: totalMs / count, kind: 'music',
        track, artist, album: null, uri: null, show: null, episode: null,
        platform: 'Unknown', country: r['Country'] || null,
        reasonStart: null, reasonEnd: null,
        shuffle: null, skipped: null, offline: null, incognito: null,
      });
    }
    return out;
  }

  function parseAppleCsv(text, kind) {
    const objs = csvObjects(text);
    const out = [];
    for (const r of objs) {
      if (kind === 'activity') {
        const rec = fromAppleActivity(r);
        if (rec) out.push(rec);
      } else {
        const recs = fromAppleDaily(r);
        if (recs) out.push(...recs);
      }
    }
    return out;
  }

  async function parseJsonText(text) {
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('One of the JSON files could not be parsed.'); }
    if (!Array.isArray(data)) return [];
    return normalizeArray(data);
  }

  /* 53-bit hash of the dedupe key. Holding the key STRINGS for a whole
   * export keeps tens of MB alive through the entire parse — the memory
   * peak that matters on mobile — while a Set of numbers is a fraction of
   * that. Collision odds across a million plays are ~1e-7, and a collision
   * merely drops one play. */
  function keyHash(s) {
    let h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return h1 * 0x200000 + (h2 >>> 11); // 32 + 21 bits
  }

  /** files: FileList/array of File. onProgress(text).
   *  Returns {plays: PlayStore, filesRead}. */
  async function parseFiles(files, onProgress) {
    const builder = PlayStore.builder();
    const seen = new Set();
    let filesRead = 0;

    const addAll = (recs) => {
      for (const p of recs) {
        // dedupe (same file dropped twice / audio+video overlap)
        const key = keyHash(p.ts + '|' + p.ms + '|' + (p.uri || p.track || p.episode || ''));
        if (seen.has(key)) continue;
        seen.add(key);
        builder.add(p);
      }
    };

    // gather sources first so Apple's fine-grained Play Activity can suppress
    // the coarse Daily Tracks file (they describe the same listening twice)
    const jsonSources = [], activitySources = [], dailySources = [];

    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.zip')) {
        onProgress?.(`Opening ${file.name}…`);
        const zip = await JSZip.loadAsync(file);
        let matched = 0;
        for (const f of Object.values(zip.files)) {
          if (f.dir) continue;
          const src = { name: f.name, text: () => f.async('string') };
          if (looksLikeHistoryJson(f.name)) { jsonSources.push(src); matched++; }
          else if (isAppleActivity(f.name)) { activitySources.push(src); matched++; }
          else if (isAppleDaily(f.name)) { dailySources.push(src); matched++; }
        }
        if (!matched) {
          throw new Error(`No streaming history files found inside ${file.name}. ` +
            `Drop the zip Spotify sent you (Streaming_History_*.json inside) or Apple's ` +
            `"Apple Media Services information" zip (Apple Music Play Activity.csv inside).`);
        }
      } else if (name.endsWith('.json') || name.endsWith('.csv')) {
        const src = { name: file.name, text: () => file.text() };
        if (name.endsWith('.json')) jsonSources.push(src);
        else if (isAppleDaily(file.name)) dailySources.push(src);
        else activitySources.push(src); // any other CSV: try the activity schema
      }
    }

    const readSources = async (sources, handler) => {
      let i = 0;
      for (const entry of sources) {
        i++;
        onProgress?.(`Reading ${baseName(entry.name)} (${i}/${sources.length})…`);
        addAll(await handler(await entry.text()));
        filesRead++;
        await new Promise(r => setTimeout(r)); // let the UI breathe
      }
    };

    await readSources(jsonSources, parseJsonText);
    await readSources(activitySources, t => parseAppleCsv(t, 'activity'));
    // Daily Tracks describes the same listening as Play Activity, only coarser —
    // read it only when it's all we have
    if (!builder.count) await readSources(dailySources, t => parseAppleCsv(t, 'daily'));

    if (!filesRead) throw new Error('Please drop a Spotify or Apple Music export .zip (or its .json/.csv files).');
    if (!builder.count) throw new Error('The files were read but contained no plays.');

    onProgress?.(`Crunching ${builder.count.toLocaleString()} plays…`);
    await new Promise(r => setTimeout(r));
    return { plays: builder.finish(), filesRead };
  }

  return { parseFiles, normalizeArray };
})();
