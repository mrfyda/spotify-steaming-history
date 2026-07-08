/* Enrich — OPT-IN metadata from MusicBrainz: artist genres and album release
 * years (for the decades chart). Strictly triggered by a user click: only
 * artist and album NAMES are sent, nothing about listening.
 *
 * MusicBrainz allows ~1 request/second, so lookups run in the background at
 * that pace with a live counter. Every result persists immediately, so a run
 * can be stopped and resumed later. A failed lookup is retried up to 3 times
 * in place, and if it still fails it stays uncached and is retried on the
 * next run — failures are never recorded as permanent misses.
 *
 * (The artist cache key is shared with the earlier iTunes-based version, so
 * artwork fetched back then keeps displaying; MusicBrainz adds no artwork.)
 */
const Enrich = (() => {

  const ARTIST_KEY = 'lh-artist-meta-v3';
  const ALBUM_KEY = 'lh-album-meta-v1';
  const DELAY = 1150;          // MusicBrainz asks for at most 1 req/sec
  const RETRIES = 3;           // attempts per item before moving on
  const MAX_CONSECUTIVE_ITEM_FAILURES = 6;

  const load = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
  const artists = load(ARTIST_KEY);
  const albums = load(ALBUM_KEY);
  function persist() {
    try {
      localStorage.setItem(ARTIST_KEY, JSON.stringify(artists));
      localStorage.setItem(ALBUM_KEY, JSON.stringify(albums));
    } catch { /* storage full/blocked */ }
  }

  /* diagnostic trace of every attempt, copyable from the UI when things fail */
  const LOG_MAX = 300;
  const log = [];
  let runStartedAt = null;
  function logEntry(name, outcome, ms) {
    if (log.length >= LOG_MAX) log.shift();
    log.push({ t: Date.now(), name, outcome, ms });
  }
  function getLog() {
    const lines = [
      'Listening History — enrichment diagnostic log (MusicBrainz)',
      `page: ${location.href}`,
      `userAgent: ${navigator.userAgent}`,
      `online: ${navigator.onLine} · cached: ${Object.keys(artists).length} artists, ${Object.keys(albums).length} albums`,
      `run started: ${runStartedAt ? new Date(runStartedAt).toISOString() : 'never'}`,
      state.error ? `stopped with error: ${state.error}` : `state: running=${state.running} done=${state.done}/${state.total}`,
      '',
      ...log.map(e => `+${((e.t - (runStartedAt || e.t)) / 1000).toFixed(1)}s  ${e.name} — ${e.outcome} (${e.ms}ms)`),
    ];
    return lines.join('\n');
  }

  /* fold case + diacritics so "ROSALÍA" matches "Rosalía" */
  const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  async function mbSearch(path, query) {
    const url = `https://musicbrainz.org/ws/2/${path}/?query=${encodeURIComponent(query)}&fmt=json&limit=5`;
    const res = await fetch(url);
    if (res.status === 503) throw new Error('rate limited');
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  const TAG_BLOCKLIST = new Set(['seen live', 'favorites', 'favourites', 'spotify', 'usa', 'uk',
    'american', 'british', 'german', 'french', 'male vocalists', 'female vocalists', 'under 2000 listeners']);

  /** Genre for one artist. {} means a definite no-match; throws on network trouble. */
  async function fetchArtist(name) {
    const data = await mbSearch('artist', `artist:${JSON.stringify(name)}`);
    const hit = (data.artists || []).find(r =>
      r.score >= 90 && (norm(r.name) === norm(name) || (r.aliases || []).some(al => norm(al.name) === norm(name))));
    if (!hit) return {};
    const tag = (hit.tags || [])
      .sort((x, y) => (y.count || 0) - (x.count || 0))
      .find(t => !TAG_BLOCKLIST.has(t.name.toLowerCase()));
    return tag ? { g: tag.name.replace(/^./, c => c.toUpperCase()) } : {};
  }

  /* Spotify album titles carry suffixes MusicBrainz doesn't use */
  const cleanTitle = t => String(t)
    .replace(/\s*[([][^)\]]*(deluxe|remaster|edition|version|bonus|anniversary|expanded)[^)\]]*[)\]]/gi, '')
    .replace(/\s*-\s*(\d{4}\s*)?(remaster(ed)?|deluxe|expanded).*$/i, '')
    .trim();

  /** First release year for one album. {} means a definite no-match. */
  async function fetchAlbum(artist, album) {
    const title = cleanTitle(album);
    const data = await mbSearch('release-group', `releasegroup:${JSON.stringify(title)} AND artist:${JSON.stringify(artist)}`);
    const hit = (data['release-groups'] || []).find(rg =>
      rg.score >= 90 &&
      (rg['artist-credit'] || []).some(c => norm(c.name) === norm(artist)) &&
      rg['first-release-date']);
    if (!hit) return {};
    const year = Number(String(hit['first-release-date']).slice(0, 4));
    return isFinite(year) && year > 1900 ? { y: year } : {};
  }

  const albumKey = (artist, album) => artist + '\u0000' + album;
  const get = name => artists[name];
  const getAlbum = (artist, album) => albums[albumKey(artist, album)];
  const pendingArtists = names => names.filter(n => !(n in artists));
  const pendingAlbums = pairs => pairs.filter(([ar, al]) => !(albumKey(ar, al) in albums));

  /* run state, readable by the UI across re-renders */
  const state = { running: false, done: 0, total: 0, stopRequested: false, error: null };
  let onUpdate = null;
  const notify = () => { try { onUpdate?.(state); } catch { /* UI gone */ } };

  /** Process a queue of {type:'artist', name} / {type:'album', artist, album} items. */
  async function run(queue) {
    if (state.running) return;
    Object.assign(state, { running: true, done: 0, total: queue.length, stopRequested: false, error: null });
    runStartedAt = Date.now();
    log.length = 0;
    notify();

    let consecutiveItemFailures = 0;
    for (const item of queue) {
      if (state.stopRequested) { logEntry(itemLabel(item), 'stopped by user before this lookup', 0); break; }

      let succeeded = false;
      for (let attempt = 1; attempt <= RETRIES && !succeeded; attempt++) {
        const t0 = Date.now();
        try {
          if (item.type === 'artist') {
            const meta = await fetchArtist(item.name);
            artists[item.name] = { ...artists[item.name], ...meta };
            logEntry(item.name, meta.g ? `ok (genre: ${meta.g})` : 'no match', Date.now() - t0);
          } else {
            const meta = await fetchAlbum(item.artist, item.album);
            albums[albumKey(item.artist, item.album)] = meta;
            logEntry(itemLabel(item), meta.y ? `ok (year: ${meta.y})` : 'no match', Date.now() - t0);
          }
          persist();
          succeeded = true;
        } catch (err) {
          logEntry(itemLabel(item), `FAILED: ${err?.message || 'unknown'} (attempt ${attempt}/${RETRIES})`, Date.now() - t0);
          if (attempt < RETRIES) await new Promise(r => setTimeout(r, 2500 * attempt));
        }
      }

      if (succeeded) {
        consecutiveItemFailures = 0;
      } else {
        consecutiveItemFailures++; // stays uncached: retried on the next run
        if (consecutiveItemFailures >= MAX_CONSECUTIVE_ITEM_FAILURES) {
          state.error = 'MusicBrainz lookups keep failing — the network may be blocking them, or the service is down. Progress is saved; try again later.';
          break;
        }
      }

      state.done++;
      notify();
      await new Promise(r => setTimeout(r, DELAY));
    }

    state.running = false;
    notify();
  }

  const itemLabel = item => item.type === 'artist' ? item.name : `${item.artist} — ${item.album}`;
  const stop = () => { state.stopRequested = true; };
  const setOnUpdate = cb => { onUpdate = cb; };
  const hasLog = () => log.length > 0;

  return { get, getAlbum, pendingArtists, pendingAlbums, run, stop, state, setOnUpdate, getLog, hasLog };
})();
