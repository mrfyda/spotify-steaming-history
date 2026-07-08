/* Enrich — OPT-IN artist metadata (genre + artwork + release year) from
 * Apple's iTunes Search API. Strictly triggered by a user click: sends only
 * artist NAMES, nothing about listening. The API has no CORS headers, so
 * requests go out as JSONP.
 *
 * Scale: enriches ALL artists (up to a sanity cap), not just the top few.
 * The first 30 fetch as a quick burst, the rest continue in the background
 * at a pace that respects Apple's ~20 req/min limit. Progress persists in
 * localStorage after every artist, so a long run can be interrupted and
 * resumed on a later visit. Only definite results (match or no-match) are
 * cached; network failures and throttling are retried, never cached.
 */
const Enrich = (() => {

  // v3: v2 could contain permanent misses poisoned by rate-limit failures
  const CACHE_KEY = 'lh-artist-meta-v3';
  const BURST = 12;            // first N requests run quickly (kept short: a fast
  const BURST_DELAY = 600;     // burst can itself trip Apple's per-minute throttle)
  const CRUISE_DELAY = 3200;   // ms between background requests (~19/min)
  const MAX_PER_SESSION = 1000;
  const MAX_CONSECUTIVE_FAILURES = 8;

  let store = {};
  try { store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch { /* fresh */ }

  function persist() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch { /* storage full/blocked */ }
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
      'Listening History — enrichment diagnostic log',
      `page: ${location.href}`,
      `userAgent: ${navigator.userAgent}`,
      `online: ${navigator.onLine} · cached artists: ${Object.keys(store).length}`,
      `run started: ${runStartedAt ? new Date(runStartedAt).toISOString() : 'never'}`,
      state.error ? `stopped with error: ${state.error}` : `state: running=${state.running} done=${state.done}/${state.total}`,
      '',
      ...log.map(e => `+${((e.t - (runStartedAt || e.t)) / 1000).toFixed(1)}s  ${e.name} — ${e.outcome} (${e.ms}ms)`),
    ];
    return lines.join('\n');
  }

  let jsonpSeq = 0;
  function jsonp(url, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const cb = '__lhJsonp' + (jsonpSeq++);
      const script = document.createElement('script');
      const cleanup = () => { delete window[cb]; script.remove(); clearTimeout(timer); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
      window[cb] = data => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('network')); };
      script.src = `${url}&callback=${cb}`;
      document.head.appendChild(script);
    });
  }

  /* fold case + diacritics so "ROSALÍA" matches "Rosalía" */
  const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  /* does an iTunes artist credit ("Elton John & Dua Lipa", "X feat. Y") include this artist? */
  function creditMatches(credit, name) {
    const target = norm(name);
    if (!target) return false;
    if (norm(credit) === target) return true;
    return credit.split(/\s*(?:&|,|\bfeat\.?\b|\bwith\b|\bx\b)\s*/i).some(part => norm(part) === target);
  }

  /** Look up one artist. Returns {g, a, r} — empty object means a definite
   *  no-match. Throws on network trouble (caller retries later). */
  async function fetchArtist(name) {
    const url = 'https://itunes.apple.com/search?media=music&entity=album&attribute=artistTerm&limit=5'
      + `&term=${encodeURIComponent(name)}`;
    const res = await jsonp(url);
    if (!res || !Array.isArray(res.results)) throw new Error('bad response'); // throttled / error page
    // prefer an exact solo credit; fall back to a collab credit that includes the artist
    const hit = res.results.find(r => norm(r.artistName) === norm(name))
      || res.results.find(r => creditMatches(r.artistName || '', name));
    if (!hit) return {};
    const year = hit.releaseDate ? Number(String(hit.releaseDate).slice(0, 4)) : undefined;
    return {
      g: hit.primaryGenreName || undefined,
      a: hit.artworkUrl100 ? hit.artworkUrl100.replace('100x100', '120x120') : undefined,
      r: isFinite(year) ? year : undefined,
    };
  }

  const get = name => store[name];
  const pending = names => names.filter(n => !(n in store)).slice(0, MAX_PER_SESSION);

  /* run state, readable by the UI across re-renders */
  const state = { running: false, done: 0, total: 0, stopRequested: false, error: null };
  let onUpdate = null;
  const notify = () => { try { onUpdate?.(state); } catch { /* UI gone */ } };

  /** Fetch metadata for all uncached names. Resolves when finished, stopped,
   *  or aborted after repeated failures. Only one run at a time. */
  async function run(names) {
    if (state.running) return;
    const todo = pending(names);
    Object.assign(state, { running: true, done: 0, total: todo.length, stopRequested: false, error: null });
    notify();

    runStartedAt = Date.now();
    log.length = 0;

    let consecutiveFailures = 0;
    let lastFailure = '';
    for (const name of todo) {
      if (state.stopRequested) { logEntry(name, 'stopped by user before this lookup', 0); break; }
      const t0 = Date.now();
      try {
        const meta = await fetchArtist(name);
        store[name] = meta;
        persist();
        consecutiveFailures = 0;
        logEntry(name, meta.g || meta.a ? `ok (genre: ${meta.g || '—'}, art: ${meta.a ? 'yes' : 'no'})` : 'no match on iTunes', Date.now() - t0);
      } catch (err) {
        consecutiveFailures++;
        lastFailure = err?.message || 'unknown';
        logEntry(name, `FAILED: ${lastFailure} (failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`, Date.now() - t0);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          state.error = lastFailure === 'network'
            ? 'Requests to itunes.apple.com are being blocked — an ad/content blocker, Private Relay, or Lockdown Mode may be stopping them. Progress is saved.'
            : 'iTunes seems unreachable or rate-limiting. Progress is saved; try again in a few minutes.';
          break;
        }
        await new Promise(r => setTimeout(r, CRUISE_DELAY * 2)); // extra backoff after a failure
      }
      state.done++;
      notify();
      await new Promise(r => setTimeout(r, state.done < BURST ? BURST_DELAY : CRUISE_DELAY));
    }

    state.running = false;
    notify();
  }

  const stop = () => { state.stopRequested = true; };
  const setOnUpdate = cb => { onUpdate = cb; };

  const hasLog = () => log.length > 0;

  return { get, pending, run, stop, state, setOnUpdate, getLog, hasLog };
})();
