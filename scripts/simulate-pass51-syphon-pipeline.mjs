import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'src/syphon-stream-worker.js'), 'utf8');
const posted = [];
const sockets = [];

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.bufferedAmount = 0;
    this.sent = [];
    sockets.push(this);
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; }
  open() { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  message(value) { this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }); }
}
class FakeOffscreenCanvas {
  constructor(w, h) { this.width = w; this.height = h; this.ctx = new FakeContext(this); }
  getContext() { return this.ctx; }
}
class FakeContext {
  constructor(surface) { this.surface = surface; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; }
  drawImage() {}
  getImageData() {
    return { data: new Uint8ClampedArray(Math.max(1, this.surface.width * this.surface.height * 4)) };
  }
}

const sandbox = {
  performance,
  WebSocket: FakeSocket,
  OffscreenCanvas: FakeOffscreenCanvas,
  Uint8ClampedArray,
  ArrayBuffer,
  console,
  setTimeout,
  clearTimeout,
  self: { postMessage(message) { posted.push(message); }, onmessage: null },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'syphon-stream-worker.js' });
const send = data => sandbox.self.onmessage({ data });
const fakeBitmap = () => ({ close() {}, width: 4, height: 2 });
const rawFrames = socket => socket.sent.filter(v => v instanceof ArrayBuffer);

send({ type: 'configure', width: 4, height: 2 });
send({ type: 'enable-transport', url: 'ws://127.0.0.1:8787', width: 4, height: 2 });
const socket = sockets[0];
if (!socket) throw new Error('Worker did not create direct WebSocket');
socket.open();
if (!posted.some(m => m.type === 'transport-open' && m.maxOutstanding === 2)) throw new Error('two-credit transport did not open');

posted.length = 0;
send({ type: 'frame', id: 1, width: 4, height: 2, profile: true, returnPixels: false, bitmap: fakeBitmap() });
let consumed = posted.find(m => m.type === 'frame-consumed' && m.id === 1);
if (!consumed || consumed.outstanding !== 1 || consumed.canAccept !== true) throw new Error('frame 1 did not consume first credit');

posted.length = 0;
send({ type: 'frame', id: 2, width: 4, height: 2, profile: true, returnPixels: false, bitmap: fakeBitmap() });
consumed = posted.find(m => m.type === 'frame-consumed' && m.id === 2);
if (!consumed || consumed.outstanding !== 2 || consumed.canAccept !== false) throw new Error('frame 2 did not fill second credit');
if (rawFrames(socket).length !== 2) throw new Error('two direct frames were not pipelined before ACK');

posted.length = 0;
send({ type: 'frame', id: 3, width: 4, height: 2, profile: true, returnPixels: false, bitmap: fakeBitmap() });
if (!posted.some(m => m.type === 'transport-busy' && m.outstanding === 2)) throw new Error('third frame was not dropped at two-credit ceiling');
if (rawFrames(socket).length !== 2) throw new Error('third frame entered an unbounded queue');

posted.length = 0;
socket.message({ type: 'syphon-ack', published: true, hasClients: true, frames: 1 });
if (!posted.some(m => m.type === 'transport-capacity' && m.outstanding === 1)) throw new Error('ACK did not restore Worker capacity');
const report = posted.find(m => m.type === 'transport-ack');
if (!report || report.ackedFrames !== 1 || report.outstanding !== 1) throw new Error('sampled Worker ACK/status report invalid');

posted.length = 0;
send({ type: 'frame', id: 3, width: 4, height: 2, profile: true, returnPixels: false, bitmap: fakeBitmap() });
if (rawFrames(socket).length !== 3) throw new Error('third frame did not enter pipeline after credit release');
if (!posted.some(m => m.type === 'frame-consumed' && m.outstanding === 2)) throw new Error('recovered second credit not consumed');

// Drain both outstanding frames so the timeout timer is cleared.
socket.message({ type: 'syphon-ack', published: true, hasClients: true, frames: 2 });
socket.message({ type: 'syphon-ack', published: true, hasClients: true, frames: 3 });

// The accepted Pass 49 pixel-return fallback remains intact.
send({ type: 'disable-transport' });
posted.length = 0;
send({ type: 'frame', id: 4, width: 4, height: 2, profile: false, returnPixels: true, bitmap: fakeBitmap() });
const pixels = posted.find(m => m.type === 'pixels');
if (!pixels || !(pixels.buffer instanceof ArrayBuffer) || pixels.buffer.byteLength !== 32) throw new Error('Pass 49 fallback pixel-return path failed');

console.log('HUFF Classic Pass 51 Syphon two-credit pipeline simulation PASS');
console.log('worker-direct: two outstanding native frames maximum, third opportunity dropped, ACK restores credit');
console.log('fallback: one-frame main-socket pixel-return route remains available');
