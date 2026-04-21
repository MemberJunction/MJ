#!/usr/bin/env node
// Test δ — P1+P2 bidirectional DFS on the 10-table chain.
//
// Descent (P1):  process roots → leaves in VIF order, using distilled ancestor summaries.
//                Each P1 is a full-description prompt (like Test γ, with concise directive).
//
// Ascent (P2):   process leaves → roots in REVERSE, using distilled DESCENDANT summaries.
//                Each P2 is a SHORT refinement prompt:
//                  "Here's your current description + what we learned about your descendants.
//                   Output an updated 1-sentence description, OR 'UNCHANGED' if nothing shifts."
//
// Hypothesis: P2 calls should be substantially cheaper than P1 (smaller output, faster latency)
// because they're refinements, not generations. Total (P1+P2) cost should beat 2 full iterations.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema } from './lib/schema-loader.mjs';

const CHAIN_STATE = process.env.CHAIN_STATE || './chain-10-state.json';
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-delta-${Date.now()}.json`;

function columnLine(c) {
    const bits = [`${c.name} (${c.dataType}${c.isNullable ? '' : ' NOT NULL'}`];
    if (c.isPrimaryKey) bits.push('PK');
    if (c.statistics?.distinctCount != null) bits.push(`${c.statistics.distinctCount} distinct`);
    bits.push(')');
    const fk = (c.isForeignKey && c.foreignKeyReferences)
        ? ` — FK → ${c.foreignKeyReferences.schema}.${c.foreignKeyReferences.table}.${c.foreignKeyReferences.referencedColumn}`
        : '';
    return `- ${bits.join(', ').replace(', )', ')')}${fk}`;
}

function distill(table, desc) {
    const first = (desc || '').split(/[.!?](?:\s|$)/)[0].trim();
    return `${table.schema}.${table.name}: ${first}`;
}

// P1 — full description from ancestor context (concise directive)
function buildP1Prompt(table, ancestorSummaries) {
    const parentsBlock = ancestorSummaries.length
        ? `## Resolved ancestors (do NOT restate — build on them)\n${ancestorSummaries.join('\n')}`
        : '## Resolved ancestors\n(none — root table)';
    const directive = ancestorSummaries.length > 0
        ? `### Conciseness directive\nDescribe ONLY what is unique to this table. Target 1 short sentence, 15–25 words.`
        : `### Conciseness directive\n1 concise sentence.`;

    return `Describe a database table. Return JSON:
{
  "tableDescription": "...",
  "columnDescriptions": [{"columnName":"...","description":"..."}],
  "primaryKey": {"columns":[...],"confidence":0.0},
  "foreignKeys": [{"columnName":"...","referencesSchema":"...","referencesTable":"...","referencesColumn":"...","confidence":0.0}],
  "inferredBusinessDomain": "..."
}

## Table: ${table.schema}.${table.name} (${table.rowCount} rows)

Columns:
${table.columns.map(columnLine).join('\n')}

${parentsBlock}

${directive}

Return JSON only.`;
}

// P2 — refinement given descendant context. Very small.
function buildP2Prompt(table, currentDescription, descendantSummaries) {
    return `Refine a table description given NEW information about the table's descendants (tables that reference it).

## Table: ${table.schema}.${table.name}

### Current description
${currentDescription}

### New descendant information (tables that use this as a parent)
${descendantSummaries.join('\n')}

### Your task
Produce an updated tableDescription OR the literal string "UNCHANGED" if the descendants add nothing material.

Return JSON:
{ "tableDescription": "...", "changed": true|false }

Rules:
- If "changed" is false, set tableDescription to the current description verbatim.
- If "changed" is true, output a refined 1-sentence description (15–25 words) that incorporates descendant insight.
- Do not restate descendant details verbatim — integrate them into this table's purpose.`;
}

