/* Enrich — OPT-IN metadata from MusicBrainz: artist genres and album release
 * years (for the decades chart). Strictly triggered by a user click: only
 * artist and album NAMES are sent, nothing about listening.
 *
 * Lookups are OR-BATCHED: one search request carries ~8 artist names (or ~5
 * album+artist clauses), which multiplies throughput roughly 8x under
 * MusicBrainz's 1-request/second limit. Lucene normalizes scores across the
 * whole OR query, so batch results are matched by normalized-name equality,
 * not score. Any name the batch response doesn't cover falls back to an
 * individual lookup (the old, score-filtered path) before being declared a
 * miss — batching never reduces recall.
 *
 * Every result persists immediately, so a run can be stopped and resumed.
 * Failed requests retry with backoff; items that still fail stay uncached
 * and are retried on the next run — failures are never cached as misses.
 *
 * Album matches also keep their release-group MBID: the Cover Art Archive
 * serves cover images straight off that id (no extra lookups — the browser
 * fetches covers lazily as rows scroll into view, only after the user opted
 * in to enrichment). The artist cache key is shared with the earlier
 * iTunes-based version, so artwork fetched back then keeps displaying.
 */
const Enrich = (() => {

  const ARTIST_KEY = 'lh-artist-meta-v3';
  const ALBUM_KEY = 'lh-album-meta-v1';
  const DELAY = 1150;          // between REQUESTS — MusicBrainz allows ~1/sec
  const RETRIES = 3;           // attempts per request before giving up on it
  const ARTIST_BATCH = 8;
  const ALBUM_BATCH = 5;
  const MAX_CONSECUTIVE_FAILURES = 6;

  const load = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; } };
  const artists = load(ARTIST_KEY);
  const albums = load(ALBUM_KEY);
  function persist() {
    try {
      localStorage.setItem(ARTIST_KEY, JSON.stringify(artists));
      localStorage.setItem(ALBUM_KEY, JSON.stringify(albums));
    } catch { /* storage full/blocked */ }
  }

  /* fold case + diacritics so "ROSALÍA" matches "Rosalía" */
  const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  async function mbSearch(path, query, limit = 5) {
    const url = `https://musicbrainz.org/ws/2/${path}/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`;
    const res = await fetch(url);
    if (res.status === 503) throw new Error('rate limited');
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  const TAG_BLOCKLIST = new Set(['seen live', 'favorites', 'favourites', 'spotify', 'usa', 'uk',
    'american', 'british', 'german', 'french', 'male vocalists', 'female vocalists', 'under 2000 listeners']);

  function artistMeta(hit) {
    const tag = (hit.tags || [])
      .sort((x, y) => (y.count || 0) - (x.count || 0))
      .find(t => !TAG_BLOCKLIST.has(t.name.toLowerCase()));
    return tag ? { g: tag.name.replace(/^./, c => c.toUpperCase()) } : {};
  }

  const artistMatches = (hit, name) =>
    norm(hit.name) === norm(name) || (hit.aliases || []).some(al => norm(al.name) === norm(name));

  /** Individual artist lookup (fallback path). {} = definite no-match. */
  async function fetchArtist(name) {
    const data = await mbSearch('artist', `artist:${JSON.stringify(name)}`);
    const hit = (data.artists || []).find(r => r.score >= 90 && artistMatches(r, name));
    return hit ? artistMeta(hit) : {};
  }

  /** One search request for many artists. Returns Map name → meta for the
   *  names the response covered; absent names go to the fallback path. */
  async function fetchArtistBatch(names) {
    const query = names.map(n => `artist:${JSON.stringify(n)}`).join(' OR ');
    const data = await mbSearch('artist', query, 100);
    const results = data.artists || [];
    const found = new Map();
    for (const name of names) {
      const hit = results.find(r => artistMatches(r, name)); // score-ordered; scores dilute across OR
      if (hit) found.set(name, artistMeta(hit));
    }
    return found;
  }

  /* Spotify album titles carry suffixes MusicBrainz doesn't use */
  const cleanTitle = t => String(t)
    .replace(/\s*[([][^)\]]*(deluxe|remaster|edition|version|bonus|anniversary|expanded)[^)\]]*[)\]]/gi, '')
    .replace(/\s*-\s*(\d{4}\s*)?(remaster(ed)?|deluxe|expanded).*$/i, '')
    .trim();

  const rgArtistMatches = (rg, artist) =>
    (rg['artist-credit'] || []).some(c => norm(c.name) === norm(artist));

  function rgYear(rg) {
    const meta = {};
    const year = Number(String(rg['first-release-date']).slice(0, 4));
    if (isFinite(year) && year > 1900) meta.y = year;
    if (rg.id) meta.i = rg.id; // release-group MBID — keys Cover Art Archive images
    return meta;
  }

  /** Individual album lookup (fallback path). {} = definite no-match. */
  async function fetchAlbum(artist, album) {
    const title = cleanTitle(album);
    const data = await mbSearch('release-group', `releasegroup:${JSON.stringify(title)} AND artist:${JSON.stringify(artist)}`);
    const hit = (data['release-groups'] || []).find(rg =>
      rg.score >= 90 && rgArtistMatches(rg, artist) && rg['first-release-date']);
    return hit ? rgYear(hit) : {};
  }

  /** One search request for many albums. Returns Map albumKey → meta. */
  async function fetchAlbumBatch(items) {
    const query = items
      .map(it => `(releasegroup:${JSON.stringify(cleanTitle(it.album))} AND artist:${JSON.stringify(it.artist)})`)
      .join(' OR ');
    const data = await mbSearch('release-group', query, 100);
    const results = data['release-groups'] || [];
    const found = new Map();
    for (const it of items) {
      const title = norm(cleanTitle(it.album));
      const hit = results.find(rg =>
        norm(rg.title) === title && rgArtistMatches(rg, it.artist) && rg['first-release-date']);
      if (hit) found.set(albumKey(it.artist, it.album), rgYear(hit));
    }
    return found;
  }

  const albumKey = (artist, album) => artist + '\u0000' + album;
  const get = name => artists[name];
  const getAlbum = (artist, album) => albums[albumKey(artist, album)];
  const albumArtUrl = (artist, album) => {
    const i = albums[albumKey(artist, album)]?.i;
    return i ? `https://coverartarchive.org/release-group/${i}/front-250` : null;
  };
  const pendingArtists = names => names.filter(n => !(n in artists));
  // an album cached with a year but no MBID predates cover support — offer it
  // for re-lookup; {} entries stay settled (looked up, no match)
  const pendingAlbums = pairs => pairs.filter(([ar, al]) => {
    const m = albums[albumKey(ar, al)];
    return !m || (m.y != null && m.i == null);
  });

  /** Rough request count → minutes, for the button's ETA. */
  function estimateMinutes(artistCount, albumCount) {
    const requests = Math.ceil(artistCount / ARTIST_BATCH) + Math.ceil(albumCount / ALBUM_BATCH);
    return Math.max(1, Math.ceil((requests * 1.35 * (DELAY / 1000)) / 60)); // ~35% headroom for fallbacks
  }

  /* run state, readable by the UI across re-renders */
  const state = { running: false, done: 0, total: 0, stopRequested: false, error: null, startedAt: null };
  let onUpdate = null;
  const notify = () => { try { onUpdate?.(state); } catch { /* UI gone */ } };

  const pause = ms => new Promise(r => setTimeout(r, ms));

  /** One request with retries. Returns the result or null after RETRIES. */
  async function attempt(fn) {
    for (let i = 1; i <= RETRIES; i++) {
      try {
        return await fn();
      } catch {
        if (i < RETRIES) await pause(2500 * i);
      }
    }
    return null;
  }

  /** Process a queue of {type:'artist', name} / {type:'album', artist, album}
   *  items: batched requests first, individual fallbacks for stragglers. */
  async function run(queue) {
    if (state.running) return;
    Object.assign(state, { running: true, done: 0, total: queue.length, stopRequested: false, error: null, startedAt: Date.now() });
    notify();

    // alternate artist and album batches so both charts fill in together,
    // preserving the queue's most-played-first order within each type
    const artistQ = queue.filter(i => i.type === 'artist');
    const albumQ = queue.filter(i => i.type === 'album');
    const batches = [];
    for (let a = 0, l = 0; a < artistQ.length || l < albumQ.length;) {
      if (a < artistQ.length) { batches.push({ type: 'artist', items: artistQ.slice(a, a + ARTIST_BATCH) }); a += ARTIST_BATCH; }
      if (l < albumQ.length) { batches.push({ type: 'album', items: albumQ.slice(l, l + ALBUM_BATCH) }); l += ALBUM_BATCH; }
    }

    let consecutiveFailures = 0;
    outer:
    for (const batch of batches) {
      if (state.stopRequested) break;
      const found = await attempt(() => batch.type === 'artist'
        ? fetchArtistBatch(batch.items.map(i => i.name))
        : fetchAlbumBatch(batch.items));

      const fallbacks = [];
      if (found == null) {
        consecutiveFailures++;
        state.done += batch.items.length; // items stay uncached, retried next run
      } else {
        consecutiveFailures = 0;
        for (const item of batch.items) {
          const key = batch.type === 'artist' ? item.name : albumKey(item.artist, item.album);
          if (found.has(key)) {
            const meta = found.get(key);
            if (batch.type === 'artist') artists[key] = { ...artists[key], ...meta };
            else albums[key] = meta;
            state.done++;
          } else {
            fallbacks.push(item); // not covered by the batch response — try individually
          }
        }
        persist();
      }
      notify();
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        state.error = 'MusicBrainz lookups keep failing — the network may be blocking them, or the service is down. Progress is saved; try again later.';
        break;
      }
      await pause(DELAY);

      for (const item of fallbacks) {
        if (state.stopRequested) break outer;
        const meta = await attempt(() => item.type === 'artist'
          ? fetchArtist(item.name)
          : fetchAlbum(item.artist, item.album));
        if (meta == null) {
          consecutiveFailures++; // stays uncached: retried on the next run
        } else {
          consecutiveFailures = 0;
          if (item.type === 'artist') artists[item.name] = { ...artists[item.name], ...meta };
          else albums[albumKey(item.artist, item.album)] = meta;
          persist();
        }
        state.done++;
        notify();
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          state.error = 'MusicBrainz lookups keep failing — the network may be blocking them, or the service is down. Progress is saved; try again later.';
          break outer;
        }
        await pause(DELAY);
      }
    }

    state.running = false;
    notify();
  }

  const stop = () => { state.stopRequested = true; };
  const setOnUpdate = cb => { onUpdate = cb; };

  return { get, getAlbum, albumArtUrl, pendingArtists, pendingAlbums, estimateMinutes, run, stop, state, setOnUpdate };
})();
