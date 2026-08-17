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
  close() {
    this.readyState = 3;
    const cb = this.onclose;
    if (cb) cb();
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  message(value) {
    this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) });
  }
}

class FakeOffscreenCanvas {
  constructor(w, h) { this.width = w; this.height = h; this.ctx = new FakeContext(this); }
  getContext() { return this.ctx; }
}
class FakeContext {
  constructor(surface) { this.surface = surface; this.globalAlpha = 1; this.globalCompositeOperation = 'source-over'; }
  drawImage() {}
  getImageData() {
    const n = Math.max(1, this.surface.width * this.surface.height * 4);
    return { data: new Uint8ClampedArray(n) };
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
  self: {
    postMessage(message) { posted.push(message); },
    onmessage: null,
  },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'syphon-stream-worker.js' });
const send = data => sandbox.self.onmessage({ data });
const fakeBitmap = () => ({ close() {}, width: 4, height: 2 });

send({ type: 'configure', width: 4, height: 2 });
if (!posted.some(m => m.type === 'configured')) throw new Error('Worker did not configure');

send({ type: 'enable-transport', url: 'ws://127.0.0.1:8787', width: 4, height: 2 });
if (sockets.length !== 1) throw new Error('Worker did not create its own WebSocket');
const socket = sockets[0];
socket.open();
if (!posted.some(m => m.type === 'transport-open')) throw new Error('Worker transport did not open');
const hello = socket.sent.find(v => typeof v === 'string');
if (!hello || JSON.parse(hello).role !== 'syphon-sender') throw new Error('Worker hello role mismatch');

posted.length = 0;
send({ type: 'frame', id: 1, width: 4, height: 2, profile: true, returnPixels: false, bitmap: fakeBitmap() });
const raw = socket.sent.find(v => v instanceof ArrayBuffer);
if (!raw || raw.byteLength !== 32) throw new Error(`Direct raw RGBA send mismatch: ${raw?.byteLength}`);
if (posted.some(m => m.type === 'pixels')) throw new Error('Direct path incorrectly transferred full pixels to controls');

socket.message({ type: 'syphon-ack', published: true, hasClients: true, frames: 1 });
const ack = posted.find(m => m.type === 'transport-ack');
if (!ack || ack.frames !== 1 || !ack.profiled) throw new Error('Compact transport ACK/profile forwarding failed');

send({ type: 'disable-transport' });
posted.length = 0;
send({ type: 'frame', id: 2, width: 4, height: 2, profile: true, returnPixels: true, bitmap: fakeBitmap() });
const pixels = posted.find(m => m.type === 'pixels');
if (!pixels || !(pixels.buffer instanceof ArrayBuffer) || pixels.buffer.byteLength !== 32) {
  throw new Error('Pass 49 pixel-return fallback failed');
}

console.log('HUFF Classic Pass 50 Syphon Worker simulation PASS');
console.log('direct path: Worker readback -> Worker WebSocket raw RGBA (no pixels postMessage)');
console.log('fallback: Worker readback -> pixels postMessage -> main-owned socket path');
