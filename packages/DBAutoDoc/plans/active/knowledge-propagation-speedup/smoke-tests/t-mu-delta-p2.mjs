#!/usr/bin/env node
// Test μ — Delta-P2 (C5): refinement as ADDITIVE DELTA, not rewrite.
//
// Hypothesis: emit { add: string | null } instead of rewriting full description.
// This should fix BOTH failure modes from earlier tests:
//   κ: unguarded P2 hallucinated in 4/7 tables (can't happen: LLM can only add)
//   δ2: P2 kept rewriting cosmetically forever (can't happen: second pass returns null)
//
// Run on chain-10 + Chinook. Compare:
//   - Quality: does delta-P2 preserve/improve accuracy vs λ (grounded rewrite P2)?
//   - Convergence: does a SECOND delta-P2 pass return null/no-change across the board?
//   - Cost: is delta output substantially smaller than rewrite output?

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema } from './lib/schema-loader.mjs';
import { buildDistilledPrompt } from './lib/prompts.mjs';
import { mergeDelta, detectHallucination } from './lib/delta-merge.mjs';

const STATE = process.env.STATE || './chinook-state.json';
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-mu-${Date.now()}.json`;

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

function buildDeltaP2Prompt(table, ancestorSummaries, currentDesc, descendantSummaries) {
    const parents = ancestorSummaries.length
        ? `### Resolved parents (distilled)\n${ancestorSummaries.join('\n')}`
        : '### Resolved parents\n(none — root table)';

    return `You will emit a DELTA — a single short clause to APPEND to an existing table description. You MUST stay grounded in the schema below. You cannot mention entities not explicitly present in the schema or direct descendant summaries.

## Table: ${table.schema}.${table.name} (${table.rowCount} rows)

Columns:
${table.columns.map(columnLine).join('\n')}

${parents}

### Current description (sacred — do NOT rewrite)
${currentDesc}

### NEW: Descendant summaries (tables that reference this one)
${descendantSummaries.join('\n')}

### Your task
Output JSON with exactly this structure:
{
  "add": "short clause to append, OR null if descendants add no NEW information",
  "reason": "brief note"
}

### Rules (strict)
1. The current description is SACRED. Do not rewrite or rephrase it. You can ONLY add a new clause.
2. Only add information DIRECTLY supported by the descendant summaries (1-hop only).
3. If descendants add no material insight, output { "add": null, "reason": "no material addition" }.
4. Delta is ≤ 15 words, 1 short clause.
5. Factual accuracy over fluency — better to output null than to guess.

Return ONLY valid JSON.`;
}

async function runChain(tables, order) {
    // Phase A: P1 descent
    console.log('═══ P1 descent ═══');
    const summaries = new Map();
    const descriptions = new Map();
    const p1Results = [];
    for (const name of order) {
        const t = tables.get(name);
        const anc = t.dependsOn.map(d => summaries.get(d.table)).filter(Boolean);
        const prompt = buildDistilledPrompt(t, tables, anc);
        const res = await callGemini(prompt);
        let desc = '';
        try { desc = (JSON.parse(res.text).tableDescription) || ''; } catch {}
        summaries.set(name, distill(t, desc));
        descriptions.set(name, desc);
        p1Results.push({ name, latencyMs: res.latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens, description: desc });
        console.log(`  P1 ${name.padEnd(15)}  ${res.latencyMs}ms  ${res.outputTokens}out  ${desc.length}c`);
    }

    // Phase B: delta-P2 ascent (first pass)
    console.log('\n═══ delta-P2 ascent (first pass) ═══');
    const p2Results = [];
    for (let i = order.length - 1; i >= 0; i--) {
        const name = order[i];
        const t = tables.get(name);
        if (!t.dependents || t.dependents.length === 0) continue;
        const anc = t.dependsOn.map(d => summaries.get(d.table)).filter(Boolean);
        const desc = t.dependents.map(d => summaries.get(d.table)).filter(Boolean);
        if (!desc.length) continue;
        const prompt = buildDeltaP2Prompt(t, anc, descriptions.get(name), desc);
        const res = await callGemini(prompt);
        let delta = { add: null, reason: 'parse failed' };
        try { delta = JSON.parse(res.text); } catch {}

        const knownEntities = new Set([...tables.keys()]);
        const susp = delta.add ? detectHallucination(delta.add, knownEntities) : [];
        const merged = mergeDelta(descriptions.get(name), delta);
        descriptions.set(name, merged.description);
        summaries.set(name, distill(t, merged.description));

        p2Results.push({
            name,
            deltaAdd: delta.add,
            deltaReason: delta.reason,
            changed: merged.changed,
            hallucinatedEntities: susp,
            latencyMs: res.latencyMs,
            outputTokens: res.outputTokens,
            inputTokens: res.inputTokens,
            finalDesc: merged.description,
        });
        console.log(`  P2a ${name.padEnd(15)}  ${res.latencyMs}ms  ${res.outputTokens}out  changed=${merged.changed} ${susp.length ? `[HALLUC:${susp.join(',')}]` : ''}  "${(delta.add || '').slice(0, 50)}"`);
    }

    // Phase C: delta-P2 second pass (convergence check)
    console.log('\n═══ delta-P2 ascent (SECOND pass — should return null) ═══');
    const p2bResults = [];
    for (let i = order.length - 1; i >= 0; i--) {
        const name = order[i];
        const t = tables.get(name);
        if (!t.dependents || t.dependents.length === 0) continue;
        const anc = t.dependsOn.map(d => summaries.get(d.table)).filter(Boolean);
        const desc = t.dependents.map(d => summaries.get(d.table)).filter(Boolean);
        if (!desc.length) continue;
        const prompt = buildDeltaP2Prompt(t, anc, descriptions.get(name), desc);
        const res = await callGemini(prompt);
        let delta = { add: null };
        try { delta = JSON.parse(res.text); } catch {}
        const merged = mergeDelta(descriptions.get(name), delta);
        p2bResults.push({ name, deltaAdd: delta.add, changed: merged.changed, latencyMs: res.latencyMs, outputTokens: res.outputTokens });
        console.log(`  P2b ${name.padEnd(15)}  ${res.latencyMs}ms  ${res.outputTokens}out  changed=${merged.changed}  "${(delta.add || '').slice(0, 50)}"`);
    }

    return { p1Results, p2Results, p2bResults, finalDescriptions: Object.fromEntries(descriptions) };
}

