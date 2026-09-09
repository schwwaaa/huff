/* HUFF Classic — Spout readback + direct transport worker
 *
 * Windows Spout optimization pass 1.
 *
 * Preferred path:
 *   main HUFF canvas -> ImageBitmap -> Worker/OffscreenCanvas -> RGBA readback
 *   -> Worker-owned loopback WebSocket -> Rust -> spout_bridge.dll
 *   -> SpoutDX::SendImage -> shared D3D11 texture.
 *
 * The Worker owns a bounded two-credit native pipeline. Frames are never
 * allowed to accumulate into an unbounded latency queue. If both native
 * credits are occupied, the newest output opportunity is skipped before
 * readback and an older frame is never queued for later delivery.
 *
 * Fallback remains available in the controls thread when Worker/WebSocket
 * transport is unavailable.
 */

'use strict';

let surface = null;
let ctx = null;
let width = 0;
let height = 0;

let transport = null;
let transportEnabled = false;
let transportFailed = false;
let transportUrl = '';
let transportWidth = 0;
let transportHeight = 0;

const MAX_OUTSTANDING_FRAMES = 2;
const ACK_TIMEOUT_MS = 2500;
const REPORT_PERIOD_MS = 250;
let outstandingFrames = 0;
let pendingProfiles = [];
let ackTimer = null;
let lastReportAt = -Infinity;
let report = null;

function emptyReport() {
  return {
    ackedFrames: 0,
    publishedFrames: 0,
    profileSamples: 0,
    drawMs: 0,
    readMs: 0,
    sendMs: 0,
    endToEndMs: 0,
    endToEndSamples: 0,
    nativeUploadUs: 0,
    nativeSamples: 0,
  };
}
report = emptyReport();

function configure(nextWidth, nextHeight) {
  const w = Math.max(1, nextWidth | 0);
  const h = Math.max(1, nextHeight | 0);
  if (!surface) {
    surface = new OffscreenCanvas(w, h);
    ctx = surface.getContext('2d', {
      alpha: false,
      desynchronized: true,
      willReadFrequently: true,
    });
  }
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  if (width !== w || height !== h) {
    width = w;
    height = h;
    surface.width = w;
    surface.height = h;
  }
}

function clearAckTimer() {
  if (ackTimer) {
    clearTimeout(ackTimer);
    ackTimer = null;
  }
}

function armAckTimer() {
  clearAckTimer();
  const oldest = pendingProfiles[0];
  if (!oldest || !transportEnabled) return;
  const elapsed = Math.max(0, performance.now() - oldest.sentAt);
  const delay = Math.max(1, ACK_TIMEOUT_MS - elapsed);
  ackTimer = setTimeout(() => {
    const current = pendingProfiles[0];
    if (!current || !transportEnabled) return;
    if (performance.now() - current.sentAt >= ACK_TIMEOUT_MS) {
      failTransport('Worker Spout ACK timeout');
    } else {
      armAckTimer();
    }
  }, delay);
}

function resetPipeline() {
  outstandingFrames = 0;
  pendingProfiles = [];
  report = emptyReport();
  lastReportAt = -Infinity;
  clearAckTimer();
}

function closeTransport() {
  transportEnabled = false;
  resetPipeline();
  const socket = transport;
  transport = null;
  if (socket) {
    try { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; } catch {}
    try { socket.close(); } catch {}
  }
}

function failTransport(message) {
  if (transportFailed) return;
  transportFailed = true;
  closeTransport();
  self.postMessage({ type: 'transport-failed', message: String(message || 'Worker Spout WebSocket failed') });
}

function frameBytes() {
  return Math.max(1, transportWidth * transportHeight * 4);
}

function hasTransportCapacity() {
  if (!transportEnabled || !transport || transport.readyState !== WebSocket.OPEN) return false;
  // Outstanding native acknowledgements are the hard ceiling. The WebSocket
  // guard prevents preparing another full raw frame while a complete frame is
  // still waiting in the local socket implementation.
  return outstandingFrames < MAX_OUTSTANDING_FRAMES
    && transport.bufferedAmount <= frameBytes();
}

function postCapacityIfAvailable() {
  if (!hasTransportCapacity()) return;
  self.postMessage({
    type: 'transport-capacity',
    outstanding: outstandingFrames,
    maxOutstanding: MAX_OUTSTANDING_FRAMES,
  });
}

function flushTransportReport(nativeMessage, force = false) {
  const now = performance.now();
  const shouldReport = force
    || !!nativeMessage.nativeSample
    || now - lastReportAt >= REPORT_PERIOD_MS;
  if (!shouldReport) return;

  self.postMessage({
    ...nativeMessage,
    type: 'transport-ack',
    outstanding: outstandingFrames,
    maxOutstanding: MAX_OUTSTANDING_FRAMES,
    ackedFrames: report.ackedFrames,
    publishedFrames: report.publishedFrames,
    profiled: report.profileSamples > 0,
    profileSamples: report.profileSamples,
    drawMs: report.drawMs,
    readMs: report.readMs,
    sendMs: report.sendMs,
    endToEndMs: report.endToEndMs,
    endToEndSamples: report.endToEndSamples,
    nativeUploadUs: report.nativeUploadUs,
    nativeSamples: report.nativeSamples,
  });
  report = emptyReport();
  lastReportAt = now;
}

