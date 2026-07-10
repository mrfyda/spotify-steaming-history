/* PlayStore — columnar storage for play history.
 *
 * A multi-year export is hundreds of thousands of plays; holding each as a
 * 15-field object costs hundreds of MB of heap, which gets the tab killed on
 * iOS when backgrounded. Here the whole history lives in a handful of typed
 * arrays (one per field) plus string tables where every distinct track /
 * artist / album name is stored exactly once — ~35 bytes per play instead of
 * ~600.
 *
 * The layout is private to this file. Consumers see plays as plain objects:
 *
 *   for (const p of plays) … p.ts, p.artist, p.skipped …
 *   plays.filter(p => …)      → a lightweight view with the same interface
 *   plays.length, plays.at(0), plays.at(-1), plays.firstTs, plays.lastTs
 *
 * Iteration materializes small throwaway objects on the fly; they're
 * young-generation garbage the moment the loop moves on, so the RESIDENT
 * memory stays at the typed arrays. Each object is fresh — holding one
 * across iterations (prevItem etc.) is safe.
 *
 * Tri-state booleans (shuffle/skipped/offline/incognito can be unknown) are
 * 2 bits each in a flags word; kind is 2 more. String columns store 0 for
 * null, else 1 + table index.
 */
const PlayStore = (() => {

  const KINDS = ['music', 'podcast', 'audiobook'];
  const TRI = [null, false, true];
  const triOf = v => v == null ? 0 : v ? 2 : 1;

  /* one deduplicating table per string column */
  class Table {
    constructor() { this.ids = new Map(); this.values = []; }
    id(s) {
      if (s == null) return 0;
      let i = this.ids.get(s);
      if (i === undefined) { this.values.push(s); i = this.values.length; this.ids.set(s, i); }
      return i;
    }
    get(i) { return i === 0 ? null : this.values[i - 1]; }
  }

  const STRING_COLS = ['track', 'artist', 'album', 'show', 'platform', 'country', 'reasonStart', 'reasonEnd'];

  class Builder {
    constructor() {
      this.ts = []; this.ms = []; this.flags = [];
      this.tables = {};
      this.cols = {};
      for (const c of STRING_COLS) { this.tables[c] = new Table(); this.cols[c] = []; }
    }

    get count() { return this.ts.length; }

    /** Accepts a normalized parser record. Fields the views never read
     *  (uri, episode) are simply not stored. */
    add(p) {
      this.ts.push(p.ts);
      this.ms.push(Math.round(p.ms) || 0);
      this.flags.push(
        Math.max(0, KINDS.indexOf(p.kind))
        | triOf(p.shuffle) << 2
        | triOf(p.skipped) << 4
        | triOf(p.offline) << 6
        | triOf(p.incognito) << 8);
      for (const c of STRING_COLS) this.cols[c].push(this.tables[c].id(p[c]));
    }

    /** Sort by ts and freeze everything into typed arrays. */
    finish() {
      const n = this.count;
      const order = Uint32Array.from({ length: n }, (_, i) => i);
      order.sort((x, y) => this.ts[x] - this.ts[y]);
      const permute = (src, out) => { for (let i = 0; i < n; i++) out[i] = src[order[i]]; return out; };
      const cols = {
        ts: permute(this.ts, new Float64Array(n)),
        ms: permute(this.ms, new Uint32Array(n)),
        flags: permute(this.flags, new Uint16Array(n)),
      };
      for (const c of STRING_COLS) cols[c] = permute(this.cols[c], new Uint32Array(n));
      const tables = {};
      for (const c of STRING_COLS) tables[c] = this.tables[c].values; // Map no longer needed
      return new Store(n, cols, tables);
    }
  }

  class Store {
    constructor(n, cols, tables) { this._n = n; this._c = cols; this._t = tables; }

    get length() { return this._n; }
    get firstTs() { return this._n ? this._c.ts[0] : null; }
    get lastTs() { return this._n ? this._c.ts[this._n - 1] : null; }

    /** The play at position i (negative counts from the end), as a plain object. */
    at(i) {
      if (i < 0) i += this._n;
      if (i < 0 || i >= this._n) return undefined;
      const c = this._c, t = this._t, f = c.flags[i];
      const str = col => { const id = c[col][i]; return id === 0 ? null : t[col][id - 1]; };
      return {
        ts: c.ts[i], ms: c.ms[i],
        kind: KINDS[f & 3],
        track: str('track'), artist: str('artist'), album: str('album'), show: str('show'),
        platform: str('platform'), country: str('country'),
        reasonStart: str('reasonStart'), reasonEnd: str('reasonEnd'),
        shuffle: TRI[f >> 2 & 3], skipped: TRI[f >> 4 & 3],
        offline: TRI[f >> 6 & 3], incognito: TRI[f >> 8 & 3],
      };
    }

    *[Symbol.iterator]() { for (let i = 0; i < this._n; i++) yield this.at(i); }

    find(fn) { for (const p of this) if (fn(p)) return p; return undefined; }

    /** Matching plays as a view over the same buffers (no copies of the data,
     *  just the selected positions), with this same read interface. */
    filter(fn) {
      const idx = [];
      for (let i = 0; i < this._n; i++) if (fn(this.at(i))) idx.push(i);
      return new View(this, Uint32Array.from(idx));
    }
  }

  class View {
    constructor(store, idx) { this._s = store; this._i = idx; }
    get length() { return this._i.length; }
    get firstTs() { return this.length ? this.at(0).ts : null; }
    get lastTs() { return this.length ? this.at(-1).ts : null; }
    at(i) {
      if (i < 0) i += this._i.length;
      return (i < 0 || i >= this._i.length) ? undefined : this._s.at(this._i[i]);
    }
    *[Symbol.iterator]() { for (let i = 0; i < this._i.length; i++) yield this._s.at(this._i[i]); }
    find(fn) { for (const p of this) if (fn(p)) return p; return undefined; }
    filter(fn) {
      const idx = [];
      for (const i of this._i) if (fn(this._s.at(i))) idx.push(i);
      return new View(this._s, Uint32Array.from(idx));
    }
  }

  /** For pre-built record arrays (the sample generator). Sorts internally. */
  function fromRecords(records) {
    const b = new Builder();
    for (const p of records) b.add(p);
    return b.finish();
  }

  return { builder: () => new Builder(), fromRecords };
})();
