#!/usr/bin/env node
// Test κ — Does P1+P2 produce QUALITATIVELY BETTER descriptions than P1 alone?
//
// Method: run P1 descent on Chinook, save P1 descriptions, then run P2 ascent.
// For each non-leaf table, we now have P1-only and P1+P2-refined descriptions.
// A judge Gemini call rates each pair: accuracy, descendant-awareness, overall preference.

import { writeFileSync, readFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema } from './lib/schema-loader.mjs';
import { buildDistilledPrompt } from './lib/prompts.mjs';

const STATE = process.env.CHINOOK_STATE || './chinook-state.json';
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-kappa-${Date.now()}.json`;

function distill(table, desc) {
    const first = (desc || '').split(/[.!?](?:\s|$)/)[0].trim();
    return `${table.schema}.${table.name}: ${first}`;
}

function buildP2(table, currentDesc, descendants) {
    return `Refine a table description given NEW information about the table's descendants.

## Table: ${table.schema}.${table.name}

### Current description
${currentDesc}

### Descendants (tables that reference this one)
${descendants.join('\n')}

### Your task
Produce an updated tableDescription OR the literal "UNCHANGED" if descendants add nothing.

Return JSON: { "tableDescription": "...", "changed": true|false }

Rules: 1 short sentence, 15-25 words. Don't restate descendant details verbatim; integrate into this table's purpose.`;
}

function buildJudge(table, p1Desc, p2Desc, schemaContext) {
    return `You are evaluating two candidate descriptions of a database table. Judge which is more accurate and informative given the schema context.

## Schema context
${schemaContext}

## Candidate A
${p1Desc}

## Candidate B
${p2Desc}

