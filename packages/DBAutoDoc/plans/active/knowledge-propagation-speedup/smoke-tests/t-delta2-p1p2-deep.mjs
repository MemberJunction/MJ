#!/usr/bin/env node
// Test δ2 — Deep investigation of P1+P2 refinement quality.
//
// Three phases on the chain-10:
//   Phase A: P1 descent (as before)
//   Phase B: P2 ascent (refines via descendant context)
//   Phase C: SECOND P2 ascent — does it still change, or detect convergence?
//
// Captures full descriptions. Computes per-table diff (added/removed words).
// Goal: confirm P2 is doing meaningful work AND test the stability/convergence claim.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema } from './lib/schema-loader.mjs';

const CHAIN_STATE = process.env.CHAIN_STATE || './chain-10-state.json';
const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t-delta2-${Date.now()}.json`;

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

function buildP1(table, ancestors) {
    const parents = ancestors.length
        ? `## Resolved ancestors (do NOT restate — build on them)\n${ancestors.join('\n')}`
        : '## Resolved ancestors\n(none — root table)';
    const dir = ancestors.length > 0
        ? `### Conciseness directive\nDescribe ONLY what is unique. 1 sentence, 15–25 words.`
        : `### Conciseness directive\n1 concise sentence.`;
    return `Describe a database table. Return JSON:
{"tableDescription":"...","columnDescriptions":[{"columnName":"...","description":"..."}],"primaryKey":{"columns":[...],"confidence":0.0},"foreignKeys":[{"columnName":"...","referencesSchema":"...","referencesTable":"...","referencesColumn":"...","confidence":0.0}],"inferredBusinessDomain":"..."}

## Table: ${table.schema}.${table.name} (${table.rowCount} rows)

Columns:
${table.columns.map(columnLine).join('\n')}

${parents}

${dir}

Return JSON only.`;
}

function buildP2(table, currentDesc, descendants) {
    return `Refine a table description given NEW information about this table's descendants.

## Table: ${table.schema}.${table.name}

### Current description
${currentDesc}

### New descendant information (tables that reference this one)
${descendants.join('\n')}

### Your task
Output an updated tableDescription OR the literal string "UNCHANGED" if descendants add NOTHING material.

Return JSON:
{ "tableDescription": "...", "changed": true|false, "whatChanged": "brief note on what you added or why unchanged" }

Rules:
- If descendants truly add no new insight, set changed=false and tableDescription to the current description verbatim.
- If changed=true: output a refined 1-sentence description (15–25 words). Do not restate descendant details.
- Be truthful about "changed" — if you don't actually change the meaning, set false.`;
}

