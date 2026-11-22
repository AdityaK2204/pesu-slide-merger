// Downloads the two LibreOffice WebAssembly files that are too big for git
// (lo/soffice.wasm, lo/soffice.data) from the npm package and checks their
// SHA-256. Everything else in lo/ is committed (already patched).
//
// Usage (from the extension folder): node tools/fetch-libreoffice.mjs
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE = '@matbee/libreoffice-converter@2.7.2';
const FILES = {
  'soffice.wasm': 'ea3d8f3b69bd1e586a8ea973e0dfa61c758612fcc529dc94ac2e30519f8b4f7b',
  'soffice.data': '8f4e98aa67e108e161cecc7906d7ac0dd3941ef9347f999c3b9dbc049f165020',
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const missing = Object.entries(FILES).filter(([name, hash]) => {
  const file = path.join(root, 'lo', name);
  return !fs.existsSync(file) || sha256(file) !== hash;
});
if (!missing.length) { console.log('lo/ is complete.'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'psm-lo-'));
try {
  console.log(`Downloading ${PACKAGE} (about 80 MB)…`);
  // PACKAGE is a constant, so running it through the shell is safe (and needed for npm.cmd on Windows).
  const tarball = execSync(`npm pack ${PACKAGE} --silent`, { cwd: tmp, encoding: 'utf8' }).trim().split('\n').pop();
  execFileSync('tar', ['-xzf', tarball], { cwd: tmp });
  for (const [name, hash] of missing) {
    const src = path.join(tmp, 'package', 'wasm', name);
    const got = sha256(src);
    if (got !== hash) throw new Error(`${name}: unexpected SHA-256 ${got}`);
    fs.copyFileSync(src, path.join(root, 'lo', name));
    console.log(`lo/${name} ✓`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
