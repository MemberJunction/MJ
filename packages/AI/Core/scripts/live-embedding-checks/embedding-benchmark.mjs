// Retrieval-quality benchmark for the local embedding models (plans/embeddinggemma-2-local-embeddings.md,
// Phase 0 step 3). Embeds each task's documents and queries with the BUILT LocalEmbedding driver, ranks by
// cosine similarity (brute force), and reports recall@5, recall@10 and MRR per task and model.
//
// Manual check, not CI: it downloads models on first run.
//   cd packages/AI/Providers/LocalEmbeddings && npm run build
//   node packages/AI/Core/scripts/live-embedding-checks/embedding-benchmark.mjs [--models a,b] [--tasks x,y]
// Set TRANSFORMERS_CACHE_DIR to reuse a model cache.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const driverPath = path.resolve(here, '../../../Providers/LocalEmbeddings/dist/index.js');
const { LocalEmbedding } = await import(pathToFileURL(driverPath).href);

const GEMMA = 'onnx-community/embeddinggemma-2-ONNX';
const QUERY_PREFIX = 'task: search result | query: ';
const DOC_PREFIX = 'title: none | text: ';
const VARIANTS = [
    { name: 'gte-small', model: 'Xenova/gte-small' },
    { name: 'bge-small-en-v1.5', model: 'Xenova/bge-small-en-v1.5' },
    { name: 'all-mpnet-base-v2', model: 'Xenova/all-mpnet-base-v2' },
    { name: 'all-MiniLM-L6-v2', model: 'Xenova/all-MiniLM-L6-v2' },
    { name: 'multilingual-MiniLM-L12-v2', model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' },
    { name: 'gemma2-768', model: GEMMA, prefixes: true },
    { name: 'gemma2-768-noprefix', model: GEMMA },
    { name: 'gemma2-256', model: GEMMA, dimensions: 256, prefixes: true },
    { name: 'gemma2-256-noprefix', model: GEMMA, dimensions: 256 },
];

const data = (file) => JSON.parse(readFileSync(path.join(here, 'retrieval-data', file), 'utf8'));
const TASKS = {
    'entity-search': { documents: data('entity-search-corpus.json').documents, queries: data('entity-search-queries.json').queries },
    'agent-memory': data('agent-memory.json'),
    'tag-matching': data('tag-matching.json'),
    'query-catalog': data('query-catalog.json'),
};

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Recall@k (share of a query's relevant docs found in the top k) and reciprocal rank of the first hit. */
function scoreQuery(rankedIds, relevant) {
    const at = (k) => relevant.filter((id) => rankedIds.slice(0, k).includes(id)).length / relevant.length;
    const first = rankedIds.findIndex((id) => relevant.includes(id));
    return { r5: at(5), r10: at(10), rr: first < 0 ? 0 : 1 / (first + 1) };
}
// self-check of the metric on a toy ranking
assert.deepEqual(scoreQuery(['a', 'b', 'c'], ['b']), { r5: 1, r10: 1, rr: 0.5 });
assert.deepEqual(scoreQuery(['a', 'b', 'c', 'd', 'e', 'f'], ['f', 'z']), { r5: 0, r10: 0.5, rr: 1 / 6 });

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const summarize = (rows) => ({ n: rows.length, recall5: mean(rows.map((r) => r.r5)), recall10: mean(rows.map((r) => r.r10)), mrr: mean(rows.map((r) => r.rr)) });

async function embed(embedder, variant, texts, prefix) {
    const input = variant.prefixes ? texts.map((t) => prefix + t) : texts;
    const t0 = performance.now();
    const result = await embedder.EmbedTexts({ model: variant.model, texts: input, dimensions: variant.dimensions, maxInputTokens: 8192 });
    if (result.vectors.length !== texts.length) throw new Error(`${variant.name}: got ${result.vectors.length} vectors for ${texts.length} texts`);
    return { vectors: result.vectors, ms: performance.now() - t0 };
}

async function runTask(embedder, variant, task) {
    const docs = await embed(embedder, variant, task.documents.map((d) => d.text), DOC_PREFIX);
    const queries = await embed(embedder, variant, task.queries.map((q) => q.q), QUERY_PREFIX);
    const rows = task.queries.map((q, i) => {
        const ranked = task.documents
            .map((d, j) => ({ id: d.id, s: dot(queries.vectors[i], docs.vectors[j]) }))
            .sort((a, b) => b.s - a.s)
            .map((x) => x.id);
        return { ...scoreQuery(ranked, q.relevant), lang: q.lang };
    });
    return {
        all: summarize(rows),
        multilingual: rows.some((r) => r.lang) ? summarize(rows.filter((r) => r.lang)) : undefined,
        english: rows.some((r) => r.lang) ? summarize(rows.filter((r) => !r.lang)) : undefined,
        docMsPerText: docs.ms / task.documents.length,
        queryMsPerText: queries.ms / task.queries.length,
    };
}

const arg = (name) => process.argv.find((a, i) => process.argv[i - 1] === name)?.split(',');
const variants = arg('--models') ? VARIANTS.filter((v) => arg('--models').includes(v.name)) : VARIANTS;
const taskNames = arg('--tasks') ?? Object.keys(TASKS);

const embedder = new LocalEmbedding();
for (const variant of variants) {
    await embedder.PreloadModel(variant.model);
    for (const name of taskNames) {
        const r = await runTask(embedder, variant, TASKS[name]);
        const f = (x) => x.toFixed(3);
        console.log(`${name.padEnd(14)} ${variant.name.padEnd(28)} R@5 ${f(r.all.recall5)}  R@10 ${f(r.all.recall10)}  MRR ${f(r.all.mrr)}  ` +
            `${r.docMsPerText.toFixed(1)} ms/doc` + (r.multilingual ? `  | English R@10 ${f(r.english.recall10)} MRR ${f(r.english.mrr)}  | multilingual R@10 ${f(r.multilingual.recall10)} MRR ${f(r.multilingual.mrr)}` : ''));
    }
}
