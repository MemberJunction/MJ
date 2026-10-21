#!/usr/bin/env node
// import-gates.mjs <path to ps-rebuild-plans/reference/gates.json> — writes gates/gates.json with the registry fields.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const PHASE0_MODE = { 'G0.2': 'nightly', 'G0.6': 'weekly' };

const registry = source.map((g) => {
  const runMode = g.phase === 0
    ? (PHASE0_MODE[g.gateId] || 'pr')
    : (g.statRule !== null || g.dataset === 'W8' ? 'weekly' : 'nightly');
  const requires = g.gateId === 'G0.6' ? ['live-model'] : g.dataset === 'W8' ? ['sidecar-16gb'] : g.ownerPR === 1 ? ['bizapps-common'] : [];
  // The reference file is camelCase; the registry is a new shape with PascalCase members, mapped once here.
  return {
    GateID: g.gateId, Phase: g.phase, OwnerPR: g.ownerPR, Dataset: g.dataset, Criterion: g.criterion,
    Threshold: g.threshold, Plain: g.plain, Today: g.today, RTest: g.rTest, TestName: g.testName,
    StatRule: g.statRule, AmendedBy: g.amendedBy, P11Threshold: g.p11Threshold,
    Status: 'expected-fail', RunMode: runMode, Requires: requires, Implementation: { Kind: 'stub' },
  };
});
mkdirSync(path.join(root, 'gates'), { recursive: true });
writeFileSync(path.join(root, 'gates', 'gates.json'), `${JSON.stringify(registry, null, 2)}\n`);
console.log(`wrote ${registry.length} gates`);
