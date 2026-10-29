// Speed and memory check for the local embedding models. Computes embeddings the way LocalEmbedding does
// (text-only config, AutoTokenizer + AutoModel on the CPU, mean pooling + L2 norm, batches of at most 32
// texts and 8,192 padded tokens, one ONNX thread per available CPU) and prints one JSON line per model:
// load time, single-query latency, ms per document at several lengths, and peak RSS.
//
// Manual check, not CI. It reads only @huggingface/transformers, so it also runs on a server without the
// MJ workspace: `npm i @huggingface/transformers@4.3.1` in any folder and pass it as --deps.
//   node packages/AI/Core/scripts/live-embedding-checks/embedding-speed.mjs [--models "EmbeddingGemma 2"]
//        [--dtype q8] [--threads N] [--max-len 2048] [--deps <dir>]
// Set TRANSFORMERS_CACHE_DIR to reuse a model cache. A single 8,192-token EmbeddingGemma 2 text needs
// about 8 GB, so pass --max-len 2048 on a smaller host.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name) => process.argv.find((a, i) => process.argv[i - 1] === name);
const deps = arg('--deps') ?? path.resolve(here, '../../../Providers/LocalEmbeddings');
const tf = await import(pathToFileURL(createRequire(path.join(deps, 'package.json')).resolve('@huggingface/transformers')).href);
tf.env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR ?? './.cache/transformers';

const MODELS = [
    { name: 'all-MiniLM-L6-v2', id: 'Xenova/all-MiniLM-L6-v2', max: 256 },
    { name: 'all-mpnet-base-v2', id: 'Xenova/all-mpnet-base-v2', max: 384 },
    { name: 'EmbeddingGemma 2', id: 'onnx-community/embeddinggemma-2-ONNX', max: 8192 },
].filter((m) => !arg('--models') || arg('--models').split(',').includes(m.name));
const dtype = arg('--dtype') ?? 'q8';
const threads = +(arg('--threads') ?? os.availableParallelism());
const maxLen = +(arg('--max-len') ?? Infinity);
const pool = JSON.parse(readFileSync(path.join(here, 'retrieval-data', 'entity-search-corpus.json'), 'utf8')).documents.map((d) => d.text);
const QUERY = 'Which agents handle invoice disputes for our members?';

const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const rssMB = () => Math.round(process.memoryUsage().rss / 1048576);
let peak = 0;

async function embed({ tokenizer, model }, texts, max) {
    const lengths = texts.map((t) => Math.min(tokenizer.encode(t).length, max));
    for (let start = 0, end = 0; start < texts.length; start = end) {
        let longest = lengths[start];
        for (end = start + 1; end < texts.length && end - start < 32; end++) {
            const next = Math.max(longest, lengths[end]);
            if (next * (end - start + 1) > 8192) break;
            longest = next;
        }
        const inputs = tokenizer(texts.slice(start, end), { padding: true, truncation: true, max_length: max });
        const output = await model(inputs);
        tf.mean_pooling(output.last_hidden_state, inputs.attention_mask).normalize(2, -1).tolist();
        peak = Math.max(peak, rssMB());
    }
}

/** n different texts of at least `tokens` tokens each, cut from the corpus. */
function docs(tokenizer, n, tokens) {
    const result = [];
    for (let i = 0; result.length < n; i++) {
        let text = '';
        for (let j = i; tokenizer.encode(text).length < tokens; j++) text += pool[(j * 7) % pool.length] + ' ';
        result.push(text);
    }
    return result;
}

for (const m of MODELS) {
    peak = 0;
    const t0 = performance.now();
    const config = await tf.AutoConfig.from_pretrained(m.id);
    for (const k of ['vision_config', 'audio_config']) if (config[k]) config[k] = null;
    const [tokenizer, model] = await Promise.all([
        tf.AutoTokenizer.from_pretrained(m.id),
        tf.AutoModel.from_pretrained(m.id, { config, dtype, device: 'cpu', session_options: { intraOpNumThreads: threads } }),
    ]);
    const loaded = { tokenizer, model };
    const r = { model: m.name, platform: `${os.platform()}-${os.arch()}`, cpus: os.availableParallelism(), threads, dtype, loadMs: Math.round(performance.now() - t0) };
    const t1 = performance.now();
    await embed(loaded, [QUERY], m.max);
    r.firstMs = Math.round(performance.now() - t1);
    r.rssAfterLoadMB = rssMB();
    const lat = [];
    for (let i = 0; i < 30; i++) {
        const t = performance.now();
        await embed(loaded, [QUERY], m.max);
        lat.push(performance.now() - t);
    }
    r.queryP50Ms = +pct(lat, 0.5).toFixed(1);
    r.queryP95Ms = +pct(lat, 0.95).toFixed(1);
    r.msPerDoc = {};
    for (const [tokens, n] of [[32, 64], [256, 64], [1024, 16], [2048, 8], [8192, 2]]) {
        if (tokens > m.max || tokens > maxLen) continue;
        const texts = docs(tokenizer, n, tokens);
        const t = performance.now();
        await embed(loaded, texts, tokens);
        r.msPerDoc[tokens] = +((performance.now() - t) / n).toFixed(1);
    }
    r.peakRssMB = peak;
    await model.dispose();
    console.log(JSON.stringify(r));
}
