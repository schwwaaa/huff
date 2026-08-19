import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canvasPath = path.join(root, 'src', 'canvas.js');
const effectsPath = path.join(root, 'src', 'effects.js');
const canvas = fs.readFileSync(canvasPath, 'utf8');
const effects = fs.readFileSync(effectsPath, 'utf8');
let checks = 0;
function ok(cond, msg) { if (!cond) throw new Error(`FAIL: ${msg}`); checks++; }

ok(canvas.includes('function _solarizeShouldReadCleanLiveSource(activity)'), 'solo Solarize source ownership helper exists');
ok(canvas.includes('const directLiveSource = _solarizeShouldReadCleanLiveSource(activity)'), 'Solarize dispatcher resolves direct live source');
ok(canvas.includes('? _graphicsCanvas(gCur)'), 'solo Solarize reads gCur');
ok(canvas.includes('directLiveSource);'), 'direct live source reaches applySolarize');
ok(effects.includes('sourceOverride = null'), 'applySolarize accepts optional source override');
ok(effects.includes('const srcCanvas = sourceOverride || buf.elt || buf.drawingContext.canvas;'), 'source override precedes persistent gBuf source');
ok(effects.includes("_solProfileAdd('directLiveSourceFrames')"), 'direct-live profiler telemetry exists');
ok(canvas.includes("'sol live   '"), 'profiler exposes solo-live frame counter');

const match = canvas.match(/function _solarizeShouldReadCleanLiveSource\(activity\) \{[\s\S]*?\n\}/);
ok(match, 'source ownership helper can be extracted');
const context = {};
vm.createContext(context);
vm.runInContext(`${match[0]}; this.fn = _solarizeShouldReadCleanLiveSource;`, context);
const fn = context.fn;
const base = { solarize:true, glitch:false, scanlines:false, luma:false, globalMix:false, feedback:false, flow:false, symmetry:false };
ok(fn(base) === true, 'Solarize-only uses clean live source');
ok(fn({...base, solarize:false}) === false, 'disabled Solarize does not use clean live source');
for (const key of ['glitch','scanlines','luma','globalMix','feedback','flow','symmetry']) {
  ok(fn({...base, [key]:true}) === false, `Solarize + ${key} preserves gBuf ownership`);
}

// The correction must not alter the accepted Pass 52 posterizer algorithms or
// the Pass 51 Syphon transport. These signature checks make accidental edits
// obvious while allowing this hotfix to remain narrowly scoped.
ok(effects.includes('function _runClassicGpuChromaPosterize'), 'Pass 52 GPU posterizer retained');
ok(effects.includes('function _posterizeChromaPixelsBytes'), 'Pass 52 CPU posterizer retained');
ok(canvas.includes("mode === 'chroma-posterize'"), 'Pass 52 posterize activity detection retained');

const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
ok(html.includes('720p60') || html.includes('1280') || html.includes('Syphon'), 'Pass 51 Syphon UI remains present');
const syphonWorker = fs.readFileSync(path.join(root, 'src', 'syphon-stream-worker.js'), 'utf8');
ok(syphonWorker.includes('credit') || syphonWorker.includes('inFlight') || syphonWorker.includes('MAX_'), 'Pass 51 bounded Syphon worker transport retained');

console.log(`HUFF Classic Pass 52A validation: ${checks.toLocaleString()} checks PASS`);
