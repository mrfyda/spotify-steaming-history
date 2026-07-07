/* Enrich — OPT-IN artist metadata (genre + artwork) from Apple's iTunes
 * Search API. Strictly triggered by a user click: sends only the top
 * artist NAMES, nothing about listening. The API has no CORS headers, so
 * requests go out as JSONP. Results are cached in localStorage, including
 * misses, so repeat visits don't refetch.
 */
const Enrich = (() => {

  const CACHE_KEY = 'lh-artist-meta-v2'; // v1 cached misses from a too-strict matcher
  const TOP_N = 30;

  let store = {};
  try { store = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch { /* fresh */ }

  function persist() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch { /* storage full/blocked */ }
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

  /** Look up one artist. Returns {g: genre, a: artworkUrl} — empty object on miss. */
  async function fetchArtist(name) {
    const url = 'https://itunes.apple.com/search?media=music&entity=album&attribute=artistTerm&limit=5'
      + `&term=${encodeURIComponent(name)}`;
    const res = await jsonp(url);
    const results = res?.results || [];
    // prefer an exact solo credit; fall back to a collab credit that includes the artist
    const hit = results.find(r => norm(r.artistName) === norm(name))
      || results.find(r => creditMatches(r.artistName || '', name));
    if (!hit) return {};
    return {
      g: hit.primaryGenreName || undefined,
      a: hit.artworkUrl100 ? hit.artworkUrl100.replace('100x100', '120x120') : undefined,
    };
  }

  const get = name => store[name];
  const hasAny = names => names.some(n => store[n] && (store[n].g || store[n].a));
  const pending = names => names.slice(0, TOP_N).filter(n => !(n in store));

  /** Fetch metadata for the given artist names (top N, uncached only). */
  async function run(names, onProgress) {
    const todo = pending(names);
    let done = 0;
    for (const name of todo) {
      try { store[name] = await fetchArtist(name); }
      catch { store[name] = {}; }
      done++;
      onProgress?.(done, todo.length);
      persist();
      await new Promise(r => setTimeout(r, 220)); // stay polite with the API
    }
  }

  return { TOP_N, get, hasAny, pending, run };
})();
