# Spotify History Report

Drop your Spotify data export zip on the page and get:

- **Full report** — an exhaustive, last.fm-style breakdown: overview stats, listening
  over time, listening clock, weekday × hour heatmap, searchable top artists / tracks /
  albums / podcasts, records & habits (streaks, biggest day, loop record, skip rate),
  platforms and countries. Filterable by year.
- **Wrapped** — a story-style, shareable recap for any year with fun facts, a listening
  personality, and a downloadable 1080×1920 share card.

Everything runs **entirely in the browser**. There is no server and no upload — the zip
is parsed with JavaScript on the page and never leaves your machine.

## Getting your data

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/)
2. Request either:
   - **Extended streaming history** — your full lifetime history (takes up to 30 days). Best results.
   - **Account data** — last year of streaming (a few days). Works, with fewer details.
3. Spotify emails you a zip. Drop it on the page as-is — no need to unpack.

Supported inputs: extended history zips (`Streaming_History_Audio_*.json`,
`Streaming_History_Video_*.json`, older `endsong_*.json`), account data zips
(`StreamingHistory*.json`), or those same `.json` files dropped directly.

## Deployment

The site is static — `index.html` plus `assets/` and `vendor/`, no build step.
`.github/workflows/deploy-pages.yml` deploys to GitHub Pages on every push to `main`.

One-time setup: in the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Development

Serve the folder with any static server and open it:

```sh
python3 -m http.server 8000
```

The "Try it with sample data" button generates a synthetic three-year history, so you can
develop without a real export.

### Code layout

| File | Purpose |
|---|---|
| `assets/parser.js` | Reads zips/JSON (JSZip), normalizes all export formats into one record shape |
| `assets/stats.js` | Aggregation engine — everything both views need, computed per time range |
| `assets/charts.js` | Small SVG chart helpers: column chart, punchcard heatmap, tooltips, table twins |
| `assets/report.js` | The exhaustive report view |
| `assets/wrapped.js` | The Wrapped slides + canvas share card |
| `assets/sample.js` | Deterministic synthetic history for the demo button |
| `assets/main.js` | Drop zone, progress, view switching |

A "stream" is counted when a play lasts ≥ 30 seconds (Spotify's own convention);
time totals always include every millisecond.

Not affiliated with Spotify.
