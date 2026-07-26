import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('..', import.meta.url));
const strict = process.argv.includes('--strict');
const failures = [];
const warnings = [];
const passes = [];

function pass(message) { passes.push(message); }
function warn(message) { warnings.push(message); }
function fail(message) { failures.push(message); }
function text(path) { return readFileSync(join(root, path), 'utf8'); }
function json(path) { return JSON.parse(text(path)); }

function command(program, args = []) {
  try {
    return execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}

const expectedVersion = '0.20.0';
const expectedBuild = 'HNW-20';
const packageJson = json('package.json');
const packageLock = json('package-lock.json');
const tauriConfig = json('src-tauri/tauri.conf.json');
const cargoToml = text('src-tauri/Cargo.toml');
const cargoLock = text('src-tauri/Cargo.lock');

for (const [label, value] of [
  ['package.json', packageJson.version],
  ['package-lock.json root', packageLock.version],
  ['package-lock.json package', packageLock.packages?.['']?.version],
  ['tauri.conf.json', tauriConfig.version],
]) {
  value === expectedVersion ? pass(`${label} = ${expectedVersion}`) : fail(`${label} is ${value}, expected ${expectedVersion}`);
}

cargoToml.includes(`version = "${expectedVersion}"`)
  ? pass(`Cargo.toml = ${expectedVersion}`)
  : fail(`Cargo.toml does not identify ${expectedVersion}`);
cargoLock.includes(`name = "huff_native_wgpu_engine"\nversion = "${expectedVersion}"`)
  ? pass(`Cargo.lock root package = ${expectedVersion}`)
  : fail(`Cargo.lock root package does not identify ${expectedVersion}`);

for (const path of [
  'src-tauri/src/production.rs',
  'PRODUCTION-VERIFICATION.md',
  'UPGRADE-NOTES-20.md',
  'MILESTONES.md',
  'TESTING.md',
]) {
  existsSync(join(root, path)) ? pass(`${path} present`) : fail(`${path} missing`);
}

const main = text('src-tauri/src/main.rs');
const app = text('src/app.js');
const html = text('src/index.html');
for (const commandName of ['run_production_check', 'recover_live_runtime', 'export_diagnostics_bundle']) {
  main.includes(commandName) && app.includes(commandName)
    ? pass(`${commandName} wired native ↔ frontend`)
    : fail(`${commandName} is not wired across native and frontend`);
}
main.includes(expectedBuild) && app.includes('Milestone 20') && html.includes('milestone 20')
  ? pass(`${expectedBuild} runtime and interface markers present`)
  : fail(`${expectedBuild} runtime/interface markers incomplete`);

const requiredAssets = [
  'src-tauri/frameworks/Syphon.framework/Syphon',
  'src-tauri/native/spout_bridge/CMakeLists.txt',
  'src-tauri/native/spout_bridge/spout_bridge.cpp',
  'src-tauri/native/spout2/SPOUTSDK/SpoutDirectX/SpoutDX/SpoutDX.cpp',
];
for (const path of requiredAssets) {
  existsSync(join(root, path)) ? pass(`${path} present`) : fail(`${path} missing`);
}

try {
  const probe = join(root, `.huff-write-test-${process.pid}`);
  writeFileSync(probe, 'huff');
  unlinkSync(probe);
  pass('Repository directory is writable');
} catch (error) {
  fail(`Repository write test failed: ${error.message}`);
}

const nodeVersion = process.versions.node;
Number(nodeVersion.split('.')[0]) >= 20 ? pass(`Node ${nodeVersion}`) : warn(`Node ${nodeVersion}; Node 20+ recommended`);

const cargoVersion = command('cargo', ['--version']).trim();
const rustcVersion = command('rustc', ['--version']).trim();
if (cargoVersion && rustcVersion) {
  pass(cargoVersion);
  pass(rustcVersion);
} else {
  (strict ? fail : warn)('Rust toolchain unavailable; native compile verification skipped');
}

const ffmpegVersion = command('ffmpeg', ['-version']).split(/\r?\n/)[0]?.trim();
const ffprobeVersion = command('ffprobe', ['-version']).split(/\r?\n/)[0]?.trim();
if (ffmpegVersion) pass(ffmpegVersion); else (strict ? fail : warn)('ffmpeg unavailable');
if (ffprobeVersion) pass(ffprobeVersion); else (strict ? fail : warn)('ffprobe unavailable');

if (ffmpegVersion) {
  const encoders = command('ffmpeg', ['-hide_banner', '-encoders']);
  const required = ['libx264', 'prores_ks', 'ffv1', 'png', 'aac', 'pcm_s24le', 'flac'];
  const missing = required.filter((name) => !encoders.includes(name));
  missing.length === 0
    ? pass(`Production encoders found: ${required.join(', ')}`)
    : (strict ? fail : warn)(`Missing/unreported FFmpeg encoders: ${missing.join(', ')}`);
}

const expectedBackend = process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'dx12' : 'vulkan';
pass(`Platform ${process.platform}/${process.arch}; expected production backend ${expectedBackend}`);
if (process.platform === 'darwin' && !existsSync(join(root, 'src-tauri/frameworks/Syphon.framework/Syphon'))) {
  fail('macOS build requires the bundled Syphon framework');
}
if (process.platform === 'win32' && !existsSync(join(root, 'src-tauri/native/spout2'))) {
  fail('Windows build requires the bundled Spout SDK');
}

console.log(`HUFF ${expectedBuild} production validation`);
for (const message of passes) console.log(`PASS  ${message}`);
for (const message of warnings) console.log(`WARN  ${message}`);
for (const message of failures) console.log(`FAIL  ${message}`);
console.log(`\nSummary: ${passes.length} pass · ${warnings.length} warning · ${failures.length} fail${strict ? ' · strict' : ''}`);

if (failures.length > 0) process.exit(1);
