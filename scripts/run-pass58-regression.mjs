import { spawnSync } from 'node:child_process';

const commands = [
  ['node', ['--check', 'src/canvas.js']],
  ['node', ['--check', 'src/effects.js']],
  ['node', ['--check', 'src/pipeline-runtime.js']],
  ['node', ['--check', 'src/syphon-stream-worker.js']],
  ['node', ['--check', 'scripts/validate-pass58.mjs']],
  ['node', ['--check', 'scripts/run-pass58-regression.mjs']],
  ['npm', ['run', 'simulate:pass51']],
  ['npm', ['run', 'simulate:pass40w']],
  ['npm', ['run', 'simulate:pass41a']],
  ['npm', ['run', 'validate:pass58']],
  ['npm', ['run', 'release:preflight']],
];

for (const [bin, args] of commands) {
  console.log(`\n===== ${bin} ${args.join(' ')} =====`);
  const r = spawnSync(bin, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('\nHUFF Classic Pass 58 constrained pipeline regression PASS');
console.log('Target-machine visual comparison of all seven recipes remains the creative acceptance gate.');
