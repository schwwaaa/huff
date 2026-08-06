#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const requested = [...args].find(v => v.startsWith('--platform='))?.split('=')[1] || 'current';
const staticOnly = args.has('--static');
const requireSigning = args.has('--require-signing');
const host = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
const platforms = requested === 'all' ? ['macos', 'windows', 'linux'] : [requested === 'current' ? host : requested];

const pass = [];
const warn = [];
const block = [];
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const exists = rel => fs.existsSync(path.join(root, rel));
const commandExists = command => {
  const finder = process.platform === 'win32' ? 'where' : 'sh';
  const args = process.platform === 'win32' ? [command] : ['-lc', `command -v ${JSON.stringify(command)} >/dev/null 2>&1`];
  return spawnSync(finder, args, { stdio: 'ignore' }).status === 0;
};
const record = (condition, message, severity = 'block') => {
  (condition ? pass : severity === 'warn' ? warn : block).push(message);
};

function pngDimensions(rel) {
  const bytes = fs.readFileSync(path.join(root, rel));
  if (bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

function toolVersion(command, versionArgs = ['--version']) {
  try { return execFileSync(command, versionArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split(/\r?\n/)[0]; }
  catch { return null; }
}

const release = readJson('release/release-config.json');
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const tauri = readJson('src-tauri/tauri.conf.json');
const cargo = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');

record(pkg.version === release.version, `package.json version is ${release.version}`);
record(lock.version === release.version && lock.packages?.['']?.version === release.version, `package-lock.json version is ${release.version}`);
record(tauri.package?.version === release.version, `tauri.conf.json version is ${release.version}`);
record(new RegExp(`^version = "${release.version.replaceAll('.', '\\.') }"$`, 'm').test(cargo), `Cargo.toml version is ${release.version}`);
record(tauri.tauri?.bundle?.identifier === release.bundleIdentifier, `bundle identifier is ${release.bundleIdentifier}`);
record(!/^com\.example\./.test(tauri.tauri?.bundle?.identifier || ''), 'placeholder bundle identifier is absent');
record(tauri.tauri?.bundle?.publisher === release.publisher, `bundle publisher is ${release.publisher}`);
record(exists('LICENSE'), 'ISC LICENSE is present');
record(exists('src-tauri/Info.plist') && fs.readFileSync(path.join(root, 'src-tauri/Info.plist'), 'utf8').includes('NSCameraUsageDescription'), 'macOS camera usage description is present');
record(exists('src-tauri/entitlements.plist') && fs.readFileSync(path.join(root, 'src-tauri/entitlements.plist'), 'utf8').includes('com.apple.security.device.camera'), 'macOS camera entitlement is present');

for (const [rel, expected] of [
  ['src-tauri/icons/32x32.png', [32, 32]],
  ['src-tauri/icons/128x128.png', [128, 128]],
  ['src-tauri/icons/256x256.png', [256, 256]],
  ['src-tauri/icons/512x512.png', [512, 512]],
  ['src-tauri/icons/1024x1024.png', [1024, 1024]],
  ['src-tauri/icons/icon.png', [1024, 1024]],
]) {
  const dims = exists(rel) ? pngDimensions(rel) : null;
  record(Boolean(dims && dims[0] === expected[0] && dims[1] === expected[1]), `${rel} is ${expected[0]}×${expected[1]}`);
}
record(exists('src-tauri/icons/icon.icns') && fs.statSync(path.join(root, 'src-tauri/icons/icon.icns')).size > 1024, 'macOS ICNS is present');
record(exists('src-tauri/icons/icon.ico') && fs.statSync(path.join(root, 'src-tauri/icons/icon.ico')).size > 1024, 'Windows ICO is present');

for (const p of platforms) {
  record(['macos', 'windows', 'linux'].includes(p), `known platform requested: ${p}`);
  if (p === 'macos') {
    record(exists('src-tauri/tauri.macos.conf.json'), 'macOS platform config is present');
    const binary = 'src-tauri/frameworks/Syphon.framework/Versions/A/Syphon';
    record(exists(binary), 'Syphon.framework binary is bundled');
    if (exists(binary)) {
      const out = toolVersion('file', [path.join(root, binary)]) || '';
      record(out.includes('x86_64') && out.includes('arm64'), 'Syphon.framework contains x86_64 and arm64');
    }
    if (!staticOnly && host === 'macos') {
      for (const cmd of ['cargo', 'rustup', 'lipo', 'codesign', 'xcrun']) record(commandExists(cmd), `macOS build tool available: ${cmd}`);
      const identity = process.env.HUFF_CODESIGN_IDENTITY || process.env.APPLE_SIGNING_IDENTITY;
      record(Boolean(identity), 'Developer ID signing identity configured', requireSigning ? 'block' : 'warn');
      const notary = process.env.HUFF_NOTARY_PROFILE || (process.env.APPLE_API_KEY && process.env.APPLE_API_ISSUER);
      record(Boolean(notary), 'notarization credentials configured', requireSigning ? 'block' : 'warn');
    }
  }
  if (p === 'windows') {
    record(exists('src-tauri/tauri.windows.conf.json'), 'Windows platform config is present');
    const required = [
      'src-tauri/native/spout2/SPOUTSDK/licence.txt',
      'src-tauri/native/spout2/SPOUTSDK/SpoutGL/SpoutCopy.cpp',
      'src-tauri/native/spout2/SPOUTSDK/SpoutGL/SpoutDirectX.cpp',
      'src-tauri/native/spout2/SPOUTSDK/SpoutGL/SpoutFrameCount.cpp',
      'src-tauri/native/spout2/SPOUTSDK/SpoutGL/SpoutSenderNames.cpp',
      'src-tauri/native/spout2/SPOUTSDK/SpoutGL/SpoutSharedMemory.cpp',
      'src-tauri/native/spout2/SPOUTSDK/SpoutGL/SpoutUtils.cpp',
      'src-tauri/native/spout2/SPOUTSDK/SpoutDirectX/SpoutDX/SpoutDX.cpp',
      'src-tauri/native/spout_bridge/CMakeLists.txt',
    ];
    for (const rel of required) record(exists(rel), `Spout package asset present: ${rel}`);
    if (!staticOnly && host === 'windows') {
      for (const cmd of ['cargo', 'rustup', 'cmake']) record(commandExists(cmd), `Windows build tool available: ${cmd}`);
      record(Boolean(process.env.HUFF_WINDOWS_CERT_THUMBPRINT), 'Windows signing thumbprint configured', requireSigning ? 'block' : 'warn');
    }
  }
  if (p === 'linux') {
    record(exists('src-tauri/tauri.linux.conf.json'), 'Linux platform config is present');
    if (!staticOnly && host === 'linux') {
      for (const cmd of ['cargo', 'rustup', 'cmake', 'pkg-config']) record(commandExists(cmd), `Linux build tool available: ${cmd}`);
      const pc = name => spawnSync('pkg-config', ['--exists', name], { stdio: 'ignore' }).status === 0;
      if (commandExists('pkg-config')) {
        for (const dep of ['webkit2gtk-4.0', 'gtk+-3.0', 'alsa']) record(pc(dep), `Linux pkg-config dependency available: ${dep}`);
      }
    }
  }
}

record(commandExists('node'), `Node available: ${toolVersion('node') || 'unknown'}`);
record(commandExists('npm'), `npm available: ${toolVersion('npm') || 'unknown'}`);
record(pkg.devDependencies?.['@tauri-apps/cli'] === '^1.6.3', 'Tauri v1 CLI remains pinned to ^1.6.3');

for (const line of pass) console.log(`PASS  ${line}`);
for (const line of warn) console.log(`WARN  ${line}`);
for (const line of block) console.error(`BLOCK ${line}`);
console.log(`\nRelease preflight: ${pass.length} passed, ${warn.length} warnings, ${block.length} blockers.`);
if (block.length) process.exit(1);
