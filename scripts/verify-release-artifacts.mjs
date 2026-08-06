#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requested = process.argv.find(v => v.startsWith('--platform='))?.split('=')[1]
  || (process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux');
const release = JSON.parse(fs.readFileSync(path.join(root, 'release/release-config.json'), 'utf8'));
const target = path.join(root, 'src-tauri', 'target');
const artifacts = path.join(root, 'artifacts');

if (!['macos', 'windows', 'linux'].includes(requested)) {
  throw new Error(`Unknown platform: ${requested}`);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && !entry.name.endsWith('.d')) out.push(full);
  }
  return out;
}

function requireFile(file, label) {
  if (!(fs.existsSync(file) && fs.statSync(file).isFile())) {
    throw new Error(`${label} missing: ${file}`);
  }
  return file;
}

function requireMatch(files, pattern, label) {
  const match = files.find(file => pattern.test(file.split(path.sep).join('/')));
  if (!match) throw new Error(`${label} missing; expected path matching ${pattern}`);
  return match;
}

const targetFiles = walk(target);
const artifactFiles = walk(artifacts);
let distributables = [];

if (requested === 'macos') {
  const appRoot = path.join(target, 'universal', 'release', 'bundle', 'macos', 'huff.app');
  const app = requireFile(path.join(appRoot, 'Contents', 'MacOS', 'huff'), 'universal app executable');
  const syphon = requireFile(path.join(appRoot, 'Contents', 'Frameworks', 'Syphon.framework', 'Versions', 'A', 'Syphon'), 'bundled Syphon.framework');
  const dmg = requireFile(path.join(target, 'universal', 'release', 'bundle', `huff-${release.version}-universal.dmg`), 'universal DMG');

  for (const [label, file] of [['app executable', app], ['Syphon.framework', syphon]]) {
    const lipo = spawnSync('lipo', ['-archs', file], { encoding: 'utf8' });
    if (lipo.status !== 0 || !lipo.stdout.includes('arm64') || !lipo.stdout.includes('x86_64')) {
      throw new Error(`${label} is not universal arm64 + x86_64`);
    }
  }
  const sign = spawnSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appRoot], { encoding: 'utf8' });
  if (sign.status !== 0) throw new Error(`codesign verification failed: ${sign.stderr}`);
  distributables = [dmg];
}

if (requested === 'windows') {
  const base = path.join(target, 'x86_64-pc-windows-msvc', 'release');
  requireFile(path.join(base, 'huff.exe'), 'Windows executable');
  requireFile(path.join(base, 'spout_bridge.dll'), 'Spout bridge DLL');
  const msi = requireMatch(targetFiles, /target\/x86_64-pc-windows-msvc\/release\/bundle\/msi\/[^/]+\.msi$/i, 'Windows MSI');
  const portable = requireFile(path.join(artifacts, `huff-${release.version}-windows-x64-portable.zip`), 'Windows portable ZIP');
  distributables = [msi, portable];
}

if (requested === 'linux') {
  requireFile(path.join(target, 'release', 'huff'), 'Linux release executable');
  const deb = requireMatch(targetFiles, /target\/release\/bundle\/deb\/[^/]+\.deb$/i, 'Linux DEB');
  const appImage = requireMatch(targetFiles, /target\/release\/bundle\/appimage\/[^/]+\.AppImage$/i, 'Linux AppImage');
  distributables = [deb, appImage];
}

fs.mkdirSync(artifacts, { recursive: true });
const lines = [];
const manifest = {
  product: release.publicName,
  version: release.version,
  platform: requested,
  generatedAt: new Date().toISOString(),
  artifacts: [],
};
for (const file of distributables) {
  const bytes = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const rel = path.relative(root, file).split(path.sep).join('/');
  lines.push(`${sha256}  ${rel}`);
  manifest.artifacts.push({ path: rel, bytes: bytes.length, sha256 });
}
fs.writeFileSync(path.join(artifacts, `SHA256SUMS-${requested}.txt`), `${lines.join('\n')}\n`);
fs.writeFileSync(path.join(artifacts, `release-manifest-${requested}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Verified ${requested} artifacts and wrote ${manifest.artifacts.length} distributable checksums.`);
