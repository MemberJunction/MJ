// End-to-end runner: organic key detection against AdventureWorks state.json.
//
// Loads the existing AW state, runs the full detection pipeline (clustering +
// LLM refinement + concept-merge), saves results, and prints a quality
// assessment. Uses the embedding cache so re-runs are cheap.
//
// Usage:
//   node run-against-aw.mjs <input-state.json> <output-state.json>
//        [--gate] [--no-merge] [--no-refine]

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Load AI_API_KEY from the benchmark env file (avoid leaking it in env)
const envText = await readFile(
    '/Users/madhavsubramaniyam/Projects/MJ/MJ/benchmark-adventureworks/.env',
    'utf-8',
);
for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2];
}

// MJ bootstrap validates MJServer config (DB vars). We aren't using a DB here, but the
// validator still demands the fields exist. Stub them with dummy values so validation
// passes — no DB connection is actually attempted on the organic-key path.
process.env.DB_HOST ??= 'localhost';
process.env.DB_DATABASE ??= 'dummy';
process.env.DB_USERNAME ??= 'dummy';
process.env.DB_PASSWORD ??= 'dummy';
process.env.MJ_BASE_ENCRYPTION_KEY ??= '0'.repeat(44);

// Side-effect import: registers all MJ class manifests (LLM providers, etc.).
await import('@memberjunction/server-bootstrap/mj-class-registrations');

const { OrganicKeyDetectionRunner } = await import(
    '/Users/madhavsubramaniyam/Projects/MJ/MJ-organic-keys/packages/DBAutoDoc/dist/discovery/OrganicKeyDetectionRunner.js'
);

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: run-against-aw.mjs <input-state.json> <output-state.json> [--gate] [--no-merge] [--no-refine]');
    process.exit(1);
}
const [inputPath, outputPath, ...flags] = args;
const useGate = flags.includes('--gate');
const skipMerge = flags.includes('--no-merge');
const skipRefine = flags.includes('--no-refine');

const state = JSON.parse(await readFile(inputPath, 'utf-8'));

const config = {
    enabled: true,
    // Excludes for migration / temp / backup / one-off custom scaffolding tables.
    // These tables exist in the state.json because DBAutoDoc documented them, but
    // they shouldn't participate in organic-key proposals — they're analyst temp
    // data or migration scratch, not production navigation endpoints.
    excludeTablePatterns: [
        // NSTA analyst scratch + all tw_ prefixed scratch (subsumes tw_temp_*)
        'tw_*',
        // Generic temp / migration prefixes
        'tmp_*',
        '*_Temp_*',
        'DataConversion*',
        // Backups — leading, middle, trailing variants + word "backup" anywhere
        'BAK_*',
        '*_BAK_*',
        '*_bk_*',
        '*_bk',
        '*__bk',
        '*backup*',
        // System
        'sysdiagrams',
        '__MigrationHistory',
    ],
    embedding: {
        enabled: true,
        model: 'gemini-embedding-001',
        dimensions: 1536,
        batchSize: 100,
        useBusinessProjection: false,
    },
    refinement: skipRefine
        ? { enabled: false }
        : { enabled: true, concurrency: 4 },
    conceptMerge: { enabled: !skipMerge },
    businessGate: useGate ? { enabled: true, threshold: 0.05 } : undefined,
    minHash: { enabled: false },
    weights: { nameSimilarity: 0.7, embeddingDistance: 1.0, valueOverlap: 0 },
    thresholds: { mergeMax: 0.35, candidateEdgeMax: 0.5, topKNeighbors: 20 },
};

const aiConfig = {
    provider: 'gemini',
    model: 'gemini-3-flash-preview',
    apiKey: process.env.AI_API_KEY,
    temperature: 0,
};

console.log('Running organic key detection against AW...');
console.log(`  Config: refine=${!skipRefine} merge=${!skipMerge} gate=${useGate}`);

const cachePath = resolve(dirname(outputPath), 'embedding-cache.json');
const runner = new OrganicKeyDetectionRunner(config, aiConfig);

const t0 = Date.now();
await runner.run(state, {
    embeddingCachePath: cachePath,
    onProgress: (msg) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`),
});
const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nDone in ${dt}s\n`);

await writeFile(outputPath, JSON.stringify(state, null, 2));
console.log(`Wrote ${outputPath}`);

// ─── Summary ────────────────────────────────────────────────────────────────
const phase = state.phases.organicKeyDetection;
console.log('\n=== PHASE STATS ===');
console.log(`  status: ${phase.status}`);
console.log(`  candidate clusters (post-gate): ${phase.candidateClusterCount}`);
console.log(`  confirmed:  ${phase.confirmedClusterCount}`);
console.log(`  rejected:   ${phase.rejectedClusterCount}`);
console.log(`  split:      ${phase.splitClusterCount}`);
console.log(`  gated:      ${phase.gatedClusterCount ?? 0}`);
console.log(`  merged:     ${phase.mergedClusterCount ?? 0}`);
console.log(`  tokens:     ${phase.tokensUsed} (in: ${phase.inputTokens}, out: ${phase.outputTokens})`);
console.log(`  cost (est): $${phase.estimatedCost.toFixed(4)}`);
if (phase.embeddingCache) {
    console.log(`  embed cache: ${phase.embeddingCache.hits} hits / ${phase.embeddingCache.misses} misses / ${phase.embeddingCache.entries} entries`);
}

const clusters = state.organicKeyClusters ?? [];
console.log(`\n=== CONFIRMED CLUSTERS (${clusters.length}) ===`);
clusters
    .sort((a, b) => b.members.length - a.members.length)
    .forEach((c, i) => {
        const merged = c.mergedFromClusterIds
            ? ` ← MERGED from ${c.mergedFromClusterIds.length}: [${c.mergedFromClusterIds.join(', ')}]`
            : '';
        console.log(
            `\n${i + 1}. \`${c.concept}\`  (conf=${c.confidence.toFixed(2)}, norm=${c.normalization}, ${c.members.length} members, tags=[${c.tags.join(',')}])${merged}`,
        );
        c.members.slice(0, 6).forEach((m) => {
            const fk = m.participatesInFK
                ? m.fkTarget
                    ? ` [FK→${m.fkTarget.schema}.${m.fkTarget.table}.${m.fkTarget.column}]`
                    : ' [FK]'
                : '';
            console.log(`    - ${m.schema}.${m.table}.${m.column}${fk}`);
        });
        if (c.members.length > 6) console.log(`    ... and ${c.members.length - 6} more`);
        if (c.mergedFromClusterIds) console.log(`    merge reasoning: ${c.mergeReasoning}`);
    });
