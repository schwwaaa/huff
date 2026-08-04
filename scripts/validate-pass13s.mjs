import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canvasPath = path.join(root, 'src', 'canvas.js');
const source = fs.readFileSync(canvasPath, 'utf8');

const checks = [];
function check(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
  if (!condition) throw new Error(`Pass 13S validation failed: ${name}`);
}

check('working Blob URL source path retained', source.includes('URL.createObjectURL(file)'));
check('p5 createVideo decoder retained', source.includes('createVideo([currentBlobUrl]'));
check('asset protocol absent', !source.includes('convertFileSrc('));
check('source generation exists', source.includes('let _sourceGeneration = 0;'));
check('owned readiness poller exists', source.includes('let _sourceReadyPoller = 0;'));
check('owned gesture unlock exists', source.includes('let _sourceGestureUnlock = null;'));
check('file callbacks check current source', source.includes('const sourceIsCurrent = () => _sourceIsCurrent(generation, v);'));
check('late play resolution guarded', source.includes('if (!sourceIsCurrent()) return;'));
check('seeked callback guarded', /addEventListener\('seeked',[\s\S]{0,180}if \(!sourceIsCurrent\(\)\) return;/.test(source));
check('error callback guarded', /addEventListener\('error',[\s\S]{0,180}if \(!sourceIsCurrent\(\)\) return;/.test(source));
check('stale camera stream rejected', source.includes('generation !== _sourceGeneration || videoEl !== capture'));
check('stale camera tracks stopped', source.includes("v?.srcObject?.getTracks().forEach(track => track.stop())"));
check('shutdown is idempotent', source.includes('if (_sourceShutdownComplete) return;'));
check('pagehide media cleanup installed', source.includes("window.addEventListener('pagehide', _shutdownMediaLifecycle"));
check('beforeunload media cleanup installed', source.includes("window.addEventListener('beforeunload', _shutdownMediaLifecycle"));
check('mirror shutdown prevents reconnect', source.includes('if (mirrorShutdown) return;'));
check('mirror pagehide cleanup installed', source.includes("window.addEventListener('pagehide', shutdownMirror"));

// Rejected Pass 13 behavior must remain absent.
check('no render-boundary scheduler hook', !source.includes('_afterRenderFrame'));
check('no consolidated transport callback', !source.includes('_transportFrameTick'));
check('no aggressive source attribute clearing', !source.includes("removeAttribute('src')"));
check('no decoder reset helper during retirement', !source.includes('media.load?.()'));

// The stable Pass 12R independent clocks must remain present.
check('independent transport rAF retained', source.includes('requestAnimationFrame(_tickTransport)'));
check('independent mirror rAF retained', source.includes('requestAnimationFrame(function pump(ts)'));
check('independent profiler rAF retained', source.includes('requestAnimationFrame(loop)'));

const drawStart = source.indexOf('function draw()');
const drawEnd = source.indexOf('\n// ─── camera', drawStart);
const drawRegion = drawStart >= 0 ? source.slice(drawStart, drawEnd > drawStart ? drawEnd : drawStart + 30000) : '';
check('profiler telemetry not sampled from draw', !drawRegion.includes('_profileCount('));
check('mirror capture not called from draw', !drawRegion.includes('sendFrame('));
check('transport update not called from draw', !drawRegion.includes('_tickTransport('));

console.log(`Pass 13S validation passed (${checks.length} checks).`);