async function main() {
    console.log(`Test δ — P1+P2 bidirectional DFS on chain-10`);
    console.log(`Model: ${model()}`);
    console.log(`Schema: ${CHAIN_STATE}\n`);

    const tables = loadSchema(CHAIN_STATE);
    const order = [...tables.keys()].sort((a, b) => walkDepth(tables, a) - walkDepth(tables, b));
    console.log(`Chain (descent order): ${order.join(' -> ')}\n`);

    // ═══ DESCENT (P1) ═══
    console.log('═══ DESCENT (P1) ═══');
    const propagation = new Map();       // name -> distilled summary
    const descriptions = new Map();      // name -> full current description
    const p1Results = [];

    for (let i = 0; i < order.length; i++) {
        const name = order[i];
        const t = tables.get(name);
        const ancestors = t.dependsOn.map(d => propagation.get(d.table)).filter(Boolean);
        const prompt = buildP1Prompt(t, ancestors);
        const res = await callGemini(prompt);
        let desc = '';
        try { desc = (JSON.parse(res.text).tableDescription) || ''; } catch {}

        propagation.set(name, distill(t, desc));
        descriptions.set(name, desc);

        const row = {
            phase: 'P1', position: i, name,
            ancestorCount: ancestors.length,
            promptChars: prompt.length,
            latencyMs: res.latencyMs,
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
            descChars: desc.length,
        };
        p1Results.push(row);
        console.log(`  P1 ${i}  ${name.padEnd(10)}  in=${res.inputTokens}  out=${res.outputTokens}  lat=${res.latencyMs}ms  descChars=${desc.length}`);
    }

    // ═══ ASCENT (P2) ═══
    // Process in REVERSE order. For each table (except leaf), refine using its descendant's P1 summary.
    console.log('\n═══ ASCENT (P2) ═══');
    const p2Results = [];
    for (let i = order.length - 1; i >= 0; i--) {
        const name = order[i];
        const t = tables.get(name);
        if (t.dependents.length === 0) {
            console.log(`  P2 ${i}  ${name.padEnd(10)}  (leaf — skipped)`);
            continue;
        }

        const descendantSummaries = t.dependents.map(d => propagation.get(d.table)).filter(Boolean);
        const prompt = buildP2Prompt(t, descriptions.get(name), descendantSummaries);
        const res = await callGemini(prompt);
        let updated = descriptions.get(name);
        let changed = false;
        try {
            const parsed = JSON.parse(res.text);
            changed = !!parsed.changed;
            if (changed && parsed.tableDescription) {
                updated = parsed.tableDescription;
                descriptions.set(name, updated);
                propagation.set(name, distill(t, updated));
            }
        } catch {}

        const row = {
            phase: 'P2', position: i, name,
            descendantCount: descendantSummaries.length,
            promptChars: prompt.length,
            latencyMs: res.latencyMs,
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
            changed,
            descCharsAfter: updated.length,
        };
        p2Results.push(row);
        console.log(`  P2 ${i}  ${name.padEnd(10)}  in=${res.inputTokens}  out=${res.outputTokens}  lat=${res.latencyMs}ms  changed=${changed}`);
    }

    // ═══ ANALYSIS ═══
    const p1Total = {
        calls: p1Results.length,
        latency: p1Results.reduce((s, r) => s + r.latencyMs, 0),
        inputTokens: p1Results.reduce((s, r) => s + r.inputTokens, 0),
        outputTokens: p1Results.reduce((s, r) => s + r.outputTokens, 0),
        avgLatency: Math.round(p1Results.reduce((s, r) => s + r.latencyMs, 0) / p1Results.length),
        avgOutputTokens: Math.round(p1Results.reduce((s, r) => s + r.outputTokens, 0) / p1Results.length),
    };
    const p2Total = {
        calls: p2Results.length,
        latency: p2Results.reduce((s, r) => s + r.latencyMs, 0),
        inputTokens: p2Results.reduce((s, r) => s + r.inputTokens, 0),
        outputTokens: p2Results.reduce((s, r) => s + r.outputTokens, 0),
        avgLatency: p2Results.length ? Math.round(p2Results.reduce((s, r) => s + r.latencyMs, 0) / p2Results.length) : 0,
        avgOutputTokens: p2Results.length ? Math.round(p2Results.reduce((s, r) => s + r.outputTokens, 0) / p2Results.length) : 0,
        changedCount: p2Results.filter(r => r.changed).length,
    };
    const grand = {
        totalCalls: p1Total.calls + p2Total.calls,
        totalLatency: p1Total.latency + p2Total.latency,
        totalInputTokens: p1Total.inputTokens + p2Total.inputTokens,
        totalOutputTokens: p1Total.outputTokens + p2Total.outputTokens,
    };

    // Compare P2 avg cost vs P1 avg cost
    const p2OverP1Latency = p2Total.avgLatency / p1Total.avgLatency;
    const p2OverP1Output = p2Total.avgOutputTokens / p1Total.avgOutputTokens;

    console.log('\n═══ SUMMARY ═══');
    console.log(`P1 (descent): ${p1Total.calls} calls, ${p1Total.latency}ms total, avg ${p1Total.avgLatency}ms, ${p1Total.avgOutputTokens} out-tok avg`);
    console.log(`P2 (ascent):  ${p2Total.calls} calls, ${p2Total.latency}ms total, avg ${p2Total.avgLatency}ms, ${p2Total.avgOutputTokens} out-tok avg, ${p2Total.changedCount} updated`);
    console.log(`\nP2 / P1 latency ratio:       ${p2OverP1Latency.toFixed(3)}  ← smaller = refinement-is-cheaper hypothesis supported`);
    console.log(`P2 / P1 output tokens ratio: ${p2OverP1Output.toFixed(3)}`);
    console.log(`\nGrand total: ${grand.totalCalls} calls, ${grand.totalLatency}ms wall, ${grand.totalOutputTokens} total output tokens`);
    console.log(`vs. 2 full iterations today (20 calls at ~${p1Total.avgLatency}ms ea): ${20 * p1Total.avgLatency}ms projected`);
    console.log(`P1+P2 saves vs 2-iter: ${(1 - grand.totalLatency / (20 * p1Total.avgLatency)) * 100 | 0}%`);

    const verdict = p2OverP1Latency < 0.7
        ? 'STRONG PASS: P2 refinements meaningfully cheaper than P1 generations'
        : p2OverP1Latency < 0.9
            ? 'PASS: P2 is somewhat cheaper'
            : p2OverP1Latency < 1.1
                ? 'TIE: P2 same cost as P1 — refinement not meaningfully cheaper'
                : 'FAIL: P2 more expensive than P1';

    console.log(`\nVERDICT: ${verdict}`);

    // Show final vs initial description for a mid table (did P2 refine?)
    const midName = order[Math.floor(order.length / 2)];
    const midP1 = p1Results.find(r => r.name === midName);
    const midP2 = p2Results.find(r => r.name === midName);
    if (midP1 && midP2) {
        console.log(`\nSample (${midName}):`);
        console.log(`  after P1 (${midP1.descChars} chars): ${p1Results.find(r => r.name === midName) ? descriptions.get(midName).slice(0, 160) : ''}`);
        console.log(`  P2 changed = ${midP2.changed}`);
    }

    writeFileSync(outFile, JSON.stringify({
        summary: { model: model(), p1: p1Total, p2: p2Total, grand, p2OverP1Latency, p2OverP1Output, verdict },
        p1Results, p2Results,
    }, null, 2));
    console.log(`\nWritten: ${outFile}`);
}

function walkDepth(tables, name, depth = 0, visited = new Set()) {
    if (visited.has(name)) return depth;
    visited.add(name);
    const t = tables.get(name);
    if (!t || t.dependsOn.length === 0) return depth;
    return walkDepth(tables, t.dependsOn[0].table, depth + 1, visited);
}

main().catch(e => { console.error(e); process.exit(1); });
