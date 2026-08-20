import { spawnSync } from 'node:child_process';

const commands = [
  ['node', ['--check', 'src/canvas.js']],
  ['node', ['--check', 'src/effects.js']],
  ['node', ['--check', 'src/pipeline-runtime.js']],
  ['node', ['--check', 'src/syphon-stream-worker.js']],
  ['node', ['--check', 'scripts/validate-pass57.mjs']],
  ['npm', ['run', 'validate:pass56']],
  ['npm', ['run', 'validate:pass55']],
  ['npm', ['run', 'validate:pass52d']],
  ['npm', ['run', 'simulate:pass51']],
  ['npm', ['run', 'simulate:pass40w']],
  ['npm', ['run', 'simulate:pass41a']],
  ['npm', ['run', 'validate:pass57']],
  ['npm', ['run', 'release:preflight']],
];

for (const [bin, args] of commands) {
  console.log(`\n===== ${bin} ${args.join(' ')} =====`);
  const r = spawnSync(bin, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('\nHUFF Classic Pass 57 automated release-candidate regression PASS');
console.log('Target-machine visual, native-dialog, output endurance, and cross-platform checks remain manual release gates.');
