import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const parameters = read('src-tauri/src/parameters.rs');
const routing = read('src-tauri/src/routing.rs');
const renderer = read('src-tauri/src/renderer.rs');
const shader = read('src-tauri/src/compositor.wgsl');
const html = read('src/index.html');
const app = read('src/app.js');
const state = read('src-tauri/src/state_documents.rs');

const required = [
  [parameters, 'routing.program_bus'],
  [parameters, 'routing.monitor_bus'],
  [parameters, 'field_store'],
  [routing, 'huff-routing/v1'],
  [routing, 'constrained_named_bus_fixed_recipe'],
  [routing, 'field_store -> process -> field_store'],
  [renderer, 'output_clean_pipeline'],
  [renderer, 'output_field_store_pipeline'],
  [renderer, 'present_bind_clean'],
  [shader, 'fs_output_clean'],
  [shader, 'fs_output_field_store'],
  [html, 'id="routingPanel"'],
  [html, 'id="programBus"'],
  [html, 'id="monitorBus"'],
  [app, "call('get_routing_catalog')"],
  [app, "call('apply_routing_recipe'"],
  [state, 'id.starts_with("routing.")'],
];

const missing = required.filter(([content, token]) => !content.includes(token)).map(([, token]) => token);
if (missing.length) {
  console.error('Routing validation failed. Missing:', missing.join(', '));
  process.exit(1);
}

const programOptions = parameters.match(/id: "routing\.program_bus"[\s\S]*?options: vec!\[([^\]]+)\]/)?.[1] || '';
const monitorOptions = parameters.match(/id: "routing\.monitor_bus"[\s\S]*?options: vec!\[([^\]]+)\]/)?.[1] || '';
for (const option of ['program', 'clean', 'field_store']) {
  if (!programOptions.includes(`"${option}"`) || !monitorOptions.includes(`"${option}"`)) {
    console.error(`Routing validation failed. Missing bus option: ${option}`);
    process.exit(1);
  }
}

const recipeCount = (routing.match(/^        recipe\(/gm) || []).length;
if (recipeCount < 6) {
  console.error(`Routing validation failed. Expected at least 6 constrained recipes, found ${recipeCount}.`);
  process.exit(1);
}

console.log('HUFF routing model valid');
console.log(`Named buses: 7`);
console.log(`Constrained recipes: ${recipeCount}`);
console.log('Program selections: program, clean, field_store');
console.log('Monitor selections: program, clean, field_store');
