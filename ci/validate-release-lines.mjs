#!/usr/bin/env node
// Authoritative CI validator for release-lines.json (LTS process doc §4.1/§8, PR #3241).
//
// Modes:
//   node ci/validate-release-lines.mjs                          structural validation only
//   node ci/validate-release-lines.mjs --base REF --mode pr     + status-transition legality vs the file at REF
//   node ci/validate-release-lines.mjs --base REF --mode push   + protected-field freeze vs the file at REF
//
// "push" mode enforces §8: on a direct push, only mechanical fields may change
// (edge.newest, lines.*.newest, lines.*.releases). Status transitions, dates,
// certifiedBuild, platform manifests, and line additions/removals require a PR.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const LINE_STATUSES = ['candidate', 'certified', 'maintenance', 'eol', 'withdrawn'];
export const DB_IMPACTS = ['none', 'metadata', 'schema'];
export const UPGRADE_IMPACTS = ['none', 'config', 'breaking'];

const RX = {
  era: /^\d+$/,
  line: /^\d+\.\d+$/,
  version: /^\d+\.\d+\.\d+$/,
  edgeVersion: /^\d+\.\d+\.\d+-edge\.\d+$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
};

// candidate → certified | withdrawn · certified → maintenance · maintenance → eol
const LEGAL_TRANSITIONS = {
  candidate: ['certified', 'withdrawn'],
  certified: ['maintenance'],
  maintenance: ['eol'],
  eol: [],
  withdrawn: [],
};

// Fields the publish workflows may append via direct push (§4.1). Everything else is PR-only.
const MECHANICAL_LINE_FIELDS = ['newest', 'releases'];

export function validateStructure(doc) {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return ['root: must be a JSON object'];
  }
  const errors = [];
  const known = new Set(['$schema', 'edge', 'eras', 'lines']);
  for (const key of ['edge', 'eras', 'lines']) {
    if (!(key in doc)) errors.push(`root: missing required key "${key}"`);
  }
  for (const key of Object.keys(doc)) {
    if (!known.has(key)) errors.push(`root: unknown key "${key}"`);
  }
  if (doc.edge !== undefined) errors.push(...validateEdge(doc.edge));
  if (doc.eras !== undefined) errors.push(...validateEras(doc.eras));
  if (doc.lines !== undefined) errors.push(...validateLines(doc.lines));
  return errors;
}

function validateEdge(edge) {
  if (typeof edge !== 'object' || edge === null) return ['edge: must be an object'];
  const errors = [];
  for (const key of Object.keys(edge)) {
    if (key !== 'newest') errors.push(`edge: unknown key "${key}"`);
  }
  if (!('newest' in edge)) {
    errors.push('edge: missing required key "newest"');
  } else if (edge.newest !== null && !RX.edgeVersion.test(edge.newest)) {
    errors.push(`edge.newest: "${edge.newest}" must be null or an X.Y.Z-edge.N version`);
  }
  return errors;
}

function validateEras(eras) {
  if (typeof eras !== 'object' || eras === null) return ['eras: must be an object'];
  const errors = [];
  if (Object.keys(eras).length === 0) errors.push('eras: at least one era is required');
  for (const [key, era] of Object.entries(eras)) {
    if (!RX.era.test(key)) {
      errors.push(`eras: key "${key}" is not a major version`);
      continue;
    }
    const platform = era === null || typeof era !== 'object' ? null : era.platform;
    if (typeof platform !== 'object' || platform === null || Object.keys(platform).length === 0) {
      errors.push(`eras.${key}.platform: required, with at least one pin`);
      continue;
    }
    for (const [pin, value] of Object.entries(platform)) {
      if (typeof value !== 'string' || value.length === 0) {
        errors.push(`eras.${key}.platform.${pin}: must be a non-empty string`);
      }
    }
  }
  return errors;
}

function validateLines(lines) {
  if (typeof lines !== 'object' || lines === null) return ['lines: must be an object'];
  const errors = [];
  for (const [key, line] of Object.entries(lines)) {
    if (!RX.line.test(key)) {
      errors.push(`lines: key "${key}" is not an X.Y line`);
      continue;
    }
    if (typeof line !== 'object' || line === null) {
      errors.push(`lines.${key}: must be an object`);
      continue;
    }
    errors.push(...validateLine(key, line));
  }
  return errors;
}

function validateLine(key, line) {
  const errors = [];
  const known = new Set([
    'status', 'certifiedBuild', 'newest', 'candidateDate', 'certifiedDate',
    'supportEnds', 'upgradeImpact', 'releases', 'scorecard',
  ]);
  for (const k of Object.keys(line)) {
    if (!known.has(k)) errors.push(`lines.${key}: unknown key "${k}"`);
  }
  if (!LINE_STATUSES.includes(line.status)) {
    errors.push(`lines.${key}.status: must be one of ${LINE_STATUSES.join(' | ')}`);
  }
  for (const f of ['certifiedBuild', 'newest']) {
    if (f in line && !RX.version.test(line[f])) {
      errors.push(`lines.${key}.${f}: "${line[f]}" is not an X.Y.Z version`);
    } else if (f in line && !String(line[f]).startsWith(`${key}.`)) {
      errors.push(`lines.${key}.${f}: ${line[f]} is not on line ${key}`);
    }
  }
  for (const f of ['candidateDate', 'certifiedDate', 'supportEnds']) {
    if (f in line && !RX.date.test(line[f])) {
      errors.push(`lines.${key}.${f}: "${line[f]}" is not a YYYY-MM-DD date`);
    }
  }
  if ('upgradeImpact' in line && !UPGRADE_IMPACTS.includes(line.upgradeImpact)) {
    errors.push(`lines.${key}.upgradeImpact: must be one of ${UPGRADE_IMPACTS.join(' | ')}`);
  }
  if ('scorecard' in line && (typeof line.scorecard !== 'string' || line.scorecard.length === 0)) {
    errors.push(`lines.${key}.scorecard: must be a non-empty string`);
  }
  errors.push(...validateLineReleases(key, line.releases));
  errors.push(...validateCertifiedRequirements(key, line));
  return errors;
}

