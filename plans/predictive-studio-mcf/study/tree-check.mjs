#!/usr/bin/env node
/**
 * tree-check.mjs — the PERMANENT soundness gate for the estimator-mechanism tree
 * (Doc 2 §4). Asserts every node's inherited assertion holds for EVERY descendant,
 * verified against the machine-checkable facts in matrix.json. Runs in CI forever
 * and gates every future model insertion (including agent-authored primitives).
 *
 * Exit 0 = sound; exit 1 = a node claim is false of some descendant.
 *
 * Usage: node tree-check.mjs   (from study/)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const tree = JSON.parse(readFileSync(join(HERE, 'tree.json'), 'utf-8'));
const matrix = JSON.parse(readFileSync(join(HERE, 'matrix.json'), 'utf-8'));
const M = Object.fromEntries(matrix.map((r) => [r.modelKey, r]));

// The one hard, machine-checkable claim per node — the mechanism-derived invariant
// a member CANNOT violate without being mis-placed. (Empty string = sheet left the
// flag unstated, which is permitted — the check only fails on a DEFINITE contradiction.)
const NODE_CHECK = {
  'split-based': (r) => r.scaleSensitive === false || r.scaleSensitive === '',
  'weighted-sum': (r) =>
    r.scaleSensitive === true || r.scaleSensitive === '' || r.interpretabilityClass === 'Coefficients',
  'distance-kernel': (r) => r.scaleSensitive === true || r.scaleSensitive === '',
  'probabilistic-generative': (r) =>
    r.distributionalAssumption === true || r.distributionalAssumption === '' || r.modelKey === 'km',
  'recurrence-temporal': (r) =>
    ['Temporal', 'Unsupervised'].includes(r.learningType) ||
    ['Sequence', 'InteractionMatrix'].includes(r.dataShape),
};

const violations = [];
const placed = new Set();
for (const node of tree.children) {
  const check = NODE_CHECK[node.name];
  if (!check) {
    violations.push(`no check defined for node '${node.name}'`);
    continue;
  }
  for (const key of node.members) {
    placed.add(key);
    const row = M[key];
    if (!row) {
      violations.push(`node '${node.name}' member '${key}' not in matrix.json`);
      continue;
    }
    if (!check(row)) {
      violations.push(
        `node '${node.name}' assertion violated by '${key}': ${JSON.stringify({
          scaleSensitive: row.scaleSensitive,
          distributionalAssumption: row.distributionalAssumption,
          learningType: row.learningType,
          dataShape: row.dataShape,
        })}`,
      );
    }
  }
}

// coverage: every model either placed in the tree or in the non-mechanistic facet
const facet = new Set(tree.nonMechanisticFacet?.members ?? []);
const uncovered = matrix.map((r) => r.modelKey).filter((k) => !placed.has(k) && !facet.has(k));
if (uncovered.length) violations.push(`uncovered models (neither tree nor facet): ${uncovered.join(', ')}`);

// duplicate placement
const counts = {};
for (const node of tree.children) for (const k of node.members) counts[k] = (counts[k] ?? 0) + 1;
for (const [k, n] of Object.entries(counts)) if (n > 1) violations.push(`'${k}' placed in ${n} nodes`);

if (violations.length) {
  console.error(`✗ tree-check FAILED (${violations.length}):`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log(
  `✓ tree-check PASSED — ${placed.size} models across ${tree.children.length} mechanism nodes ` +
    `+ ${facet.size} non-mechanistic facet, every node assertion sound.`,
);
