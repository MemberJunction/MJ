#!/usr/bin/env node
// derive_t3_lag.mjs <T3 seed dir> <outDir> — copies truth.csv and truth_origins.csv, writes rows.csv without SamePeriodTarget,
// and updates manifest.json with id: "T3-lag", derivedFrom: "T3", droppedColumns: ["SamePeriodTarget"].
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const t3Dir = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3]);
mkdirSync(outDir, { recursive: true });

copyFileSync(path.join(t3Dir, 'truth.csv'), path.join(outDir, 'truth.csv'));
copyFileSync(path.join(t3Dir, 'truth_origins.csv'), path.join(outDir, 'truth_origins.csv'));

const lines = readFileSync(path.join(t3Dir, 'rows.csv'), 'utf8').trimEnd().split('\n');
const header = lines[0].split(',');
const dropIdx = header.indexOf('SamePeriodTarget');
if (dropIdx === -1) throw new Error('SamePeriodTarget column not found in T3 rows.csv');
const stripped = lines.map((line) => {
  const parts = line.split(',');
  parts.splice(dropIdx, 1);
  return parts.join(',');
});
writeFileSync(path.join(outDir, 'rows.csv'), `${stripped.join('\n')}\n`);

const manifest = JSON.parse(readFileSync(path.join(t3Dir, 'manifest.json'), 'utf8'));
manifest.id = 'T3-lag';
manifest.derivedFrom = 'T3';
manifest.droppedColumns = ['SamePeriodTarget'];
if (manifest.columns?.features) {
  manifest.columns.features = manifest.columns.features.filter((c) => c !== 'SamePeriodTarget');
}
if (manifest.columns?.traps) {
  manifest.columns.traps = manifest.columns.traps.filter((c) => c !== 'SamePeriodTarget');
}
if (Array.isArray(manifest.traps)) {
  manifest.traps = manifest.traps.filter((t) => t.column !== 'SamePeriodTarget');
}
writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('T3-lag', lines.length - 1);
