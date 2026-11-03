# EmbeddingGemma 2 retrieval benchmark (Phase 0 step 3)

Results of `embedding-benchmark.mjs`, run 2026-10-12, for the go/no-go in
`plans/embeddinggemma-2-local-embeddings.md`.

## Verdict

**No-go for making EmbeddingGemma 2 the default local model on quality grounds. Go for shipping
it as an available, opt-in model.**

The plan's gate is: *EmbeddingGemma 2 beats the current best local model on recall@10 / MRR on at
least 3 of 4 tasks, with acceptable CPU latency.*

- **Counting every query, on macOS, it passes narrowly** (3 of 4: entity search, tag matching and
  query catalog; it loses agent memory). But the wins in entity search and tag matching come from
  the 7 non-English queries in those sets. EmbeddingGemma 2 gets all of them right, and the current
  models mostly miss them.
- **On English queries alone, it fails.** It roughly ties the best current model on each task: it
  wins query-catalog MRR, ties entity-search MRR, and ties or loses the rest. The differences are smaller
  than these sample sizes can separate.
- **On Linux, where MJAPI runs, it fails even counting every query** (2 of 4). all-mpnet-base-v2,
  today's default, ranks tags better there (MRR 0.958 against 0.928).
- **Latency is acceptable on a laptop, slower on a small server.** On 18 Apple cores a query takes
  about 30 ms (all-mpnet-base-v2: 3 ms) and a 256-token document about 60 ms (mpnet: 31 ms). On 2
  cores a query takes 80–110 ms and a 256-token document about 0.45 s. See
  [Speed and memory](#speed-and-memory-2026-10-13).

What EmbeddingGemma 2 clearly adds is **multilingual retrieval** and an **8,192-token window**. This
benchmark's documents are short, so it does not test the window. Those are reasons to offer the
model, not reasons to switch every host to it.

**Stored dimension:** 768. At 256 dimensions MRR moves by up to ±0.04 per task, in both directions, within noise, so
256 is a fair choice where memory matters, and it is still smaller than today's 384-d vectors. MJ's
local corpora are small, so the storage saving is minor. 768 also keeps the multilingual numbers
(MRR 0.917 against 0.875).

**Prefixes:** the model-card prefixes (`task: search result | query: ` / `title: none | text: `)
did **not** help on this data. Without them EmbeddingGemma 2 scored the same or better on MRR in
three of four tasks (entity search 0.894 against 0.865, agent memory 0.891 against 0.809, tags
equal), and slightly worse on query catalog (0.910 against 0.917). The
query/document plumbing is still worth having, because other asymmetric models (Cohere, Gemini
Embedding 2) need it. Whether EmbeddingGemma 2's catalog row should carry the prefixes needs real
data. A title-aware document prefix (`title: {Name} | text: {Description}`) was not tried.

## Results (macOS, darwin-arm64)

Recall@10 / MRR, all queries. The bold row is EmbeddingGemma 2 as the plan designs it: 768-d, with
prefixes.

| Model | entity-search (n=54) | agent-memory (n=26) | tag-matching (n=30) | query-catalog (n=26) |
|---|---|---|---|---|
| gte-small | 0.887 / 0.701 | 0.875 / 0.838 | 0.983 / 0.898 | 1.000 / 0.873 |
| bge-small-en-v1.5 | 0.835 / 0.637 | 0.859 / 0.776 | 0.950 / 0.913 | 0.962 / 0.878 |
| all-mpnet-base-v2 (current default) | 0.904 / 0.793 | 0.843 / 0.817 | 0.983 / 0.906 | 1.000 / 0.868 |
| all-MiniLM-L6-v2 (current tag model) | 0.877 / 0.703 | 0.888 / 0.777 | 0.967 / 0.822 | 1.000 / 0.819 |
| paraphrase-multilingual-MiniLM-L12-v2 | 0.741 / 0.526 | 0.827 / 0.719 | 0.950 / 0.875 | 1.000 / 0.748 |
| **EmbeddingGemma 2, 768, prefixes** | **0.926 / 0.865** | **0.843 / 0.809** | **1.000 / 0.928** | **1.000 / 0.917** |
| EmbeddingGemma 2, 768, no prefixes | 0.944 / 0.894 | 0.856 / 0.891 | 1.000 / 0.928 | 1.000 / 0.910 |
| EmbeddingGemma 2, 256, prefixes | 0.944 / 0.847 | 0.846 / 0.787 | 1.000 / 0.961 | 1.000 / 0.879 |
| EmbeddingGemma 2, 256, no prefixes | 0.935 / 0.837 | 0.875 / 0.866 | 1.000 / 0.944 | 1.000 / 0.904 |

English queries only (the two tasks that include non-English queries):

| Model | entity-search (n=48) | tag-matching (n=29) |
|---|---|---|
| gte-small | 0.957 / 0.771 | 0.983 / 0.925 |
| bge-small-en-v1.5 | 0.918 / 0.693 | 0.983 / 0.943 |
| all-mpnet-base-v2 | 0.955 / 0.854 | 0.983 / 0.902 |
| all-MiniLM-L6-v2 | 0.944 / 0.762 | 1.000 / 0.848 |
| paraphrase-multilingual-MiniLM-L12-v2 | 0.750 / 0.533 | 0.948 / 0.871 |
| **EmbeddingGemma 2, 768, prefixes** | **0.917 / 0.859** | **1.000 / 0.925** |
| EmbeddingGemma 2, 768, no prefixes | 0.938 / 0.892 | 1.000 / 0.925 |

Non-English entity-search queries (n=6; Spanish, German, French), recall@10 / MRR:
all-mpnet-base-v2 0.500 / 0.310, paraphrase-multilingual-MiniLM-L12-v2 0.667 / 0.468,
EmbeddingGemma 2 (768, prefixes) **1.000 / 0.917**. The one Spanish tag-matching query ranked the
right tag first for EmbeddingGemma 2, all-mpnet-base-v2 and the multilingual MiniLM, and 9th to 23rd
for the other models.

Document embedding time on the entity-search corpus (1,302 documents, batches of 32), ms per
document: gte-small 7.8, bge-small 12.4, all-mpnet-base-v2 27.9, all-MiniLM-L6-v2 4.9,
multilingual MiniLM 10.5, EmbeddingGemma 2 30–45. These numbers are indicative only: other builds
were running on the same machine.

## Linux cross-check (linux-arm64 container)

MJAPI runs on Linux, and quantized all-mpnet-base-v2 behaves differently there (about 0.80 cosine
to its own fp32 output, against 0.99 on macOS; see the plan's Phase 0 findings). A Linux run of the
same data used the transformers.js `feature-extraction` pipeline, which does the same mean pooling
and normalization as `LocalEmbedding`. Its EmbeddingGemma 2 numbers matched the macOS driver run
exactly, which confirms the two runners agree.

| Model | entity-search all / English | agent-memory | tag-matching all / English | query-catalog |
|---|---|---|---|---|
| gte-small | 0.878 / 0.696 · 0.946 / 0.764 | 0.894 / 0.819 | 1.000 / 0.931 · 1.000 / 0.960 | 1.000 / 0.876 |
| all-mpnet-base-v2 | 0.910 / 0.787 · 0.983 / 0.853 | 0.856 / 0.773 | 1.000 / 0.958 · 1.000 / 0.957 | 1.000 / 0.886 |
| EmbeddingGemma 2, 768, prefixes | 0.926 / 0.865 · 0.917 / 0.859 | 0.843 / 0.809 | 1.000 / 0.928 · 1.000 / 0.925 | 1.000 / 0.917 |
| EmbeddingGemma 2, 768, no prefixes | 0.944 / 0.894 · 0.938 / 0.892 | 0.856 / 0.891 | 1.000 / 0.928 · 1.000 / 0.925 | 1.000 / 0.910 |

**mpnet's quantization loss barely affects ranking.** On Linux its retrieval is about the same as on
macOS, and better on tags. Only agent-memory MRR is lower (0.773 against 0.817). The loss looks
like a near-uniform distortion that mostly preserves order, so it is not a quality reason to
switch. It is still a compatibility problem: vectors stored under one runtime don't match queries
embedded under the other, so the re-embed after the runtime upgrade stays necessary.

## Speed and memory (2026-10-13)

Measured with [`embedding-speed.mjs`](embedding-speed.mjs) at q8 on an Apple M5 Max. "Linux" is a
linux-arm64 container on the same Mac, limited to 2 or 4 CPUs (`--cpus` and `--cpuset-cpus` gave the
same results). Azure vCPUs are slower per core than Apple cores, so treat the Linux rows as a best
case for a server that size.

| Host | Model | Query p50 | 256-token doc | 2,048-token doc | RSS after load |
|---|---|---|---|---|---|
| Mac, 18 cores | all-MiniLM-L6-v2 | 1.1 ms | 8.5 ms | — | 0.2 GB |
| Mac, 18 cores | all-mpnet-base-v2 | 3.1 ms | 31 ms | — | 0.3 GB |
| Mac, 18 cores | EmbeddingGemma 2 | 30 ms | 57 ms | 0.66 s | 0.5–0.9 GB |
| Linux, 4 CPUs | all-mpnet-base-v2 | 5.7 ms | 63 ms | — | 0.3 GB |
| Linux, 4 CPUs | EmbeddingGemma 2 | 79 ms | 0.28 s | 3.7 s | 0.7 GB |
| Linux, 2 CPUs | all-MiniLM-L6-v2 | 1.3 ms | 17 ms | — | 0.2 GB |
| Linux, 2 CPUs | all-mpnet-base-v2 | 5.9 ms | 94 ms | — | 0.3 GB |
| Linux, 2 CPUs | EmbeddingGemma 2 | 83–111 ms | 0.44 s | 5.9 s | 0.5–0.8 GB |

- **Threads in a CPU-limited container.** ONNX Runtime sizes its thread pool from the host's
  cores, not the container's limit. With 2 CPUs on the 18-core host and default threads, every model
  was about 10× slower: EmbeddingGemma 2 queries took 1.2–1.3 s, mpnet 48 ms, MiniLM 13 ms. ONNX
  Runtime itself logs "Specify the number of threads explicitly". `LocalEmbedding` now sets
  `intraOpNumThreads` to `os.availableParallelism()`, which honors cpusets and CPU quotas; on the
  full Mac that matches the default. On an x64 host with hyperthreading it counts logical CPUs, where
  ONNX Runtime's default counts physical cores, so the Linux x64 run should compare the two.
- **Memory grows with the square of the text length.** Peak RSS for one EmbeddingGemma 2 text, in a
  fresh process: 0.9 GB at 512 tokens, 1.1 GB at 1,024, 1.6 GB at 2,048, 3.1 GB at 4,096 and
  8.4 GB at 8,192. ONNX Runtime keeps that memory afterwards, and turning its arena off does not
  help. In an 8 GB container one 8,192-token text was killed for running out of memory (exit 137).
  A full batch (8,192 padded tokens) peaks at 2.7–3.7 GB. The catalog row therefore sets
  `MaxInputTokens` to 2,048.
- **q8 has a fixed cost per call.** On 2 CPUs, fp32 answers a query in 25 ms against 92 ms for q8,
  with the same document speed (0.43 s against 0.46 s per 256 tokens) and the same vectors (cosine
  0.99993). fp32 costs 1.08 GB of weights instead of 314 MB and about 0.45 GB more RSS.
- **Load time** with the weights on local disk is 0.4–0.8 s. The first run downloads 314 MB of q8
  weights and a 32 MB tokenizer.

**In the browser** (Chrome 154 on the same Mac, transformers.js 4.3.1, model files served locally, so
no download time):

| Backend, dtype | Weights | Query p50 | 256-token doc | Cosine to server q8 vectors |
|---|---|---|---|---|
| WebGPU fp16 | 542 MB | 18 ms | 31 ms | 0.9999 |
| WebGPU fp32 | 1.08 GB | 17 ms | 39 ms | 0.9999 |
| WebGPU q8 | 314 MB | 65 ms | 169 ms | 1.0000 |
| WebGPU q4 | 174 MB | 14 ms | 31 ms | 0.982 |
| WASM fp32 (no GPU) | 1.08 GB | 66–88 ms | 0.5 s | 0.9999 |
| WASM fp16 | 542 MB | 85 ms | 1.15 s | 0.9999 |

- WASM cannot load q8 or q4: ONNX Runtime Web has no CPU kernel for their `GatherBlockQuantized`
  embedding lookup.
- fp16 and fp32 vectors match the server's, so a query embedded in the browser can search vectors
  stored by MJAPI. q4 vectors are off by about 0.02 cosine. For scale, the most similar pair of
  different documents in the sample is at 0.914.
- Server q8 vectors were identical on macOS and Linux (cosine 1.0000).

## Caveats

- **Labels written by an AI.** All 136 queries and their labels were written by an AI assistant,
  aiming for paraphrases that avoid the target's wording. That is not the same as real user queries.
- **Two tasks are synthetic:** agent memory (40 notes) and tag matching (30 tags) are invented sets
  in an association/nonprofit setting. Entity search and query catalog use the repo's real metadata
  (1,302 and 30 documents).
- **Small N.** 26–54 queries per task: an MRR difference under about 0.05 is not meaningful.
- **Ceiling effects.** Query catalog has 30 documents, so recall@10 is 1.000 for almost every model.
  Only its MRR discriminates.
- **Short documents.** Most are a name plus one or two sentences, so EmbeddingGemma 2's long context
  is untested.
- **Batch effects.** The `Xenova/*` models are dynamically quantized, so a vector shifts slightly
  with its batch-mates (cosine ≥ 0.998). The metrics are deterministic for a fixed dataset.
- **Hardware.** Apple M5 Max, plus CPU-limited linux-arm64 containers on the same machine. Re-run
  `embedding-speed.mjs` on the MJAPI target hardware (Linux x64) before relying on the server
  numbers. The browser numbers are from a high-end GPU; typical laptops and phones will be slower.

## Before revisiting the default

Re-run this benchmark against real data from an MJ database: Search Entity Documents rendered from
their templates, real agent notes and their retrieval queries, real tags and content items. Then
add a title-aware document prefix variant. Re-run with:

```bash
node packages/AI/Core/scripts/live-embedding-checks/embedding-benchmark.mjs
```
