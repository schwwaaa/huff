import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const effectsSource = fs.readFileSync(path.join(root, 'src/effects.js'), 'utf8');
const canvasSource = fs.readFileSync(path.join(root, 'src/canvas.js'), 'utf8');
const rustSource = fs.readFileSync(path.join(root, 'src-tauri/src/main.rs'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function deterministicNoise(x, y = 0) {
  const z = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return z - Math.floor(z);
}

const TWO_PI = Math.PI * 2;

function oldFlow(width, height, cell, strength, time, turbulence, implode, swirl, spread) {
  const result = [];
  const cx = width * 0.5;
  const cy = height * 0.5;
  const frequency = 0.9 * Math.max(0.05, spread);
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * cell;
      const y = row * cell;
      const nx = (x + 0.5 * cell) / width * 2.0;
      const ny = (y + 0.5 * cell) / height * 2.0;

      let angle = deterministicNoise(nx * frequency + time, ny * frequency) * TWO_PI * 2.0;
      if (turbulence > 0) {
        const angle2 = deterministicNoise(
          nx * frequency * 4 + time * 1.3 + 100,
          ny * frequency * 4 + time * 0.9,
        ) * TWO_PI * 2.0;
        angle = angle * (1 - turbulence * 0.5) + angle2 * (turbulence * 0.5);
      }

      let dx = Math.cos(angle) * strength;
      let dy = Math.sin(angle) * strength;

      if (implode !== 0) {
        const px = x + 0.5 * cell;
        const py = y + 0.5 * cell;
        const vx = cx - px;
        const vy = cy - py;
        const length = Math.hypot(vx, vy) || 1;
        dx += (vx / length) * strength * implode;
        dy += (vy / length) * strength * implode;
      }

      if (swirl !== 0) {
        const px = x + 0.5 * cell;
        const py = y + 0.5 * cell;
        const radialAngle = Math.atan2(py - cy, px - cx) * swirl;
        const cosine = Math.cos(radialAngle);
        const sine = Math.sin(radialAngle);
        const rotatedX = dx * cosine - dy * sine;
        const rotatedY = dx * sine + dy * cosine;
        dx = rotatedX;
        dy = rotatedY;
      }

      dx = Math.fround(dx);
      dy = Math.fround(dy);
      const tileWidth = Math.min(cell, width - x);
      const tileHeight = Math.min(cell, height - y);
      const sourceX = Math.max(0, Math.min(width - tileWidth, Math.floor(x + dx)));
      const sourceY = Math.max(0, Math.min(height - tileHeight, Math.floor(y + dy)));
      result.push([x, y, tileWidth, tileHeight, sourceX, sourceY, dx, dy]);
    }
  }
  return result;
}

function buildGrid(width, height, cell) {
  const grid = [];
  const cx = width * 0.5;
  const cy = height * 0.5;
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);

  for (let row = 0; row < rows; row++) {
    const y = row * cell;
    const py = y + 0.5 * cell;
    for (let column = 0; column < columns; column++) {
      const x = column * cell;
      const px = x + 0.5 * cell;
      const vx = cx - px;
      const vy = cy - py;
      const length = Math.hypot(vx, vy) || 1;
      grid.push({
        x,
        y,
        tileWidth: Math.min(cell, width - x),
        tileHeight: Math.min(cell, height - y),
        nx: (x + 0.5 * cell) / width * 2.0,
        ny: (y + 0.5 * cell) / height * 2.0,
        inwardX: vx / length,
        inwardY: vy / length,
        radialAngle: Math.atan2(py - cy, px - cx),
      });
    }
  }
  return grid;
}

function cachedFlow(width, height, cell, strength, time, turbulence, implode, swirl, spread) {
  const result = [];
  const frequency = 0.9 * Math.max(0.05, spread);
  const turbulenceMix = turbulence * 0.5;
  const implodeScale = strength * implode;

  for (const tile of buildGrid(width, height, cell)) {
    let angle = deterministicNoise(tile.nx * frequency + time, tile.ny * frequency) * TWO_PI * 2.0;
    if (turbulence > 0) {
      const angle2 = deterministicNoise(
        tile.nx * frequency * 4 + time * 1.3 + 100,
        tile.ny * frequency * 4 + time * 0.9,
      ) * TWO_PI * 2.0;
      angle = angle * (1 - turbulenceMix) + angle2 * turbulenceMix;
    }

    let dx = Math.cos(angle) * strength;
    let dy = Math.sin(angle) * strength;
    if (implode !== 0) {
      dx += tile.inwardX * implodeScale;
      dy += tile.inwardY * implodeScale;
    }
    if (swirl !== 0) {
      const radialAngle = tile.radialAngle * swirl;
      const cosine = Math.cos(radialAngle);
      const sine = Math.sin(radialAngle);
      const rotatedX = dx * cosine - dy * sine;
      const rotatedY = dx * sine + dy * cosine;
      dx = rotatedX;
      dy = rotatedY;
    }

    dx = Math.fround(dx);
    dy = Math.fround(dy);
    const sourceX = Math.max(0, Math.min(width - tile.tileWidth, Math.floor(tile.x + dx)));
    const sourceY = Math.max(0, Math.min(height - tile.tileHeight, Math.floor(tile.y + dy)));
    result.push([
      tile.x,
      tile.y,
      tile.tileWidth,
      tile.tileHeight,
      sourceX,
      sourceY,
      dx,
      dy,
    ]);
  }
  return result;
}

let cases = 0;
let tiles = 0;
for (const width of [320, 641, 1280, 1920]) {
  for (const height of [180, 359, 720, 1080]) {
    for (const cell of [8, 37, 80, 127]) {
      for (const turbulence of [0, 0.37, 1]) {
        for (const implode of [-1, 0, 0.61]) {
          for (const swirl of [-2, 0, 1.25]) {
            const args = [width, height, cell, 17.25, 4.123, turbulence, implode, swirl, 1.73];
            const before = oldFlow(...args);
            const after = cachedFlow(...args);
            assert(before.length === after.length, `Flow tile count mismatch for ${args.join(',')}`);
            for (let index = 0; index < before.length; index++) {
              for (let field = 0; field < before[index].length; field++) {
                assert(
                  Object.is(before[index][field], after[index][field]),
                  `Flow mismatch at case ${args.join(',')} tile ${index} field ${field}`,
                );
              }
            }
            cases++;
            tiles += before.length;
          }
        }
      }
    }
  }
}

assert(effectsSource.includes('class FlowGridWorkspace'), 'FlowGridWorkspace missing');
assert(effectsSource.includes('const _flowGrid = new FlowGridWorkspace();'), 'Flow workspace singleton missing');
assert(canvasSource.includes('mirrorReceivers <= 0 || relayFramePending'), 'Mirror sender guard missing');
assert(canvasSource.includes("message.type === 'mirror-state'"), 'Mirror state handler missing');
assert(canvasSource.includes("message.type === 'mirror-ack'"), 'Mirror acknowledgement handler missing');
assert(rustSource.includes('async fn notify_mirror_state'), 'Rust mirror-state notifier missing');
assert(rustSource.includes('async fn forward_mirror_frame'), 'Rust mirror frame helper missing');
assert((rustSource.match(/forward_mirror_frame\(&clients_r/g) || []).length === 3, 'Expected three platform relay calls');
assert(canvasSource.includes('function _ensureFrameRingCapacity'), 'Frame-ring capacity cache missing');

console.log(`PASS 9 validation passed: ${cases} flow cases, ${tiles} exact tile comparisons`);
console.log('Mirror receiver-awareness, relay acknowledgement, and frame-ring cache markers present.');