function wordSet(s) {
    return new Set(
        s.toLowerCase()
            .replace(/[.,!?;:"()]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3)   // ignore stopwords-ish
    );
}

function diff(before, after) {
    const b = wordSet(before), a = wordSet(after);
    const added = [...a].filter(w => !b.has(w));
    const removed = [...b].filter(w => !a.has(w));
    return { added, removed };
}

async function runP1Pass(tables, order) {
    const summaries = new Map(), descs = new Map(), rows = [];
    for (const name of order) {
        const t = tables.get(name);
        const anc = t.dependsOn.map(d => summaries.get(d.table)).filter(Boolean);
        const prompt = buildP1(t, anc);
        const res = await callGemini(prompt);
        let d = '';
        try { d = (JSON.parse(res.text).tableDescription) || ''; } catch {}
        summaries.set(name, distill(t, d));
        descs.set(name, d);
        rows.push({ name, latencyMs: res.latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens, description: d });
        console.log(`  P1  ${name.padEnd(10)}  ${res.latencyMs}ms  ${d.length}c  "${d.slice(0, 80)}..."`);
    }
    return { summaries, descs, rows };
}

async function runP2Pass(tables, order, summaries, descs, label) {
    const rows = [];
    for (let i = order.length - 1; i >= 0; i--) {
        const name = order[i];
        const t = tables.get(name);
        if (t.dependents.length === 0) continue;
        const desc = t.dependents.map(d => summaries.get(d.table)).filter(Boolean);
        const prompt = buildP2(t, descs.get(name), desc);
        const res = await callGemini(prompt);
        let updated = descs.get(name), changed = false, whatChanged = '';
        try {
            const p = JSON.parse(res.text);
            changed = !!p.changed;
            whatChanged = p.whatChanged || '';
            if (changed) {
                updated = p.tableDescription || descs.get(name);
                descs.set(name, updated);
                summaries.set(name, distill(t, updated));
            }
        } catch {}
        rows.push({
            name, changed, whatChanged,
            latencyMs: res.latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens,
            beforeDesc: descs.get(name), afterDesc: updated,
        });
        console.log(`  ${label} ${name.padEnd(10)}  ${res.latencyMs}ms  ${res.outputTokens}out  changed=${changed}  ${whatChanged.slice(0, 70)}`);
    }
    return rows;
}

async function main() {
    console.log(`Test δ2 — Deep P1+P2 investigation (three-phase: P1 + P2 + P2')`);
    console.log(`Model: ${model()}\n`);
    const tables = loadSchema(CHAIN_STATE);
    const order = [...tables.keys()].sort((a, b) => walkDepth(tables, a) - walkDepth(tables, b));
    console.log(`Chain: ${order.join(' -> ')}\n`);

    console.log('═══ PHASE A: P1 descent ═══');
    const { summaries, descs, rows: p1 } = await runP1Pass(tables, order);

    console.log('\n═══ PHASE B: P2 ascent (first pass) ═══');
    // Before running P2, snapshot P1 descriptions so we can diff
    const beforeP2 = new Map(descs);
    const p2a = await runP2Pass(tables, order, summaries, descs, 'P2a');

    // Capture diffs for each table that was in P2
    const diffs = p2a.map(r => {
        const before = beforeP2.get(r.name);
        const after = descs.get(r.name);
        const d = diff(before, after);
        return {
            name: r.name,
            changed: r.changed,
            whatChanged: r.whatChanged,
            wordsAdded: d.added,
            wordsRemoved: d.removed,
            beforeDescription: before,
            afterDescription: after,
        };
    });

    console.log('\n═══ PHASE C: P2 ascent (SECOND pass — should detect convergence) ═══');
    // No new propagation since B; a well-behaved P2 should mostly say UNCHANGED here
    const beforeP2c = new Map(descs);
    const p2b = await runP2Pass(tables, order, summaries, descs, 'P2b');

    const p2bChangedCount = p2b.filter(r => r.changed).length;

    console.log('\n═══ ANALYSIS ═══');
    console.log(`P1 passes:  10 calls, total ${p1.reduce((s, r) => s + r.latencyMs, 0)}ms`);
    console.log(`P2 first:   ${p2a.length} calls, total ${p2a.reduce((s, r) => s + r.latencyMs, 0)}ms, ${p2a.filter(r => r.changed).length}/${p2a.length} changed`);
    console.log(`P2 second:  ${p2b.length} calls, total ${p2b.reduce((s, r) => s + r.latencyMs, 0)}ms, ${p2bChangedCount}/${p2b.length} changed`);
    console.log(`\nConvergence check: if P1+P2 architecture is well-behaved, P2b changed-count should be ~0`);
    console.log(`  Actual: ${p2bChangedCount} out of ${p2b.length}`);
    const convergedRatio = 1 - (p2bChangedCount / p2b.length);
    console.log(`  Convergence ratio: ${(convergedRatio * 100).toFixed(0)}% of P2b calls were UNCHANGED`);

    console.log('\n═══ DIFFS: what P2 added to each table ═══');
    for (const d of diffs.slice(0, 5)) {
        if (!d.changed) continue;
        console.log(`\n--- ${d.name} ---`);
        console.log(`Before: ${d.beforeDescription}`);
        console.log(`After:  ${d.afterDescription}`);
        console.log(`Words added: [${d.wordsAdded.slice(0, 10).join(', ')}]`);
        console.log(`LLM reason: ${d.whatChanged}`);
    }

    const summary = {
        model: model(),
        p1Total: { calls: p1.length, latency: p1.reduce((s, r) => s + r.latencyMs, 0), outputTokens: p1.reduce((s, r) => s + r.outputTokens, 0) },
        p2FirstTotal: { calls: p2a.length, latency: p2a.reduce((s, r) => s + r.latencyMs, 0), outputTokens: p2a.reduce((s, r) => s + r.outputTokens, 0), changedCount: p2a.filter(r => r.changed).length },
        p2SecondTotal: { calls: p2b.length, latency: p2b.reduce((s, r) => s + r.latencyMs, 0), outputTokens: p2b.reduce((s, r) => s + r.outputTokens, 0), changedCount: p2bChangedCount },
        convergenceRatio: convergedRatio,
    };
    writeFileSync(outFile, JSON.stringify({ summary, p1, p2a, p2b, diffs }, null, 2));
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
