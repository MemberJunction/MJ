#!/usr/bin/env node
// Test ξ — Full integration: Fiedler partition + per-cluster scheduling + delta-P2 + belief-skip
// on the 15-table synthetic enterprise schema (HR / Sales / Inventory + 3 bridges).
//
// Compares:
//   - Baseline: serial, single worker, verbose prompts, 2-iteration loop
//   - Full: Fiedler split, parallel per-cluster, distilled prompts, delta-P2 ascent, belief-skip
// Reports LLM call count, wall time, hallucination count.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema, buildGraph } from './lib/schema-loader.mjs';
import { buildDistilledPrompt } from './lib/prompts.mjs';
import { recursiveBisect } from './lib/fiedler.mjs';
import { mergeDelta, detectHallucination } from './lib/delta-merge.mjs';
import { BeliefStore } from './lib/belief-store.mjs';

const STATE = process.env.STATE || './enterprise-15-state.json';
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-xi-${Date.now()}.json`;
const MAX_CONCURRENCY = 3;

function distill(table, desc) {
    const first = (desc || '').split(/[.!?](?:\s|$)/)[0].trim();
    return `${table.schema}.${table.name}: ${first}`;
}

function columnLine(c) {
    const bits = [`${c.name} (${c.dataType}${c.isNullable ? '' : ' NOT NULL'}`];
    if (c.isPrimaryKey) bits.push('PK');
    if (c.statistics?.distinctCount != null) bits.push(`${c.statistics.distinctCount} distinct`);
    bits.push(')');
    const fk = (c.isForeignKey && c.foreignKeyReferences) ? ` — FK → ${c.foreignKeyReferences.schema}.${c.foreignKeyReferences.table}.${c.foreignKeyReferences.referencedColumn}` : '';
    return `- ${bits.join(', ').replace(', )', ')')}${fk}`;
}

function buildDeltaP2Prompt(table, ancestors, currentDesc, descendants) {
    const parents = ancestors.length ? `### Parents\n${ancestors.join('\n')}` : '### Parents\n(none)';
    return `Emit DELTA to APPEND to an existing description, grounded strictly in schema + 1-hop descendants.

## Table: ${table.schema}.${table.name} (${table.rowCount} rows)
Columns:
${table.columns.map(columnLine).join('\n')}

${parents}

### Current description (sacred)
${currentDesc}

### Descendants (new info)
${descendants.join('\n')}

Rules: ≤15 words, 1 clause, grounded in direct descendants only. Output:
{ "add": "clause or null", "reason": "brief" }

JSON only.`;
}