Return JSON:
{
  "winner": "A" | "B" | "tie",
  "reason": "short reason, focusing on accuracy and completeness",
  "aScoreAccuracy": 1-10,
  "bScoreAccuracy": 1-10,
  "aScoreDescendantAwareness": 1-10,
  "bScoreDescendantAwareness": 1-10
}`;
}

function buildSchemaContext(table, tables) {
    const cols = table.columns.map(c => `  - ${c.name} (${c.dataType}${c.isPrimaryKey ? ', PK' : ''}${c.isForeignKey ? `, FK → ${c.fkRef?.schema}.${c.fkRef?.table}` : ''})`).join('\n');
    const deps = table.dependsOn.map(d => `${d.schema}.${d.table}`).join(', ');
    const ctx = [
        `Table: ${table.schema}.${table.name} (${table.rowCount} rows)`,
        `Columns:\n${cols}`,
        deps ? `Depends on: ${deps}` : 'Depends on: (none — root table)',
    ];
    // Include dependents
    const depts = (table.dependents || []).map(d => `${d.schema}.${d.table}`).join(', ');
    if (depts) ctx.push(`Referenced by: ${depts}`);
    return ctx.join('\n');
}

async function main() {
    console.log(`Test κ — P1-only vs P1+P2 quality comparison on Chinook`);
    console.log(`Model: ${model()}  Schema: ${STATE}\n`);
    const tables = loadSchema(STATE);
    // Topological order (roots first)
    const order = topoOrder(tables);

    // ═══ P1 descent ═══
    console.log('═══ P1 descent (capture descriptions) ═══');
    const propagation = new Map();
    const p1Descs = new Map();
    let p1TotalLat = 0;
    for (const name of order) {
        const t = tables.get(name);
        const anc = t.dependsOn.map(d => propagation.get(d.table)).filter(Boolean);
        const prompt = buildDistilledPrompt(t, tables, anc);
        const res = await callGemini(prompt);
        let d = '';
        try { d = (JSON.parse(res.text).tableDescription) || ''; } catch {}
        p1Descs.set(name, d);
        propagation.set(name, distill(t, d));
        p1TotalLat += res.latencyMs;
        console.log(`  P1  ${name.padEnd(15)}  ${res.latencyMs}ms  ${d.length}c`);
    }

    // ═══ P2 ascent ═══
    console.log('\n═══ P2 ascent (refine using descendants) ═══');
    const p1P2Descs = new Map(p1Descs);
    let p2TotalLat = 0;
    let p2CallCount = 0;
    for (let i = order.length - 1; i >= 0; i--) {
        const name = order[i];
        const t = tables.get(name);
        if (!t.dependents || t.dependents.length === 0) continue;
        const descSummaries = t.dependents.map(d => propagation.get(d.table)).filter(Boolean);
        if (!descSummaries.length) continue;
        const prompt = buildP2(t, p1P2Descs.get(name), descSummaries);
        const res = await callGemini(prompt);
        let d = p1P2Descs.get(name), changed = false;
        try { const p = JSON.parse(res.text); changed = !!p.changed; if (changed) d = p.tableDescription || p1P2Descs.get(name); } catch {}
        p1P2Descs.set(name, d);
        propagation.set(name, distill(t, d));
        p2TotalLat += res.latencyMs;
        p2CallCount++;
        console.log(`  P2  ${name.padEnd(15)}  ${res.latencyMs}ms  changed=${changed}`);
    }

    // ═══ Judge comparison ═══
    console.log('\n═══ Judge: compare P1-only vs P1+P2 per table ═══');
    const judgements = [];
    // Only judge tables where P2 could have changed things (i.e. non-leaves)
    const comparableTables = order.filter(n => {
        const t = tables.get(n);
        return t.dependents && t.dependents.length > 0;
    });
    for (const name of comparableTables) {
        const t = tables.get(name);
        const a = p1Descs.get(name);
        const b = p1P2Descs.get(name);
        if (!a || !b || a === b) {
            judgements.push({ name, winner: 'tie', note: a === b ? 'identical' : 'missing data', a, b });
            console.log(`  ${name.padEnd(15)}  tie (${a === b ? 'identical' : 'missing data'})`);
            continue;
        }
        const ctx = buildSchemaContext(t, tables);
        const prompt = buildJudge(t, a, b, ctx);
        const res = await callGemini(prompt);
        let j = { winner: 'error' };
        try { j = JSON.parse(res.text); } catch {}
        judgements.push({ name, ...j, a, b });
        console.log(`  ${name.padEnd(15)}  winner=${j.winner}  A.acc=${j.aScoreAccuracy}  B.acc=${j.bScoreAccuracy}  A.desc-aware=${j.aScoreDescendantAwareness}  B.desc-aware=${j.bScoreDescendantAwareness}`);
    }

    // ═══ Summary ═══
    const winners = { A: 0, B: 0, tie: 0, error: 0 };
    let aAccSum = 0, bAccSum = 0, aDescSum = 0, bDescSum = 0, scoreCount = 0;
    for (const j of judgements) {
        if (j.winner === 'A') winners.A++;
        else if (j.winner === 'B') winners.B++;
        else if (j.winner === 'tie') winners.tie++;
        else winners.error++;
        if (typeof j.aScoreAccuracy === 'number') {
            aAccSum += j.aScoreAccuracy; bAccSum += j.bScoreAccuracy;
            aDescSum += j.aScoreDescendantAwareness; bDescSum += j.bScoreDescendantAwareness;
            scoreCount++;
        }
    }

    console.log('\n═══ RESULTS ═══');
    console.log(`Judge wins: A(P1-only)=${winners.A}  B(P1+P2)=${winners.B}  tie=${winners.tie}  error=${winners.error}`);
    if (scoreCount > 0) {
        console.log(`Avg accuracy:           A=${(aAccSum / scoreCount).toFixed(1)}  B=${(bAccSum / scoreCount).toFixed(1)}`);
        console.log(`Avg descendant-aware:   A=${(aDescSum / scoreCount).toFixed(1)}  B=${(bDescSum / scoreCount).toFixed(1)}`);
    }
    console.log(`\nTiming: P1 ${p1TotalLat}ms (${order.length} calls), P2 ${p2TotalLat}ms (${p2CallCount} calls)`);

    const summary = {
        model: model(),
        tables: order.length, comparedTables: comparableTables.length,
        timing: { p1TotalMs: p1TotalLat, p2TotalMs: p2TotalLat, p1Calls: order.length, p2Calls: p2CallCount },
        judge: {
            wins: winners,
            avgAccuracyA: scoreCount ? aAccSum / scoreCount : null,
            avgAccuracyB: scoreCount ? bAccSum / scoreCount : null,
            avgDescendantAwareA: scoreCount ? aDescSum / scoreCount : null,
            avgDescendantAwareB: scoreCount ? bDescSum / scoreCount : null,
        },
    };

    // Show a few full side-by-sides
    console.log('\n═══ SIDE-BY-SIDE (3 examples) ═══');
    for (const j of judgements.slice(0, 3)) {
        console.log(`\n--- ${j.name} ---`);
        console.log(`A (P1-only): ${j.a}`);
        console.log(`B (P1+P2):   ${j.b}`);
        console.log(`Judge:       winner=${j.winner}, reason: ${(j.reason || '').slice(0, 200)}`);
    }

    writeFileSync(outFile, JSON.stringify({ summary, judgements, p1Descs: Object.fromEntries(p1Descs), p1P2Descs: Object.fromEntries(p1P2Descs) }, null, 2));
    console.log(`\nWritten: ${outFile}`);
}

function topoOrder(tables) {
    const inDeg = new Map();
    for (const [n, t] of tables) inDeg.set(n, t.dependsOn.length);
    const result = [];
    while (result.length < tables.size) {
        const ready = [...tables.keys()].filter(n => !result.includes(n) && inDeg.get(n) === 0).sort();
        if (!ready.length) break;
        const next = ready[0];
        result.push(next);
        for (const [n, t] of tables) {
            if (t.dependsOn.some(d => d.table === next)) inDeg.set(n, inDeg.get(n) - 1);
        }
    }
    return result;
}

main().catch(e => { console.error(e); process.exit(1); });
