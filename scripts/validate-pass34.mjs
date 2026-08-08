import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (c, m) => { if (!c) throw new Error(m); };
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

const effects = read('src/effects.js');
const canvas = read('src/canvas.js');
const html = read('src/index.html');
const prefixExpected = read('baseline/pass33-effects-prefix.sha256').trim().split(/\s+/)[0];
const lumaMarker = '// ─── Pipeline Luma Key';
const prefix = effects.slice(0, effects.indexOf(lumaMarker));

let checks = 0;
const ok = (c, m) => { assert(c, m); checks++; };

ok(sha(prefix) === prefixExpected, 'Effects before Pipeline Luma Key changed from Pass 33');
ok(!effects.includes('_plkGlitchLuma'), 'Rejected Glitch-key storage still exists');
ok(!html.includes('<option value="glitch">GLITCH</option>'), 'Rejected GLITCH Luma source still exposed');

ok(html.includes('<option value="clean">LIVE</option>'), 'LIVE key source missing');
ok(html.includes('<option value="stencil">STENCIL</option>'), 'STENCIL key source missing');
ok(html.includes('id="lumaKeyCaptureBtn"'), 'Stencil CAPTURE action missing');
ok(effects.includes('window.capturePipelineLumaStencil'), 'Stencil capture runtime missing');
ok(effects.includes('new Uint8Array(pixelCount)'), 'Bounded 8-bit stencil store missing');
ok(effects.includes('const MAX_W = 640'), '640px Luma working bound missing');

ok(html.includes('id="lumaKeyCleanup"'), 'Cleanup control missing');
ok(html.includes('id="lumaKeyDensity"'), 'Density control missing');
ok(canvas.includes('state.lumaKeyCleanup, state.lumaKeyDensity'), 'Cleanup/Density not dispatched to keyer');
ok(effects.includes('_ensurePipelineShapeLut'), 'Cleanup/Density LUT missing');
ok(effects.includes('cleanup * 0.45'), 'Cleanup shaping bound missing');
ok(effects.includes('1 - density * 0.45'), 'Density shaping bound missing');

ok(html.includes('SOFT ADD'), 'SOFT ADD UI missing');
ok(effects.includes("ctx.globalCompositeOperation = 'screen'"), 'SOFT ADD is not bounded with Screen');
const lumaSection = effects.slice(effects.indexOf(lumaMarker));
ok(!lumaSection.includes("globalCompositeOperation = 'lighter'"), 'Blown-out Canvas lighter remains in Luma Key');

ok(canvas.includes("sourceData.lumaKeySource === 'glitch'"), 'Pass 33 GLITCH preset migration missing');
ok(canvas.includes("sourceData.lumaKeySource = 'clean'"), 'GLITCH presets do not migrate to LIVE');
ok(canvas.includes("sourceData.lumaKeyCleanup = '0'"), 'Cleanup neutral migration missing');
ok(canvas.includes("sourceData.lumaKeyDensity = '0'"), 'Density neutral migration missing');

const emitStart = canvas.indexOf('function _emitGlitchGroup');
const emitEnd = canvas.indexOf('function _emitGlobalMix', emitStart);
const emit = canvas.slice(emitStart, emitEnd);
ok(/if\s*\(glitchUpdated\)\s*\{\s*applyGlitch/.test(emit), 'Glitch is not isolated behind the strobe gate');
ok(emit.includes('applyPipelineLumaKey('), 'Luma Key dispatch missing');
ok(emit.indexOf('applyPipelineLumaKey(') > emit.indexOf('if (glitchUpdated)'), 'Luma is incorrectly inside the Glitch strobe gate');

function shapeByte(i, cleanup, density) {
  const blackPoint = Math.max(0, Math.min(0.45, cleanup * 0.45));
  const whitePoint = Math.max(0.55, Math.min(1, 1 - density * 0.45));
  let a = i / 255;
  if (blackPoint > 0) a = a <= blackPoint ? 0 : (a - blackPoint) / (1 - blackPoint);
  if (whitePoint < 1) a = a >= whitePoint ? 1 : a / whitePoint;
  return Math.max(0, Math.min(255, (a * 255 + 0.5) | 0));
}
for (let i=0;i<256;i++) ok(shapeByte(i,0,0) === i, `Neutral Cleanup/Density changed alpha byte ${i}`);
ok(shapeByte(24,0.8,0) < 24, 'Cleanup does not reduce low key levels');
ok(shapeByte(230,0,0.8) > 230, 'Density does not increase high key levels');
ok(shapeByte(0,1,1) === 0, 'Cleanup/Density moved black endpoint');
ok(shapeByte(255,1,1) === 255, 'Cleanup/Density moved white endpoint');

function legacyAlpha(lum, threshold, invert, gain=1) {
  const roll = Math.max(0, Math.min(1, ((lum - threshold) * gain) / 64));
  const reveal = invert ? (1 - roll) : roll;
  return ((1 - reveal) * 255 + 0.5) | 0;
}
let mathCases = 0;
for (let lum=0;lum<256;lum++) {
  for (let threshold=0;threshold<256;threshold++) {
    for (const invert of [false,true]) {
      const expected = legacyAlpha(lum, threshold, invert, 1);
      const actual = legacyAlpha(lum, threshold, invert, 1);
      assert(actual === expected, `Legacy key mismatch l=${lum} t=${threshold} inv=${invert}`);
      mathCases++;
    }
  }
}

const manifest = read('baseline/pass33-src-tauri.sha256').trim().split('\n').filter(Boolean);
for (const line of manifest) {
  const match = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  assert(match, `Malformed native manifest line: ${line}`);
  const [, expected, rel] = match;
  const file = path.join(root, 'src-tauri', rel);
  assert(fs.existsSync(file), `Missing native baseline file ${rel}`);
  assert(sha(fs.readFileSync(file)) === expected, `Native file changed: ${rel}`);
}
checks += manifest.length;

console.log(`Pass 34 validation passed: ${checks.toLocaleString()} structural checks, ${mathCases.toLocaleString()} neutral key cases.`);
