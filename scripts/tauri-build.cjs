#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requested = process.argv[2] || 'auto';
const host = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : 'unknown';

function run(command, args, options = {}) {
  console.log('→', command, ...args);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (requested === 'preflight') {
  run(process.execPath, ['scripts/release-preflight.mjs', '--platform=all', '--static']);
  process.exit(0);
}

const desired = requested === 'auto' ? host : requested;
if (desired !== host && !(host === 'macos' && ['mac-universal', 'mac-arm', 'mac-x86'].includes(desired))) {
  console.error(`Release packaging is native-only. Host=${host}, requested=${desired}.`);
  process.exit(1);
}

if (process.platform !== 'win32') {
  run('bash', ['build.sh', desired === 'macos' ? 'mac-universal' : desired]);
  process.exit(0);
}

if (desired !== 'windows') {
  console.error(`Unsupported Windows target: ${desired}`);
  process.exit(1);
}

run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-windows.ps1']);
