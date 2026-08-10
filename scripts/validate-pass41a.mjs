import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const canvas = read('src/canvas.js');
const html = read('src/index.html');
const pkg = JSON.parse(read('package.json'));
let checks = 0;
function ok(cond, msg) { checks++; if (!cond) throw new Error(`FAIL: ${msg}`); }
function has(text, token, msg=token) { ok(text.includes(token), msg); }
function lacks(text, token, msg=token) { ok(!text.includes(token), msg); }

// Classic processing ceiling / explicit resolution modes.
has(canvas, 'const CLASSIC_MAX_LONG_EDGE = 1920;', '1920 long-edge ceiling');
has(canvas, 'const CLASSIC_MAX_PIXELS = 1920 * 1080;', '1080p-class pixel ceiling');
has(canvas, "if (mode === '1080p') return { width:1920, height:1080", '1080p explicit mode');
has(canvas, "if (mode === '720p') return { width:1280, height:720", '720p explicit mode');
has(canvas, "_selectedProcessResolutionMode() !== 'auto'", 'fixed process mode ignores window resize');
has(html, 'id="processResolution"', 'process resolution UI');
has(html, '<option value="auto" selected>AUTO</option>', 'AUTO compatibility default');
has(html, '<option value="1080p">1080P</option>', '1080p maximum fidelity option');

function classicDims(w,h) {
  const maxLong=1920, maxPixels=1920*1080;
  const longScale=maxLong/Math.max(w,h);
  const pixelScale=Math.sqrt(maxPixels/(w*h));
  const scale=Math.min(1,longScale,pixelScale);
  return {w:Math.max(2,Math.floor((w*scale)/2)*2), h:Math.max(2,Math.floor((h*scale)/2)*2)};
}
for (const [w,h] of [[3840,2160],[2560,1440],[3440,1440],[1080,1920],[1280,720],[800,600],[7680,4320]]) {
  const d=classicDims(w,h);
  ok(Math.max(d.w,d.h)<=1920, `AUTO long edge <=1920 for ${w}x${h}`);
  ok(d.w*d.h<=1920*1080, `AUTO pixels <=1080p for ${w}x${h}`);
}
const d4k=classicDims(3840,2160);
ok(d4k.w===1920 && d4k.h===1080, '4K AUTO maps to 1920x1080');

// Source fit preserves legacy stretch but exposes fidelity-safe modes.
has(html, 'id="sourceFit"', 'source fit UI');
has(html, '<option value="stretch" selected>STRETCH</option>', 'legacy STRETCH default');
has(html, '<option value="fit">FIT</option>', 'FIT mode');
has(html, '<option value="fill">FILL</option>', 'FILL mode');
has(html, '<option value="one-to-one">1:1</option>', '1:1 mode');
has(canvas, "if (mode === 'stretch') return _copyFullFrame", 'stretch fast path retained');
has(canvas, "if (mode === 'fit')", 'fit implementation');
has(canvas, "else if (mode === 'fill')", 'fill implementation');
has(canvas, "else if (mode === 'one-to-one')", '1:1 implementation');
has(canvas, '_copySourceFrame(gCur.drawingContext, v, gCur.width, gCur.height', 'rVFC uses source-fit blit');

// HISTORY is explicit and strictly budgeted; old QUALITY remains compatibility-only.
has(html, '<label>HISTORY</label>', 'HISTORY visible label');
has(html, 'id="historyFrames"', 'history frames control');
has(html, 'id="quality"', 'legacy quality alias retained');
has(html, 'style="display:none"', 'legacy quality alias hidden');
has(canvas, 'const FRAME_RING_BUDGET_BYTES = 192 * 1024 * 1024;', '192 MiB FrameRing budget');
has(canvas, 'this._cap  = Math.max(1, cap);', 'FrameRing no unsafe four-frame floor');
has(canvas, 'newCap = Math.max(1, newCap);', 'FrameRing resize no unsafe floor');
has(canvas, 'Math.floor(FRAME_RING_BUDGET_BYTES / bpf)', 'strict byte-derived ring capacity');
has(canvas, 'renderState.historyFrames ?? HISTORY_MAX_FRAMES', 'FrameRing uses HISTORY not quality');
lacks(canvas, 'renderState.quality ??', 'quality removed from ring runtime');
const budget=192*1024*1024;
for (const [w,h] of [[1920,1080],[5120,2880],[7680,4320]]) {
  const bpf=w*h*4;
  const cap=Math.max(1,Math.min(120,Math.floor(budget/bpf)));
  ok(cap*bpf<=budget, `ring capacity stays <=192 MiB at ${w}x${h}`);
}
ok(Math.floor(budget/(1920*1080*4))===24, '1080p history ceiling is 24 RGBA frames');

// Mirror preview no longer changes when temporal history changes.
has(canvas, 'const STREAM_JPEG_Q = 0.97;', 'fixed high mirror JPEG quality');
has(canvas, 'const STREAM_PERIOD = 1000 / STREAM_FPS_CAP;', 'fixed mirror cadence');
lacks(canvas, 'refreshStreamTuning', 'old quality-coupled mirror tuning removed');
lacks(canvas, "event.target?.id === 'quality'", 'quality no longer tunes preview');

// Playback diagnostics and source/container visibility.
has(html, 'id="sourceInfo"', 'source info pill');
has(html, '.mp4,.m4v,.mov,.webm', 'explicit common container picker hints');
has(canvas, 'window.HUFF_PLAYBACK_TELEMETRY = _playbackTelemetry;', 'playback telemetry exposed');
has(canvas, 'metadata.presentedFrames', 'rVFC presentedFrames tracked');
has(canvas, 'metadata.processingDuration', 'rVFC processingDuration tracked');
has(canvas, 'metadata.mediaTime', 'rVFC mediaTime tracked');
has(canvas, 'getVideoPlaybackQuality', 'browser dropped-frame stats reported');
has(canvas, "'rvfc gaps  '", 'profiler rVFC gap row');
has(canvas, "'video drop '", 'profiler browser drop row');
has(canvas, "'process    '", 'profiler process resolution row');
has(canvas, "'src scale  '", 'profiler source scale row');

// Seek responsiveness + exact landing on release.
has(canvas, 'typeof vv.fastSeek === \'function\'', 'fastSeek retained during drag');
has(canvas, 'v.currentTime = exactTarget;', 'exact currentTime seek on release');
has(canvas, 'touchcancel', 'touch cancel finishes precise scrub');

// Preset compatibility.
has(canvas, "'quality','historyFrames','processResolution','sourceFit'", 'new source controls captured with legacy alias');
has(canvas, "if (!('historyFrames' in sourceData))", 'legacy quality preset migration');
has(canvas, "sourceData.processResolution = 'auto'", 'legacy process mode migration');
has(canvas, "sourceData.sourceFit = 'stretch'", 'legacy source fit migration');
has(canvas, 'syncHistoryFromLegacyQuality', 'legacy quality MIDI/OSC compatibility');
has(canvas, 'syncLegacyQualityFromHistory', 'new history syncs legacy alias');

// Protected Pass 40W engine files must stay exact.
const manifest = read('baseline/pass40w-protected.sha256').trim().split(/\n+/).filter(Boolean);
for (const line of manifest) {
  const [expected, ...parts]=line.trim().split(/\s+/);
  const rel=parts.join(' ');
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');
  ok(actual===expected, `protected exact: ${rel}`);
}

ok(pkg.scripts?.['validate:pass41a']==='node scripts/validate-pass41a.mjs', 'package exposes Pass 41A validator');
console.log(`PASS 41A validation: ${checks} checks PASS`);
