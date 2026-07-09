/* CmpSummary — the compact, shareable slice of a listening history that the
 * Compare view consumes: per-artist listening time plus a handful of headline
 * stats. ~100 KB instead of a multi-MB export, and strictly less revealing:
 * no timestamps, no tracks, no play-by-play. This is the only thing that ever
 * travels to a friend, whether as a downloaded file or over a live room. */
const CmpSummary = (() => {

  const KIND = 'listening-compare-summary';
  const VERSION = 1;

  /** Serialize a Stats.aggregate into a plain, JSON-safe summary object. */
  function build(a) {
    return {
      kind: KIND, v: VERSION,
      firstTs: a.firstTs, lastTs: a.lastTs,
      totalMs: a.totalMs, streams: a.streams,
      uniqueArtists: a.uniqueArtists, uniqueTracks: a.uniqueTracks,
      activeDays: a.activeDays,
      discoveryRate: a.discoveryRate, skipRate: a.skipRate,
      nightShare: a.nightShare,
      fingerprint: a.fingerprint,
      artists: [...a.byArtist.entries()].map(([name, e]) => [name, Math.round(e.ms)]),
    };
  }

  /** Quick shape check, for sniffing dropped .json files. */
  const looksLike = obj => !!obj && obj.kind === KIND && Array.isArray(obj.artists);

  /** Rebuild an aggregate-shaped object (just the fields Compare reads)
   *  from a summary. Throws a user-facing message on bad input. */
  function toAggregate(s) {
    if (!looksLike(s)) throw new Error("That file isn't a listening summary.");
    if (s.v > VERSION) throw new Error('That summary comes from a newer version of this page — refresh and try again.');
    const byArtist = new Map();
    for (const pair of s.artists) {
      if (!Array.isArray(pair)) continue;
      const [name, ms] = pair;
      if (typeof name === 'string' && name && Number.isFinite(ms) && ms > 0) byArtist.set(name, { ms });
    }
    if (!byArtist.size) throw new Error("That summary doesn't contain any listening data.");
    const num = v => (Number.isFinite(v) ? v : null);
    return {
      byArtist,
      firstTs: num(s.firstTs), lastTs: num(s.lastTs),
      totalMs: num(s.totalMs) || 0, streams: num(s.streams) || 0,
      uniqueArtists: num(s.uniqueArtists) || byArtist.size,
      uniqueTracks: num(s.uniqueTracks) || 0,
      activeDays: num(s.activeDays) || 0,
      discoveryRate: num(s.discoveryRate), skipRate: num(s.skipRate),
      nightShare: num(s.nightShare) || 0,
      fingerprint: s.fingerprint && typeof s.fingerprint === 'object' ? s.fingerprint : null,
    };
  }

  /** Download the summary as a small .json file to swap over any messenger. */
  function download(a) {
    const json = JSON.stringify(build(a));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    link.download = 'my-listening-summary.json';
    link.click();
    URL.revokeObjectURL(link.href);
    return json.length;
  }

  const sizeKB = a => Math.max(1, Math.round(JSON.stringify(build(a)).length / 1024));

  return { build, looksLike, toAggregate, download, sizeKB };
})();
