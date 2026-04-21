#!/usr/bin/env node
// T4 — Synthesis ramp: per-call latency + output tokens as a function of DFS depth.
// Validates the CORE vision claim: deeper-in-graph calls become SYNTHESIS, not inference,
// and should take less time + produce fewer output tokens.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema, buildGraph, depthFromRoots } from './lib/schema-loader.mjs';
import { buildDistilledPrompt, distillResolvedTable } from './lib/prompts.mjs';
import { checkQuality } from './lib/metrics.mjs';

const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t4-${Date.now()}.json`;

async function main() {
    console.log(`T4 — Synthesis ramp (per-depth latency + output tokens)`);
    console.log(`Model: ${model()}\n`);

    const tables = loadSchema();
    const graph = buildGraph(tables);
    const depth = depthFromRoots(graph);

    // Sort tables by depth (DFS order within each depth level, alphabetical stability)
    const order = [...tables.keys()].sort((a, b) => {
        const da = depth.get(a) ?? 99, db = depth.get(b) ?? 99;
        if (da !== db) return da - db;
        return a.localeCompare(b);
    });

    console.log('Processing order:');
    for (const name of order) {
        console.log(`  depth ${depth.get(name) ?? '?'}  ${name}`);
    }
    console.log();

    // Mock "resolved" state — as we process each table, we use state.json's actual
    // description for propagation purposes. (This simulates what a real run would have
    // after that table was processed.)
    const results = [];
    for (const name of order) {
        const t = tables.get(name);
        const parents = t.dependsOn.map(d => tables.get(d.table)).filter(Boolean);
        const prompt = buildDistilledPrompt(t, tables, parents.map(distillResolvedTable));
        const r = await callGemini(prompt);
        const q = checkQuality(t, r.text);
        const row = {
            table: name,
            depth: depth.get(name) ?? null,
            latencyMs: r.latencyMs,
            promptChars: r.promptChars,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            pkCorrect: q.pkCorrect,
            fkCorrect: q.fkCorrect,
        };
        results.push(row);
        console.log(`  depth ${row.depth}  ${name.padEnd(15)}  ${row.latencyMs}ms  ${row.outputTokens} out  PK=${q.pkCorrect?'✓':'✗'} FK=${q.fkCorrect?'✓':'✗'}`);
    }

    // Aggregate by depth
    const byDepth = new Map();
    for (const r of results) {
        if (!byDepth.has(r.depth)) byDepth.set(r.depth, []);
        byDepth.get(r.depth).push(r);
    }
    const depthSummary = [...byDepth.entries()].sort((a, b) => a[0] - b[0]).map(([d, rows]) => ({
        depth: d,
        count: rows.length,
        avgLatencyMs: Math.round(rows.reduce((s, r) => s + r.latencyMs, 0) / rows.length),
        avgOutputTokens: Math.round(rows.reduce((s, r) => s + r.outputTokens, 0) / rows.length),
        avgInputTokens: Math.round(rows.reduce((s, r) => s + r.inputTokens, 0) / rows.length),
        pkPassRate: rows.filter(r => r.pkCorrect).length / rows.length,
        fkPassRate: rows.filter(r => r.fkCorrect).length / rows.length,
    }));

    console.log('\n=== DEPTH SUMMARY (synthesis ramp validation) ===');
    console.log('depth  count  avg_latency_ms  avg_out_tokens  avg_in_tokens  PK_pass  FK_pass');
    for (const d of depthSummary) {
        console.log(`  ${d.depth}      ${d.count}      ${String(d.avgLatencyMs).padStart(10)}    ${String(d.avgOutputTokens).padStart(10)}    ${String(d.avgInputTokens).padStart(10)}    ${(d.pkPassRate * 100).toFixed(0).padStart(3)}%    ${(d.fkPassRate * 100).toFixed(0).padStart(3)}%`);
    }

    // Claim verdict
    const depths = depthSummary.map(d => d.depth);
    const latencies = depthSummary.map(d => d.avgLatencyMs);
    const outputs = depthSummary.map(d => d.avgOutputTokens);
    const trendLat = trend(latencies);
    const trendOut = trend(outputs);
    console.log(`\nTrend in avg latency across depths: ${trendLat}`);
    console.log(`Trend in avg output tokens across depths: ${trendOut}`);
    const verdict = (trendLat === 'decreasing' && trendOut === 'decreasing')
        ? 'PASS: synthesis-ramp hypothesis supported (both latency and output tokens decrease with depth)'
        : (trendLat === 'decreasing' || trendOut === 'decreasing')
            ? 'PARTIAL: only one metric shows expected decrease'
            : 'FAIL: no depth-related decay observed — synthesis-ramp hypothesis not supported by this data';
    console.log(`\nVERDICT: ${verdict}`);

    const summary = { model: model(), depthSummary, verdict, trendLat, trendOut };
    writeFileSync(outFile, JSON.stringify({ summary, perTable: results }, null, 2));
    console.log(`\nWritten: ${outFile}`);
}

function trend(values) {
    if (values.length < 2) return 'insufficient';
    let decreasing = 0, increasing = 0;
    for (let i = 1; i < values.length; i++) {
        if (values[i] < values[i - 1]) decreasing++;
        else if (values[i] > values[i - 1]) increasing++;
    }
    if (decreasing > increasing) return 'decreasing';
    if (increasing > decreasing) return 'increasing';
    return 'flat';
}

main().catch(e => { console.error(e); process.exit(1); });
