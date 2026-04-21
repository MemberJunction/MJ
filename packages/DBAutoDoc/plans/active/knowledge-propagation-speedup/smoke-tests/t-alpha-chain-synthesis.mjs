#!/usr/bin/env node
// Test α + β — Pure chain synthesis ramp with constant table complexity.
// Processes a 10-table linear chain sequentially, propagating real distilled
// summaries from each resolved table to the next.
// Measures per-position: latency, input tokens, output tokens, *description-only char count*.
// Separates structural inference cost (description) from column-description boilerplate.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema } from './lib/schema-loader.mjs';
import { buildDistilledPrompt } from './lib/prompts.mjs';

const CHAIN_STATE = process.env.CHAIN_STATE || './chain-10-state.json';

const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-alpha-${Date.now()}.json`;

function distill(table, llmDescription) {
    // Extract first sentence as 1-line summary (mirrors propagation architecture)
    const first = (llmDescription || '').split(/[.!?](?:\s|$)/)[0].trim();
    return `${table.schema}.${table.name}: ${first}`;
}

async function main() {
    console.log(`Test α+β — Chain synthesis ramp with constant complexity`);
    console.log(`Model: ${model()}`);
    console.log(`Schema: ${CHAIN_STATE}\n`);

    const tables = loadSchema(CHAIN_STATE);
    // Process chain in order (root → deepest)
    const chainOrder = [];
    for (const [name, t] of tables) {
        // A chain is topologically sorted by # of deps
        if (t.dependsOn.length === 0) chainOrder.unshift(name);
        else chainOrder.push(name);
    }
    chainOrder.sort((a, b) => {
        const ta = tables.get(a), tb = tables.get(b);
        // Sort by position in chain (by walking dependsOn chain)
        const depthA = walkDepth(tables, a);
        const depthB = walkDepth(tables, b);
        return depthA - depthB;
    });

    console.log(`Processing order: ${chainOrder.join(' -> ')}\n`);

    const propagation = new Map();  // name -> distilled summary string
    const results = [];

    for (let i = 0; i < chainOrder.length; i++) {
        const name = chainOrder[i];
        const t = tables.get(name);
        const ancestors = t.dependsOn.map(d => propagation.get(d.table)).filter(Boolean);

        const prompt = buildDistilledPrompt(t, tables, ancestors);
        const res = await callGemini(prompt);

        // Parse out the tableDescription
        let tableDesc = '';
        try {
            const parsed = JSON.parse(res.text);
            tableDesc = parsed.tableDescription || '';
        } catch {
            tableDesc = '(JSON parse failed)';
        }

        const row = {
            position: i,
            name,
            promptChars: prompt.length,
            ancestorCount: ancestors.length,
            latencyMs: res.latencyMs,
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
            tableDescChars: tableDesc.length,
            tableDescTokensApprox: Math.round(tableDesc.length / 4),
            tableDescription: tableDesc,
        };
        results.push(row);
        propagation.set(name, distill(t, tableDesc));

        console.log(`  pos ${i}  ${name.padEnd(10)}  in=${res.inputTokens}  out=${res.outputTokens}  latency=${res.latencyMs}ms  descChars=${tableDesc.length}`);
    }

    console.log('\n=== ANALYSIS ===\n');

    // Primary trend: does output tokens decrease with chain position?
    const outTokensTrend = trendDirection(results.map(r => r.outputTokens));
    const descCharsTrend = trendDirection(results.map(r => r.tableDescChars));
    const latencyTrend = trendDirection(results.map(r => r.latencyMs));

    console.log(`Trend in total output tokens:         ${outTokensTrend}`);
    console.log(`Trend in tableDescription char count: ${descCharsTrend}  ← isolated structural-inference metric`);
    console.log(`Trend in latency:                     ${latencyTrend}`);

    // Monotonic decrease test for descChars (the cleanest signal)
    const descChars = results.map(r => r.tableDescChars);
    const firstHalfAvg = avg(descChars.slice(0, Math.floor(descChars.length / 2)));
    const secondHalfAvg = avg(descChars.slice(Math.floor(descChars.length / 2)));
    const percentChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1);
    console.log(`Description char count, first half avg: ${Math.round(firstHalfAvg)}`);
    console.log(`Description char count, second half avg: ${Math.round(secondHalfAvg)}`);
    console.log(`Change from early to late chain: ${percentChange}% (negative = synthesis effect)`);

    const verdict = secondHalfAvg < firstHalfAvg * 0.85
        ? 'STRONG PASS: description shrinks ≥15% as chain deepens — synthesis-ramp supported'
        : secondHalfAvg < firstHalfAvg * 0.95
            ? 'WEAK PASS: slight shrinking (<15%) in description — synthesis effect present but small'
            : secondHalfAvg > firstHalfAvg * 1.1
                ? 'FAIL: descriptions GROW with depth — inverse of synthesis-ramp hypothesis'
                : 'TIE: descriptions flat with depth — no synthesis effect, no opposite either';

    console.log(`\nVERDICT: ${verdict}`);

    console.log('\n=== SAMPLE DESCRIPTIONS (first, middle, last) ===');
    console.log(`[${results[0].name}]: ${results[0].tableDescription}`);
    console.log(`[${results[Math.floor(results.length/2)].name}]: ${results[Math.floor(results.length/2)].tableDescription}`);
    console.log(`[${results[results.length-1].name}]: ${results[results.length-1].tableDescription}`);

    const summary = {
        model: model(),
        chainLength: results.length,
        trends: { outTokens: outTokensTrend, descChars: descCharsTrend, latency: latencyTrend },
        firstHalfAvgDescChars: Math.round(firstHalfAvg),
        secondHalfAvgDescChars: Math.round(secondHalfAvg),
        percentChange: percentChange + '%',
        verdict,
    };
    writeFileSync(outFile, JSON.stringify({ summary, perPosition: results }, null, 2));
    console.log(`\nWritten: ${outFile}`);
}

function walkDepth(tables, name, depth = 0, visited = new Set()) {
    if (visited.has(name)) return depth;
    visited.add(name);
    const t = tables.get(name);
    if (!t || t.dependsOn.length === 0) return depth;
    return walkDepth(tables, t.dependsOn[0].table, depth + 1, visited);
}

function trendDirection(values) {
    if (values.length < 3) return 'insufficient';
    let inc = 0, dec = 0;
    for (let i = 1; i < values.length; i++) {
        if (values[i] > values[i-1]) inc++;
        else if (values[i] < values[i-1]) dec++;
    }
    if (dec > inc + 1) return 'decreasing';
    if (inc > dec + 1) return 'increasing';
    return 'flat/noisy';
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

main().catch(e => { console.error(e); process.exit(1); });
