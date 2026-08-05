/* HUFF Classic — Syphon readback worker
 *
 * Moves output scaling and Canvas2D pixel readback off the controls WebView's
 * main thread when Worker + OffscreenCanvas + ImageBitmap are available.
 * The controls page still owns scheduling and WebSocket transport.
 */

'use strict';

let surface = null;
let ctx = null;
let width = 0;
let height = 0;

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

  if (message.type === 'release') {
    surface = null;
    ctx = null;
    width = 0;
    height = 0;
    return;
  }

  if (message.type !== 'frame' || !message.bitmap) return;

  const bitmap = message.bitmap;
  const profiled = !!message.profile;
  try {
    configure(message.width, message.height);
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
    self.postMessage({
      type: 'pixels',
      id: message.id,
      profiled,
      drawMs,
      readMs,
      buffer,
    }, [buffer]);
  } catch (error) {
    try { bitmap.close?.(); } catch {}
    self.postMessage({ type: 'error', id: message.id, message: String(error) });
  }
};
