#!/usr/bin/env node
// T2 — VIF vs alphabetical ordering within a level. With parallel dispatch (4 workers),
// does starting with lowest-VIF tables reduce tail latency + unblock dependents sooner?
// Simulator approach — deterministic, uses measured per-call latency.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { loadSchema, buildGraph, vif, depthFromRoots } from './lib/schema-loader.mjs';

const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t2-${Date.now()}.json`;
const CONCURRENCY = 4;

// Per-call latency by depth. Calibrate from T4 if available; else use reasonable default.
const DEFAULT_DEPTH_LATENCY = { 0: 5500, 1: 5000, 2: 4000, 3: 3000 };

function runSchedule(tables, graph, depth, ordering, depthLat) {
    const pending = new Map([...tables.keys()].map(n => [n, tables.get(n).dependsOn.length]));
    const resolved = new Set();
    const inFlight = [];
    let now = 0;
    let tailCompletion = 0;

    const pickReady = () => [...tables.keys()].filter(n => !resolved.has(n) && pending.get(n) === 0 && !inFlight.find(x => x.name === n));
    const sortReady = (names) => {
        if (ordering === 'alphabetical') return [...names].sort();
        if (ordering === 'vif-ascending') {
            return [...names].sort((a, b) => {
                const va = vif(graph, a), vb = vif(graph, b);
                if (va !== vb) return va - vb;
                return a.localeCompare(b);
            });
        }
        return names;
    };

    while (resolved.size < tables.size) {
        while (inFlight.length < CONCURRENCY) {
            const ready = pickReady();
            if (!ready.length) break;
            const chosen = sortReady(ready)[0];
            const d = depth.get(chosen) ?? 0;
            const dur = depthLat[d] ?? 5000;
            inFlight.push({ name: chosen, endTime: now + dur, depth: d });
        }
        if (!inFlight.length) break;
        inFlight.sort((a, b) => a.endTime - b.endTime);
        const next = inFlight.shift();
        now = next.endTime;
        tailCompletion = Math.max(tailCompletion, now);
        resolved.add(next.name);
        for (const child of (graph.incoming.get(next.name) ?? [])) {
            if (!resolved.has(child)) pending.set(child, pending.get(child) - 1);
        }
    }

    return { wallMs: tailCompletion };
}

async function main() {
    console.log(`T2 — VIF vs alphabetical ordering  (concurrency=${CONCURRENCY})`);
    const tables = loadSchema();
    const graph = buildGraph(tables);
    const depth = depthFromRoots(graph);

    let depthLat = DEFAULT_DEPTH_LATENCY;
    const t4Path = process.env.T4_RESULT_PATH;
    if (t4Path && existsSync(t4Path)) {
        try {
            const t4 = JSON.parse(readFileSync(t4Path, 'utf8'));
            const override = {};
            for (const d of t4.summary?.depthSummary ?? []) override[d.depth] = d.avgLatencyMs;
            if (Object.keys(override).length) depthLat = override;
        } catch {}
    }
    console.log(`Depth latency (ms): ${JSON.stringify(depthLat)}\n`);

    const a = runSchedule(tables, graph, depth, 'alphabetical', depthLat);
    const b = runSchedule(tables, graph, depth, 'vif-ascending', depthLat);

    const summary = {
        concurrency: CONCURRENCY,
        tables: tables.size,
        alphabetical: { wallSec: Math.round(a.wallMs / 1000) },
        vifAscending: { wallSec: Math.round(b.wallMs / 1000) },
        delta: ((a.wallMs - b.wallMs) / a.wallMs * 100).toFixed(1) + '%',
        verdict: b.wallMs < a.wallMs
            ? `PASS: VIF-ascending ${((a.wallMs - b.wallMs) / a.wallMs * 100).toFixed(1)}% faster`
            : b.wallMs === a.wallMs ? 'TIE' : 'FAIL: alphabetical was faster',
    };
    console.log(JSON.stringify(summary, null, 2));
    writeFileSync(outFile, JSON.stringify({ summary, depthLat }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
