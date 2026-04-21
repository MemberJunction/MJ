#!/usr/bin/env node
// Test ν — Fiedler spectral partitioning on synthetic schemas.
//
// Validates that our C1 partitioner correctly identifies natural clusters on:
//   1. Clean 2-cluster schema (expect: clean split)
//   2. 3-cluster schema with bridge (expect: 3 clusters + bridge flagged)
//   3. Densely connected schema (expect: tight λ_2 → stop splitting)
//   4. Real Chinook (1 cluster expected — nothing to cut meaningfully)
//
// No LLM calls. Pure graph math. Tests the I3 invariant (per-component independence).

import { writeFileSync } from 'node:fs';
import { recursiveBisect, fiedlerVector, buildLaplacian } from './lib/fiedler.mjs';
import { loadSchema, buildGraph } from './lib/schema-loader.mjs';

const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-nu-${Date.now()}.json`;

// ═══ Synthetic test schemas ═══

function twoClusterSchema() {
    // Cluster A: T0-T4 fully connected internally
    // Cluster B: T5-T9 fully connected internally
    // One bridge edge: T4-T5
    const nodes = Array.from({ length: 10 }, (_, i) => `T${i}`);
    const edges = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) edges.push({ a: `T${i}`, b: `T${j}` });
    for (let i = 5; i < 10; i++) for (let j = i + 1; j < 10; j++) edges.push({ a: `T${i}`, b: `T${j}` });
    edges.push({ a: 'T4', b: 'T5' });   // bridge
    return { nodes, edges, expectedClusters: 2, expectedBridges: ['T4', 'T5'] };
}

function threeClusterSchema() {
    // Three tight clusters of 4 each, weakly linked by 2 bridges
    const nodes = Array.from({ length: 12 }, (_, i) => `T${i}`);
    const edges = [];
    // Cluster A: T0-T3
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) edges.push({ a: `T${i}`, b: `T${j}` });
    // Cluster B: T4-T7
    for (let i = 4; i < 8; i++) for (let j = i + 1; j < 8; j++) edges.push({ a: `T${i}`, b: `T${j}` });
    // Cluster C: T8-T11
    for (let i = 8; i < 12; i++) for (let j = i + 1; j < 12; j++) edges.push({ a: `T${i}`, b: `T${j}` });
    // Bridges
    edges.push({ a: 'T3', b: 'T4' });
    edges.push({ a: 'T7', b: 'T8' });
    return { nodes, edges, expectedClusters: 3, expectedBridges: ['T3', 'T4', 'T7', 'T8'] };
}

function denseSchema() {
    // Everyone connected to everyone — should not split
    const nodes = Array.from({ length: 8 }, (_, i) => `T${i}`);
    const edges = [];
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) edges.push({ a: `T${i}`, b: `T${j}` });
    return { nodes, edges, expectedClusters: 1, expectedBridges: [] };
}

function chinookFromState() {
    const tables = loadSchema('./chinook-state.json');
    const graph = buildGraph(tables);
    const nodes = [...tables.keys()];
    const edges = [];
    for (const [src, deps] of graph.outgoing) {
        for (const tgt of deps) {
            edges.push({ a: src, b: tgt });
        }
    }
    return { nodes, edges, expectedClusters: 1 };
}

async function runCase(name, { nodes, edges, expectedClusters, expectedBridges = [] }) {
    console.log(`\n═══ ${name}: ${nodes.length} nodes, ${edges.length} edges ═══`);
    const t0 = Date.now();
    const { clusters, dendrogram, bridges } = recursiveBisect(nodes, edges, { minSize: 3, tightThreshold: 2.5, maxDepth: 3 });
    const dt = Date.now() - t0;

    // Check top-level lambda2 if not already computed
    let topLambda = dendrogram.lambda2;
    if (topLambda == null) {
        const L = buildLaplacian(nodes, edges);
        topLambda = fiedlerVector(L, nodes.length).lambda2;
    }

    console.log(`  Clusters found: ${clusters.length} (expected ~${expectedClusters})`);
    console.log(`  Cluster sizes: [${clusters.map(c => c.length).join(', ')}]`);
    console.log(`  Bridge candidates: [${[...bridges].join(', ')}] (expected includes: [${expectedBridges.join(', ')}])`);
    console.log(`  λ_2 at root: ${topLambda.toFixed(4)}`);
    console.log(`  Computation time: ${dt}ms`);

    // Verdict
    let verdict = '✓ pass';
    if (expectedClusters === 1 && clusters.length > 1) verdict = `✗ over-split (expected 1, got ${clusters.length})`;
    else if (expectedClusters === 1 && clusters.length === 1) verdict = '✓ correctly kept as one cluster';
    else if (clusters.length < expectedClusters - 1 || clusters.length > expectedClusters + 1) verdict = `⚠ expected ${expectedClusters}, got ${clusters.length}`;

    // Check bridges overlap
    if (expectedBridges.length > 0) {
        const caught = expectedBridges.filter(b => bridges.has(b));
        const bridgeRecall = caught.length / expectedBridges.length;
        console.log(`  Bridge recall: ${caught.length}/${expectedBridges.length} (${(bridgeRecall * 100).toFixed(0)}%)`);
    }
    console.log(`  Verdict: ${verdict}`);

    return {
        name,
        nodes: nodes.length,
        edges: edges.length,
        clustersFound: clusters.length,
        clusterSizes: clusters.map(c => c.length),
        expectedClusters,
        bridgesFound: [...bridges],
        expectedBridges,
        lambda2: topLambda,
        computationMs: dt,
        verdict,
    };
}

async function main() {
    console.log('Test ν — Fiedler spectral partitioning');
    const results = [];
    results.push(await runCase('two-cluster', twoClusterSchema()));
    results.push(await runCase('three-cluster', threeClusterSchema()));
    results.push(await runCase('dense', denseSchema()));
    results.push(await runCase('chinook', chinookFromState()));

    console.log('\n═══ OVERALL ═══');
    let passes = 0;
    for (const r of results) {
        if (r.verdict.startsWith('✓')) passes++;
    }
    console.log(`Pass rate: ${passes}/${results.length}`);

    writeFileSync(outFile, JSON.stringify({ results, passes, total: results.length }, null, 2));
    console.log(`\nWritten: ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
