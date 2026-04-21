#!/usr/bin/env node
// Test λ — Grounded P2: restore full schema context in the ascent prompt.
// Fix for the hallucination found in Test κ. P2 now sees:
//   - full table columns (stats, FK details)
//   - parent summaries
//   - current description (from P1)
//   - descendant summaries (new in P2)
// Rule: only add facts supported by schema or direct descendants; no extrapolation.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema } from './lib/schema-loader.mjs';
import { buildDistilledPrompt } from './lib/prompts.mjs';

const STATE = process.env.CHINOOK_STATE || './chinook-state.json';
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-lambda-${Date.now()}.json`;

function distill(table, desc) {
    const first = (desc || '').split(/[.!?](?:\s|$)/)[0].trim();
    return `${table.schema}.${table.name}: ${first}`;
}

function columnLine(c) {
    const bits = [`${c.name} (${c.dataType}${c.isNullable ? '' : ' NOT NULL'}`];
    if (c.isPrimaryKey) bits.push('PK');
    if (c.distinctCount != null) bits.push(`${c.distinctCount} distinct`);
    bits.push(')');
    const fk = (c.isForeignKey && c.fkRef)
        ? ` — FK → ${c.fkRef.schema}.${c.fkRef.table}.${c.fkRef.referencedColumn ?? c.fkRef.column}`
        : '';
    return `- ${bits.join(', ').replace(', )', ')')}${fk}`;
}

// GROUNDED P2: includes full schema context plus descendant summaries, with
// anti-hallucination directive.
function buildGroundedP2(table, ancestorSummaries, currentDesc, descendantSummaries) {
    const parents = ancestorSummaries.length
        ? `### Resolved parents (distilled)\n${ancestorSummaries.join('\n')}`
        : '### Resolved parents\n(none — root table)';

    return `You will REFINE an existing table description given new information about the table's descendants. You MUST stay grounded in the schema below. Do NOT extrapolate to entities not explicitly present in the schema or the direct descendant summaries.

## Table: ${table.schema}.${table.name} (${table.rowCount} rows)

Columns:
${table.columns.map(columnLine).join('\n')}

${parents}

### Current description (from prior pass)
${currentDesc}

### NEW: Descendant summaries (tables that reference this one)
${descendantSummaries.join('\n')}

### Rules (strict)
1. Output an updated description ONLY if the descendant summaries contribute a concept that is ALREADY present in this table's schema or in its direct descendants' names. Otherwise set changed=false.
2. Do NOT mention entities that are more than 1 hop away (e.g., if Track is a direct descendant, Track's own descendants are NOT available to you).
3. Stay within 1 short sentence, 15-25 words.
4. Preserve factual accuracy — it is better to leave the description unchanged than to hallucinate relationships.

Return JSON:
{ "tableDescription": "...", "changed": true|false, "reason": "brief note" }`;
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
  "bScoreDescendantAwareness": 1-10,
  "bHallucinates": true | false
}`;
}

function buildSchemaContext(table) {
    const cols = table.columns.map(c => `  - ${c.name} (${c.dataType}${c.isPrimaryKey ? ', PK' : ''}${c.isForeignKey ? `, FK → ${c.fkRef?.schema}.${c.fkRef?.table}` : ''})`).join('\n');
    const deps = table.dependsOn.map(d => `${d.schema}.${d.table}`).join(', ');
    const depts = (table.dependents || []).map(d => `${d.schema}.${d.table}`).join(', ');
    return [
        `Table: ${table.schema}.${table.name} (${table.rowCount} rows)`,
        `Columns:\n${cols}`,
        deps ? `Depends on: ${deps}` : 'Depends on: (none)',
        depts ? `Referenced by: ${depts}` : 'Referenced by: (none)',
    ].join('\n');
}

async function main() {
    console.log(`Test λ — Grounded P2 (schema restored in ascent)`);
    console.log(`Model: ${model()}\n`);
    const tables = loadSchema(STATE);
    const order = topoOrder(tables);

    // P1 descent
    console.log('═══ P1 descent ═══');
    const propagation = new Map(), p1Descs = new Map();
    let p1Lat = 0;
    for (const name of order) {
        const t = tables.get(name);
        const anc = t.dependsOn.map(d => propagation.get(d.table)).filter(Boolean);
        const prompt = buildDistilledPrompt(t, tables, anc);
        const res = await callGemini(prompt);
        let d = '';
        try { d = (JSON.parse(res.text).tableDescription) || ''; } catch {}
        p1Descs.set(name, d); propagation.set(name, distill(t, d)); p1Lat += res.latencyMs;
        console.log(`  P1  ${name.padEnd(15)}  ${res.latencyMs}ms  ${d.length}c`);
    }

    // Grounded P2 ascent
    console.log('\n═══ Grounded P2 ascent (full schema restored) ═══');
    const p2Descs = new Map(p1Descs);
    let p2Lat = 0, p2Calls = 0;
    const p2Meta = [];
    for (let i = order.length - 1; i >= 0; i--) {
        const name = order[i];
        const t = tables.get(name);
        if (!t.dependents?.length) continue;
        const anc = t.dependsOn.map(d => propagation.get(d.table)).filter(Boolean);
        const desc = t.dependents.map(d => propagation.get(d.table)).filter(Boolean);
        if (!desc.length) continue;
        const prompt = buildGroundedP2(t, anc, p2Descs.get(name), desc);
        const res = await callGemini(prompt);
        let d = p2Descs.get(name), changed = false, reason = '';
        try { const p = JSON.parse(res.text); changed = !!p.changed; reason = p.reason || ''; if (changed) d = p.tableDescription || d; } catch {}
        p2Descs.set(name, d); propagation.set(name, distill(t, d)); p2Lat += res.latencyMs; p2Calls++;
        p2Meta.push({ name, changed, reason, latencyMs: res.latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens });
        console.log(`  P2  ${name.padEnd(15)}  ${res.latencyMs}ms  ${res.outputTokens}out  changed=${changed}  ${reason.slice(0, 60)}`);
    }

    // Judge
    console.log('\n═══ Judge: A=P1-only, B=P1+grounded-P2 ═══');
    const comparable = order.filter(n => tables.get(n).dependents?.length > 0);
    const judgements = [];
    for (const name of comparable) {
        const t = tables.get(name);
        const a = p1Descs.get(name), b = p2Descs.get(name);
        if (a === b) {
            judgements.push({ name, winner: 'tie', note: 'identical (P2 unchanged)', a, b });
            console.log(`  ${name.padEnd(15)}  tie (P2 unchanged)`);
            continue;
        }
        const ctx = buildSchemaContext(t);
        const res = await callGemini(buildJudge(t, a, b, ctx));
        let j = {};
        try { j = JSON.parse(res.text); } catch { j = { winner: 'error' }; }
        judgements.push({ name, ...j, a, b });
        console.log(`  ${name.padEnd(15)}  winner=${j.winner}  A.acc=${j.aScoreAccuracy}  B.acc=${j.bScoreAccuracy}  halluc=${j.bHallucinates}`);
    }

    // Summary
    const wins = { A: 0, B: 0, tie: 0, error: 0 };
    let aAccSum = 0, bAccSum = 0, aDescSum = 0, bDescSum = 0, scoreCount = 0, hallucCount = 0;
    for (const j of judgements) {
        if (j.winner === 'A') wins.A++;
        else if (j.winner === 'B') wins.B++;
        else if (j.winner === 'tie') wins.tie++;
        else wins.error++;
        if (typeof j.aScoreAccuracy === 'number') {
            aAccSum += j.aScoreAccuracy; bAccSum += j.bScoreAccuracy;
            aDescSum += j.aScoreDescendantAwareness; bDescSum += j.bScoreDescendantAwareness;
            scoreCount++;
        }
        if (j.bHallucinates === true) hallucCount++;
    }

    console.log('\n═══ RESULTS ═══');
    console.log(`Wins:  A(P1-only)=${wins.A}  B(P1+grounded-P2)=${wins.B}  tie=${wins.tie}  error=${wins.error}`);
    if (scoreCount > 0) {
        console.log(`Avg accuracy:         A=${(aAccSum/scoreCount).toFixed(1)}  B=${(bAccSum/scoreCount).toFixed(1)}`);
        console.log(`Avg descendant-aware: A=${(aDescSum/scoreCount).toFixed(1)}  B=${(bDescSum/scoreCount).toFixed(1)}`);
    }
    console.log(`Hallucination flagged in ${hallucCount}/${judgements.length} P2 outputs  (kappa was ~4/7)`);
    console.log(`Timing: P1 ${p1Lat}ms (${order.length} calls), P2 ${p2Lat}ms (${p2Calls} calls)`);

    // Compare with kappa (unguarded P2)
    console.log('\n═══ COMPARISON TO KAPPA (unguarded P2) ═══');
    console.log(`Kappa: B wins 2/7, A wins 4/7, acc A=9.8 B=8.2, desc-aware A=4.5 B=8.5`);
    console.log(`This:  B wins ${wins.B}/${comparable.length}, A wins ${wins.A}/${comparable.length}`);

    console.log('\n═══ SIDE-BY-SIDE (up to 4) ═══');
    for (const j of judgements.slice(0, 4)) {
        console.log(`\n--- ${j.name} ---`);
        console.log(`A (P1):   ${j.a}`);
        console.log(`B (P1+grounded-P2): ${j.b}`);
        console.log(`Winner: ${j.winner}${j.bHallucinates ? '  [B HALLUCINATES]' : ''}`);
        if (j.reason) console.log(`Reason: ${j.reason.slice(0, 180)}`);
    }

    writeFileSync(outFile, JSON.stringify({
        summary: {
            model: model(), timing: { p1Ms: p1Lat, p2Ms: p2Lat, p1Calls: order.length, p2Calls },
            wins, avgAccA: scoreCount ? aAccSum/scoreCount : null, avgAccB: scoreCount ? bAccSum/scoreCount : null,
            hallucinationCount: hallucCount, comparedCount: judgements.length,
        },
        judgements, p2Meta, p1Descs: Object.fromEntries(p1Descs), p2Descs: Object.fromEntries(p2Descs),
    }, null, 2));
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