function forwardTransportMessage(event) {
  if (typeof event.data !== 'string') return;
  try {
    const message = JSON.parse(event.data);
    if (message.type !== 'spout-ack') return;

    const profile = pendingProfiles.shift() || null;
    outstandingFrames = Math.max(0, outstandingFrames - 1);
    report.ackedFrames++;
    if (message.published) report.publishedFrames++;

    if (profile?.profiled) {
      report.profileSamples++;
      report.drawMs += profile.drawMs;
      report.readMs += profile.readMs;
      report.sendMs += profile.sendMs;
      report.endToEndMs += Math.max(0, performance.now() - profile.receivedAt);
      report.endToEndSamples++;
    }

    if (message.nativeSample) {
      report.nativeUploadUs += Number(message.nativeUploadUs) || 0;
      report.nativeSamples++;
    }

    armAckTimer();
    flushTransportReport(message, outstandingFrames === 0);
    postCapacityIfAvailable();
  } catch {}
}

function enableTransport(url, nextWidth, nextHeight) {
  closeTransport();
  transportFailed = false;
  transportUrl = String(url || '');
  transportWidth = Math.max(1, nextWidth | 0);
  transportHeight = Math.max(1, nextHeight | 0);
  if (!transportUrl || typeof WebSocket === 'undefined') {
    failTransport('Worker WebSocket is unavailable');
    return;
  }

  try {
    const socket = new WebSocket(transportUrl);
    transport = socket;
    socket.binaryType = 'arraybuffer';
    socket.onmessage = forwardTransportMessage;
    socket.onopen = () => {
      if (socket !== transport) {
        try { socket.close(); } catch {}
        return;
      }
      transportEnabled = true;
      resetPipeline();
      socket.send(JSON.stringify({
        type: 'hello',
        role: 'spout-sender',
        width: transportWidth,
        height: transportHeight,
      }));
      self.postMessage({
        type: 'transport-open',
        maxOutstanding: MAX_OUTSTANDING_FRAMES,
      });
    };
    socket.onerror = () => failTransport('Worker Spout WebSocket error');
    socket.onclose = () => {
      if (socket === transport && transportEnabled) failTransport('Worker Spout WebSocket closed');
    };
  } catch (error) {
    failTransport(error);
  }
}

self.onmessage = (event) => {
  const message = event.data || {};

  if (message.type === 'configure') {
    try {
      configure(message.width, message.height);
      self.postMessage({ type: 'configured', width, height });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) });
    }
    return;
  }

  if (message.type === 'enable-transport') {
    enableTransport(message.url, message.width, message.height);
    return;
  }

  if (message.type === 'disable-transport') {
    closeTransport();
    transportFailed = false;
    return;
  }

  if (message.type === 'release') {
    closeTransport();
    surface = null;
    ctx = null;
    width = 0;
    height = 0;
    return;
  }

  if (message.type !== 'frame' || !message.bitmap) return;

  const bitmap = message.bitmap;
  const profiled = !!message.profile;
  const receivedAt = performance.now();
  try {
    configure(message.width, message.height);

    if (!message.returnPixels) {
      if (!transportEnabled || !transport || transport.readyState !== WebSocket.OPEN) {
        bitmap.close?.();
        self.postMessage({ type: 'transport-failed', message: 'Worker Spout WebSocket not ready for frame' });
        return;
      }
      if (!hasTransportCapacity()) {
        bitmap.close?.();
        self.postMessage({
          type: 'transport-busy',
          id: message.id,
          outstanding: outstandingFrames,
          maxOutstanding: MAX_OUTSTANDING_FRAMES,
          bufferedAmount: transport.bufferedAmount,
        });
        return;
      }
    }

    const drawStarted = profiled ? performance.now() : 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(bitmap, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    bitmap.close?.();
    const drawMs = profiled ? performance.now() - drawStarted : 0;

    const readStarted = profiled ? performance.now() : 0;
    const imageData = ctx.getImageData(0, 0, width, height);
    const readMs = profiled ? performance.now() - readStarted : 0;
    const buffer = imageData.data.buffer;

    if (message.returnPixels) {
      self.postMessage({
        type: 'pixels',
        id: message.id,
        profiled,
        drawMs,
        readMs,
        buffer,
      }, [buffer]);
      return;
    }

    const sendStarted = profiled ? performance.now() : 0;
    transport.send(buffer);
    const sendMs = profiled ? performance.now() - sendStarted : 0;
    outstandingFrames++;
    pendingProfiles.push({
      id: message.id,
      profiled,
      drawMs,
      readMs,
      sendMs,
      receivedAt,
      sentAt: performance.now(),
    });
    armAckTimer();

    self.postMessage({
      type: 'frame-consumed',
      id: message.id,
      outstanding: outstandingFrames,
      maxOutstanding: MAX_OUTSTANDING_FRAMES,
      canAccept: hasTransportCapacity(),
    });
  } catch (error) {
    try { bitmap.close?.(); } catch {}
    if (!message.returnPixels) failTransport(error);
    else self.postMessage({ type: 'error', id: message.id, message: String(error) });
  }
};
