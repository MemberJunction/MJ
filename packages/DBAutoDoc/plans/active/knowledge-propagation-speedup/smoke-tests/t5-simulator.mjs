#!/usr/bin/env node
// T5 — Simulator: given per-depth latency measured by T4 (or defaults), project total wall time
// for Chinook, LousyDB, AdventureWorks under various scheduler configs.
// No LLM calls — pure simulation.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { loadSchema, buildGraph, depthFromRoots, reachableDescendants, vif } from './lib/schema-loader.mjs';

const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t5-${Date.now()}.json`;

// Default per-depth latency (ms) — overwritten if T4 result JSON is available.
const DEFAULT_DEPTH_LATENCY = {
    0: 5000,   // roots: heavy inference
    1: 4500,
    2: 3500,
    3: 2500,   // junctions: synthesis
};

// Config knobs
const CONFIGS = [
    { name: 'baseline (today)', concurrency: 1, propagation: 'verbose', priority: 'alphabetical', useCache: false, useClusters: false },
    { name: 'parallel only', concurrency: 4, propagation: 'verbose', priority: 'topological', useCache: false, useClusters: false },
    { name: '+ distilled', concurrency: 4, propagation: 'distilled', priority: 'topological', useCache: false, useClusters: false },
    { name: '+ reach priority', concurrency: 4, propagation: 'distilled', priority: 'reach', useCache: false, useClusters: false },
    { name: '+ caching', concurrency: 4, propagation: 'distilled', priority: 'reach', useCache: true, useClusters: false },
    { name: 'full (+ clusters)', concurrency: 4, propagation: 'distilled', priority: 'reach', useCache: true, useClusters: true },
];

const BASE_VERBOSE_LATENCY_MS = 10_000; // typical today
const DISTILLED_DISCOUNT = 0.66;         // T1 measured ~64%, use 66% as model
const CACHE_DISCOUNT = 0.85;             // provider-reported; applied to input-token portion
const REACH_PRIORITY_DISCOUNT = 0.9;     // conservative — ordering effect at scale
const CLUSTER_DISCOUNT = 0.6;            // only applies when schema has real cluster structure

function simulate(tables, config, depthLat) {
    const graph = buildGraph(tables);
    const depth = depthFromRoots(graph);
    const N = tables.size;

    // 1. Determine per-table call duration (ms)
    let perCallLat = new Map();
    for (const name of tables.keys()) {
        const d = depth.get(name) ?? 0;
        const base = config.propagation === 'distilled'
            ? (depthLat[d] ?? depthLat[Math.min(...Object.keys(depthLat).map(Number))])
            : BASE_VERBOSE_LATENCY_MS;
        let lat = base;
        if (config.useCache) lat *= (1 - 0.15 * (1 - CACHE_DISCOUNT)); // ~13% speedup on cached input
        perCallLat.set(name, Math.round(lat));
    }

    // 2. Schedule with DAG + priority + concurrency
    const pending = new Map([...tables.keys()].map(n => [n, tables.get(n).dependsOn.length]));
    const resolved = new Set();
    let now = 0;
    let wallMax = 0;
    const inFlight = []; // [{name, endTime}]

    const reach = new Map();
    for (const name of tables.keys()) reach.set(name, reachableDescendants(graph, name).size);

    const pickReady = () => [...tables.keys()].filter(n => !resolved.has(n) && pending.get(n) === 0 && !inFlight.find(x => x.name === n));

    const sortReady = (names) => {
        const sorted = [...names];
        if (config.priority === 'alphabetical') return sorted.sort();
        if (config.priority === 'topological') return sorted.sort((a, b) => (depth.get(a) - depth.get(b)) || a.localeCompare(b));
        if (config.priority === 'reach') {
            return sorted.sort((a, b) => {
                const dd = (depth.get(a) - depth.get(b));
                if (dd) return dd;
                const rr = (reach.get(b) - reach.get(a)); // descending reach
                if (rr) return rr;
                return (vif(graph, a) - vif(graph, b)) || a.localeCompare(b);
            });
        }
        return sorted;
    };

    let iterations = 0;
    while (resolved.size < N) {
        iterations++;
        if (iterations > N * 100) {
            throw new Error(`Simulator stuck — resolved=${resolved.size}/${N} inFlight=${inFlight.length} now=${now}`);
        }
        // fill workers
        while (inFlight.length < config.concurrency) {
            const ready = pickReady();
            if (!ready.length) break;
            const chosen = sortReady(ready)[0];
            const dur = perCallLat.get(chosen);
            inFlight.push({ name: chosen, endTime: now + dur });
        }
        if (!inFlight.length) break;
        // advance to the next completion
        inFlight.sort((a, b) => a.endTime - b.endTime);
        const next = inFlight.shift();
        now = next.endTime;
        wallMax = Math.max(wallMax, now);
        resolved.add(next.name);
        // Decrement pending of dependents
        for (const child of (graph.incoming.get(next.name) ?? [])) {
            if (!resolved.has(child)) pending.set(child, pending.get(child) - 1);
        }
    }

    let wall = wallMax;
    // 2 iterations for non-distilled (today's loop)
    if (config.propagation === 'verbose') wall *= 2;
    // Cluster sharding: only applies when schema has >1 connected component or >1 strong cluster
    // We approximate — for big schemas with >30 tables, clusters shave ~40% via parallel-independent processing
    if (config.useClusters && N > 30) wall = Math.round(wall * CLUSTER_DISCOUNT);

    return { wallMs: Math.round(wall), totalCalls: config.propagation === 'verbose' ? N * 2 : N };
}

function projectForSchema(name, path, depthLat) {
    if (!existsSync(path)) {
        return { schema: name, skipped: `no state.json at ${path}` };
    }
    const tables = loadSchema(path);
    const configs = CONFIGS.map(c => {
        try {
            const r = simulate(tables, c, depthLat);
            return { config: c.name, wallSec: Math.round(r.wallMs / 1000), calls: r.totalCalls };
        } catch (e) {
            return { config: c.name, error: e.message };
        }
    });
    const baseline = configs[0];
    const full = configs[configs.length - 1];
    return {
        schema: name,
        tables: tables.size,
        configs,
        speedup: full.wallSec && baseline.wallSec ? (baseline.wallSec / full.wallSec).toFixed(2) + 'x' : 'n/a',
    };
}

async function main() {
    console.log('T5 — Simulator (no LLM calls; pure projection)');

    // Try to read T4 result from results/ dir for better calibration
    let depthLat = DEFAULT_DEPTH_LATENCY;
    try {
        const t4Candidate = process.env.T4_RESULT_PATH;
        if (t4Candidate && existsSync(t4Candidate)) {
            const t4 = JSON.parse(readFileSync(t4Candidate, 'utf8'));
            const override = {};
            for (const d of t4.summary?.depthSummary ?? []) override[d.depth] = d.avgLatencyMs;
            if (Object.keys(override).length > 0) {
                depthLat = override;
                console.log(`Calibrated from T4: ${JSON.stringify(depthLat)}`);
            }
        } else {
            console.log(`Using default per-depth latencies: ${JSON.stringify(depthLat)}`);
        }
    } catch (e) {
        console.log(`Calibration skipped: ${e.message}`);
    }
    console.log();

    const inDocker = existsSync('/app/chinook-state.json');
    const p = (name) => inDocker ? `/app/${name}-state.json` : `./${name}-state.json`;
    const schemas = [
        { name: 'chinook', path: p('chinook') },
        { name: 'lousydb', path: p('lousydb') },
        { name: 'adventureworks', path: p('adventureworks') },
    ];

    const projections = schemas.map(s => projectForSchema(s.name, s.path, depthLat));
    for (const p of projections) {
        console.log('===', p.schema, '===');
        if (p.skipped) { console.log('  ', p.skipped); continue; }
        console.log(`  tables: ${p.tables}`);
        for (const c of p.configs) {
            if (c.error) console.log(`    ${c.config.padEnd(25)}  ERROR: ${c.error}`);
            else console.log(`    ${c.config.padEnd(25)}  ${String(c.wallSec).padStart(6)} s   (${c.calls} calls)`);
        }
        console.log(`  speedup baseline -> full: ${p.speedup}`);
        console.log();
    }

    writeFileSync(outFile, JSON.stringify({ depthLat, projections }, null, 2));
    console.log(`Written: ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
