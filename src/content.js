// Adds a "Download Unit N slides / notes" bar to PESU Academy course pages.
// One click: list the unit's classes, fetch every file in class order,
// convert PowerPoint / Word files to PDF, merge everything into one
// bookmarked PDF and save it.
(() => {
  'use strict';
  if (globalThis.__pesuSlideMerger) return;
  globalThis.__pesuSlideMerger = true;

  const { parseUnits, getClasses, getMaterialLinks, downloadDeck, mapLimit, SessionExpiredError, clean } = globalThis.PESU;
  const { mergeUnit } = globalThis.PESUMerge;
  const { CONVERTIBLE, toPdf } = globalThis.PESUConvert;

  const DEFAULTS = { titlePages: false, convertOffice: true, keepOriginals: false };
  const PARALLEL = 3;
  const MATERIALS = {
    slides: { column: 'Slides', fallbackType: '2', noun: 'slides', item: 'deck' },
    notes: { column: 'Notes', fallbackType: '3', noun: 'notes', item: 'file' },
  };

  // ---------- helpers ----------

  const pad = (n) => String(n).padStart(2, '0');
  const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function safeName(s, max = 80) {
    let out = String(s || '')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (out.length > max) out = `${out.slice(0, max - 1).trim()}…`;
    out = out.replace(/[. ]+$/, '');
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(out)) out = `_${out}`;
    return out || 'untitled';
  }

  // Saved blobs need a real type, or the browser may re-guess the extension.
  const MIME = {
    pdf: 'application/pdf', zip: 'application/zip', txt: 'text/plain', rtf: 'application/rtf',
    ppt: 'application/vnd.ms-powerpoint', pps: 'application/vnd.ms-powerpoint', pot: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
    doc: 'application/msword', dot: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    odp: 'application/vnd.oasis.opendocument.presentation', odt: 'application/vnd.oasis.opendocument.text',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
  };
  const blobOf = (bytes, ext) => new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' });

  function officeKind(ext) {
    if (/^(ppt|pptx|pps|ppsx|pot|potx|odp)$/.test(ext)) return 'PowerPoint';
    if (/^(doc|docx|dot|dotx|odt|rtf)$/.test(ext)) return 'Word';
    if (/^(xls|xlsx|ods)$/.test(ext)) return 'Excel';
    return ext.toUpperCase();
  }

  function unitShortTitle(title) {
    return clean(title).replace(/^unit\s*-?\s*\d+\s*[:.\-–]?\s*/i, '').replace(/[:\s]+$/, '');
  }

  async function getSettings() {
    try { return { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) }; } catch { return { ...DEFAULTS }; }
  }

  function courseInfo() {
    const bc = document.querySelector('.cmc_breadcrum');
    const text = bc ? clean([...bc.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.nodeValue).join(' ')) : '';
    const m = text.match(/^([A-Z0-9]{5,})\s*[:\-]\s*(.+)$/i);
    const code = m ? m[1] : '';
    const name = m ? clean(m[2]) : text;
    const rowClick = document.querySelector('#CourseContentId tr[onclick*="handleclasscoursecontentunit"]')?.getAttribute('onclick') || '';
    const courseId = rowClick.match(/handleclasscoursecontentunit\(\s*'[^']*'\s*,\s*'([^']*)'/)?.[1]
      || document.querySelector('#selectedData')?.value || '';
    return {
      code,
      name,
      label: clean([code, name].filter(Boolean).join(' ')) || 'PESU course',
      courseId,
      subType: document.querySelector('#subType')?.value || '',
    };
  }

  // Downloads go through the background worker (so they land in a
  // "PESU Slides/<course>" folder); if that fails, fall back to a link click.
  async function save({ blob, path, flatName }) {
    const objectUrl = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'psm-download', url: objectUrl, filename: path });
      if (res?.ok) return path.split('/').pop();
    } catch { /* extension reloaded or API unavailable: use the fallback */ }
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = flatName;
    a.style.display = 'none';
    document.body.append(a);
    a.click();
    a.remove();
    return flatName;
  }

  // ---------- UI ----------

  const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1zM5 19a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5z"/></svg>';

  const CSS = `
    :host { all: initial; display: block; font-family: inherit; margin: 12px 0 4px; }
    :host(.floating) { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; margin: 0;
      width: min(460px, calc(100vw - 32px)); filter: drop-shadow(0 8px 24px rgba(15,35,55,.18)); }
    * { box-sizing: border-box; }
    .card { font: 13px/1.45 "Open Sans", system-ui, -apple-system, "Segoe UI", sans-serif; color: #173049;
      background: #f5f9fc; border: 1px solid #d9e6ef; border-radius: 6px; padding: 10px 12px; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    button { font: inherit; font-weight: 600; border-radius: 4px; padding: 7px 14px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px; border: 1px solid #0091cd; transition: background .15s, opacity .15s; }
    button:focus-visible { outline: 2px solid #173049; outline-offset: 2px; }
    button:disabled { opacity: .55; cursor: progress; }
    .primary { background: #0091cd; color: #fff; }
    .primary:hover:not(:disabled) { background: #007bb0; }
    .ghost { background: #fff; color: #0079ac; }
    .ghost:hover:not(:disabled) { background: #e8f4fa; }
    .seg { display: inline-flex; border: 1px solid #b9d3e3; border-radius: 4px; overflow: hidden; background: #fff; }
    .seg button { border: 0; border-radius: 0; padding: 7px 12px; background: #fff; color: #3d5466; font-weight: 600; }
    .seg button + button { border-left: 1px solid #b9d3e3; }
    .seg button[aria-pressed="true"] { background: #173049; color: #fff; }
    .status { flex: 1 1 220px; min-width: 0; color: #4a5f70; }
    .status b { color: #173049; font-weight: 600; }
    .status.error { color: #b3261e; }
    .status.ok { color: #1d6b43; }
    .track { height: 3px; background: #e1ebf2; border-radius: 3px; margin-top: 9px; overflow: hidden; display: none; }
    .track.on { display: block; }
    .fill { height: 100%; width: 0; background: #0091cd; transition: width .25s ease; }
    ul { margin: 8px 0 0; padding: 0 0 0 18px; color: #4a5f70; font-size: 12px; max-height: 160px; overflow: auto; }
    ul:empty { display: none; }
    li { margin: 2px 0; }
    li.warn::marker { color: #c77700; }
    li.bad::marker { color: #b3261e; }
    li.info::marker { color: #0091cd; }
    .x { margin-left: auto; background: none; border: 0; color: #4a5f70; padding: 2px 6px; font-size: 16px; line-height: 1; display: none; }
    :host(.floating) .x { display: inline-flex; }
  `;

  let host;
  let ui;
  let busy = false;
  let lingering = false; // keep the floating card up after a run until it's closed
  let material = 'slides';

  function buildUi() {
    host = document.createElement('div');
    host.id = 'pesu-slide-merger';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="card" role="region" aria-label="Slides and notes downloader">
        <div class="row">
          <div class="seg" role="group" aria-label="What to download">
            <button type="button" data-mat="slides" aria-pressed="true">Slides</button>
            <button type="button" data-mat="notes" aria-pressed="false">Notes</button>
          </div>
          <button class="primary" id="unit" type="button">${ICON_DOWNLOAD}<span id="unitLabel">Download unit slides</span></button>
          <button class="ghost" id="all" type="button" title="Save one merged PDF per unit">All units</button>
          <button class="x" id="close" type="button" aria-label="Hide">×</button>
        </div>
        <div class="row" style="margin-top:6px"><div class="status" id="status" aria-live="polite"></div></div>
        <div class="track" id="track"><div class="fill" id="fill"></div></div>
        <ul id="log"></ul>
      </div>`;
    const $ = (id) => root.getElementById(id);
    ui = {
      unitBtn: $('unit'), allBtn: $('all'), unitLabel: $('unitLabel'), status: $('status'), track: $('track'),
      fill: $('fill'), log: $('log'), close: $('close'), seg: [...root.querySelectorAll('.seg button')],
    };
    ui.unitBtn.addEventListener('click', () => start('unit'));
    ui.allBtn.addEventListener('click', () => start('all'));
    ui.close.addEventListener('click', () => { if (!busy) { lingering = false; host.remove(); } });
    ui.seg.forEach((b) => b.addEventListener('click', () => setMaterial(b.dataset.mat, true)));
    Promise.resolve().then(() => chrome.storage.local.get({ material: 'slides' }))
      .then((s) => setMaterial(s.material, false)).catch(() => {});
  }

  function setMaterial(next, remember) {
    if (busy || !MATERIALS[next]) return;
    material = next;
    ui.seg.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mat === next)));
    if (remember) Promise.resolve().then(() => chrome.storage.local.set({ material: next })).catch(() => {});
    refreshLabel();
    resetStatus();
  }

  function setStatus(html, tone = '') {
    ui.status.className = `status ${tone}`;
    ui.status.innerHTML = html;
  }

  function resetStatus() {
    setStatus(`Merges every class's ${MATERIALS[material].noun} in this unit into one PDF, in order. PowerPoint and Word files are converted.`);
    ui.log.textContent = '';
  }

  function setProgress(fraction) {
    if (fraction == null) { ui.track.classList.remove('on'); return; }
    ui.track.classList.add('on');
    ui.fill.style.width = `${Math.max(2, Math.min(100, fraction * 100)).toFixed(1)}%`;
  }

  function log(text, tone = '') {
    const li = document.createElement('li');
    if (tone) li.className = tone;
    li.textContent = text;
    ui.log.append(li);
  }

  function refreshLabel() {
    if (!ui || busy) return;
    const units = parseUnits(document);
    const active = units.find((u) => u.active) || units[0];
    ui.unitLabel.textContent = `Download ${active ? `Unit ${active.number}` : 'unit'} ${MATERIALS[material].noun}`;
    ui.allBtn.style.display = units.length > 1 ? '' : 'none';
  }

  let observedUl = null;
  const ulObserver = new MutationObserver(() => refreshLabel());

  function place() {
    const ul = document.querySelector('#courselistunit');
    if (!host) buildUi();
    if (ul) {
      lingering = false;
      host.classList.remove('floating');
      if (host.previousElementSibling !== ul) ul.after(host);
      if (observedUl !== ul) {
        ulObserver.disconnect();
        ulObserver.observe(ul, { subtree: true, attributes: true, attributeFilter: ['class'] });
        observedUl = ul;
        if (!busy) resetStatus(); // a different course page: drop the last run's message
      }
      refreshLabel();
    } else if (busy || lingering) {
      host.classList.add('floating');
      if (host.parentElement !== document.body) document.body.append(host);
    } else if (host.isConnected) {
      host.remove();
    }
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; place(); });
  }).observe(document.body, { childList: true, subtree: true });
  place();

  // ---------- the actual work ----------

  async function runUnit(unit, course, settings, mat, report) {
    const unitName = unitShortTitle(unit.title) || `Unit ${unit.number}`;
    const tag = `Unit ${unit.number}`;
    const folder = `PESU Slides/${safeName(course.label, 70)}`;

    report(`<b>${tag}</b> · reading the class list…`, 0.02);
    const classes = await getClasses({ unitId: unit.id, courseId: course.courseId, subType: course.subType, column: mat.column });
    if (!classes.length) return { unit, empty: true, reason: 'no classes listed' };

    // 1. File links for every class, in table order.
    const withFiles = classes.filter((c) => c.count !== 0);
    let looked = 0;
    await mapLimit(withFiles, PARALLEL, async (cls) => {
      try {
        cls.decks = await getMaterialLinks({ courseId: cls.courseId || course.courseId, topicId: cls.topicId, typeId: cls.typeId || mat.fallbackType });
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        cls.decks = [];
        cls.linkError = err.message;
      }
      looked++;
      report(`<b>${tag}</b> · finding ${mat.noun} · ${looked} of ${withFiles.length} classes`, 0.02 + 0.1 * (looked / withFiles.length));
    });

    // A file marked "applies to whole unit" can show up under several classes: keep its first spot.
    const seen = new Set();
    for (const cls of classes) {
      cls.decks = (cls.decks || []).filter((d) => !seen.has(d.id) && seen.add(d.id));
      if (cls.linkError) log(`${tag} · class ${cls.index} "${cls.title}": couldn't read its ${mat.noun} list (${cls.linkError})`, 'bad');
    }
    const decks = classes.flatMap((cls) => cls.decks.map((d) => ({ cls, deck: d })));
    if (!decks.length) return { unit, empty: true, reason: `no ${mat.noun} uploaded yet` };

    // 2. Download every file.
    let fetched = 0;
    let bytes = 0;
    await mapLimit(decks, PARALLEL, async ({ deck }) => {
      try {
        deck.result = await downloadDeck(deck);
        bytes += deck.result.bytes.length;
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        deck.error = err.message;
      }
      fetched++;
      report(`<b>${tag}</b> · downloading · ${fetched} of ${decks.length} files · ${mb(bytes)}`, 0.12 + 0.55 * (fetched / decks.length));
    });

    // 3. Convert PowerPoint / Word / Excel files to PDF, one at a time.
    const office = decks.filter(({ deck }) => deck.result?.type === 'file' && CONVERTIBLE.has(deck.result.ext));
    let converted = 0;
    if (office.length && settings.convertOffice) {
      for (let i = 0; i < office.length; i++) {
        const { cls, deck } = office[i];
        const kind = officeKind(deck.result.ext);
        const base = 0.67 + 0.15 * (i / office.length);
        report(`<b>${tag}</b> · converting ${kind} file ${i + 1} of ${office.length}…`, base);
        try {
          const pdf = await toPdf(deck.result.bytes, {
            name: `${safeName(deck.title, 60)}.${deck.result.ext}`,
            ext: deck.result.ext,
            onProgress: (p) => {
              const starting = !/^(complete|converting)$/.test(p.phase) || /download|compil|filesystem|initiali|starting|preparing/i.test(p.message || '');
              report(`<b>${tag}</b> · converting ${kind} file ${i + 1} of ${office.length} · ${starting ? 'starting the converter (first time takes a few seconds)…' : esc(String(p.message || '').replace(/\.+$/, '').toLowerCase())}`, base);
            },
          });
          deck.original = deck.result;
          deck.result = { bytes: pdf, type: 'pdf', ext: 'pdf' };
          converted++;
          log(`${tag} · class ${cls.index}, "${deck.title}": converted from .${deck.original.ext}`, 'info');
        } catch (err) {
          deck.skipReason = `is a .${deck.result.ext} file that couldn't be converted (${err.message})`;
        }
      }
    }
    for (const { deck } of decks) {
      const r = deck.result;
      if (r && r.type === 'file' && !deck.skipReason) {
        deck.skipReason = CONVERTIBLE.has(r.ext)
          ? `is a .${r.ext} file (PowerPoint/Word conversion is turned off in the extension's options)`
          : `is a .${r.ext} file, which can't go into a PDF`;
      }
    }

    // 4. Save what couldn't be merged (and the originals, if asked) next to the PDF.
    for (const { cls, deck } of decks) {
      const keep = deck.result?.type === 'file' ? deck.result : settings.keepOriginals ? deck.original : null;
      if (!keep) continue;
      const base = safeName(`${tag} ${mat.noun} - ${pad(cls.index)} - ${deck.title}`, 90);
      const name = await save({
        blob: blobOf(keep.bytes, keep.ext),
        path: `${folder}/${base}.${keep.ext}`,
        flatName: safeName(`${course.code || course.label} ${base}`, 110) + `.${keep.ext}`,
      });
      if (deck.result?.type === 'file') deck.savedAs = name;
    }

    // 5. Merge in class order.
    const ordered = classes.filter((c) => c.decks.length);
    const result = await mergeUnit(ordered, {
      titlePages: settings.titlePages,
      docTitle: `${course.label} - ${tag} ${mat.noun}: ${unitName}`,
      onProgress: (done, total) => report(`<b>${tag}</b> · merging · ${done} of ${total} files`, 0.82 + 0.16 * (done / total)),
    });

    for (const s of result.skipped) {
      log(`${tag} · class ${s.cls.index}, "${s.deck.title}" ${s.reason}${s.deck.savedAs ? ` → saved as ${s.deck.savedAs}` : ''}`, s.deck.result ? 'warn' : 'bad');
    }

    // 6. Save the merged PDF.
    const fileBase = safeName(`${tag} ${mat.noun} - ${unitName}`, 90);
    const savedAs = await save({
      blob: blobOf(result.bytes, 'pdf'),
      path: `${folder}/${fileBase}.pdf`,
      flatName: `${safeName(`${course.code || course.label} ${fileBase}`, 120)}.pdf`,
    });
    report(`<b>${tag}</b> · saved`, 1);
    return { unit, savedAs, pages: result.pageCount, files: decks.length, converted, skipped: result.skipped.length };
  }

  async function start(mode) {
    if (busy) return;
    const course = courseInfo();
    const units = parseUnits(document);
    const targets = mode === 'all' ? units : [units.find((u) => u.active) || units[0]].filter(Boolean);
    if (!course.courseId || !targets.length) {
      setStatus('Open a course from <b>My Courses</b> first, then pick a unit tab.', 'error');
      return;
    }

    busy = true;
    const mat = MATERIALS[material];
    ui.unitBtn.disabled = ui.allBtn.disabled = true;
    ui.seg.forEach((b) => { b.disabled = true; });
    ui.log.textContent = '';
    setProgress(0);
    const settings = await getSettings();
    const results = [];

    try {
      for (let i = 0; i < targets.length; i++) {
        const span = 1 / targets.length;
        const report = (html, f) => {
          setStatus(targets.length > 1 ? `${html} <span>(${i + 1}/${targets.length})</span>` : html);
          setProgress(i * span + f * span);
        };
        const r = await runUnit(targets[i], course, settings, mat, report);
        results.push(r);
        if (r.empty) log(`Unit ${r.unit.number}: ${r.reason}, nothing to save.`, 'warn');
        else if (targets.length > 1) log(`Unit ${r.unit.number}: ${plural(r.files, 'file')}, ${r.pages} pages → ${r.savedAs}`);
      }

      const saved = results.filter((r) => !r.empty);
      const skipped = saved.reduce((n, r) => n + r.skipped, 0);
      const converted = saved.reduce((n, r) => n + r.converted, 0);
      const extra = `${converted ? ` · ${converted} converted from PowerPoint/Word` : ''}${skipped ? ` · ${skipped} not merged (see below)` : ''}`;
      if (!saved.length) {
        setStatus(`No ${mat.noun} have been uploaded for ${targets.length > 1 ? 'any unit' : 'this unit'} yet.`, 'error');
      } else if (saved.length === 1) {
        const r = saved[0];
        setStatus(`Saved <b>${esc(r.savedAs)}</b> · ${plural(r.files, mat.item)}, ${r.pages} pages${extra}`, skipped ? '' : 'ok');
      } else {
        setStatus(`Saved <b>${saved.length} PDFs</b> to Downloads › PESU Slides${extra}`, skipped ? '' : 'ok');
      }
    } catch (err) {
      console.error('[Slide Merger for PESU Academy]', err);
      setStatus(esc(err instanceof SessionExpiredError ? err.message : `Something went wrong: ${err.message || err}`), 'error');
    } finally {
      busy = false;
      lingering = host.classList.contains('floating');
      ui.unitBtn.disabled = ui.allBtn.disabled = false;
      ui.seg.forEach((b) => { b.disabled = false; });
      setProgress(null);
      place();
    }
  }
})();
