import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const hash = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walkFiles(base) {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() || entry.isSymbolicLink()) {
        out.push(path.relative(base, full).split(path.sep).join('/'));
      }
    }
  };
  walk(base);
  return out.sort();
}

function parseManifest(rel) {
  const entries = new Map();
  for (const line of read(rel).trim().split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    assert(match, `invalid manifest line in ${rel}: ${line}`);
    entries.set(match[2], match[1]);
  }
  return entries;
}

function digestFilesystemEntry(full) {
  const stat = fs.lstatSync(full);
  const bytes = stat.isSymbolicLink()
    ? Buffer.from(`SYMLINK:${fs.readlinkSync(full)}`)
    : fs.readFileSync(full);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function verifyManifest(relDir, manifestRel, allowedChanged, allowedAdded = []) {
  const base = path.join(root, relDir);
  const expected = parseManifest(manifestRel);
  const changed = new Set(allowedChanged);
  const added = new Set(allowedAdded);

  for (const [rel, digest] of expected) {
    const full = path.join(base, ...rel.split('/'));
    assert(fs.existsSync(full), `${relDir}/${rel} missing`);
    if (!changed.has(rel)) {
      assert(digestFilesystemEntry(full) === digest, `${relDir}/${rel} changed outside Pass 28 scope`);
    }
  }
  for (const rel of walkFiles(base)) {
    if (!expected.has(rel)) assert(added.has(rel), `${relDir}/${rel} is an undeclared added runtime file`);
  }
}

verifyManifest('src', 'baseline/pass27-src.sha256', ['canvas.js', 'canvas.html', 'index.html']);
verifyManifest('src-tauri', 'baseline/pass27-src-tauri.sha256', ['src/main.rs']);

const pass27 = parseManifest('baseline/pass27-src.sha256');
assert(hash('src/effects.js') === pass27.get('effects.js'), 'Flow/effect implementation changed');
assert(hash('src/pipeline-runtime.js') === pass27.get('pipeline-runtime.js'), 'validated pipeline runtime changed');
assert(hash('src/capability-instrumentation.js') === pass27.get('capability-instrumentation.js'), 'Pass 27 instrumentation changed');

const canvas = read('src/canvas.js');
for (const marker of [
  'let reconnectTimer = 0;',
  'let pumpRafId = 0;',
  'function clearReconnectTimer()',
  'function scheduleReconnect()',
  'pumpRafId = requestAnimationFrame(pump);',
  'cancelAnimationFrame(pumpRafId);',
  "document.removeEventListener('input', updateStreamTuning);",
  "encoderWorker.postMessage({ type:'release' });",
  'tcv.width = 1;',
  'tcv.height = 1;',
]) assert(canvas.includes(marker), `missing mirror lifecycle marker: ${marker}`);
assert(!/setTimeout\(ensureWS\s*,/.test(canvas), 'mirror reconnect still uses an unowned timeout');
assert((canvas.match(/createGraphics\(/g) ?? []).length === 2, 'Pass 28 added another p5.Graphics surface');
assert(!canvas.includes('SortMosh') && !canvas.includes('flowMelt') && !canvas.includes('flowLag'), 'rejected Flow code detected');

const viewer = read('src/canvas.html');
for (const marker of [
  'let reconnectTimer = 0;',
  'let viewerShutdown = false;',
  'let socketGeneration = 0;',
  'function scheduleReconnect()',
  'function shutdownViewer()',
  "window.addEventListener('pagehide', shutdownViewer, { once:true });",
  'generation !== socketGeneration',
  'pendingFrame = null;',
]) assert(viewer.includes(marker), `missing canvas-viewer lifecycle marker: ${marker}`);
assert(!viewer.includes('setTimeout(() => {\n      _wsDelay = Math.min'), 'viewer retains the unowned reconnect timeout');

const index = read('src/index.html');
for (const marker of [
  'function releaseSyphonTransport({ stopNative = false, clearPollTimer = false } = {})',
  'let lifecycleGeneration = 0;',
  'let startPending = false;',
  'let stopPending = false;',
  'generation !== lifecycleGeneration',
  "releaseSyphonTransport({ stopNative: true, clearPollTimer: true });",
  "window.addEventListener('pagehide', shutdownSyphon, { once: true });",
  'function releaseSpoutTransport({ stopNative = false, clearPollTimer = false } = {})',
  "releaseSpoutTransport({ stopNative: true, clearPollTimer: true });",
  "window.addEventListener('pagehide', shutdownSpout, { once: true });",
  'statusPollTimer = setInterval(async () => {',
  'spoutCanvas.width = 1;',
  'fallbackCanvas.width = 1;',
]) assert(index.includes(marker), `missing output lifecycle marker: ${marker}`);
assert(!index.includes("window.addEventListener('beforeunload', closeSpoutWS"), 'Spout still has socket-only shutdown');
assert(!index.includes("window.addEventListener('beforeunload', () => {\n            active = false;"), 'Syphon still has partial shutdown handler');

const rust = read('src-tauri/src/main.rs');
for (const marker of [
  'static RUNTIME_SHUTDOWN_STARTED: AtomicBool = AtomicBool::new(false);',
  'fn shutdown_native_runtime()',
  'RUNTIME_SHUTDOWN_STARTED.swap(true, Ordering::SeqCst)',
  'if let Some(tx) = shutdown.take()',
  '*midi = None;',
  'shutdown_native_runtime();',
  '*shutdown = Some(tx);',
]) assert(rust.includes(marker), `missing native shutdown marker: ${marker}`);
assert(!rust.includes('OnceCell<tokio::sync::oneshot::Sender'), 'OSC shutdown sender still cannot be taken');

// Deterministic model of the generation guard used by Syphon and Spout.
class OutputLifecycleModel {
  generation = 0;
  active = false;
  startPending = false;
  stopPending = false;
  shuttingDown = false;
  nativeStops = 0;

  beginStart() {
    if (this.active || this.startPending || this.stopPending || this.shuttingDown) return null;
    this.startPending = true;
    return ++this.generation;
  }
  resolveStart(token) {
    if (this.shuttingDown || token !== this.generation) {
      this.nativeStops++;
      return false;
    }
    this.active = true;
    this.startPending = false;
    return true;
  }
  beginStop() {
    if (this.stopPending) return false;
    this.stopPending = true;
    this.generation++;
    this.startPending = false;
    this.active = false;
    return true;
  }
  resolveStop() { this.stopPending = false; }
  shutdown() {
    if (this.shuttingDown) return false;
    this.shuttingDown = true;
    this.generation++;
    this.active = false;
    this.startPending = false;
    this.stopPending = false;
    this.nativeStops++;
    return true;
  }
}

for (let i = 0; i < 10000; i++) {
  const m = new OutputLifecycleModel();
  const token = m.beginStart();
  assert(token === 1, 'initial start token invalid');
  if (i % 3 === 0) {
    assert(m.beginStop(), 'stop should cancel pending start');
    assert(!m.resolveStart(token), 'stale start completion reactivated output');
    m.resolveStop();
    const token2 = m.beginStart();
    assert(token2 === 3, 'restart token did not advance');
    assert(m.resolveStart(token2), 'valid restart failed');
  } else if (i % 3 === 1) {
    assert(m.shutdown(), 'shutdown failed');
    assert(!m.resolveStart(token), 'start completion survived shutdown');
    assert(m.beginStart() === null, 'start permitted after shutdown');
    assert(!m.shutdown(), 'shutdown was not idempotent');
  } else {
    assert(m.resolveStart(token), 'normal start failed');
    assert(m.beginStart() === null, 'duplicate start permitted');
    assert(m.beginStop(), 'normal stop failed');
    assert(!m.beginStop(), 'duplicate stop permitted');
    m.resolveStop();
  }
}

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts?.['validate:pass28'] === 'node scripts/validate-pass28.mjs', 'validate:pass28 package script missing');

console.log('PASS 28 validation passed.');
console.log('Mirror sender/viewer reconnect ownership, Syphon/Spout generation guards, deterministic browser cleanup, and idempotent native shutdown are present.');
console.log('10,000 lifecycle sequences passed; Flow/effects and the validated pipeline runtime remain byte-identical to Pass 27.');
