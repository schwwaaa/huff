const MAX_LONG = 1920;
const MAX_PIXELS = 1920 * 1080;
const RING_BUDGET = 192 * 1024 * 1024;

function processDims(w,h,mode='auto') {
  if (mode === '1080p') return {width:1920,height:1080};
  if (mode === '720p') return {width:1280,height:720};
  const scale = Math.min(1, MAX_LONG / Math.max(w,h), Math.sqrt(MAX_PIXELS / (w*h)));
  return {
    width: Math.max(2, Math.floor((w*scale)/2)*2),
    height: Math.max(2, Math.floor((h*scale)/2)*2),
  };
}
function historyCap(w,h) {
  return Math.max(1, Math.min(120, Math.floor(RING_BUDGET/(w*h*4))));
}
function fit(sw,sh,dw,dh,mode) {
  if (mode === 'stretch') return {sx:0,sy:0,sw,sh,dx:0,dy:0,dw,dh};
  if (mode === 'fit') {
    const z=Math.min(dw/sw,dh/sh), rw=sw*z,rh=sh*z;
    return {sx:0,sy:0,sw,sh,dx:(dw-rw)/2,dy:(dh-rh)/2,dw:rw,dh:rh};
  }
  if (mode === 'fill') {
    const z=Math.max(dw/sw,dh/sh), cw=dw/z,ch=dh/z;
    return {sx:(sw-cw)/2,sy:(sh-ch)/2,sw:cw,sh:ch,dx:0,dy:0,dw,dh};
  }
  const cw=Math.min(sw,dw), ch=Math.min(sh,dh);
  return {sx:Math.max(0,(sw-cw)/2),sy:Math.max(0,(sh-ch)/2),sw:cw,sh:ch,dx:Math.max(0,(dw-cw)/2),dy:Math.max(0,(dh-ch)/2),dw:cw,dh:ch};
}

const cases = [
  ['4K 16:9',3840,2160],
  ['1440p 16:9',2560,1440],
  ['Ultrawide',3440,1440],
  ['Portrait',1080,1920],
  ['720p',1280,720],
];
console.log('HUFF Classic Pass 41A playback simulation');
for (const [name,w,h] of cases) {
  const a=processDims(w,h,'auto');
  console.log(`${name.padEnd(12)} AUTO ${w}x${h} -> ${a.width}x${a.height}; history max ${historyCap(a.width,a.height)} frames`);
}
console.log('\nExplicit modes:');
for (const mode of ['720p','1080p']) {
  const d=processDims(800,600,mode);
  console.log(`${mode}: ${d.width}x${d.height}; history max ${historyCap(d.width,d.height)} frames`);
}
console.log('\n4:3 source (1440x1080) into 1080p Classic:');
for (const mode of ['stretch','fit','fill','one-to-one']) {
  console.log(mode.padEnd(10), JSON.stringify(fit(1440,1080,1920,1080,mode)));
}

if (historyCap(1920,1080) !== 24) throw new Error('1080p history cap changed');
if (processDims(3840,2160,'auto').width !== 1920) throw new Error('4K AUTO cap failed');
console.log('\nPASS playback simulation');
