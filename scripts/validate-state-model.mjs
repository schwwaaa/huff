import fs from 'node:fs';

const parameters = fs.readFileSync('src-tauri/src/parameters.rs', 'utf8');
const stateModel = fs.readFileSync('src-tauri/src/state_documents.rs', 'utf8');
const main = fs.readFileSync('src-tauri/src/main.rs', 'utf8');
const app = fs.readFileSync('src/app.js', 'utf8');
const html = fs.readFileSync('src/index.html', 'utf8');

const canonicalIds = [...parameters.matchAll(/ParameterDefinition\s*\{[\s\S]*?\bid:\s*"([^"]+)"\.into\(\),/g)]
  .map((match) => match[1]);
const uniqueIds = new Set(canonicalIds);
const requiredDomains = ['Look', 'Source', 'Temporal', 'Routing', 'Render'];
const requiredKinds = ['Preset', 'Snapshot', 'Sequence', 'Project'];
const requiredCommands = [
  'get_state_model_catalog',
  'export_state_model_catalog',
  'save_state_document',
  'load_state_document',
];
const requiredUiIds = [
  'stateDocumentName', 'stateDocumentKind', 'stateSaveBtn', 'stateLoadBtn',
  'stateModelExportBtn', 'stateScopeLook', 'stateScopeSource', 'stateScopeTemporal',
  'stateScopeRouting', 'stateScopeRender', 'stateScopeTransport',
  'stateScopeAutomation', 'stateScopeMaps', 'stateScopePixels',
];

const failures = [];
if (!stateModel.includes('huff-state/v1')) failures.push('missing huff-state/v1 schema');
if (uniqueIds.size !== 100) failures.push(`expected 100 canonical parameters, found ${uniqueIds.size}`);
for (const domain of requiredDomains) if (!stateModel.includes(`${domain},`)) failures.push(`missing state domain ${domain}`);
for (const kind of requiredKinds) if (!stateModel.includes(`${kind},`)) failures.push(`missing state document kind ${kind}`);
for (const command of requiredCommands) {
  if (!main.includes(`fn ${command}`)) failures.push(`missing Rust command ${command}`);
  if (!main.includes(`            ${command},`)) failures.push(`command not registered: ${command}`);
  if (!app.includes(`'${command}'`)) failures.push(`frontend does not call ${command}`);
}
for (const id of requiredUiIds) if (!html.includes(`id="${id}"`)) failures.push(`missing UI id ${id}`);
if (!stateModel.includes('Persistent GPU pixels are intentionally separate')) failures.push('persistent image separation policy missing');
if (!stateModel.includes('pub sequenceable: bool')) failures.push('sequenceability metadata missing');
if (!stateModel.includes('pub live_safety: ParameterLiveSafety')) failures.push('live-safety metadata missing');
if (!stateModel.includes('pub interpolation_policy: ParameterInterpolationPolicy')) failures.push('interpolation metadata missing');

if (failures.length) {
  console.error('HUFF state-model validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('HUFF state model valid: huff-state/v1');
console.log(`Canonical parameters classified: ${uniqueIds.size}`);
console.log('Document kinds: preset, snapshot, sequence, project');
console.log('Persistent GPU pixels: explicitly separate / not embedded');
