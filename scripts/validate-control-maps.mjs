import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const parametersSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'parameters.rs'), 'utf8');
const canonicalIds = new Set([...parametersSource.matchAll(/\bid:\s*"([^"]+)"\.into\(\)/g)].map((match) => match[1]));
const actions = new Set(['clear_buffers', 'flow_pulse', 'reset_parameters']);
const validBehaviors = new Set(['absolute', 'gate', 'toggle', 'trigger']);
const validCurves = new Set(['linear', 'smooth', 'square', 'cube', 'sqrt']);
const files = [
  path.join(root, 'control-maps', 'factory-midi.json'),
  path.join(root, 'control-maps', 'factory-osc.json'),
];
const problems = [];

for (const file of files) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  const label = path.relative(root, file);
  if (document.schema !== 'huff-control-map/v1') problems.push(`${label}: unsupported schema ${document.schema}`);
  if (!Array.isArray(document.mappings)) {
    problems.push(`${label}: mappings must be an array`);
    continue;
  }
  for (const [index, mapping] of document.mappings.entries()) {
    const prefix = `${label} mapping ${index + 1}`;
    if (!canonicalIds.has(mapping.target) && !actions.has(mapping.target)) problems.push(`${prefix}: unknown target ${mapping.target}`);
    if (!validBehaviors.has(mapping.behavior)) problems.push(`${prefix}: invalid behavior ${mapping.behavior}`);
    if (!validCurves.has(mapping.curve)) problems.push(`${prefix}: invalid curve ${mapping.curve}`);
    for (const field of ['smoothing', 'threshold']) {
      if (!Number.isFinite(mapping[field]) || mapping[field] < 0 || mapping[field] > 1) problems.push(`${prefix}: ${field} must be within 0..1`);
    }
  }
}

if (problems.length) {
  console.error(`HUFF control-map validation failed with ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log(`HUFF control maps valid: ${files.length} documents`);
console.log(`Canonical targets discovered: ${canonicalIds.size}`);
console.log(`Canonical actions: ${[...actions].join(', ')}`);
