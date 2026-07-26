import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const failures = [];
const passes = [];
const requireToken = (file, token) => {
  const content = read(file);
  if (content.includes(token)) passes.push(`${file}: ${token}`);
  else failures.push(`${file}: missing ${token}`);
};

for (const file of [
  'src-tauri/src/interop.rs',
  'INTEROP-RESEARCH.md',
  'UPGRADE-NOTES-21.md',
  'MILESTONES.md',
]) {
  if (exists(file)) passes.push(`${file} present`);
  else failures.push(`${file} missing`);
}

for (const [file, token] of [
  ['src-tauri/src/interop.rs', 'huff-interop-report/v1'],
  ['src-tauri/src/interop.rs', 'metal-direct-syphon'],
  ['src-tauri/src/interop.rs', 'd3d12-shared-handle-spout'],
  ['src-tauri/src/interop.rs', 'd3d11on12-spout'],
  ['src-tauri/src/interop.rs', 'vulkan-external-memory'],
  ['src-tauri/src/interop.rs', 'bounded host-memory memcpy probe only'],
  ['src-tauri/src/output_frame.rs', 'enum ExternalOutputFrame'],
  ['src-tauri/src/output_frame.rs', 'cpu-readback-upload'],
  ['src-tauri/src/renderer.rs', 'ExternalOutputFrame::cpu_rgba'],
  ['src-tauri/src/syphon.rs', 'submit(frame: ExternalOutputFrame)'],
  ['src-tauri/src/spout.rs', 'submit(frame: ExternalOutputFrame)'],
  ['src-tauri/src/main.rs', 'run_interop_analysis'],
  ['src-tauri/src/main.rs', 'run_interop_copy_probe'],
  ['src-tauri/src/main.rs', 'export_interop_report'],
  ['src/app.js', "call('run_interop_analysis')"],
  ['src/app.js', "call('run_interop_copy_probe')"],
  ['src/index.html', 'id="interopOverlay"'],
  ['src/index.html', 'id="interopBtn"'],
  ['src/app.js', "['Native sharing', 'Research only · disabled']"],
]) requireToken(file, token);

const interop = read('src-tauri/src/interop.rs');
if (interop.includes('native_texture_sharing: true') || interop.includes('zero-copy enabled')) {
  failures.push('Interop research must not claim that native texture sharing is enabled');
} else {
  passes.push('No unsafe native-sharing enablement claim');
}

const packageJson = JSON.parse(read('package.json'));
if (packageJson.version === '0.21.0') passes.push('package version 0.21.0');
else failures.push(`package version ${packageJson.version}; expected 0.21.0`);

console.log('HUFF HNW-21 interoperability validation');
for (const line of passes) console.log(`PASS  ${line}`);
for (const line of failures) console.log(`FAIL  ${line}`);
console.log(`\nSummary: ${passes.length} pass · ${failures.length} fail`);
if (failures.length) process.exit(1);
