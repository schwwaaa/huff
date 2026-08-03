/* mirror-encoder-worker.js
 * Off-main-thread scaler + JPEG encoder for the HUFF canvas mirror.
 * Receives a transferable ImageBitmap, scales it into an OffscreenCanvas,
 * encodes with convertToBlob(), then transfers the encoded ArrayBuffer back.
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
    const maxW = Math.max(1, Number(msg.maxW) || 1280);
    const maxH = Math.max(1, Number(msg.maxH) || 1280);
    const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const quality = Math.max(0.3, Math.min(0.97, Number(msg.quality) || 0.76));

    ensureSurface(width, height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(bitmap, 0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';

    const blob = await surface.convertToBlob({ type: 'image/jpeg', quality });
    const buffer = await blob.arrayBuffer();
    self.postMessage({ type: 'encoded', buffer }, [buffer]);
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
