# LibreOffice (WebAssembly) — third-party notice

The files in this folder come from **@matbee/libreoffice-converter 2.7.2**
(browser build), which packages LibreOffice compiled to WebAssembly.

- Package: https://www.npmjs.com/package/@matbee/libreoffice-converter
- Source: https://github.com/matbeedotcom/libreoffice-document-converter
- LibreOffice source: https://www.libreoffice.org/about-us/source-code/
- License: Mozilla Public License 2.0 — https://mozilla.org/MPL/2.0/
  (LibreOffice also includes third-party components under their own licenses;
  see the LibreOffice source.)

| File | From package path |
| --- | --- |
| `browser.js` | `dist/browser.js` |
| `browser.worker.global.js` | `dist/browser.worker.global.js` (modified, see below) |
| `soffice.js` | `wasm/soffice.js` (modified, see below) |
| `soffice.worker.js` | `wasm/soffice.worker.js` |
| `soffice.wasm` | `wasm/soffice.wasm` |
| `soffice.data` | `wasm/soffice.data` |

## Modifications

`soffice.js` and `browser.worker.global.js` were changed by
`../tools/patch-soffice.mjs` (the full source of the change is in that script):

1. embind glue built with `new Function(...)` replaced by equivalent closures,
   so it runs under the extension's Content Security Policy.
2. The pre-spawned thread pool raised from 4 to 20 workers.
3. LibreOffice's debug logging (`SAL_LOG=+ALL`) turned down.

These modified files are themselves source code (JavaScript) and remain under the MPL-2.0.
