// Build the Chrome Web Store package.
//
//   node scripts/package.mjs            write dist/manual-video-zoom-<version>.zip
//   node scripts/package.mjs --verify   build, then read the archive back and check it
//
// No dependencies and no build step, per the project's rules: only node:fs,
// node:path, node:zlib and node:crypto. The archive is reproducible - every
// entry carries a fixed timestamp, the order is fixed and deflate is
// deterministic - so the same sources produce a byte-identical ZIP, and the
// SHA-256 printed here can be published alongside the release.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// An explicit allowlist, never a directory walk with exclusions. An exclusion
// list fails open, and failing open here means shipping tests/ - or a .pem - to
// Google. manifest.json must be first so it lands at the archive root.
export const FILES = [
  'manifest.json',
  'constants.js',
  'content.js',
  'background.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'LICENSE',
  '_locales/en/messages.json',
  '_locales/ja/messages.json',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

/* ---------- CRC-32 ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ---------- writer ---------- */

// 1980-01-01 00:00, the earliest a DOS timestamp can express. Fixed so the
// archive does not change when file mtimes do.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

function localHeader(name, crc, csize, usize) {
  const n = Buffer.from(name, 'utf8');
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4);          // version needed
  h.writeUInt16LE(0, 6);           // flags: names are ASCII, nothing to signal
  h.writeUInt16LE(8, 8);           // deflate
  h.writeUInt16LE(DOS_TIME, 10);
  h.writeUInt16LE(DOS_DATE, 12);
  h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(csize, 18);
  h.writeUInt32LE(usize, 22);
  h.writeUInt16LE(n.length, 26);
  h.writeUInt16LE(0, 28);          // extra field length
  return Buffer.concat([h, n]);
}

function centralHeader(name, crc, csize, usize, offset) {
  const n = Buffer.from(name, 'utf8');
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4);          // version made by
  h.writeUInt16LE(20, 6);          // version needed
  h.writeUInt16LE(0, 8);
  h.writeUInt16LE(8, 10);
  h.writeUInt16LE(DOS_TIME, 12);
  h.writeUInt16LE(DOS_DATE, 14);
  h.writeUInt32LE(crc, 16);
  h.writeUInt32LE(csize, 20);
  h.writeUInt32LE(usize, 24);
  h.writeUInt16LE(n.length, 28);
  h.writeUInt16LE(0, 30);          // extra
  h.writeUInt16LE(0, 32);          // comment
  h.writeUInt16LE(0, 34);          // disk number start
  h.writeUInt16LE(0, 36);          // internal attributes
  h.writeUInt32LE(0, 38);          // external attributes
  h.writeUInt32LE(offset, 42);
  return Buffer.concat([h, n]);
}

export function buildZip(root = ROOT, files = FILES) {
  const parts = [];
  const central = [];
  let offset = 0;
  const entries = [];

  for (const name of files) {
    const raw = fs.readFileSync(path.join(root, name));
    const deflated = zlib.deflateRawSync(raw, {level: 9});
    const crc = crc32(raw);
    const local = localHeader(name, crc, deflated.length, raw.length);
    parts.push(local, deflated);
    central.push(centralHeader(name, crc, deflated.length, raw.length, offset));
    offset += local.length + deflated.length;
    entries.push({name, raw: raw.length, deflated: deflated.length});
  }

  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // this disk
  eocd.writeUInt16LE(0, 6);              // disk with central directory
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);             // comment length

  return {buffer: Buffer.concat([...parts, cd, eocd]), entries};
}

/* ---------- reader, for --verify ---------- */

export function readZipNames(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry ' + i);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    names.push(buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/* ---------- cli ---------- */

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const {version} = manifest;
  const outDir = path.join(ROOT, 'dist');
  const out = path.join(outDir, `manual-video-zoom-${version}.zip`);

  const {buffer, entries} = buildZip();
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(out, buffer);

  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const pad = Math.max(...entries.map(e => e.name.length));
  for (const e of entries) {
    console.log(`  ${e.name.padEnd(pad)}  ${String(e.raw).padStart(7)} -> ${String(e.deflated).padStart(7)}`);
  }
  console.log(`\n${entries.length} entries, ${buffer.length} bytes`);
  console.log(`file    ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
  console.log(`sha256  ${sha}`);

  if (!process.argv.includes('--verify')) return;

  const back = fs.readFileSync(out);
  const names = readZipNames(back);
  const problems = [];
  if (names[0] !== 'manifest.json') problems.push(`first entry is ${names[0]}, not manifest.json`);
  if (JSON.stringify(names) !== JSON.stringify(FILES)) {
    problems.push(`entries differ from the allowlist:\n  got      ${names.join(', ')}\n  expected ${FILES.join(', ')}`);
  }
  for (const n of names) {
    if (n.includes('\\')) problems.push(`${n} uses a backslash separator`);
    if (n.startsWith('.') || n.split('/').includes('..')) problems.push(`${n} is not a plain relative path`);
    if (n.endsWith('/')) problems.push(`${n} is a directory entry`);
  }
  // Everything the manifest points at must actually be inside the archive.
  const referenced = new Set([
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
    ...(manifest.content_scripts?.[0]?.js ?? []),
    manifest.background?.service_worker,
    manifest.action?.default_popup,
  ].filter(Boolean));
  for (const ref of referenced) {
    if (!names.includes(ref)) problems.push(`manifest references ${ref}, which is not in the archive`);
  }
  if (problems.length) {
    console.error('\nVERIFY FAILED');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('verify  ok');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
