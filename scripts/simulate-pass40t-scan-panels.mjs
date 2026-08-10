import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1920, H = 1080, aspect = W / H;

function smoothPanelMix(zoom) {
  if (Math.abs(zoom - 1) < 1e-9) return 0;
  const depth = Math.min(1, Math.abs(Math.log2(Math.max(0.0001, zoom))));
  return depth * depth * (3 - 2 * depth);
}

function panelRect({x,y,w,h}, zoom) {
  const mix = smoothPanelMix(zoom);
  const panelH = h + (Math.max(h, w / aspect) - h) * mix;
  const dw = w * zoom;
  const dh = panelH * zoom;
  return {
    x: x + w/2 - dw/2,
    y: y + h/2 - dh/2,
    w: dw,
    h: dh,
    panelMix: mix,
  };
}

const bases = [
  {x:180,y:170,w:1480,h:72},
  {x:420,y:445,w:1120,h:96},
  {x:710,y:735,w:820,h:126},
];
const zooms = [0.5, 1, 1.5, 2];

// Contract checks.
for (const b of bases) {
  const n = panelRect(b, 1);
  if (n.x !== b.x || n.y !== b.y || n.w !== b.w || n.h !== b.h || n.panelMix !== 0) {
    throw new Error('1x must preserve exact flat-band geometry');
  }
}
const forward = panelRect(bases[1], 2);
if (!(forward.h > bases[1].h * 5)) throw new Error('2x must escape the original band-height constraint');
if (!(Math.abs((forward.w / forward.h) - aspect) < 0.001)) throw new Error('2x panel must reach source aspect ratio');
const backward = panelRect(bases[1], 0.5);
if (!(backward.w < bases[1].w && backward.h > bases[1].h)) throw new Error('0.5x must form a smaller free panel, not a thinner constrained strip');

const margin=60, gap=50, cellW=520, cellH=360;
const svgW = margin*2 + zooms.length*cellW + (zooms.length-1)*gap;
const svgH = 500;
let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">\n`;
svg += `<rect width="100%" height="100%" fill="#efefef"/>`;
svg += `<text x="${margin}" y="32" font-family="monospace" font-size="18" fill="#000">Pass 40T Scanlines panel-aware ZOOM simulation — 1x = exact 2D bands; away from 1x = free video panels</text>`;
for (let zi=0; zi<zooms.length; zi++) {
  const z=zooms[zi], ox=margin + zi*(cellW+gap), oy=80;
  svg += `<text x="${ox}" y="${oy-14}" font-family="monospace" font-size="16" fill="#000">ZOOM ${z.toFixed(2)}x</text>`;
  svg += `<rect x="${ox}" y="${oy}" width="${cellW}" height="${cellH}" fill="#fff" stroke="#000" stroke-width="2" stroke-dasharray="7 5"/>`;
  for (let i=0;i<bases.length;i++) {
    const b=bases[i];
    const r=panelRect(b,z);
    const sx=cellW/W, sy=cellH/H;
    const rx=ox+r.x*sx, ry=oy+r.y*sy, rw=r.w*sx, rh=r.h*sy;
    svg += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="none" stroke="#000" stroke-width="${i+1}"/>`;
    if (z===1) {
      svg += `<line x1="${ox}" y1="${oy+(b.y+b.h/2)*sy}" x2="${ox+cellW}" y2="${oy+(b.y+b.h/2)*sy}" stroke="#aaa" stroke-width="1"/>`;
    }
  }
}
svg += `</svg>\n`;
const out = path.join(root,'SCANLINES_PANEL_ZOOM_SIMULATION.svg');
fs.writeFileSync(out, svg);
console.log('PASS 40T scan-panel simulation PASS');
console.log(`wrote ${path.relative(root,out)}`);
console.log(JSON.stringify({zooms, representativeForward: forward, representativeBackward: backward}, null, 2));
