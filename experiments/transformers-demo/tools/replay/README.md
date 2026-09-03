# Replay harness: real Betty turns through the local router

Answers the question the demo cannot: *how often would the local model's "research or not" decision agree
with what Betty actually did?* Nothing here touches MJ; it drives the Chrome Canary instance over CDP and
uses the router prompt + schema from `../../src/app/ai/builtin-ai-router.ts`, so a prompt change is
re-scored by re-running.

1. Launch Canary with the Gemma 4 flag and remote debugging on port 9333 (see `../../README.md`).
2. Extract turns from a Betty database (read-only): `extract-betty-turns.sql` → `betty-turns.json`
   (real member messages — **never commit it**; `.gitignore` covers `*.json`).
3. `npm install`, then `node replay.mjs message | context | tenant`
   - `message`: the user message alone
   - `context`: plus the previous user/Betty turn from the same conversation
   - `tenant`: message alone, with the organisation name injected into the router prompt (one session per tenant)
4. `node summarize.mjs message context tenant` scores each `results-<variant>.json` under four skip rules
   (A: skip unless `needs_research`; C: skip only `smalltalk`/`out_of_scope`; B/D variants).

Ground truth is "Betty spawned the Topic-Refined Search sub-agent", i.e. Betty's own decision, not correctness.
Results from 2026-09-02 are in `../../FINDINGS-CHROME-BUILTIN-AI.md`.