async function main() {
    console.log(`Test μ — Delta-P2 refinement`);
    console.log(`Model: ${model()}  Schema: ${STATE}\n`);
    const tables = loadSchema(STATE);
    const order = topoOrder(tables);

    const result = await runChain(tables, order);

    const p1Total = {
        calls: result.p1Results.length,
        latency: result.p1Results.reduce((s, r) => s + r.latencyMs, 0),
        outputTokens: result.p1Results.reduce((s, r) => s + r.outputTokens, 0),
    };
    const p2aChanged = result.p2Results.filter(r => r.changed).length;
    const p2aHallucinated = result.p2Results.filter(r => r.hallucinatedEntities.length > 0).length;
    const p2aTotal = {
        calls: result.p2Results.length,
        latency: result.p2Results.reduce((s, r) => s + r.latencyMs, 0),
        outputTokens: result.p2Results.reduce((s, r) => s + r.outputTokens, 0),
    };
    const p2bChanged = result.p2bResults.filter(r => r.changed).length;
    const p2bTotal = {
        calls: result.p2bResults.length,
        latency: result.p2bResults.reduce((s, r) => s + r.latencyMs, 0),
        outputTokens: result.p2bResults.reduce((s, r) => s + r.outputTokens, 0),
    };

    console.log('\n═══ SUMMARY ═══');
    console.log(`P1       ${p1Total.calls} calls  ${p1Total.latency}ms  avg ${Math.round(p1Total.latency / p1Total.calls)}ms  ${p1Total.outputTokens} out-tokens`);
    console.log(`delta-P2 ${p2aTotal.calls} calls  ${p2aTotal.latency}ms  avg ${Math.round(p2aTotal.latency / Math.max(1, p2aTotal.calls))}ms  ${p2aTotal.outputTokens} out-tokens   changed=${p2aChanged}/${p2aTotal.calls}  halluc=${p2aHallucinated}/${p2aTotal.calls}`);
    console.log(`delta-P2b ${p2bTotal.calls} calls  ${p2bTotal.latency}ms  avg ${Math.round(p2bTotal.latency / Math.max(1, p2bTotal.calls))}ms  ${p2bTotal.outputTokens} out-tokens   changed=${p2bChanged}/${p2bTotal.calls}`);

    console.log(`\nP2a / P1 latency ratio:     ${(p2aTotal.latency / p1Total.latency).toFixed(3)}`);
    console.log(`P2a / P1 output-tokens ratio: ${(p2aTotal.outputTokens / p1Total.outputTokens).toFixed(3)}`);
    console.log(`P2b convergence ratio:     ${((1 - p2bChanged / Math.max(1, p2bTotal.calls)) * 100).toFixed(0)}% of second-pass calls returned no-change`);

    const verdicts = [];
    if (p2aHallucinated === 0) verdicts.push('✅ Hallucination-free (I2 invariant holds)');
    else verdicts.push(`⚠️  ${p2aHallucinated} suspicious additions — review needed`);

    if (p2bChanged <= Math.ceil(p2bTotal.calls * 0.3)) verdicts.push('✅ Second pass converges (≤30% changed)');
    else verdicts.push(`❌ Second pass still changing ${p2bChanged}/${p2bTotal.calls} — convergence not robust`);

    if (p2aTotal.outputTokens / p1Total.outputTokens < 0.5) verdicts.push('✅ Deltas substantially smaller than P1 outputs');
    else verdicts.push(`⚠️  Deltas aren't much smaller than P1 outputs`);

    console.log(`\n═══ VERDICTS ═══`);
    for (const v of verdicts) console.log(`  ${v}`);

    console.log(`\n═══ SAMPLE FINAL DESCRIPTIONS ═══`);
    const sampleNames = order.slice(0, Math.min(4, order.length));
    for (const n of sampleNames) {
        console.log(`\n[${n}]: ${result.finalDescriptions[n]}`);
    }

    const summary = {
        model: model(),
        p1: p1Total,
        p2a: { ...p2aTotal, changed: p2aChanged, hallucinated: p2aHallucinated },
        p2b: { ...p2bTotal, changed: p2bChanged },
        verdicts,
    };
    writeFileSync(outFile, JSON.stringify({ summary, ...result }, null, 2));
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
