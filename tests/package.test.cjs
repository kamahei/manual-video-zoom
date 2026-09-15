const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
// The build script is ESM; a .cjs test reaches it with a dynamic import.
const load = () => import(require('node:url').pathToFileURL(path.join(root, 'scripts/package.mjs')).href);

// Everything the manifest points at has to be in the package. Shipping an
// archive that references a missing file is a store rejection, and the
// allowlist is hand-written, so this is the check that keeps the two in step.
test('the package allowlist covers every file the manifest references', async () => {
 const {FILES} = await load();
 const referenced = new Set([
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
  ...manifest.content_scripts[0].js,
  manifest.background.service_worker,
  manifest.action.default_popup
 ]);
 for (const file of referenced) assert.ok(FILES.includes(file), `${file} is referenced but not packaged`);
 assert.equal(FILES[0], 'manifest.json');
 for (const file of FILES) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file} is packaged but does not exist`);
  assert.ok(!file.includes('\\') && !file.startsWith('.') && !file.split('/').includes('..'), file);
 }
});

// popup.css is reached from popup.html rather than the manifest, and LICENSE
// travels with the copy because MIT asks it to; neither is caught above.
test('the package also carries the stylesheet and the licence', async () => {
 const {FILES} = await load();
 assert.ok(read('popup.html').includes('popup.css'));
 for (const file of ['popup.css', 'LICENSE']) assert.ok(FILES.includes(file), file);
});

test('development-only files are never packaged', async () => {
 const {FILES} = await load();
 const excluded = ['README.md', 'INSTALL.ja.md', 'PRIVACY.md', 'AGENTS.md', 'CHANGELOG.md',
  'SECURITY.md', '.gitignore', 'scripts/package.mjs'];
 for (const file of excluded) assert.ok(!FILES.includes(file), file);
 for (const file of FILES) {
  assert.ok(!file.startsWith('tests/') && !file.startsWith('docs/') &&
   !file.startsWith('scripts/') && !file.startsWith('.github/'), file);
 }
});

test('the archive puts manifest.json first, uses / separators and is reproducible', async () => {
 const {buildZip, readZipNames, FILES} = await load();
 const first = buildZip();
 const second = buildZip();
 assert.ok(first.buffer.equals(second.buffer), 'two builds of the same sources must be byte-identical');
 const names = readZipNames(first.buffer);
 assert.deepEqual(names, FILES);
 assert.equal(names[0], 'manifest.json');
 for (const name of names) assert.ok(!name.includes('\\') && !name.endsWith('/'), name);
 // Local header, then the central directory and end record the readers look for.
 assert.equal(first.buffer.readUInt32LE(0), 0x04034b50);
 assert.ok(first.buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) > 0);
});

test('the packaged version is a valid Chrome Web Store version string', () => {
 const parts = manifest.version.split('.');
 assert.ok(parts.length >= 1 && parts.length <= 4, manifest.version);
 for (const part of parts) {
  assert.match(part, /^(0|[1-9]\d*)$/, manifest.version);
  assert.ok(Number(part) <= 65535, manifest.version);
 }
});
