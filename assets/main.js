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
