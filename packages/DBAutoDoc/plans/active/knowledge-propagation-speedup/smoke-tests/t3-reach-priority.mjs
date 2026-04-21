#!/usr/bin/env node
// T3 — Max-reach root ordering. Among ready roots, does starting from the highest-reach
// root complete the DFS faster than starting from the lowest-reach root?
// We model this deterministically with actual Gemini calls but scheduled under the two orderings.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema, buildGraph, reachableDescendants } from './lib/schema-loader.mjs';
import { buildDistilledPrompt, distillResolvedTable } from './lib/prompts.mjs';
import { performance } from 'node:perf_hooks';

const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t3-${Date.now()}.json`;

const CONCURRENCY = 4;

async function scheduleAndRun(tables, graph, priorityFn) {
    // Each table's remaining-dependency count
    const pending = new Map();
    for (const [name, t] of tables) {
        pending.set(name, t.dependsOn.length);
    }
    const resolved = new Map(); // name -> { description, summary }
    const timing = []; // { name, startMs, endMs, order }
    const t0 = performance.now();

    const isReady = (n) => pending.get(n) === 0 && !resolved.has(n);
    const pickNext = () => {
        const ready = [...tables.keys()].filter(isReady);
        if (!ready.length) return null;
        return ready.sort((a, b) => priorityFn(a) - priorityFn(b))[0];
    };

    let workers = 0;
    let order = 0;

    function tick(resolveFn) {
        while (workers < CONCURRENCY) {
            const next = pickNext();
            if (!next) break;
            workers++;
            const myOrder = order++;
            const startMs = Math.round(performance.now() - t0);
            pending.set(next, -1); // mark in-flight

            (async () => {
                const t = tables.get(next);
                const parents = t.dependsOn.map(d => resolved.get(d.table)).filter(Boolean);
                const parentSummaries = parents.map(p => `${p.schema}.${p.name}: ${(p.description||'').split(/[.!?](?:\s|$)/)[0].trim()}`);
                const prompt = buildDistilledPrompt(t, tables, parentSummaries);
                const r = await callGemini(prompt);
                resolved.set(next, { ...t }); // we keep the already-known description for propagation
                const endMs = Math.round(performance.now() - t0);
                timing.push({ name: next, startMs, endMs, durationMs: r.latencyMs, order: myOrder });
                // Reduce pending of dependents
                for (const d of (graph.incoming.get(next) ?? [])) {
                    const cur = pending.get(d);
                    if (cur > 0) pending.set(d, cur - 1);
                }
                workers--;
                if (resolved.size === tables.size) resolveFn();
                else tick(resolveFn);
            })();
        }
    }

    await new Promise(resolveFn => tick(resolveFn));
    const wallMs = Math.round(performance.now() - t0);
    return { timing, wallMs };
}

async function main() {
    console.log(`T3 — Max-reach root ordering  (concurrency=${CONCURRENCY})`);
    console.log(`Model: ${model()}\n`);
    const tables = loadSchema();
    const graph = buildGraph(tables);

    // Compute reach per table
    const reach = new Map();
    for (const name of tables.keys()) {
        reach.set(name, reachableDescendants(graph, name).size);
    }
    console.log('Reach per root table:');
    for (const [name, r] of [...reach.entries()].sort((a, b) => b[1] - a[1])) {
        const t = tables.get(name);
        if (t.dependsOn.length === 0) console.log(`  ${name.padEnd(15)}  reach=${r}`);
    }

    // Run A: reach-descending priority (lower number = higher priority → negate reach so high-reach pops first)
    console.log('\n=== Schedule A: reach-descending (start with max-reach roots) ===');
    const prioA = n => -reach.get(n);
    const a = await scheduleAndRun(tables, graph, prioA);

    console.log('\n=== Schedule B: reach-ascending (start with min-reach roots) ===');
    const prioB = n => reach.get(n);
    const b = await scheduleAndRun(tables, graph, prioB);

    const summary = {
        model: model(),
        concurrency: CONCURRENCY,
        tables: tables.size,
        scheduleA: { label: 'reach-descending', wallMs: a.wallMs, order: a.timing.map(t => t.name) },
        scheduleB: { label: 'reach-ascending', wallMs: b.wallMs, order: b.timing.map(t => t.name) },
        ratio: (a.wallMs / b.wallMs).toFixed(3),
        verdict: a.wallMs < b.wallMs
            ? `PASS: reach-descending ${((1 - a.wallMs / b.wallMs) * 100).toFixed(1)}% faster`
            : a.wallMs === b.wallMs
                ? 'TIE: no difference'
                : `FAIL: reach-ascending was faster by ${((1 - b.wallMs / a.wallMs) * 100).toFixed(1)}%`,
    };

    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));
    writeFileSync(outFile, JSON.stringify({ summary, scheduleA: a, scheduleB: b }, null, 2));
    console.log(`\nWritten: ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
