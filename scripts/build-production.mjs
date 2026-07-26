import { spawnSync } from 'node:child_process';
import process from 'node:process';

const requested = process.argv[2] || (process.platform === 'darwin' ? 'metal' : process.platform === 'win32' ? 'dx12' : 'vulkan');
const allowed = new Set(['metal', 'dx12', 'vulkan', 'gl']);
if (!allowed.has(requested)) {
  console.error(`Unsupported production backend: ${requested}`);
  process.exit(2);
}
if (process.platform === 'darwin' && requested !== 'metal') {
  console.warn(`Warning: ${requested} is a research backend on macOS; Metal is the production target.`);
}
if (process.platform === 'win32' && requested !== 'dx12') {
  console.warn(`Warning: ${requested} is not the Windows production target; DX12 is required for the validated Spout path.`);
}

const node = process.execPath;
let result = spawnSync(node, ['scripts/validate-production.mjs', '--strict'], {
  stdio: 'inherit',
  env: process.env,
});
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
result = spawnSync(executable, ['tauri', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, WGPU_BACKEND: requested },
});
process.exit(result.status ?? 1);
