import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const hashFile = full => {
  const st = fs.lstatSync(full);
  const data = st.isSymbolicLink() ? Buffer.from(`SYMLINK:${fs.readlinkSync(full)}`) : fs.readFileSync(full);
  return crypto.createHash('sha256').update(data).digest('hex');
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function parseManifest(rel) {
  const map = new Map();
  for (const line of read(rel).trim().split(/\r?\n/)) {
    const m = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(m, `invalid manifest line: ${line}`);
    map.set(m[2], m[1]);
  }
  return map;
}

function walk(base) {
  const out = [];
  const visit = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) visit(full);
      else if (e.isFile() || e.isSymbolicLink()) out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  };
  visit(base);
  return out.sort();
}

function verifyTree(relDir, manifestRel, allowedChanged = [], allowedAdded = []) {
  const base = path.join(root, relDir);
  const expected = parseManifest(manifestRel);
  const changed = new Set(allowedChanged);
  for (const [rel, digest] of expected) {
    const full = path.join(base, ...rel.split('/'));
    assert(fs.existsSync(full), `${relDir}/${rel} missing`);
    if (!changed.has(rel)) assert(hashFile(full) === digest, `${relDir}/${rel} changed outside Pass 29 scope`);
  }
  for (const rel of walk(base)) {
    if (expected.has(rel)) continue;
    assert(allowedAdded.some(value => value.endsWith('/') ? rel.startsWith(value) : rel === value), `${relDir}/${rel} undeclared addition`);
  }
}

verifyTree('src', 'baseline/pass28-src.sha256');
verifyTree('src-tauri', 'baseline/pass28-src-tauri.sha256', [
  'Cargo.lock', 'Cargo.toml', 'build.rs', 'tauri.conf.json'
], [
  'tauri.macos.conf.json', 'tauri.windows.conf.json', 'tauri.linux.conf.json', 'native/spout2/SPOUTSDK/'
]);

const pass28Tauri = parseManifest('baseline/pass28-src-tauri.sha256');
for (const rel of ['src/main.rs', 'src/spout.rs', 'src/syphon.rs']) {
  assert(hashFile(path.join(root, 'src-tauri', rel)) === pass28Tauri.get(rel), `${rel} runtime changed`);
}
const pass28Src = parseManifest('baseline/pass28-src.sha256');
for (const rel of ['effects.js', 'pipeline-runtime.js', 'canvas.js', 'index.html']) {
  assert(hashFile(path.join(root, 'src', rel)) === pass28Src.get(rel), `src/${rel} changed`);
}

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const cfg = JSON.parse(read('src-tauri/tauri.conf.json'));
const release = JSON.parse(read('release/release-config.json'));
for (const v of [pkg.version, lock.version, lock.packages[''].version, cfg.package.version, release.version]) {
  assert(v === '1.0.3', `version mismatch: ${v}`);
}
assert(cfg.tauri.bundle.identifier === 'com.schwwaaa.huff', 'release bundle identifier invalid');
assert(cfg.tauri.bundle.publisher === 'schwwaaa', 'publisher missing');
assert(cfg.tauri.bundle.macOS.frameworks.includes('frameworks/Syphon.framework'), 'Syphon framework bundle declaration missing');
assert(JSON.parse(read('src-tauri/tauri.macos.conf.json')).tauri.bundle.targets.join(',') === 'app,dmg', 'macOS targets invalid');
assert(JSON.parse(read('src-tauri/tauri.windows.conf.json')).tauri.bundle.targets.join(',') === 'msi', 'Windows target must be MSI-only');
assert(JSON.parse(read('src-tauri/tauri.linux.conf.json')).tauri.bundle.targets.join(',') === 'deb,appimage', 'Linux targets invalid');

const requiredSpout = [
  'SPOUTSDK/licence.txt',
  'SPOUTSDK/SpoutGL/SpoutCopy.cpp',
  'SPOUTSDK/SpoutGL/SpoutDirectX.cpp',
  'SPOUTSDK/SpoutGL/SpoutFrameCount.cpp',
  'SPOUTSDK/SpoutGL/SpoutSenderNames.cpp',
  'SPOUTSDK/SpoutGL/SpoutSharedMemory.cpp',
  'SPOUTSDK/SpoutGL/SpoutUtils.cpp',
  'SPOUTSDK/SpoutDirectX/SpoutDX/SpoutDX.cpp',
];
for (const rel of requiredSpout) assert(fs.existsSync(path.join(root, 'src-tauri/native/spout2', rel)), `Spout SDK missing ${rel}`);
assert(walk(path.join(root, 'src-tauri/native/spout2/SPOUTSDK')).length >= 60, 'Build-required Spout SDK source set incomplete');

const buildRs = read('src-tauri/build.rs');
for (const marker of [
  'HUFF Classic Windows release requires Spout2 SDK file',
  'let out_dir = PathBuf::from(env::var("OUT_DIR")',
  'out_dir.ancestors().nth(3)',
  'spout_bridge.dll',
]) assert(buildRs.includes(marker), `build.rs missing marker: ${marker}`);
assert(!buildRs.includes('building WITHOUT Spout support'), 'Windows build can still silently omit Spout');

const buildSh = read('build.sh');
for (const marker of [
  'macOS bundles must be built on macOS',
  'Windows MSI must be built natively on Windows',
  'Linux bundles must be built natively on Linux',
  'HUFF_NOTARY_PROFILE',
  'verify-release-artifacts.mjs',
]) assert(buildSh.includes(marker), `build.sh missing marker: ${marker}`);
assert(!buildSh.includes('cargo-xwin') && !buildSh.includes("command -v cross"), 'unsupported release cross-compilation remains');

for (const rel of [
  'scripts/release-preflight.mjs',
  'scripts/set-release-version.mjs',
  'scripts/verify-release-artifacts.mjs',
  'scripts/package-windows.ps1',
  'scripts/check-linux-deps.sh',
  'scripts/macos-notarize.sh',
]) assert(fs.existsSync(path.join(root, rel)), `${rel} missing`);

assert(pkg.scripts['validate:pass29'] === 'node scripts/validate-pass29.mjs', 'validate:pass29 script missing');
assert(pkg.scripts['release:preflight'] === 'node scripts/release-preflight.mjs --platform=all --static', 'release preflight script missing');

const preflight = spawnSync(process.execPath, ['scripts/release-preflight.mjs', '--platform=all', '--static'], { cwd: root, encoding: 'utf8' });
assert(preflight.status === 0, `static release preflight failed:\n${preflight.stdout}\n${preflight.stderr}`);
assert(preflight.stdout.includes('0 blockers'), 'static release preflight did not report zero blockers');

console.log('PASS 29 validation passed.');
console.log('Pass 28 browser/native runtime is byte-identical; release metadata, native-only build routing, Syphon architecture checks, restored Spout SDK assets, Linux package targets, and release preflight are valid.');
