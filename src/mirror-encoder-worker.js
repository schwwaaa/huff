/* mirror-encoder-worker.js
 * Off-main-thread scaler + JPEG encoder for the HUFF canvas mirror.
 * Receives a transferable ImageBitmap that Pass 15 normally pre-sizes to the
 * bounded mirror dimensions, copies it into a persistent OffscreenCanvas, encodes
 * with convertToBlob(), then transfers the encoded ArrayBuffer back. Legacy full-
 * resolution bitmaps remain supported and are scaled here when required.
 */

'use strict';

let surface = null;
let ctx = null;

function ensureSurface(width, height) {
  if (!surface || surface.width !== width || surface.height !== height) {
    surface = new OffscreenCanvas(width, height);
    ctx = surface.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  }
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type !== 'frame' || !msg.bitmap) return;

  const bitmap = msg.bitmap;
  try {
    const width = Math.max(1, Number(msg.width) || bitmap.width || 1);
    const height = Math.max(1, Number(msg.height) || bitmap.height || 1);
    const quality = Math.max(0.3, Math.min(0.97, Number(msg.quality) || 0.76));
    const profile = msg.profile === true;
    const started = profile ? performance.now() : 0;

    ensureSurface(width, height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    if (bitmap.width === width && bitmap.height === height) ctx.drawImage(bitmap, 0, 0);
    else ctx.drawImage(bitmap, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    const blob = await surface.convertToBlob({ type: 'image/jpeg', quality });
    const buffer = await blob.arrayBuffer();
    self.postMessage({
      type: 'encoded',
      buffer,
      encodeMs: profile ? performance.now() - started : undefined,
    }, [buffer]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error && error.message ? error.message : String(error),
    });
  } finally {
    try { bitmap.close(); } catch (_) {}
  }
};

self.postMessage({ type: 'ready' });
