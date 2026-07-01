# Live embedding checks

Manual, real-backend sanity checks for MemberJunction's embedding providers. Each run exercises the
**real** `EmbedTexts` path — the `BaseEmbeddings` dispatcher → the provider's `embedBatch` (native
batch) or the per-text fallback — against a live backend and asserts **one distinct vector per input
text**, i.e. no batch collapse (the GAP-8 bug this work fixes and generalizes against).

> These are **manual** checks, **not** CI tests. They need real API keys (or, for `local`, an
> on-machine model download) and can't run in CI. The committed CI coverage is the **mocked** unit
> tests in each provider package plus the `BaseEmbeddings` suite in `@memberjunction/ai`.
>
> **No secrets are stored here** — keys are read from the environment. Put them in the repo-root
> `.env`, which is gitignored and never committed.

## Running

1. Build the provider package you want to check, e.g. `cd packages/AI/Providers/OpenAI && npm run build`.
2. Add the provider's key to the repo-root `.env` (see accepted env-var names below).
3. From the repo root:

   ```bash
   node --env-file=.env scripts/live-embedding-checks/live-embedding-check.mjs <provider>
   ```

   `<provider>` is one of `gemini`, `openai`, `cohere`, `local`.

| Provider | Key env var (any of) | Notes |
|----------|----------------------|-------|
| `gemini` | `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `AI_VENDOR_API_KEY__GeminiEmbedding` | model `gemini-embedding-2` |
| `openai` | `OPENAI_API_KEY` / `AI_VENDOR_API_KEY__OpenAIEmbedding` | model `text-embedding-3-small` |
| `cohere` | `COHERE_API_KEY` / `AI_VENDOR_API_KEY__CohereEmbedding` | model `embed-v4.0` |
| `local`  | *(none)* | runs an on-machine model (`Xenova/all-MiniLM-L6-v2`); no key |

## Verified

Gemini, OpenAI, Cohere, and the local model each returned 3 distinct, correctly-dimensioned vectors
for 3 distinct texts (no collapse), through the real dispatcher.
