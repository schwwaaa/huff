#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(next || '')) {
  console.error('Usage: node scripts/set-release-version.mjs <semver>');
  process.exit(1);
}
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const writeJson = (rel, value) => fs.writeFileSync(path.join(root, rel), `${JSON.stringify(value, null, 2)}\n`);

const pkg = readJson('package.json');
pkg.version = next;
writeJson('package.json', pkg);
const lock = readJson('package-lock.json');
lock.version = next;
if (lock.packages?.['']) lock.packages[''].version = next;
writeJson('package-lock.json', lock);
const tauri = readJson('src-tauri/tauri.conf.json');
tauri.package.version = next;
writeJson('src-tauri/tauri.conf.json', tauri);
const release = readJson('release/release-config.json');
release.version = next;
writeJson('release/release-config.json', release);
for (const rel of ['src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']) {
  const full = path.join(root, rel);
  let text = fs.readFileSync(full, 'utf8');
  if (rel.endsWith('Cargo.toml')) text = text.replace(/(^\[package\][\s\S]*?^version = ")[^"]+("$)/m, `$1${next}$2`);
  else text = text.replace(/(name = "huff"\nversion = ")[^"]+("\n)/, `$1${next}$2`);
  fs.writeFileSync(full, text);
}
console.log(`HUFF Classic release version synchronized to ${next}.`);
