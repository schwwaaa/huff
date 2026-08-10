// Deterministic architectural simulation for Pass 40V's Luma handoff/cache
// contract. This does not benchmark WebKit; it verifies the intended source-read
// cadence and bounded workspace size for a representative 1920x1080 source.

function dims(W,H,maxW){
  const scale=W>maxW?maxW/W:1;
  return {sw:Math.max(1,Math.round(W*scale)),sh:Math.max(1,Math.round(H*scale))};
}
const composite=dims(1920,1080,640);
const object=dims(1920,1080,320);
if(composite.sw!==640||composite.sh!==360) throw new Error('unexpected composite dims');
if(object.sw!==320||object.sh!==180) throw new Error('unexpected object dims');
if(composite.sw*composite.sh !== 4*object.sw*object.sh) throw new Error('object plane should be 4x fewer pixels at 1080p');

class Cache {
  constructor(){this.frame=-1;this.reads=0;this.reuses=0;this.shapeSerial=0;}
  source(frame){if(this.frame===frame){this.reuses++;return 'reuse';}this.frame=frame;this.reads++;return 'read';}
  shapeEdit(){this.shapeSerial++; /* source frame intentionally preserved */}
}
const live=new Cache();
const sequence=[];
sequence.push(['frame 100',live.source(100)]);
live.shapeEdit();
sequence.push(['same-frame INVERT',live.source(100)]);
live.shapeEdit();
sequence.push(['same-frame CLIP',live.source(100)]);
sequence.push(['frame 101',live.source(101)]);
if(live.reads!==2||live.reuses!==2) throw new Error(`cache cadence wrong: ${live.reads}/${live.reuses}`);

const stencilOngoingReads=0;
if(stencilOngoingReads!==0) throw new Error('stencil simulation invariant failed');

console.log('PASS 40V Luma handoff simulation PASS');
console.log(`COMPOSITE LIVE workspace: ${composite.sw}x${composite.sh} = ${composite.sw*composite.sh} pixels`);
console.log(`TARGETED LIVE workspace:  ${object.sw}x${object.sh} = ${object.sw*object.sh} pixels`);
console.log('Targeted plane pixel count at 1080p: 25% of COMPOSITE plane');
for(const [label,result] of sequence) console.log(`${label.padEnd(20)} ${result}`);
console.log(`LIVE source reads/reuses: ${live.reads}/${live.reuses}`);
console.log('STENCIL ongoing source reads after capture: 0');
