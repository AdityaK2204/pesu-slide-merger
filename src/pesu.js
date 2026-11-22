// PESU Academy data access: unit -> classes -> slide decks -> file bytes.
// Every request runs from the PESU Academy page itself, so it uses the
// student's existing login session. Nothing is sent anywhere else.
(() => {
  'use strict';

  const ADMIN_URL = '/Academy/s/studentProfilePESUAdmin';
  const MENU_ID = '653';            // "My Courses"
  const CONTROLLER = '6403';
  const SLIDES_TYPE = '2';          // material type id for "Slides"
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  class SessionExpiredError extends Error {
    constructor() {
      super('Your PESU Academy session has expired. Refresh the page, log in again and retry.');
      this.name = 'SessionExpiredError';
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
  }

  function looksLikeLoginPage(text) {
    return /name=["']j_password["']|j_spring_security_check/i.test(text);
  }

  async function fetchWithRetry(url, init, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, init);
        if (res.status >= 500 && i < tries - 1) {
          lastErr = new Error(`Server error ${res.status}`);
          await sleep(600 * (i + 1));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (i < tries - 1) await sleep(600 * (i + 1));
      }
    }
    throw lastErr;
  }

  async function getPage(params) {
    const qs = new URLSearchParams({ ...params, _: String(Date.now()) });
    const res = await fetchWithRetry(`${ADMIN_URL}?${qs}`, {
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
    });
    const text = await res.text();
    if (looksLikeLoginPage(text) || res.status === 401) throw new SessionExpiredError();
    if (!res.ok) throw new Error(`PESU Academy returned HTTP ${res.status}`);
    return new DOMParser().parseFromString(text, 'text/html');
  }

  // ---------- parsing (pure, works on any Document) ----------

  /** Unit tabs on the open course page, in display order. */
  function parseUnits(root) {
    return [...root.querySelectorAll('#courselistunit a')]
      .map((a, i) => {
        const id = (a.getAttribute('onclick') || '').match(/handleclassUnit\(\s*'?(\d+)'?\s*\)/)?.[1]
          || (a.getAttribute('href') || '').match(/courseUnit_(\d+)/)?.[1];
        return id ? {
          id,
          number: i + 1,
          title: clean(a.getAttribute('title') || a.textContent),
          active: !!a.closest('li')?.classList.contains('active'),
        } : null;
      })
      .filter(Boolean);
  }

  /**
   * Classes of a unit, in the order the unit table lists them.
   * `column` is the table header to count (e.g. "Slides" or "Notes"); each
   * class also gets that column's material type id, read from the cell's
   * handleclasscoursecontentunit(..., <type>, event) call.
   */
  function parseClasses(doc, column = 'Slides') {
    const rows = [...doc.querySelectorAll('tr[onclick*="handleclasscoursecontentunit"]')];
    if (!rows.length) return [];

    const headers = [...(rows[0].closest('table')?.querySelectorAll('thead th') || [])]
      .map((th) => clean(th.textContent).toLowerCase());
    const col = headers.indexOf(column.toLowerCase());

    return rows.map((tr, i) => {
      const m = (tr.getAttribute('onclick') || '')
        .match(/handleclasscoursecontentunit\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/);
      if (!m) return null;
      let count = null; // null = unknown, fetch anyway
      let typeId = null;
      const cell = col >= 0 ? tr.cells[col] : null;
      if (cell) {
        const n = clean(cell.textContent).match(/\d+/);
        count = n ? Number(n[0]) : 0;
        typeId = (cell.getAttribute('onclick') || '').replace(/\s+/g, '').match(/,(\d+),event\)/)?.[1] || null;
      }
      const titleEl = tr.querySelector('.short-title');
      return {
        index: i + 1,
        topicId: m[1],
        courseId: m[2],
        unitId: m[3],
        classNo: m[4],
        title: clean(titleEl?.getAttribute('title') || titleEl?.textContent || tr.cells[0]?.textContent) || `Class ${i + 1}`,
        count,
        typeId,
      };
    }).filter(Boolean);
  }

  /** Material files (slide decks, notes…) listed for one class, in display order. */
  function parseMaterialLinks(doc) {
    const decks = [];
    const seen = new Set();
    const push = (id, title, hint, viewerPath) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      decks.push({ id, title: clean(title) || 'Slides', hint, viewerPath });
    };

    for (const box of doc.querySelectorAll('.link-preview')) {
      const boxClick = box.getAttribute('onclick') || '';
      const a = box.querySelector('a[onclick]') || box.querySelector('a');
      const aClick = a?.getAttribute('onclick') || '';
      const title = (a || box).textContent;

      const fileId = boxClick.match(/downloadcoursedoc\(\s*'([^']+)'/)?.[1];
      if (fileId) { push(fileId, title, 'file'); continue; }

      const viewer = aClick.match(/loadIframe\(\s*'([^']+)'/)?.[1];
      if (viewer) {
        const path = viewer.split('#')[0];
        push(path.match(UUID_RE)?.[0] || path.split('/').pop(), title, 'pdf', path);
        continue;
      }
      const any = (boxClick + ' ' + aClick).match(UUID_RE)?.[0];
      if (any) push(any, title, 'unknown');
    }

    // Fallback if the markup changes: scan for any referenced document ids.
    if (!decks.length) {
      const html = doc.documentElement?.outerHTML || '';
      for (const m of html.matchAll(/(?:downloadslidecoursedoc\/|downloadcoursedoc\(\s*')([0-9a-f-]{36})/gi)) {
        push(m[1], `Slides ${decks.length + 1}`, 'unknown');
      }
    }
    return decks;
  }

  // ---------- network ----------

  async function getClasses({ unitId, courseId, subType, column }) {
    const params = {
      controllerMode: CONTROLLER, actionType: '43', coursecontentid: unitId,
      menuId: MENU_ID, selectedData: courseId,
    };
    if (subType) params.subType = subType;
    return parseClasses(await getPage(params), column);
  }

  async function getMaterialLinks({ courseId, topicId, typeId = SLIDES_TYPE }) {
    return parseMaterialLinks(await getPage({
      url: 'studentProfilePESUAdmin', controllerMode: CONTROLLER, actionType: '60',
      selectedData: courseId, id: typeId, unitid: topicId, menuId: MENU_ID,
    }));
  }

  function candidateUrls(deck) {
    const urls = [`/Academy/s/referenceMeterials/downloadslidecoursedoc/${deck.id}`];
    if (deck.viewerPath) urls.push(deck.viewerPath.replace('/Academy/a/', '/Academy/s/'), deck.viewerPath);
    urls.push(`/Academy/s/referenceMeterials/downloadcoursedoc/${deck.id}`);
    return [...new Set(urls)];
  }

  function sniff(bytes, filename) {
    const head = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 1024)));
    const ext = (filename.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
    if (head.includes('%PDF-')) return { type: 'pdf', ext: 'pdf' };
    if (head.startsWith('PK\x03\x04')) {
      const probe = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 4096)));
      const officeExt = probe.includes('ppt/') ? 'pptx' : probe.includes('word/') ? 'docx' : probe.includes('xl/') ? 'xlsx' : '';
      return { type: 'file', ext: officeExt || ext || 'zip' };
    }
    if (head.startsWith('\xD0\xCF\x11\xE0')) return { type: 'file', ext: ext || 'ppt' };
    if (/^\s*</.test(head)) return { type: 'html', ext: 'html' };
    return { type: 'file', ext: ext || 'bin' };
  }

  function filenameFrom(res) {
    const cd = res.headers.get('content-disposition') || '';
    const star = cd.match(/filename\*\s*=\s*[^']*''([^;]+)/i)?.[1];
    if (star) { try { return decodeURIComponent(star); } catch { /* ignore */ } }
    return cd.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1] || '';
  }

  /** Download one deck. Resolves to { bytes, type: 'pdf'|'file', ext, url }. */
  async function downloadDeck(deck) {
    let lastErr = new Error('No download link worked');
    for (const url of candidateUrls(deck)) {
      try {
        const res = await fetchWithRetry(url, { credentials: 'include' });
        if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!bytes.length) { lastErr = new Error('Empty file'); continue; }
        const kind = sniff(bytes, filenameFrom(res));
        if (kind.type === 'html') {
          const text = new TextDecoder().decode(bytes.subarray(0, 4000));
          if (looksLikeLoginPage(text)) throw new SessionExpiredError();
          lastErr = new Error('Server returned a web page instead of the file');
          continue;
        }
        return { bytes, type: kind.type, ext: kind.ext, url: new URL(res.url || url, location.origin).href };
      } catch (err) {
        if (err instanceof SessionExpiredError) throw err;
        lastErr = err;
      }
    }
    throw lastErr;
  }

  /** Run fn over items with at most `limit` in flight; results keep input order. */
  async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
  }

  globalThis.PESU = {
    SessionExpiredError, parseUnits, parseClasses, parseMaterialLinks,
    getClasses, getMaterialLinks, downloadDeck, mapLimit, sniff, clean,
  };
})();
