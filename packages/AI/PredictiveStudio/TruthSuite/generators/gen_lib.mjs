// probes/scenarios/gen_lib.mjs — Loom-backed primitives for planted scenarios
import fs from 'node:fs';
import { engine } from './loom.mjs';
export const { createRng, IdentityService } = engine;
export function ids(ns, seed) { const s = new IdentityService(); s.RegisterNamespace('ps-scenarios', ns); return (kind, parts) => s.MintId('ps-scenarios', kind, [`S${seed}`, ...parts]); }
export function writeCsv(file, cols, rows) {
  const esc = v => (v === null || v === undefined) ? '' : (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
  fs.writeFileSync(file, [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n') + '\n');
}
export const sigmoid = z => 1 / (1 + Math.exp(-z));
export function round(x, d = 6) { const f = 10 ** d; return Math.round(x * f) / f; }
