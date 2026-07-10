/* Main — drop zone wiring, view switching, app state. */
(() => {
  let allPlays = null;

  const $ = id => document.getElementById(id);
  const landing = $('landing'), reportEl = $('report'), wrappedEl = $('wrapped'), compareEl = $('compare');
  const tabs = $('viewTabs');
  const dropzone = $('dropzone'), fileInput = $('fileInput');
  const progress = $('progress'), progressText = $('progressText'), dropError = $('dropError');

  /* ---------- view switching ---------- */
  const rendered = { report: false, wrapped: false, compare: false };
  const invalidate = () => { rendered.report = rendered.wrapped = rendered.compare = false; };

  function showView(view) {
    landing.hidden = true;
    reportEl.hidden = view !== 'report';
    wrappedEl.hidden = view !== 'wrapped';
    compareEl.hidden = view !== 'compare';
    tabs.hidden = false;
    tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    if (!rendered[view]) {
      if (view === 'report') Report.render(allPlays);
      else if (view === 'wrapped') Wrapped.render(allPlays);
      else Compare.render(allPlays);
      rendered[view] = true;
    }
  }

  tabs.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => showView(t.dataset.view)));

  /* ---------- live-compare invites (?room=…) ---------- */
  const invitedRoom = /^[a-z2-9]{6,32}$/.test(new URLSearchParams(location.search).get('room') || '');
  if (invitedRoom) {
    // tell the invitee why they're here before they even load a file
    const note = document.createElement('div');
    note.className = 'privacy invite-note';
    note.innerHTML = '<div><strong>You’ve been invited to a live compare.</strong> Load your own history ' +
      'below and the side-by-side comparison starts automatically — only a compact summary of artist ' +
      'totals is exchanged, directly between your two browsers.</div>';
    dropzone.parentElement.insertBefore(note, dropzone);
  }
  // the moment a live exchange completes, bring the comparison forward
  document.addEventListener('compare:ready', () => { if (allPlays) showView('compare'); });

  /* ---------- shed weight while backgrounded ----------
   * iOS evicts background tabs by physical footprint, and once data is
   * loaded most of ours is the rendered views: tens of thousands of
   * DOM/SVG nodes whose listeners also pin the aggregates. All of it is
   * re-derivable from the (small) play store, so drop it the moment the
   * app is hidden and rebuild on return, restoring the scroll position. */
  let shedView = null, shedScroll = 0;
  document.addEventListener('visibilitychange', () => {
    if (!allPlays || tabs.hidden) return; // nothing loaded: nothing heavy
    if (document.hidden) {
      const view = ['report', 'wrapped', 'compare'].find(v => !$(v).hidden);
      if (!view) return;
      shedView = view;
      shedScroll = window.scrollY;
      $('reportBody').innerHTML = '';
      wrappedEl.innerHTML = '';
      compareEl.innerHTML = '';
      invalidate();
    } else if (shedView) {
      const view = shedView;
      shedView = null;
      showView(view);
      window.scrollTo({ top: shedScroll, behavior: 'instant' }); // beat the html{scroll-behavior:smooth}
    }
  });

  $('resetBtn').addEventListener('click', () => {
    allPlays = null;
    invalidate();
    Wrapped.reset();
    Compare.reset();
    $('reportBody').innerHTML = '';
    wrappedEl.innerHTML = '';
    compareEl.innerHTML = '';
    tabs.hidden = true;
    reportEl.hidden = wrappedEl.hidden = compareEl.hidden = true;
    landing.hidden = false;
    fileInput.value = '';
    window.scrollTo({ top: 0 });
  });

  /* ---------- file handling ---------- */
  function setBusy(busy, text) {
    progress.hidden = !busy;
    if (text) progressText.textContent = text;
    dropzone.style.pointerEvents = busy ? 'none' : '';
    dropzone.style.opacity = busy ? .5 : '';
  }
  function showError(msg) {
    dropError.textContent = msg;
    dropError.hidden = false;
  }

  async function handleFiles(files) {
    if (!files || !files.length) return;
    dropError.hidden = true;
    setBusy(true, 'Reading files…');
    try {
      const { plays } = await Parser.parseFiles([...files], t => { progressText.textContent = t; });
      allPlays = plays;
      invalidate();
      Wrapped.reset();
      Compare.reset();
      showView(invitedRoom ? 'compare' : 'report');
    } catch (err) {
      console.error(err);
      showError(err.message || 'Something went wrong reading that file.');
    } finally {
      setBusy(false);
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => handleFiles(fileInput.files));

  ['dragenter', 'dragover'].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev =>
    dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));

  // also accept drops anywhere on the landing page
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (!landing.hidden) handleFiles(e.dataTransfer.files);
  });

  /* ---------- re-render charts when the system theme flips ---------- */
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (!allPlays) return;
      invalidate();
      if (!reportEl.hidden) { Report.render(allPlays); rendered.report = true; }
      else if (!wrappedEl.hidden) { Wrapped.render(allPlays); rendered.wrapped = true; }
      else if (!compareEl.hidden) { Compare.render(allPlays); rendered.compare = true; }
    });
  } catch { /* old browsers: theme applies on next load */ }

  /* ---------- calendar reminder for the export wait ---------- */
  $('icsBtn').addEventListener('click', () => {
    const start = new Date(Date.now() + 14 * 86400000);
    start.setHours(18, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60000);
    const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const url = location.origin + location.pathname;
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//listening-history//EN',
      'BEGIN:VEVENT',
      `UID:${stamp(start)}@listening-history`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      'SUMMARY:Check if your Spotify data export arrived',
      `DESCRIPTION:Spotify should have emailed your streaming history by now. Drop the zip at ${url} to explore it.`,
      `URL:${url}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    link.download = 'spotify-export-reminder.ics';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  /* ---------- sample data / linkable demo ---------- */
  async function loadSample() {
    dropError.hidden = true;
    setBusy(true, 'Generating sample history…');
    await new Promise(r => setTimeout(r, 30));
    try {
      allPlays = Sample.generate();
      invalidate();
      Wrapped.reset();
      Compare.reset();
      showView(invitedRoom ? 'compare' : 'report');
    } finally {
      setBusy(false);
    }
  }
  $('sampleBtn').addEventListener('click', loadSample);

  // ?demo — the same sample-data experience, but linkable
  if (new URLSearchParams(location.search).has('demo')) loadSample();
})();