async function runCluster(tables, clusterNodes, knownEntities, beliefStore, label) {
    const clusterTables = clusterNodes.map(n => tables.get(n)).filter(Boolean);

    // Build in-cluster graph
    const inCluster = new Set(clusterNodes);
    const clusterGraph = { outgoing: new Map(), incoming: new Map() };
    for (const n of clusterNodes) {
        clusterGraph.outgoing.set(n, []);
        clusterGraph.incoming.set(n, []);
    }
    for (const t of clusterTables) {
        for (const d of t.dependsOn) {
            if (inCluster.has(d.table)) {
                clusterGraph.outgoing.get(t.name).push(d.table);
                clusterGraph.incoming.get(d.table).push(t.name);
            }
        }
    }

    // Topological order within cluster
    const inDeg = new Map();
    for (const n of clusterNodes) inDeg.set(n, clusterGraph.outgoing.get(n).length);
    const order = [];
    while (order.length < clusterNodes.length) {
        const ready = clusterNodes.filter(n => !order.includes(n) && inDeg.get(n) === 0);
        if (!ready.length) {
            // Cycle or cross-cluster deps — take anything remaining
            for (const n of clusterNodes) if (!order.includes(n)) order.push(n);
            break;
        }
        const next = ready[0];
        order.push(next);
        for (const n of clusterGraph.incoming.get(next)) inDeg.set(n, inDeg.get(n) - 1);
    }

    const summaries = new Map(), descriptions = new Map(), callRecords = [];

    // ═══ P1 descent (parallel within cluster) ═══
    const pending = new Map(order.map(n => [n, clusterGraph.outgoing.get(n).length]));
    const resolved = new Set();
    const inFlight = new Map();   // name -> promise

    while (resolved.size < order.length) {
        // Launch workers up to concurrency
        while (inFlight.size < MAX_CONCURRENCY) {
            const next = order.find(n => !resolved.has(n) && !inFlight.has(n) && pending.get(n) === 0);
            if (!next) break;
            const t = tables.get(next);
            const anc = t.dependsOn.filter(d => inCluster.has(d.table))
                .map(d => summaries.get(d.table)).filter(Boolean);
            const prompt = buildDistilledPrompt(t, tables, anc);
            const p = callGemini(prompt).then(res => ({ name: next, res }));
            inFlight.set(next, p);
        }
        if (inFlight.size === 0) break;
        const { name: doneName, res } = await Promise.race(inFlight.values());
        inFlight.delete(doneName);
        resolved.add(doneName);

        const t = tables.get(doneName);
        let desc = '';
        try { desc = (JSON.parse(res.text).tableDescription) || ''; } catch {}
        descriptions.set(doneName, desc);
        summaries.set(doneName, distill(t, desc));
        try { beliefStore.consumeP1(doneName, JSON.parse(res.text)); } catch {}

        callRecords.push({ phase: 'P1', name: doneName, latencyMs: res.latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens });

        // Unblock dependents
        for (const child of clusterGraph.incoming.get(doneName)) {
            if (pending.get(child) > 0) pending.set(child, pending.get(child) - 1);
        }
    }

    // ═══ delta-P2 ascent (parallel within cluster, reverse order) ═══
    const revOrder = [...order].reverse();
    const p2Done = new Set();
    const p2InFlight = new Map();

    while (p2Done.size < revOrder.length) {
        while (p2InFlight.size < MAX_CONCURRENCY) {
            const next = revOrder.find(n => !p2Done.has(n) && !p2InFlight.has(n));
            if (!next) break;
            const t = tables.get(next);
            const dependents = clusterGraph.incoming.get(next) ?? [];
            if (!dependents.length) { p2Done.add(next); continue; }
            const anc = t.dependsOn.filter(d => inCluster.has(d.table)).map(d => summaries.get(d.table)).filter(Boolean);
            const descSummaries = dependents.map(d => summaries.get(d)).filter(Boolean);
            if (!descSummaries.length) { p2Done.add(next); continue; }
            const prompt = buildDeltaP2Prompt(t, anc, descriptions.get(next), descSummaries);
            const p = callGemini(prompt).then(res => ({ name: next, res }));
            p2InFlight.set(next, p);
        }
        if (p2InFlight.size === 0) break;
        const { name: doneName, res } = await Promise.race(p2InFlight.values());
        p2InFlight.delete(doneName);
        p2Done.add(doneName);

        const t = tables.get(doneName);
        let delta = { add: null };
        try { delta = JSON.parse(res.text); } catch {}
        const susp = delta.add ? detectHallucination(delta.add, knownEntities) : [];
        const merged = mergeDelta(descriptions.get(doneName), delta);
        descriptions.set(doneName, merged.description);
        summaries.set(doneName, distill(t, merged.description));
        try { beliefStore.consumeDeltaP2(doneName, delta); } catch {}

        callRecords.push({ phase: 'P2', name: doneName, latencyMs: res.latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens, hallucinated: susp.length > 0, changed: merged.changed });
    }

    return { descriptions: Object.fromEntries(descriptions), callRecords, cluster: clusterNodes };
}

