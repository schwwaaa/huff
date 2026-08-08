import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const assert = (c, m) => { if (!c) throw new Error(m); };
let checks = 0;
const ok = (c, m) => { assert(c, m); checks++; };

const effects = read('src/effects.js');
const canvas = read('src/canvas.js');
const html = read('src/index.html');

// Pass 34 UI and accepted key features remain present.
ok(html.includes('<option value="clean">LIVE</option>'), 'LIVE key source missing');
ok(html.includes('<option value="stencil">STENCIL</option>'), 'STENCIL key source missing');
ok(html.includes('id="lumaKeyCleanup"'), 'Cleanup missing');
ok(html.includes('id="lumaKeyDensity"'), 'Density missing');
ok(html.includes('SOFT ADD'), 'SOFT ADD missing');
ok(!html.includes('<option value="glitch">GLITCH</option>'), 'Rejected GLITCH key returned');

// Responsiveness architecture: bounded reusable CUT + current FILL.
ok(effects.includes('let _plkMaskCanvas = null, _plkMaskCtx = null;'), 'Bounded key-cut canvas missing');
ok(effects.includes('_plkMaskImageData = _plkMaskCtx.createImageData(sw, sh);'), 'Reusable stencil mask ImageData missing');
ok(effects.includes("_plkCtx.globalCompositeOperation = 'destination-in'"), 'Live fill is not clipped by reusable CUT');
ok(effects.includes('_plkCtx.drawImage(_plkMaskCanvas, 0, 0, sw, sh);'), 'Reusable CUT is not applied to live fill');
ok(effects.includes('const keyFrameChanged =\n    safeKeySource === \'clean\''), 'STENCIL path still depends on advancing source frames');
ok(effects.includes('maskData = _plkMaskImageData;'), 'STENCIL does not use preallocated mask pixels');

const applyStart = effects.indexOf('function applyPipelineLumaKey(');
const apply = effects.slice(applyStart);
const stencilBranch = apply.slice(apply.indexOf("if (safeKeySource === 'stencil')"), apply.indexOf('} else {', apply.indexOf("if (safeKeySource === 'stencil')")));
ok(!stencilBranch.includes('getImageData'), 'STENCIL rebuild performs a synchronous readback');

// Strobe compatibility: key CUT analysis is capped, fill remains render-rate.
ok(canvas.includes('const _lumaAnalysisGate = Object.seal({'), 'Luma analysis gate missing');
ok(canvas.includes("if (!state?.corruptOn || !state?.glitchStrobe) return _vfc;"), 'Normal Luma cadence no longer preserves decoded-frame serial');
ok(canvas.includes('Math.floor(performance.now() / (1000 / 15))'), 'Glitch-Strobe Luma analysis is not capped to ~15 Hz');
ok(canvas.includes('_lumaAnalysisSerial(state)'), 'Luma dispatcher does not use analysis serial');
ok(canvas.includes("_resetLumaAnalysisGate('source-retired')"), 'Source reset does not reset Luma analysis gate');
ok(canvas.includes("_resetLumaAnalysisGate('resize')"), 'Resize does not reset Luma analysis gate');
ok(canvas.includes("_resetLumaAnalysisGate('clear')"), 'Clear does not reset Luma analysis gate');

// Stencil feedback must be explicit rather than dim static text.
ok(canvas.includes("label = w && h ? `READY ${w}×${h}` : 'READY';"), 'READY state lacks captured dimensions');
ok(canvas.includes("label = 'CAPTURE FIRST';"), 'STENCIL empty state is unclear');
ok(canvas.includes("label = 'NO SOURCE';"), 'Capture failure state is unclear');
ok(canvas.includes("color = '#a7ffb5';"), 'READY state does not visibly light');
ok(canvas.includes("style.color = isReady ? 'var(--term-green)' : ''"), 'CAPTURE button does not visibly indicate stored stencil');

// Preserve every Pass 34 src file except the two intended runtime files.
const manifest = read('baseline/pass34-src.sha256').trim().split('\n').filter(Boolean);
for (const line of manifest) {
  const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  assert(m, `Malformed Pass 34 src manifest line: ${line}`);
  const [, expected, rel] = m;
  if (rel === 'src/canvas.js' || rel === 'src/effects.js') continue;
  const abs = path.join(root, rel);
  ok(fs.existsSync(abs), `Missing Pass 34 source file ${rel}`);
  ok(sha(fs.readFileSync(abs)) === expected, `Unexpected source change: ${rel}`);
}

// Native tree remains byte-identical to Pass 34.
const nativeManifest = read('baseline/pass34-src-tauri.sha256').trim().split('\n').filter(Boolean);
for (const line of nativeManifest) {
  const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
  assert(m, `Malformed native manifest line: ${line}`);
  const [, expected, rel] = m;
  const abs = path.join(root, 'src-tauri', rel);
  ok(fs.existsSync(abs), `Missing native file ${rel}`);
  ok(sha(fs.readFileSync(abs)) === expected, `Native file changed: ${rel}`);
}

console.log(`Pass 35 validation passed: ${checks.toLocaleString()} checks.`);
