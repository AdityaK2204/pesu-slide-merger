// Saves files for the content script with chrome.downloads, so they can go
// into a "PESU Slides/<course>/" folder inside the Downloads directory.
// Replies { ok: false } if the download can't start or gets interrupted,
// and the content script then falls back to a plain link download.

// It also opens/closes the hidden converter page (offscreen/offscreen.html).

const WAIT_MS = 20000;
const OFFSCREEN_URL = 'offscreen/offscreen.html';
let creating = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const reply = (p) => p
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  switch (msg?.type) {
    case 'psm-download': reply(download(msg.url, msg.filename)); return true;
    case 'psm-converter-ensure': reply(ensureConverter().then(() => ({ ok: true }))); return true;
    case 'psm-converter-idle': chrome.offscreen.closeDocument().catch(() => {}); return false;
    default: return false;
  }
});

async function ensureConverter() {
  if (await chrome.offscreen.hasDocument()) return;
  creating ??= chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['WORKERS'],
    justification: 'Convert PowerPoint and Word files to PDF with a bundled LibreOffice (WebAssembly).',
  }).catch((err) => {
    if (!/single offscreen document/i.test(String(err?.message))) throw err;
  }).finally(() => { creating = null; });
  await creating;
}

async function download(url, filename) {
  const id = await chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false });
  if (typeof id !== 'number') return { ok: false, error: 'download did not start' };

  return new Promise((resolve) => {
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      chrome.downloads.onChanged.removeListener(onChanged);
      resolve(result);
    };
    const check = (state, error) => {
      if (state === 'complete') finish({ ok: true, id });
      else if (state === 'interrupted') {
        chrome.downloads.erase({ id }).catch(() => {});
        finish({ ok: false, error: error || 'interrupted' });
      }
    };
    const onChanged = (delta) => {
      if (delta.id === id && delta.state) check(delta.state.current, delta.error?.current);
    };
    // Still running after a while (big file or a "Save as" prompt): treat as started fine.
    const timer = setTimeout(() => finish({ ok: true, id, pending: true }), WAIT_MS);
    chrome.downloads.onChanged.addListener(onChanged);
    chrome.downloads.search({ id }).then(([item]) => item && check(item.state, item.error));
  });
}
