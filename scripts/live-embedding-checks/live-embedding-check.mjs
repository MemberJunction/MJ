/**
 * Live sanity check for MJ embedding providers.
 *
 * Runs the REAL `EmbedTexts` path (BaseEmbeddings dispatcher → the provider's `embedBatch`, or the
 * per-text fallback) against a live backend and asserts ONE distinct vector per input text — i.e. no
 * batch collapse (the GAP-8 bug this work fixes/prevents).
 *
 * These are MANUAL checks, not CI tests: they need real API keys (or, for `local`, an on-machine
 * model download) and can't run in CI. The committed CI coverage is the mocked unit tests in each
 * provider package plus the BaseEmbeddings suite in @memberjunction/ai. No secrets live here — keys
 * are read from the environment (put them in the gitignored .env).
 *
 * Usage (build the provider package first):
 *   node --env-file=.env scripts/live-embedding-checks/live-embedding-check.mjs <gemini|openai|cohere|local>
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const distOf = (pkgDir) => resolve(HERE, '../../packages/AI/Providers', pkgDir, 'dist/index.js');

/** Per-provider config. `keyEnv` lists accepted env-var names (first one set wins); empty = no key. */
const PROVIDERS = {
    gemini: { dist: distOf('Gemini'), className: 'GeminiEmbedding', model: 'gemini-embedding-2', keyEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'AI_VENDOR_API_KEY__GeminiEmbedding'] },
    openai: { dist: distOf('OpenAI'), className: 'OpenAIEmbedding', model: 'text-embedding-3-small', keyEnv: ['OPENAI_API_KEY', 'AI_VENDOR_API_KEY__OpenAIEmbedding'] },
    cohere: { dist: distOf('Cohere'), className: 'CohereEmbedding', model: 'embed-v4.0', keyEnv: ['COHERE_API_KEY', 'AI_VENDOR_API_KEY__CohereEmbedding'] },
    local: { dist: distOf('LocalEmbeddings'), className: 'LocalEmbedding', model: 'Xenova/all-MiniLM-L6-v2', keyEnv: [] },
};

const which = process.argv[2];
const cfg = PROVIDERS[which];
if (!cfg) {
    console.error(`Usage: node --env-file=.env ${process.argv[1]} <${Object.keys(PROVIDERS).join('|')}>`);
    process.exit(2);
}

const key = cfg.keyEnv.map((name) => process.env[name]).find(Boolean) ?? '';
if (cfg.keyEnv.length && !key) {
    console.error(`No API key found for '${which}'. Set one of ${cfg.keyEnv.join(' / ')} in .env and re-run.`);
    process.exit(2);
}

const cosine = (a, b) => {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const texts = [
    'The mitochondria is the powerhouse of the cell.',
    'Quarterly revenue exceeded analyst forecasts by twelve percent.',
    'The hiking trail winds through old-growth redwood forest.',
];

try {
    const mod = await import(pathToFileURL(cfg.dist).href);
    const Embedding = mod[cfg.className];
    const embedder = new Embedding(key);

    console.log(`\n=== Live check — ${cfg.className}.EmbedTexts (real dispatch) · ${texts.length} distinct texts · model ${cfg.model} ===`);
    if (which === 'local') console.log('(first run downloads the model; may take a minute)…');
    const res = await embedder.EmbedTexts({ texts, model: cfg.model });

    const dims = res.vectors.map((v) => v.length);
    const allIdentical = res.vectors.length > 0 && res.vectors.every((v) => JSON.stringify(v) === JSON.stringify(res.vectors[0]));
    const cos = res.vectors.length >= 3
        ? [cosine(res.vectors[0], res.vectors[1]), cosine(res.vectors[0], res.vectors[2]), cosine(res.vectors[1], res.vectors[2])]
        : [];

    const checks = [
        ['returns one vector per input text', res.vectors.length === texts.length, `${res.vectors.length} vectors for ${texts.length} texts`],
        ['every vector has a non-empty, consistent dimensionality', dims.length > 0 && dims.every((d) => d > 0 && d === dims[0]), `dims=${JSON.stringify(dims)}`],
        ['vectors are NOT all identical (no batch collapse)', !allIdentical, allIdentical ? 'ALL IDENTICAL — collapsed!' : 'distinct'],
        ['distinct texts are not near-duplicates (cosine < 0.999)', cos.length > 0 && cos.every((c) => c < 0.999), `cos=[${cos.map((c) => c.toFixed(3)).join(', ')}]`],
    ];

    console.log('\n=== RESULTS ===');
    let ok = true;
    for (const [name, pass, detail] of checks) { console.log(`${pass ? '✅' : '❌'} ${name} — ${detail}`); if (!pass) ok = false; }
    console.log(ok ? '\n✅ ALL CHECKS PASSED\n' : '\n❌ SOME CHECKS FAILED\n');
    process.exit(ok ? 0 : 1);
} catch (err) {
    console.error('\n❌ Live check threw:', err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
}
