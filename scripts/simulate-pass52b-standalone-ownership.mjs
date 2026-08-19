import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const canvas = fs.readFileSync(path.join(root, 'src', 'canvas.js'), 'utf8');
function extract(name) {
  const start = canvas.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing ${name}`);
  const brace = canvas.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < canvas.length; i++) {
    if (canvas[i] === '{') depth++;
    else if (canvas[i] === '}') {
      depth--;
      if (!depth) return canvas.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}
const ctx = {};
vm.createContext(ctx);
vm.runInContext([
  extract('_feedbackActuallyOwnsBuffer'),
  extract('_symmetryShouldReadCleanLiveSource'),
  extract('_solarizeShouldReadCleanLiveSource'),
  'this.sym = _symmetryShouldReadCleanLiveSource;',
  'this.sol = _solarizeShouldReadCleanLiveSource;',
].join('\n'), ctx);

const empty = {glitch:false,scanlines:false,luma:false,globalMix:false,feedback:false,flow:false,symmetry:false,solarize:false};
const F=(activity, enabled=false)=>({activity:{...empty,...activity},state:{feedbackEnabled:enabled}});
const cases = [
  ['Symmetry only, Feedback disabled but amount nonzero', F({symmetry:true,feedback:true}, false), true, false],
  ['Solarize only, Feedback disabled but amount nonzero', F({solarize:true,feedback:true}, false), false, true],
  ['Symmetry + Solarize, Feedback disabled', F({symmetry:true,solarize:true,feedback:true}, false), true, false],
  ['Symmetry + real Feedback', F({symmetry:true,feedback:true}, true), false, false],
  ['Solarize + real Feedback', F({solarize:true,feedback:true}, true), false, false],
  ['Symmetry + Flow', F({symmetry:true,flow:true}, false), false, false],
  ['Solarize + Flow', F({solarize:true,flow:true}, false), false, false],
];
for (const [name, frame, symExpected, solExpected] of cases) {
  const sym = ctx.sym(frame);
  const sol = ctx.sol(frame);
  if (sym !== symExpected || sol !== solExpected) {
    throw new Error(`${name}: expected sym=${symExpected}, sol=${solExpected}; got sym=${sym}, sol=${sol}`);
  }
  console.log(`${name}: sym-live=${sym ? 'YES':'NO'} solar-live=${sol ? 'YES':'NO'}`);
}
console.log('HUFF Classic Pass 52B standalone ownership simulation PASS');