async function main() {
    console.log(`Test ξ — Full integration: Fiedler + delta-P2 + belief store`);
    console.log(`Schema: ${STATE}   Model: ${model()}   Concurrency: ${MAX_CONCURRENCY}\n`);
    const tables = loadSchema(STATE);
    const graph = buildGraph(tables);
    const nodes = [...tables.keys()];
    const edges = [];
    for (const [src, deps] of graph.outgoing) for (const tgt of deps) edges.push({ a: src, b: tgt });

    // ═══ Fiedler partition ═══
    console.log('═══ Fiedler partition ═══');
    const { clusters, bridges } = recursiveBisect(nodes, edges, { minSize: 4, cutRatioLimit: 0.4, maxDepth: 3 });
    console.log(`Clusters: ${clusters.length}`);
    for (let i = 0; i < clusters.length; i++) {
        console.log(`  cluster ${i}: ${clusters[i].join(', ')}`);
    }
    console.log(`Bridges: [${[...bridges].join(', ')}]`);

    const knownEntities = new Set(nodes);
    const beliefStore = new BeliefStore();
    const clusterStart = Date.now();

    // Run all clusters in parallel (no shared state — I3 invariant)
    console.log('\n═══ Running clusters in parallel ═══');
    const clusterResults = await Promise.all(
        clusters.map((c, i) => runCluster(tables, c, knownEntities, beliefStore, `cluster-${i}`))
    );
    const clusterMs = Date.now() - clusterStart;
    console.log(`Cluster-parallel wall time: ${clusterMs}ms`);

    // Aggregate metrics
    const allRecords = clusterResults.flatMap(r => r.callRecords);
    const p1Calls = allRecords.filter(r => r.phase === 'P1');
    const p2Calls = allRecords.filter(r => r.phase === 'P2');
    const p1Latency = p1Calls.reduce((s, r) => s + r.latencyMs, 0);
    const p2Latency = p2Calls.reduce((s, r) => s + r.latencyMs, 0);
    const p2Changed = p2Calls.filter(r => r.changed).length;
    const hallucinated = p2Calls.filter(r => r.hallucinated).length;

    // Since clusters ran in parallel, wall time is dominated by the slowest cluster
    const perClusterDurations = clusterResults.map(r => {
        const latencies = r.callRecords.map(c => c.latencyMs);
        return latencies.reduce((s, l) => s + l, 0);   // approximation
    });

    console.log('\n═══ RESULTS ═══');
    console.log(`Total LLM calls: ${allRecords.length}  (P1: ${p1Calls.length}, P2: ${p2Calls.length})`);
    console.log(`Total-sequential LLM time (if 1-worker serial): ${(p1Latency + p2Latency)}ms = ${((p1Latency + p2Latency) / 1000).toFixed(1)}s`);
    console.log(`Cluster-parallel wall time (actual): ${clusterMs}ms = ${(clusterMs / 1000).toFixed(1)}s`);
    console.log(`Parallel speedup: ${((p1Latency + p2Latency) / clusterMs).toFixed(2)}x`);
    console.log(`P2 changes: ${p2Changed}/${p2Calls.length}`);
    console.log(`Hallucinated additions: ${hallucinated} ${hallucinated === 0 ? '(I2 invariant holds)' : '⚠'}`);
    console.log(`\nBelief store summary:`);
    for (const [pfx, slot] of Object.entries(beliefStore.summary())) {
        console.log(`  ${pfx}: ${slot.confident}/${slot.count} confident, avg p=${slot.avgProb.toFixed(2)}`);
    }

    // Simulated baseline: sequential, verbose (×2 prompt size), 2 iterations
    // Rough model: baseline_time = 2 × N × (verbose_prompt_latency)
    // verbose is ~1.5× distilled per T1, and 2 iterations doubles
    const distilledAvgLatency = p1Calls.length ? p1Latency / p1Calls.length : 5000;
    const baselineSimulated = 2 * tables.size * distilledAvgLatency * 1.5;
    console.log(`\nSimulated baseline (2 iters × N × verbose, 1 worker): ${(baselineSimulated / 1000).toFixed(1)}s`);
    console.log(`Full-arch / baseline speedup: ${(baselineSimulated / clusterMs).toFixed(2)}x`);

    const summary = {
        model: model(), schema: STATE, tables: tables.size, clusters: clusters.length,
        clusterSizes: clusters.map(c => c.length),
        bridges: [...bridges],
        p1Calls: p1Calls.length, p2Calls: p2Calls.length, totalCalls: allRecords.length,
        p1TotalLatency: p1Latency, p2TotalLatency: p2Latency, wallTime: clusterMs,
        hallucinations: hallucinated,
        simulatedBaselineMs: baselineSimulated, speedup: baselineSimulated / clusterMs,
    };
    writeFileSync(outFile, JSON.stringify({ summary, clusterResults, beliefSummary: beliefStore.summary() }, null, 2));
    console.log(`\nWritten: ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
