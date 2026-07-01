#!/usr/bin/env node
// Zero-dependency, file-backed state store for the autodev engine (phase 1: autonomous quality).
// Standalone: no MemberJunction, no npm dependencies. Requires Node 18+.
//
// The investigation log is JSONL (one record per line). Records are keyed by `id`;
// when the same id appears multiple times, the LAST line wins (cheap append-to-update).
//
// Usage:
//   node state.mjs lock-acquire            -> ACQUIRED | LOCKED
//   node state.mjs lock-release            -> RELEASED
//   node state.mjs seen <candidateKey>     -> SEEN <status> <id> | NEW
//   node state.mjs record '<json>'         -> <id>   (json may also come via stdin)
//   node state.mjs list [--status s] [--source x]
//   node state.mjs digest

import {
  readFileSync, writeFileSync, appendFileSync, existsSync,
  mkdirSync, unlinkSync, statSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');                  // autodev/
const LOG_DIR = join(ROOT, 'log');
const LOG_FILE = join(LOG_DIR, 'investigations.jsonl');
const LOCK_FILE = join(LOG_DIR, '.tick.lock');
const LOCK_STALE_MS = 6 * 60 * 60 * 1000;            // a lock older than 6h is presumed dead

function ensure() {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  if (!existsSync(LOG_FILE)) writeFileSync(LOG_FILE, '');
}

// Read all records, deduped by id (latest line wins). Returns insertion-ordered array.
function readAll() {
  ensure();
  const byId = new Map();
  for (const line of readFileSync(LOG_FILE, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t);
      if (r && r.id) byId.set(r.id, r);
    } catch {
      /* skip malformed lines rather than crash the tick */
    }
  }
  return [...byId.values()];
}

function readJsonArg(args) {
  const inline = args.find((a) => a.trim().startsWith('{'));
  if (inline) return JSON.parse(inline);
  return JSON.parse(readFileSync(0, 'utf8'));        // stdin (fd 0)
}

function lockAcquire() {
  ensure();
  if (existsSync(LOCK_FILE)) {
    const age = Date.now() - statSync(LOCK_FILE).mtimeMs;
    if (age < LOCK_STALE_MS) return 'LOCKED';
    // stale lock — steal it
  }
  writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  return 'ACQUIRED';
}

function lockRelease() {
  if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
  return 'RELEASED';
}

function seen(key) {
  if (!key) return 'NEW';
  const hit = readAll().find((r) => r.candidateKey === key);
  return hit ? `SEEN ${hit.status || 'unknown'} ${hit.id}` : 'NEW';
}

function record(args) {
  const incoming = readJsonArg(args);
  const all = readAll();
  const existing = incoming.id ? all.find((r) => r.id === incoming.id) : undefined;
  const now = new Date().toISOString();
  const merged = existing
    ? { ...existing, ...incoming, updatedAt: now }
    : { id: incoming.id || `inv_${randomUUID()}`, createdAt: now, updatedAt: now, ...incoming };
  if (!existing) merged.id = merged.id || `inv_${randomUUID()}`;
  appendFileSync(LOG_FILE, JSON.stringify(merged) + '\n');
  return merged.id;
}

function list(args) {
  const status = flagValue(args, '--status');
  const source = flagValue(args, '--source');
  let rows = readAll();
  if (status) rows = rows.filter((r) => r.status === status);
  if (source) rows = rows.filter((r) => r.source === source);
  return rows.map((r) =>
    `${r.id}  [${r.status || '?'}]  ${r.source || '?'}  ${r.candidateKey || ''}  ${(r.hypothesis || '').slice(0, 80)}`
  ).join('\n') || '(none)';
}

function digest() {
  const rows = readAll();
  const byStatus = {};
  const bySource = {};
  for (const r of rows) {
    byStatus[r.status || '?'] = (byStatus[r.status || '?'] || 0) + 1;
    bySource[r.source || '?'] = (bySource[r.source || '?'] || 0) + 1;
  }
  const openPRs = rows.filter((r) => r.status === 'pr-raised' && r.prUrl);
  const recentKeys = rows.slice(-25).map((r) => r.candidateKey).filter(Boolean);
  const blocked = rows.filter((r) => r.status === 'blocked' || r.phase);
  const out = [];
  out.push(`Total investigations: ${rows.length}`);
  out.push(`By status: ${JSON.stringify(byStatus)}`);
  out.push(`By source: ${JSON.stringify(bySource)}`);
  out.push(`Open PRs (status=pr-raised): ${openPRs.length}`);
  for (const p of openPRs) out.push(`  - ${p.id} ${p.prUrl}`);
  out.push(`In-flight / phased (need follow-up): ${blocked.length}`);
  for (const b of blocked.slice(0, 10)) out.push(`  - ${b.id} [${b.status}] phase=${b.phase || '-'} ${b.candidateKey || ''}`);
  out.push(`Recently touched candidateKeys (skip these): ${recentKeys.join(', ') || '(none)'}`);
  return out.join('\n');
}

function flagValue(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

// ---- dispatch ----
const [cmd, ...args] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'lock-acquire': process.stdout.write(lockAcquire() + '\n'); break;
    case 'lock-release': process.stdout.write(lockRelease() + '\n'); break;
    case 'seen': process.stdout.write(seen(args[0]) + '\n'); break;
    case 'record': process.stdout.write(record(args) + '\n'); break;
    case 'list': process.stdout.write(list(args) + '\n'); break;
    case 'digest': process.stdout.write(digest() + '\n'); break;
    default:
      process.stderr.write(
        'Unknown command. Use: lock-acquire | lock-release | seen | record | list | digest\n'
      );
      process.exit(2);
  }
} catch (err) {
  process.stderr.write(`state.mjs error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
}
