import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const parametersPath = path.join(root, 'src-tauri', 'src', 'parameters.rs');
const contractPath = path.join(root, 'src-tauri', 'src', 'legacy_parameter_contract.json');

const source = fs.readFileSync(parametersPath, 'utf8');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const blockPattern = /ParameterDefinition\s*\{([\s\S]*?)\n\s*\}(?:,|\n\s*\]\))/g;

function capture(block, pattern) {
  return block.match(pattern)?.[1] ?? null;
}

function parseNumberField(block, field) {
  const value = capture(block, new RegExp(`${field}:\\s*Some\\(([-0-9.]+)\\)`));
  return value == null ? null : Number(value);
}

function parseDefault(block) {
  const jsonValue = capture(block, /default:\s*serde_json::json!\((.*?)\),/s);
  if (jsonValue != null) return JSON.parse(jsonValue.trim());
  const boolValue = capture(block, /default:\s*serde_json::Value::Bool\((true|false)\)/);
  if (boolValue != null) return boolValue === 'true';
  const stringValue = capture(block, /default:\s*serde_json::Value::String\("([^"]+)"\.into\(\)\)/);
  if (stringValue != null) return stringValue;
  throw new Error(`Could not parse default from block:\n${block.slice(0, 240)}`);
}

function parseOptions(block) {
  const body = capture(block, /options:\s*vec!\[(.*?)\],/s);
  if (body == null) return [];
  return [...body.matchAll(/"([^"]+)"\.into\(\)/g)].map((match) => match[1]);
}

const registry = [];
for (const match of source.matchAll(blockPattern)) {
  const block = match[1];
  registry.push({
    canonicalId: capture(block, /id:\s*"([^"]+)"/),
    legacyId: capture(block, /legacy_id:\s*"([^"]+)"/),
    kind: capture(block, /kind:\s*ParameterKind::(\w+)/)?.toLowerCase(),
    default: parseDefault(block),
    min: parseNumberField(block, 'min'),
    max: parseNumberField(block, 'max'),
    step: parseNumberField(block, 'step'),
    options: parseOptions(block),
  });
}

function equivalent(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return Math.abs(left - right) <= 1e-7;
  return JSON.stringify(left) === JSON.stringify(right);
}

const byId = new Map(registry.map((entry) => [entry.canonicalId, entry]));
const mismatches = [];
for (const legacy of contract.parameters) {
  const native = byId.get(legacy.canonicalId);
  if (!native) {
    mismatches.push(`${legacy.canonicalId}: missing from native registry`);
    continue;
  }
  for (const field of ['legacyId', 'kind', 'default', 'min', 'max', 'step', 'options']) {
    if (!equivalent(native[field], legacy[field])) {
      mismatches.push(`${legacy.canonicalId}.${field}: native=${JSON.stringify(native[field])} legacy=${JSON.stringify(legacy[field])}`);
    }
  }
}

const legacyIds = new Set(contract.parameters.map((entry) => entry.canonicalId));
const nativeOnly = registry.filter((entry) => !legacyIds.has(entry.canonicalId)).map((entry) => entry.canonicalId);

if (contract.parameterCount !== contract.parameters.length) {
  mismatches.push(`contract parameterCount=${contract.parameterCount} but parameters.length=${contract.parameters.length}`);
}

if (mismatches.length) {
  console.error(`HUFF parity validation failed with ${mismatches.length} mismatch(es):`);
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exit(1);
}

console.log(`HUFF parity contract exact: ${contract.parameters.length}/${contract.parameters.length}`);
console.log(`Native registry parameters: ${registry.length}`);
console.log(`Native-only parameters: ${nativeOnly.length}`);
for (const id of nativeOnly) console.log(`- ${id}`);