function validateLineReleases(key, releases) {
  if (releases === undefined) return [];
  if (typeof releases !== 'object' || releases === null) return [`lines.${key}.releases: must be an object`];
  const errors = [];
  for (const [version, entry] of Object.entries(releases)) {
    if (!RX.version.test(version) || !version.startsWith(`${key}.`)) {
      errors.push(`lines.${key}.releases: "${version}" is not an X.Y.Z version on line ${key}`);
      continue;
    }
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`lines.${key}.releases.${version}: must be an object`);
      continue;
    }
    for (const k of Object.keys(entry)) {
      if (k !== 'dbImpact' && k !== 'labels') errors.push(`lines.${key}.releases.${version}: unknown key "${k}"`);
    }
    if (!DB_IMPACTS.includes(entry.dbImpact)) {
      errors.push(`lines.${key}.releases.${version}.dbImpact: must be one of ${DB_IMPACTS.join(' | ')}`);
    }
    if ('labels' in entry && (!Array.isArray(entry.labels) || entry.labels.some((l) => typeof l !== 'string'))) {
      errors.push(`lines.${key}.releases.${version}.labels: must be an array of strings`);
    }
  }
  return errors;
}

function validateCertifiedRequirements(key, line) {
  if (!['certified', 'maintenance', 'eol'].includes(line.status)) return [];
  const errors = [];
  for (const f of ['certifiedBuild', 'certifiedDate', 'scorecard']) {
    if (!(f in line)) errors.push(`lines.${key}: status "${line.status}" requires "${f}"`);
  }
  return errors;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function stripMechanical(line) {
  const copy = { ...line };
  for (const f of MECHANICAL_LINE_FIELDS) delete copy[f];
  return copy;
}

export function checkPushFreeze(base, head) {
  const errors = [];
  if (stableStringify(base.eras) !== stableStringify(head.eras)) {
    errors.push('push: eras/platform manifests changed — platform changes require a PR');
  }
  const baseLines = base.lines ?? {};
  const headLines = head.lines ?? {};
  for (const key of Object.keys(headLines)) {
    if (!(key in baseLines)) errors.push(`push: line ${key} added — new lines require a PR`);
  }
  for (const key of Object.keys(baseLines)) {
    if (!(key in headLines)) {
      errors.push(`push: line ${key} removed — lines are never deleted`);
      continue;
    }
    if (stableStringify(stripMechanical(baseLines[key])) !== stableStringify(stripMechanical(headLines[key]))) {
      errors.push(`push: protected fields changed on line ${key} — status/dates/certifiedBuild/scorecard changes require a PR`);
    }
  }
  return errors;
}

export function checkPrTransitions(base, head) {
  const errors = [];
  const baseLines = base.lines ?? {};
  const headLines = head.lines ?? {};
  for (const key of Object.keys(baseLines)) {
    if (!(key in headLines)) {
      errors.push(`pr: line ${key} removed — lines are never deleted (use status eol or withdrawn)`);
      continue;
    }
    errors.push(...checkLineTransition(key, baseLines[key], headLines[key]));
  }
  for (const key of Object.keys(headLines)) {
    if (!(key in baseLines) && headLines[key].status !== 'candidate') {
      errors.push(`pr: new line ${key} must start as "candidate", not "${headLines[key].status}"`);
    }
  }
  return errors;
}

function checkLineTransition(key, before, after) {
  const errors = [];
  if (before.status !== after.status) {
    const legal = LEGAL_TRANSITIONS[before.status] ?? [];
    if (!legal.includes(after.status)) {
      errors.push(`pr: lines.${key}.status: illegal transition ${before.status} → ${after.status}`);
    }
  }
  for (const f of ['certifiedBuild', 'candidateDate', 'certifiedDate']) {
    if (f in before && before[f] !== after[f]) {
      errors.push(`pr: lines.${key}.${f}: immutable once set ("${before[f]}" → "${after[f]}")`);
    }
  }
  if ('supportEnds' in before && !('supportEnds' in after)) {
    errors.push(`pr: lines.${key}.supportEnds: cannot be removed — windows are extend-only`);
  } else if ('supportEnds' in before && after.supportEnds < before.supportEnds) {
    errors.push(`pr: lines.${key}.supportEnds: windows are extend-only ("${before.supportEnds}" → "${after.supportEnds}")`);
  }
  return errors;
}

export function parseCliArgs(argv) {
  const args = { file: 'release-lines.json', base: null, mode: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i];
    else if (a === '--base') args.base = argv[++i];
    else if (a === '--mode') args.mode = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.base && !['pr', 'push'].includes(args.mode)) {
    throw new Error('--base requires --mode pr|push');
  }
  return args;
}

function loadAtRef(ref, file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null; // file does not exist at ref — caller reports it
  }
}

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const head = JSON.parse(readFileSync(args.file, 'utf8'));
  const errors = validateStructure(head);
  if (args.base) {
    const baseRaw = loadAtRef(args.base, args.file);
    if (baseRaw === null) {
      console.log(`note: ${args.file} does not exist at ${args.base} — structural checks only`);
    } else {
      const base = JSON.parse(baseRaw);
      errors.push(...(args.mode === 'push' ? checkPushFreeze(base, head) : checkPrTransitions(base, head)));
    }
  }
  if (errors.length > 0) {
    for (const e of errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log(`OK ${args.file} valid${args.base ? ` (${args.mode} checks vs ${args.base})` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
