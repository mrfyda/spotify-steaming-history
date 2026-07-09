/* Share — renders a report card (an SVG chart or a top list) to a branded
 * PNG, then hands it to the system share sheet or downloads it. Everything
 * is drawn locally; nothing is uploaded. */
const Share = (() => {

  const SITE = 'mrfyda.github.io/spotify-steaming-history';
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const W = 1200, PAD = 64, SCALE = 2; // logical px; canvas is 2x for retina

  function colors() {
    const th = Charts.theme();
    const dark = th.surface === '#1e1e1d';
    return {
      bg: th.surface,
      text: dark ? '#f0efeb' : '#1c1b18',
      muted: th.muted,
      secondary: th.secondary,
      line: th.grid,
      accent: th.mark,
    };
  }

  function mkCanvas(h) {
    const canvas = document.createElement('canvas');
    canvas.width = W * SCALE; canvas.height = h * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    return { canvas, ctx };
  }

  function header(ctx, c, title, sub) {
    ctx.fillStyle = c.text;
    ctx.font = `700 40px ${FONT}`;
    ctx.fillText(title, PAD, PAD + 34);
    if (sub) {
      ctx.fillStyle = c.muted;
      ctx.font = `400 21px ${FONT}`;
      ctx.fillText(sub, PAD, PAD + 70);
    }
    return PAD + (sub ? 100 : 64);
  }

  function footer(ctx, c, h) {
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD, h - 74); ctx.lineTo(W - PAD, h - 74); ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.font = `400 19px ${FONT}`;
    ctx.fillText('Listening History · computed in my browser, data never uploaded', PAD, h - 40);
    ctx.textAlign = 'right';
    ctx.fillStyle = c.secondary;
    ctx.fillText(SITE, W - PAD, h - 40);
    ctx.textAlign = 'left';
  }

  const ellipsize = (ctx, text, max) => {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  };

  /** Draw an SVG chart node onto a branded card. Returns a canvas.
   *  legend: [{label, color}] — chart legends live in HTML, not the SVG,
   *  so they're redrawn here. */
  async function chartCard({ title, sub, legend }, svgNode) {
    const c = colors();
    const vb = (svgNode.getAttribute('viewBox') || '0 0 800 240').split(/\s+/).map(Number);
    const [, , vw, vh] = vb;
    const drawW = W - PAD * 2;
    const drawH = (vh / vw) * drawW;

    const clone = svgNode.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', vw); clone.setAttribute('height', vh);
    clone.style.fontFamily = FONT; // standalone SVGs don't inherit page fonts
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const legendH = legend?.length ? 44 : 0;
      const top = 164 + legendH;
      const h = top + drawH + 110;
      const { canvas, ctx } = mkCanvas(h);
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, h);
      header(ctx, c, title, sub);
      if (legendH) {
        let x = PAD;
        ctx.font = `500 20px ${FONT}`;
        for (const item of legend) {
          ctx.fillStyle = item.color;
          ctx.beginPath(); ctx.roundRect(x, top - 40, 16, 16, 4); ctx.fill();
          ctx.fillStyle = c.secondary;
          ctx.fillText(item.label, x + 24, top - 26);
          x += 24 + ctx.measureText(item.label).width + 28;
        }
      }
      ctx.drawImage(img, PAD, top, drawW, drawH);
      footer(ctx, c, h);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Draw a ranked list card. rows: [{name, sub, value}]. Returns a canvas. */
  function listCard({ title, sub, rows }) {
    const c = colors();
    const ROW = 64, top = 164;
    const h = top + rows.length * ROW + 104;
    const { canvas, ctx } = mkCanvas(h);
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, h);
    header(ctx, c, title, sub);

    rows.forEach((r, i) => {
      const y = top + i * ROW;
      if (i) {
        ctx.strokeStyle = c.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
      }
      ctx.fillStyle = c.muted;
      ctx.font = `600 24px ${FONT}`;
      ctx.fillText(String(i + 1), PAD, y + 40);

      ctx.font = `600 26px ${FONT}`;
      ctx.fillStyle = c.text;
      const nameX = PAD + 56, nameMax = W - PAD * 2 - 260;
      ctx.fillText(ellipsize(ctx, r.name, nameMax), nameX, y + (r.sub ? 32 : 40));
      if (r.sub) {
        ctx.font = `400 19px ${FONT}`;
        ctx.fillStyle = c.muted;
        ctx.fillText(ellipsize(ctx, r.sub, nameMax), nameX, y + 55);
      }
      ctx.font = `600 26px ${FONT}`;
      ctx.fillStyle = c.secondary;
      ctx.textAlign = 'right';
      ctx.fillText(r.value, W - PAD, y + 40);
      ctx.textAlign = 'left';
    });
    footer(ctx, c, h);
    return canvas;
  }

  /** Share via the system sheet when possible, otherwise download. */
  async function deliver(canvas, filename) {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    if (!blob) return;
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch { /* cancelled: fall through */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  /** Attach a share button to a card; build() returns a canvas or a Promise of one. */
  function button(cardEl, title, build) {
    const btn = document.createElement('button');
    btn.className = 'card-share';
    btn.title = 'Share this as an image';
    btn.textContent = '↗ Share';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await deliver(await build(), `${slug(title) || 'listening-history'}.png`); }
      catch (err) { console.error(err); }
      finally { btn.disabled = false; }
    });
    cardEl.appendChild(btn);
  }

  return { chartCard, listCard, deliver, button };
})();
