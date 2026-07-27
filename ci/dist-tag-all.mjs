#!/usr/bin/env node
// Moves an npm dist-tag across every publishable @memberjunction workspace package,
// then verifies the move. LTS process doc §4.2 (PR #3241): the `latest` flip at
// certification must cover all packages with post-move assertions — a partial
// move is worse than no move, and on npm ≤ 10 a bare publish can drag `latest`
// backward, so tags are always managed explicitly.
//
// Usage:
//   node ci/dist-tag-all.mjs --version 5.50.1 --tag latest [--dry-run]
//        [--registry URL] [--concurrency 8] [--scope @memberjunction]
//
// The scratch-scope drill from the doc: point --registry at a scratch registry
// (or --scope at a scratch org) and run with --dry-run off.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const execFileP = promisify(execFile);
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2000;
const RX_VERSION = /^\d+\.\d+\.\d+(-edge\.\d+)?$/;
const RX_TAG = /^[a-z][a-z0-9.-]*$/;

export function parseCliArgs(argv) {
  const args = { version: null, tag: null, dryRun: false, registry: null, concurrency: 8, scope: '@memberjunction' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--version') args.version = argv[++i];
    else if (a === '--tag') args.tag = argv[++i];
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--registry') args.registry = argv[++i];
    else if (a === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (a === '--scope') args.scope = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!args.version || !RX_VERSION.test(args.version)) {
    throw new Error('--version is required and must be X.Y.Z or X.Y.Z-edge.N');
  }
  if (!args.tag || !RX_TAG.test(args.tag) || RX_VERSION.test(args.tag)) {
    throw new Error('--tag is required and must be a dist-tag name, not a version');
  }
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 32) {
    throw new Error('--concurrency must be an integer between 1 and 32');
  }
  return args;
}

// Workspace globs in this repo are exact paths or single-level `dir/*` patterns.
function expandPattern(rootDir, pattern) {
  if (!pattern.endsWith('/*')) {
    const dir = join(rootDir, pattern);
    return existsSync(dir) && statSync(dir).isDirectory() ? [dir] : [];
  }
  const parent = join(rootDir, pattern.slice(0, -2));
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(parent, e.name));
}

export function collectWorkspacePackages(rootDir, scope) {
  const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  const names = new Set();
  for (const pattern of rootPkg.workspaces ?? []) {
    for (const dir of expandPattern(rootDir, pattern)) {
      const pkgPath = join(dir, 'package.json');
      if (!existsSync(pkgPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.private === true) continue;
      if (typeof pkg.name !== 'string' || !pkg.name.startsWith(`${scope}/`)) continue;
      names.add(pkg.name);
    }
  }
  return [...names].sort();
}

export function buildPlan(names, version) {
  return names.map((name) => ({ name, spec: `${name}@${version}` }));
}

export function parseDistTagLs(output) {
  const tags = {};
  for (const line of output.split('\n')) {
    const m = line.match(/^([^:\s]+):\s*(\S+)$/);
    if (m) tags[m[1]] = m[2];
  }
  return tags;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry(fn, attempts = MAX_ATTEMPTS, baseDelayMs = RETRY_BASE_MS, sleep = defaultSleep) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await sleep(baseDelayMs * attempt);
    }
  }
  throw lastError;
}

export async function runPool(items, worker, concurrency) {
  const queue = [...items];
  const results = [];
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  });
  await Promise.all(lanes);
  return results;
}

function npmArgs(parts, registry) {
  return registry ? [...parts, '--registry', registry] : parts;
}

async function moveOne(item, tag, registry) {
  try {
    await withRetry(() => execFileP('npm', npmArgs(['dist-tag', 'add', item.spec, tag], registry)));
    return { name: item.name, ok: true };
  } catch (err) {
    return { name: item.name, ok: false, error: err.stderr?.trim() || err.message };
  }
}

async function verifyOne(item, tag, version, registry) {
  try {
    const { stdout } = await withRetry(() => execFileP('npm', npmArgs(['dist-tag', 'ls', item.name], registry)));
    const actual = parseDistTagLs(stdout)[tag];
    if (actual === version) return { name: item.name, ok: true };
    return { name: item.name, ok: false, error: `expected ${tag} → ${version}, found ${actual ?? '(unset)'}` };
  } catch (err) {
    return { name: item.name, ok: false, error: err.stderr?.trim() || err.message };
  }
}

function report(stage, results) {
  const failures = results.filter((r) => !r.ok);
  console.log(`${stage}: ${results.length - failures.length}/${results.length} ok`);
  for (const f of failures) console.error(`FAIL ${stage} ${f.name}: ${f.error}`);
  return failures.length;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const names = collectWorkspacePackages(process.cwd(), args.scope);
  if (names.length === 0) throw new Error(`no publishable ${args.scope}/* packages found — run from the repo root`);
  const plan = buildPlan(names, args.version);
  console.log(`Moving dist-tag "${args.tag}" → ${args.version} on ${plan.length} packages${args.registry ? ` (registry ${args.registry})` : ''}`);
  if (args.dryRun) {
    for (const item of plan) console.log(`dry-run: npm dist-tag add ${item.spec} ${args.tag}`);
    return;
  }
  const moved = await runPool(plan, (item) => moveOne(item, args.tag, args.registry), args.concurrency);
  const moveFailures = report('move', moved);
  const verified = await runPool(plan, (item) => verifyOne(item, args.tag, args.version, args.registry), args.concurrency);
  const verifyFailures = report('verify', verified);
  if (moveFailures + verifyFailures > 0) {
    console.error(`Tag state is inconsistent — re-run this script until both passes are clean.`);
    process.exit(1);
  }
  console.log(`All ${plan.length} packages: ${args.tag} → ${args.version}, verified.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`FAIL ${err.message}`);
    process.exit(1);
  });
}
