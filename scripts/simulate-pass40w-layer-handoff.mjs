// Pass 40W deterministic interaction simulation.
// Models the reported Scan + Luma + Corrupt failure: the previous CONTINUOUS
// speed gate removed Corrupt from most render frames below 1x, so Scan repainted
// the shared persistent composite and a speed adjustment produced a one-frame
// Corrupt flash. Pass 40W keeps CONTINUOUS Corrupt present every render and uses
// a speed-scaled decoded-frame clock only for historical-age evolution.

function oldContinuousGate(speed, frames, speedChangeAt = -1) {
  let acc = 0;
  const out = [];
  let lastSpeed = 1;
  let entering = true;
  for (let f = 0; f < frames; f++) {
    const changed = f === speedChangeAt || Math.abs(speed-lastSpeed)>1e-9;
    let draw = false;
    if (speed >= 1) draw = true;
    else if (speed <= 0) draw = entering || changed;
    else if (entering || changed) draw = true;
    else {
      acc += speed;
      if (acc >= 1) { acc -= Math.floor(acc); draw = true; }
    }
    out.push(draw);
    entering = false;
    lastSpeed = speed;
  }
  return out;
}
function newContinuousGate(frames) { return Array.from({length:frames},()=>true); }

const oldSlow = oldContinuousGate(0.15, 20);
const newSlow = newContinuousGate(20);
if (oldSlow.filter(Boolean).length >= 20) throw new Error('old gate model should omit Corrupt renders below 1x');
if (!newSlow.every(Boolean)) throw new Error('new CONTINUOUS layer must be present every render');

// A speed edit in the old gate creates an isolated redraw surrounded by holds.
const oldZero = oldContinuousGate(0, 8, 3);
if (!oldZero[0] || !oldZero[3] || oldZero.filter(Boolean).length !== 2) {
  throw new Error(`old zero-speed flash model unexpected: ${oldZero}`);
}

// Speed-scaled decoded source clock. At 0x age choice is fixed. At .25x it
// changes once per four decoded frames. At 1x it tracks every decoded frame.
function sourceSerials(speed, decodedFrames) {
  let clock = 100;
  let lastVfc = 100;
  const out = [Math.floor(clock)];
  for (let i=1;i<=decodedFrames;i++) {
    const vfc=100+i;
    clock += (vfc-lastVfc)*speed;
    lastVfc=vfc;
    out.push(Math.floor(clock));
  }
  return out;
}
const zero=sourceSerials(0,12);
const quarter=sourceSerials(.25,12);
const one=sourceSerials(1,12);
if (new Set(zero).size !== 1) throw new Error('0x source age choice must lock');
if (new Set(quarter).size >= new Set(one).size) throw new Error('.25x should evolve source age slower than 1x');
for (let i=0;i<one.length;i++) if (one[i] !== 100+i) throw new Error('1x source clock must track decoded frames');

console.log('PASS 40W Scan/Luma/Corrupt layer-handoff simulation PASS');
console.log(`Old CONTINUOUS at 0.15x: ${oldSlow.map(v=>v?'C':'-').join('')}`);
console.log(`New CONTINUOUS at 0.15x: ${newSlow.map(v=>v?'C':'-').join('')}`);
console.log(`0x source serials:    ${zero.join(',')}`);
console.log(`0.25x source serials: ${quarter.join(',')}`);
console.log(`1x source serials:    ${one.join(',')}`);
console.log('C = Corrupt is actually composited on that render frame');
