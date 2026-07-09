/* Main — drop zone wiring, view switching, app state. */
(() => {
  let allPlays = null;

  const $ = id => document.getElementById(id);
  const landing = $('landing'), reportEl = $('report'), wrappedEl = $('wrapped');
  const tabs = $('viewTabs');
  const dropzone = $('dropzone'), fileInput = $('fileInput');
  const progress = $('progress'), progressText = $('progressText'), dropError = $('dropError');

  /* ---------- view switching ---------- */
  const rendered = { report: false, wrapped: false };

  function showView(view) {
    landing.hidden = true;
    reportEl.hidden = view !== 'report';
    wrappedEl.hidden = view !== 'wrapped';
    tabs.hidden = false;
    tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    if (!rendered[view]) {
      if (view === 'report') Report.render(allPlays);
      else Wrapped.render(allPlays);
      rendered[view] = true;
    }
  }

  tabs.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => showView(t.dataset.view)));

  $('resetBtn').addEventListener('click', () => {
    allPlays = null;
    rendered.report = rendered.wrapped = false;
    Wrapped.reset();
    $('reportBody').innerHTML = '';
    wrappedEl.innerHTML = '';
    tabs.hidden = true;
    reportEl.hidden = wrappedEl.hidden = true;
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
      rendered.report = rendered.wrapped = false;
      Wrapped.reset();
      showView('report');
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
      rendered.report = rendered.wrapped = false;
      if (!reportEl.hidden) { Report.render(allPlays); rendered.report = true; }
      else if (!wrappedEl.hidden) { Wrapped.render(allPlays); rendered.wrapped = true; }
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

  /* ---------- sample data ---------- */
  $('sampleBtn').addEventListener('click', async () => {
    dropError.hidden = true;
    setBusy(true, 'Generating sample history…');
    await new Promise(r => setTimeout(r, 30));
    try {
      allPlays = Sample.generate();
      rendered.report = rendered.wrapped = false;
      Wrapped.reset();
      showView('report');
    } finally {
      setBusy(false);
    }
  });
})();
