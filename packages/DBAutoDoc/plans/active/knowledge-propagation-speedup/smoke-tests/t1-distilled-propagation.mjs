#!/usr/bin/env node
// T1 — Distilled vs verbose propagation, 5 tables x 3 samples.
// Validates: distilled 1-line summaries give the LLM enough to match/beat verbose full descriptions.

import { writeFileSync } from 'node:fs';
import { callGemini, model } from './lib/gemini.mjs';
import { loadSchema } from './lib/schema-loader.mjs';
import { buildVerbosePrompt, buildDistilledPrompt, distillResolvedTable } from './lib/prompts.mjs';
import { checkQuality, stats } from './lib/metrics.mjs';

const TEST_TABLES = ['Artist', 'Album', 'Track', 'PlaylistTrack', 'InvoiceLine'];
const SAMPLES = 3;

const outArg = process.argv.indexOf('--out');
const outFile = outArg > -1 ? process.argv[outArg + 1] : `./results/t1-${Date.now()}.json`;

async function run(promptFn, label, tables) {
    const rows = [];
    for (const name of TEST_TABLES) {
        const t = tables.get(name);
        const runs = [];
        for (let i = 0; i < SAMPLES; i++) {
            const parents = t.dependsOn.map(d => tables.get(d.table)).filter(Boolean);
            const prompt = label === 'verbose'
                ? promptFn(t, tables, parents)
                : promptFn(t, tables, parents.map(distillResolvedTable));
            const res = await callGemini(prompt);
            const q = checkQuality(t, res.text);
            runs.push({ ...res, ...q });
            process.stdout.write(`  ${label} × ${name} sample ${i + 1}: ${res.latencyMs}ms  PK=${q.pkCorrect?'✓':'✗'} FK=${q.fkCorrect?'✓':'✗'}\n`);
        }
        rows.push({
            table: name,
            latency: stats(runs.map(r => r.latencyMs)),
            inputTokens: stats(runs.map(r => r.inputTokens)),
            outputTokens: stats(runs.map(r => r.outputTokens)),
            pkCorrectAll: runs.every(r => r.pkCorrect),
            fkCorrectAll: runs.every(r => r.fkCorrect),
            sampleDescription: runs[0].description?.slice(0, 150),
        });
    }
    return rows;
}

async function main() {
    console.log(`T1 — Distilled vs verbose propagation`);
    console.log(`Model: ${model()}  Tables: ${TEST_TABLES.join(', ')}  Samples: ${SAMPLES}\n`);
    const tables = loadSchema();

    console.log('=== verbose ===');
    const verbose = await run(buildVerbosePrompt, 'verbose', tables);
    console.log('\n=== distilled ===');
    const distilled = await run(buildDistilledPrompt, 'distilled', tables);

    const sumLat = rows => rows.reduce((s, r) => s + r.latency.mean, 0);
    const sumIn = rows => rows.reduce((s, r) => s + r.inputTokens.mean, 0);
    const sumOut = rows => rows.reduce((s, r) => s + r.outputTokens.mean, 0);
    const passCount = (rows, k) => rows.filter(r => r[k]).length;

    const summary = {
        model: model(),
        tables: TEST_TABLES,
        samples: SAMPLES,
        verbose: {
            totalLatencyMs: sumLat(verbose),
            totalInputTokens: sumIn(verbose),
            totalOutputTokens: sumOut(verbose),
            pkPass: `${passCount(verbose, 'pkCorrectAll')}/${verbose.length}`,
            fkPass: `${passCount(verbose, 'fkCorrectAll')}/${verbose.length}`,
        },
        distilled: {
            totalLatencyMs: sumLat(distilled),
            totalInputTokens: sumIn(distilled),
            totalOutputTokens: sumOut(distilled),
            pkPass: `${passCount(distilled, 'pkCorrectAll')}/${distilled.length}`,
            fkPass: `${passCount(distilled, 'fkCorrectAll')}/${distilled.length}`,
        },
        ratios: {
            latency: (sumLat(distilled) / sumLat(verbose)).toFixed(3),
            inputTokens: (sumIn(distilled) / sumIn(verbose)).toFixed(3),
            outputTokens: (sumOut(distilled) / sumOut(verbose)).toFixed(3),
        },
    };

    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify(summary, null, 2));

    writeFileSync(outFile, JSON.stringify({ summary, perTable: { verbose, distilled } }, null, 2));
    console.log(`\nWritten: ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
