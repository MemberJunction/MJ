#!/usr/bin/env node
// Test γ — Constrained synthesis prompt on the 10-table chain.
// Same schema + propagation as Test α, but prompt explicitly tells the LLM:
//   "You have ancestor context. Don't restate it. Write a minimal description of
//    what's unique to THIS table only."
// Goal: see if description size DECREASES with depth when the prompt incentivizes
// synthesis-not-elaboration.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema } from './lib/schema-loader.mjs';

const CHAIN_STATE = process.env.CHAIN_STATE || './chain-10-state.json';
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-gamma-${Date.now()}.json`;

function distill(table, llmDescription) {
    const first = (llmDescription || '').split(/[.!?](?:\s|$)/)[0].trim();
    return `${table.schema}.${table.name}: ${first}`;
}

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

function buildConstrainedPrompt(table, ancestorSummaries) {
    const parentsBlock = ancestorSummaries.length
        ? `## Resolved ancestors (you already know these — do NOT restate)\n${ancestorSummaries.join('\n')}`
        : '## Resolved ancestors\n(none — this is a root table)';

    const conciseDirective = ancestorSummaries.length > 0
        ? `\n\n### Conciseness directive\nThe reader already has the ancestor context above. Your tableDescription should describe ONLY what is UNIQUE about this table — what it adds that the ancestors do not. Do not re-explain the hierarchy. Target 1 short sentence, 15–25 words maximum.`
        : `\n\n### Conciseness directive\nTarget 1 concise sentence for tableDescription.`;

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

${parentsBlock}${conciseDirective}

Return JSON only.`;
}

async function main() {
    console.log(`Test γ — Constrained synthesis prompt (explicit concise directive)`);
    console.log(`Model: ${model()}`);
    console.log(`Schema: ${CHAIN_STATE}\n`);

    const tables = loadSchema(CHAIN_STATE);
    const chainOrder = [...tables.keys()].sort((a, b) => {
        return walkDepth(tables, a) - walkDepth(tables, b);
    });

    console.log(`Processing order: ${chainOrder.join(' -> ')}\n`);

    const propagation = new Map();
    const results = [];

    for (let i = 0; i < chainOrder.length; i++) {
        const name = chainOrder[i];
        const t = tables.get(name);
        const ancestors = t.dependsOn.map(d => propagation.get(d.table)).filter(Boolean);

        const prompt = buildConstrainedPrompt(t, ancestors);
        const res = await callGemini(prompt);

        let tableDesc = '';
        try { tableDesc = (JSON.parse(res.text).tableDescription) || ''; } catch {}

        const row = {
            position: i,
            name,
            ancestorCount: ancestors.length,
            promptChars: prompt.length,
            latencyMs: res.latencyMs,
            inputTokens: res.inputTokens,
            outputTokens: res.outputTokens,
            tableDescChars: tableDesc.length,
            tableDescription: tableDesc,
        };
        results.push(row);
        propagation.set(name, distill(t, tableDesc));

        console.log(`  pos ${i}  ${name.padEnd(10)}  in=${res.inputTokens}  out=${res.outputTokens}  latency=${res.latencyMs}ms  descChars=${tableDesc.length}`);
    }

    // Analysis
    const descChars = results.map(r => r.tableDescChars);
    const firstHalfAvg = avg(descChars.slice(0, 5));
    const secondHalfAvg = avg(descChars.slice(5));
    const pctChange = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1);

    const outTokens = results.map(r => r.outputTokens);
    const outFirstHalf = avg(outTokens.slice(0, 5));
    const outSecondHalf = avg(outTokens.slice(5));
    const outPct = ((outSecondHalf - outFirstHalf) / outFirstHalf * 100).toFixed(1);

    console.log(`\n=== ANALYSIS ===`);
    console.log(`Description chars  first-half ${Math.round(firstHalfAvg)}  second-half ${Math.round(secondHalfAvg)}  change ${pctChange}%`);
    console.log(`Output tokens      first-half ${Math.round(outFirstHalf)}  second-half ${Math.round(outSecondHalf)}  change ${outPct}%`);

    const verdict = secondHalfAvg < firstHalfAvg * 0.85
        ? 'STRONG PASS: description ≥15% shorter in second half — constrained synthesis works'
        : secondHalfAvg < firstHalfAvg * 0.95
            ? 'WEAK PASS: slight shrinking — directive partially effective'
            : secondHalfAvg > firstHalfAvg * 1.05
                ? 'FAIL: descriptions still grow — LLM ignoring directive'
                : 'TIE: flat — directive no effect';

    console.log(`\nVERDICT: ${verdict}`);
    console.log('\n=== SAMPLE DESCRIPTIONS (first, mid, last) ===');
    console.log(`[${results[0].name}] (no context): ${results[0].tableDescription}`);
    console.log(`[${results[4].name}]: ${results[4].tableDescription}`);
    console.log(`[${results[9].name}] (full context): ${results[9].tableDescription}`);

    const summary = {
        model: model(), chainLength: results.length,
        firstHalfAvgDescChars: Math.round(firstHalfAvg),
        secondHalfAvgDescChars: Math.round(secondHalfAvg),
        descCharsChange: pctChange + '%',
        outputTokensChange: outPct + '%',
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

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

main().catch(e => { console.error(e); process.exit(1); });
