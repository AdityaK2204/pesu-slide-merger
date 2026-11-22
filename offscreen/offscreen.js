// Hidden extension page that converts PowerPoint / Word files to PDF with
// LibreOffice compiled to WebAssembly (bundled in ../lo, nothing downloaded).
// The content script talks to it over a runtime port named "psm-convert":
//   in : {op:'begin', name, ext} · {op:'chunk', data:<base64>} · {op:'end'}
//   out: {op:'progress', phase, percent, message} · {op:'chunk', data} · {op:'done'} · {op:'error', message}
import { WorkerBrowserConverter } from '../lo/browser.js';

const IDLE_MS = 3 * 60 * 1000; // free the ~1 GB converter when unused
const STALL_MS = 3 * 60 * 1000; // a normal lecture deck takes seconds; a huge one well under this
const CHUNK = 4 * 1024 * 1024;

const progressListeners = new Set();
let initPromise = null;
let converter = null;
let queue = Promise.resolve();
let idleTimer = null;

function getConverter() {
  if (!self.crossOriginIsolated) {
    return Promise.reject(new Error('converter page is not cross-origin isolated (SharedArrayBuffer unavailable)'));
  }
  if (!initPromise) {
    const url = (p) => chrome.runtime.getURL(p);
    converter = new WorkerBrowserConverter({
      sofficeJs: url('lo/soffice.js'),
      sofficeWasm: url('lo/soffice.wasm'),
      sofficeData: url('lo/soffice.data'),
      sofficeWorkerJs: url('lo/soffice.worker.js'),
      browserWorkerJs: url('lo/browser.worker.global.js'),
      onProgress: (p) => progressListeners.forEach((fn) => fn(p)),
    });
    initPromise = converter.initialize().catch((err) => {
      initPromise = null;
      converter = null;
      throw err;
    });
  }
  return initPromise;
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function armIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => chrome.runtime.sendMessage({ type: 'psm-converter-idle' }).catch(() => {}), IDLE_MS);
}

// If LibreOffice stops reporting progress, throw the instance away so the
// next file gets a fresh one instead of waiting on a stuck worker.
async function withWatchdog(promise, onStall) {
  let timer;
  const stalled = new Promise((_, reject) => {
    timer = setTimeout(() => { onStall(); reject(new Error('conversion stalled')); }, STALL_MS);
  });
  try { return await Promise.race([promise, stalled]); } finally { clearTimeout(timer); }
}

function resetConverter() {
  const old = converter;
  converter = null;
  initPromise = null;
  old?.destroy().catch(() => {});
}

async function convert(port, job) {
  const send = (msg) => { try { port.postMessage(msg); } catch { /* port closed */ } };
  const onProgress = (p) => send({ op: 'progress', phase: p.phase, percent: p.percent, message: p.message });
  progressListeners.add(onProgress);
  try {
    await withWatchdog(getConverter(), resetConverter);
    send({ op: 'progress', phase: 'converting', percent: 100, message: 'Converting' });
    const input = concat(job.parts);
    const result = await withWatchdog(
      converter.convert(input, { outputFormat: 'pdf', inputFormat: job.ext }, job.name),
      resetConverter,
    );
    const pdf = result.data;
    for (let i = 0; i < pdf.length; i += CHUNK) send({ op: 'chunk', data: toBase64(pdf.subarray(i, i + CHUNK)) });
    send({ op: 'done', bytes: pdf.length, ms: result.duration });
  } catch (err) {
    send({ op: 'error', message: err?.message || String(err) });
  } finally {
    progressListeners.delete(onProgress);
    armIdleTimer();
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'psm-convert') return;
  clearTimeout(idleTimer);
  const job = { parts: [], name: 'document', ext: '' };
  port.onMessage.addListener((msg) => {
    if (msg.op === 'begin') { job.name = msg.name || job.name; job.ext = (msg.ext || '').toLowerCase(); }
    else if (msg.op === 'chunk') job.parts.push(fromBase64(msg.data));
    else if (msg.op === 'end') queue = queue.then(() => convert(port, job)); // one document at a time
  });
});

// Warm up as soon as the page opens: a unit with Office files is about to need it.
getConverter().catch(() => {});
