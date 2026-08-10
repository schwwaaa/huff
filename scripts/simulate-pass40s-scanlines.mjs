function step(state, cfg, dt = 1/60) {
  const speed = Math.max(0, Number(cfg.speed) || 0);
  state.phX += speed * 0.008;
  state.phY += speed * 0.009;

  state.x += (Number(cfg.moveX) || 0) * speed * dt;
  state.y += (Number(cfg.moveY) || 0) * speed * dt;

  const moveZ = Number(cfg.moveZ) || 0;
  if (moveZ !== 0 && speed > 0) {
    let nz = (Number(cfg.baseZoom) || 1) + state.zoomOffset + moveZ * speed * dt * state.zDir;
    while (nz > 4 || nz < 0.25) {
      if (nz > 4) { nz = 8 - nz; state.zDir *= -1; }
      if (nz < 0.25) { nz = 0.5 - nz; state.zDir *= -1; }
    }
    state.zoomOffset = nz - (Number(cfg.baseZoom) || 1);
  }

  if (cfg.spinRight) state.spin = (state.spin + (Number(cfg.spinSpeed) || 0) * speed * 0.5) % 360;
  else if (cfg.spinLeft) state.spin = ((state.spin - (Number(cfg.spinSpeed) || 0) * speed * 0.5) % 360 + 360) % 360;
  return state;
}

function runFrames(cfg, frames) {
  const state = { phX:0, phY:2000, x:0, y:0, zoomOffset:0, zDir:1, spin:0 };
  for (let i=0;i<frames;i++) step(state,cfg);
  return state;
}

const scenarios = [
  ['stable 0x', {speed:0, moveX:250, moveY:-125, moveZ:1, spinRight:true, spinSpeed:2}],
  ['slow 0.05x', {speed:0.05, moveX:250, moveY:-125, moveZ:0.2, spinRight:true, spinSpeed:2}],
  ['original 1x', {speed:1, moveX:0, moveY:0, moveZ:0, spinRight:true, spinSpeed:1}],
  ['fast 4x', {speed:4, moveX:250, moveY:-125, moveZ:0.2, spinRight:true, spinSpeed:2}],
];

console.log('HUFF Classic Pass 40S — Scanlines motion simulation (60 frames)');
for (const [name,cfg] of scenarios) {
  const s=runFrames(cfg,60);
  console.log(`${name.padEnd(14)} phX=${s.phX.toFixed(4)} phY=${s.phY.toFixed(4)} x=${s.x.toFixed(2)} y=${s.y.toFixed(2)} zoom=${((Number(cfg.baseZoom)||1)+s.zoomOffset).toFixed(3)} spin=${s.spin.toFixed(2)}°`);
}
console.log('\nAt SPEED 0x, geometry/motion state is unchanged while the renderer still executes every frame, so live video can continue inside held slices.');
