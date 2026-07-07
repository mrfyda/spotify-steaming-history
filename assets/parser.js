/* Parser — turns Spotify export files into normalized play records.
 *
 * Supported inputs:
 *  - Extended streaming history zip: "Streaming_History_Audio_*.json",
 *    "Streaming_History_Video_*.json" (schema per Spotify's ReadMeFirst PDF),
 *    older exports named "endsong_*.json"
 *  - Account data zip: "StreamingHistory*.json" ({endTime, artistName, trackName, msPlayed})
 *  - The same JSON files dropped directly (unzipped)
 *
 * Normalized record:
 *  { ts, ms, kind: 'music'|'podcast'|'audiobook',
 *    track, artist, album, uri, show, episode,
 *    platform, country, reasonStart, reasonEnd,
 *    shuffle, skipped, offline, incognito }
 * skipped is true/false when the export provides it, otherwise null.
 */
const Parser = (() => {

  const HISTORY_FILE_RE = /(streaming[ _]?history|endsong).*\.json$/i;

  function looksLikeHistoryJson(name) {
    return HISTORY_FILE_RE.test(name.replace(/^.*\//, '')) && !/__MACOSX/.test(name);
  }

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

  async function parseJsonText(text) {
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('One of the JSON files could not be parsed.'); }
    if (!Array.isArray(data)) return [];
    return normalizeArray(data);
  }

  /** files: FileList/array of File. onProgress(text). Returns {plays, filesRead}. */
  async function parseFiles(files, onProgress) {
    const plays = [];
    const seen = new Set();
    let filesRead = 0;

    const addAll = (recs) => {
      for (const p of recs) {
        // dedupe (same file dropped twice / audio+video overlap)
        const key = p.ts + '|' + p.ms + '|' + (p.uri || p.track || p.episode || '');
        if (seen.has(key)) continue;
        seen.add(key);
        plays.push(p);
      }
    };

    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.zip')) {
        onProgress?.(`Opening ${file.name}…`);
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files).filter(f => !f.dir && looksLikeHistoryJson(f.name));
        if (!entries.length) {
          throw new Error(`No streaming history files found inside ${file.name}. ` +
            `Make sure it's the zip Spotify sent you (it should contain Streaming_History_*.json or StreamingHistory*.json files).`);
        }
        let i = 0;
        for (const entry of entries) {
          i++;
          onProgress?.(`Reading ${entry.name.replace(/^.*\//, '')} (${i}/${entries.length})…`);
          const text = await entry.async('string');
          addAll(await parseJsonText(text));
          filesRead++;
          await new Promise(r => setTimeout(r)); // let the UI breathe
        }
      } else if (name.endsWith('.json')) {
        onProgress?.(`Reading ${file.name}…`);
        addAll(await parseJsonText(await file.text()));
        filesRead++;
      }
    }

    if (!filesRead) throw new Error('Please drop the Spotify export .zip (or its .json files).');
    if (!plays.length) throw new Error('The files were read but contained no plays.');

    plays.sort((a, b) => a.ts - b.ts);
    onProgress?.(`Crunching ${plays.length.toLocaleString()} plays…`);
    await new Promise(r => setTimeout(r));
    return { plays, filesRead };
  }

  return { parseFiles, normalizeArray };
})();
