// Content-script side of the Office -> PDF converter. Sends the file to the
// extension's hidden converter page in base64 chunks and gets a PDF back.
(() => {
  'use strict';

  const CONVERTIBLE = new Set([
    'ppt', 'pptx', 'pps', 'ppsx', 'pot', 'potx', 'odp',
    'doc', 'docx', 'dot', 'dotx', 'odt', 'rtf',
    'xls', 'xlsx', 'ods',
  ]);
  const CHUNK = 4 * 1024 * 1024;
  const TIMEOUT_MS = 6 * 60 * 1000;

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

  /**
   * Convert an Office file to PDF.
   * onProgress({ phase, percent, message }) reports converter start-up and conversion.
   */
  async function toPdf(bytes, { name = 'document', ext = '', onProgress } = {}) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ok = await chrome.runtime.sendMessage({ type: 'psm-converter-ensure' });
      if (!ok?.ok) throw new Error(ok?.error || 'could not start the converter');
      const port = chrome.runtime.connect({ name: 'psm-convert' });
      const result = await new Promise((resolve, reject) => {
        const parts = [];
        let answered = false;
        const timer = setTimeout(() => { port.disconnect(); reject(new Error('conversion timed out')); }, TIMEOUT_MS);
        port.onMessage.addListener((msg) => {
          answered = true;
          if (msg.op === 'progress') onProgress?.(msg);
          else if (msg.op === 'chunk') parts.push(fromBase64(msg.data));
          else if (msg.op === 'done' || msg.op === 'error') {
            clearTimeout(timer);
            port.disconnect();
            if (msg.op === 'error') { reject(new Error(msg.message)); return; }
            const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
            let o = 0;
            for (const p of parts) { out.set(p, o); o += p.length; }
            resolve(out);
          }
        });
        port.onDisconnect.addListener(() => {
          clearTimeout(timer);
          // Dropped before any reply: the converter page wasn't listening yet. Retry.
          if (!answered) resolve(null);
          else reject(new Error('converter closed unexpectedly'));
        });
        try {
          port.postMessage({ op: 'begin', name, ext });
          for (let i = 0; i < bytes.length; i += CHUNK) port.postMessage({ op: 'chunk', data: toBase64(bytes.subarray(i, i + CHUNK)) });
          port.postMessage({ op: 'end' });
        } catch { /* disconnect handler decides */ }
      });
      if (result) return result;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('converter did not respond');
  }

  globalThis.PESUConvert = { CONVERTIBLE, toPdf };
})();
