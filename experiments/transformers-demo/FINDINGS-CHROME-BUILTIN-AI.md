# Chrome Built-in AI (Prompt API) with Gemma 4 — Findings

**Date**: September 2, 2026
**Experiment**: Reuse the in-browser chat demo, swap the model for Chrome's *built-in* one (Gemma 4 dev trial,
Built-in AI Early Preview Program), and probe it as a client-side pre-processor / request router for
server-side agents (Betty, Sage).
**Hardware**: MacBook Pro, Apple M5 Max (18 cores), 64 GB RAM, macOS 26.4 — Chrome's `chrome://on-device-internals`
rates this "Device performance class: Very High"; results will be slower on typical member hardware.
**Browser**: Google Chrome Canary 155.0.8038.2 with `chrome://flags/#gemma4-for-built-in-ai` = Enabled
(command line: `--enable-features=OptimizationGuideManifestBroker,AIApiFoundationalModel:model_version/v4`).
Same profile with the flag off = stock Gemini Nano v3, used as the A/B baseline.

---

## Executive summary

- **It works, and it is fast.** A three-file addition to the existing Angular demo (service + component + router
  definitions, no worker, no model download in-app) chats with Gemma 4 2B at **210–240 tokens/s with a 40–60 ms
  first token** on this machine. Nothing is bundled: the 2.4 GB model lives in the Chrome profile and is shared by
  every site that uses the API.
- **Gemma 4 vs. Gemini Nano (same machine, same prompts):** ~2× the generation throughput (EAP mail promised
  "up to 70%"), smaller on disk (2.4 GB vs 4.1 GB), same context window (9,216 tokens), same or slightly better
  routing accuracy. Structured routing calls are, however, *slower* on Gemma 4 when sessions are `clone()`d —
  which turned out to be a `clone()` cost, not a model cost (below).
- **The pre-processor idea is viable at ~300 ms per decision** on a 2B model with a ~185-token router prompt
  and JSON-Schema-constrained output (`responseConstraint`), *if* the router owns one long-lived session.
  A fresh `create()` per request costs 0.25–0.9 s depending on what else is resident, alternating the router
  with a chat session doubles the route cost, and `clone()` per request costs ~1 s in this build.
- **Replayed against ~450 real production turns of an MJ-based assistant (data kept private), a tenant-aware
  router prompt agreed with the server-side research-or-not decision 79% of the time.** A conservative skip rule
  (skip only smalltalk / out of scope) brings false skips down to 4–5% while still catching ~47% of the turns the
  server skipped, at ~270 ms per decision against ~1.5 s for the server agent's own planning prompt. Summary in
  *Replay against production traffic*.
- **Quality is "coarse router" grade, not "planner" grade.** On 12 hand-labelled Betty requests the 2B model got
  9–10/12 on intent and 9–10/12 on target agent across five runs, with run-to-run variance on the ambiguous
  cases. It reliably separates smalltalk / out-of-scope / needs-research / direct-answer; it is unreliable on
  finer distinctions (e.g. "make me a PDF report" → `out_of_scope`).
- **Deployment reality check:** the Prompt API for *web pages* is an **origin trial** (Chrome 148+); it is GA only
  for Chrome **extensions** (138+). Gemma 4 itself is a **Canary-only dev trial behind a flag**. So this is usable
  today for internal/EAP testing and for an extension-shaped deployment, not for Betty's members on stable Chrome.

## Against the original ask

| Amith asked for | Status | Where |
|-----------------|--------|-------|
| Reuse the existing experiment rather than start over | Done. His app, routes and Transformers.js modes are untouched; four files added plus wiring. | `src/app/ai/builtin-ai*.ts`, `src/app/builtin-chat/` |
| "A very simple chat app … running with Gemma 4" | Done and verified to be Gemma 4 (`gemma4-2b-it`), not the stock Nano. The chat is the core; the activity panel, router probe and hybrid toggle are optional layers on it. | Model identity section |
| Share findings so we can decide whether to invest more | This document + the shared page. Recommendation: a small second step, not a big investment. | Executive summary, Recommendation |
| The real question: a local pre/co-processor that routes requests to agents and pre-digests "is research needed?" | Tested three ways: a router probe (intent + target agent as constrained JSON, scored against hand labels), a full hybrid loop (route → plan → fetch → answer), and a private replay of ~450 real production turns against the server agent's own decisions: 79% agreement with a tenant-aware prompt, 4–5% false skips under a conservative rule, ~270 ms per decision vs the server's ~1.5 s planning prompt. | Routing, Hybrid path, Replay |
| "Instant, free, low latency" | Free and local: yes, proven in-page with a network counter and offline runs. Instant: generation yes (40–60 ms first token); decisions cost ~0.3 s each once sessions are warm, 1–2 s while they warm up. | Performance, Hybrid path |
| Voice as a later possibility | Not tested. The latency profile is right for it and the API reports audio input capability; noted as a follow-up once tool use lands. | Implications |

**Not done, deliberately or for lack of time:** no run on non-Apple or mid-range hardware; no test of the 4B/12B
variants (no switch exposed); the tool-use and embeddings flags untouched; only one round of router-prompt tuning
(the tenant-aware variant) and no few-shot examples; no integration into MJ's conversation UI beyond the design
pointer in Implications.

## What was built

Reused `experiments/transformers-demo` and added a third mode alongside the Transformers.js text/audio chat:

| File | Purpose |
|------|---------|
| `src/app/ai/builtin-ai.service.ts` | Angular service over `LanguageModel`: availability, download monitor, streaming with TTFT/throughput stats, abort, context-usage tracking, and `ClassifyRequests()` (structured-output router probe on one long-lived, auto-recycled router session). Mirrors `ChatService`'s observable surface so the two paths compare 1:1. |
| `src/app/ai/builtin-ai-router.ts` | Router system prompt, JSON Schema for `responseConstraint`, and 12 hand-labelled sample requests. |
| `src/app/builtin-chat/builtin-chat.component.ts` | Chat UI (copy of `chat.component.ts`) + a "Router probe" panel with per-request latency and scoring. |
| `src/app/ai/builtin-ai-hybrid.ts` | Hybrid ("co-processor") path: planner prompt + JSON Schema, two keyless CORS sources standing in for Betty's knowledge base (Wikipedia search+summary, GitHub latest release), grounded-answer prompt. |
| Activity panel (in the component) | Every Prompt API call as it happens: availability, session create/model load, prompt, first token, streaming, completion stats, router/planner decisions with raw JSON, fetches, and a per-reply **network-request count** from the Resource Timing API (the page's proof that inference made no network calls), plus live online/offline and GPU/browser facts. |
| `README.md`, home card, route, `@types/dom-chromium-ai` | Wiring. `angular.json` component-style budget raised 4→8 kB (the new component's inline styles tripped the old cap). |

No Web Worker: the Prompt API is **not exposed in Workers** (`'LanguageModel' in self` is `false` in a Worker in
Canary 155), and the model already runs out-of-process in Chrome's on-device model service, so the page thread is
never blocked by inference.

Verified end-to-end by driving the production bundle in Canary over CDP (puppeteer-core, request interception,
no dev server): connect, two-turn chat with history, abort mid-generation, router probe, "New chat" reset — zero
console errors.

## Model identity (verified, not assumed)

The API never tells you which model you got, so this was checked on disk and in `chrome://on-device-internals`:

| Component | Manifest `BaseModelSpec.name` | Weights | Backend | State |
|-----------|-------------------------------|---------|---------|-------|
| `gemma4_component` 2026.8.7.929 | **`gemma4-2b-it`** (2026.06.10) | 2,373 MiB (`OptGuideManifestModel/…/weights.bin`) | GPU (highest quality) | Ready — serves `prompt_api_gemma4`, `summarizer_gemma4`, `writing_assistance_api_gemma4` |
| `nano_v3_gpu_component` 2025.8.8.1141 | `v3Nano` | 4,072 MiB (`OptGuideOnDeviceModel/…`) | GPU | Ready — serves `prompt_api` etc. when the flag is off |
| `gemma4_4b_component` 2026.7.28 / `gemma4_12b_component` 2026.7.1 | — | 0 MiB (not installed) | GPU | Use cases `prompt_api_gemma4_4b` / `_12b` show **"Pending Usage"** — larger variants exist in the manifest, but the flag hard-codes `model_version/v4` → 2B, and no public switch for 4B/12B was found in Chromium 155 |

Chromium source (`chrome/browser/ai/ai_manager.cc`) maps `AIApiFoundationalModel:model_version/<v>` to an
"experimental use case" in the Prompt API feature config (`v4` → `prompt_api_gemma4`), and the
`OptimizationGuideManifestBroker` feature is what fetches the manifest-based model instead of the legacy
component. Both features are exactly what the flag turns on.

## Prompt API surface as actually exposed to web pages (Canary 155)

Differs from older docs/blog posts; the community typings `@types/dom-chromium-ai@0.0.17` match what was observed.

- Statics: `LanguageModel.availability(opts?)` → `unavailable | downloadable | downloading | available`;
  `LanguageModel.create(opts?)`. **`params()` is gone on the web** (extension-only).
- Session: `prompt`, `promptStreaming` (a `ReadableStream<string>`; async-iterable at runtime, TS 5.5 needs a cast),
  `append`, `clone`, `destroy`, `measureContextUsage`, `contextUsage`, `contextWindow` (9,216), `oncontextoverflow`.
  `inputQuota` / `inputUsage` / `measureInputUsage` are **gone** (renamed to the `context*` names).
- `topK` / `temperature` are **not settable from web pages** (extension-only; web gets `samplingMode` in the
  origin trial). `expectedInputs` for image/audio are accepted — internals report capabilities "Image, Audio" — untested here.
- `responseConstraint` (JSON Schema) and `omitResponseConstraintInput` work. Constraint enforcement is *almost*
  watertight: in ~60 constrained calls, one response was two valid JSON objects concatenated — parse the first
  balanced object, don't trust `JSON.parse(raw)` blindly.
- `create()` needs a **user gesture** when it has to download; afterwards it does not.
- `file://` pages are a secure context and get the API; Workers do not.

## Performance

### Model download & session creation

| Step | Gemma 4 2B | Gemini Nano v3 |
|------|-----------:|---------------:|
| First `create()` incl. download (this connection) | 129 s for ~2.4 GB | not re-measured (4.1 GB) |
| First `create()` after browser start (weights → GPU) | 2.1 s | 7.1 s |
| `create()` once resident | ~0.4 s (bench) / 2.5 s incl. route load in-app | — |

### Free-text generation (streaming, system prompt "You are a helpful assistant.")

| Prompt | Gemma 4 2B | Gemini Nano v3 |
|--------|-----------:|---------------:|
| "Explain in 3 sentences what a professional association does." | TTFT 59 ms · 87 tok · **241 tok/s** | TTFT 66 ms · 95 tok · 118 tok/s |
| "Write a 150-word welcome message…" | TTFT 38 ms · 225 tok · **212 tok/s** | TTFT 76 ms · 191 tok · 106 tok/s |
| In-app chat (Angular, per-chunk change detection) | 133–168 tok/s, TTFT 47–281 ms | — |

Tokens counted with the model's own tokenizer via `measureContextUsage(outputText)`.

### Router probe (12 hand-labelled Betty requests, `responseConstraint` JSON, Gemma 4 2B unless noted)

| Session strategy | Per request | Source |
|------------------|------------:|--------|
| **One long-lived router session** (nothing else resident, or an *idle* chat session alive) | **260–330 ms** | bench2 D, bench3 E5, bench4 E — the consistent floor. Final in-app build: median 284 ms over 12 requests, first request 688 ms including session creation |
| Long-lived router session *alternating* with chat prompts on another session | ~640 ms route / ~530 ms chat | bench4 F — the service keeps one prefilled context hot; two contexts thrash |
| Fresh `create({initialPrompts})` per request | 240–340 ms (bench3, no constraint) → 650–900 ms (bench4, constraint; in-app median 690 ms) | high run-to-run variance |
| `clone()` per request | 1,001–1,095 ms median; first clone 250–500 ms, every later one ~1 s | bench, bench2 A/B/C, bench3 E1/E3/E4 — independent of destroy() or a warm base |
| `clone()`, no constraint, "JSON only" instruction | 956 ms | bench2 C — the constraint itself costs ≤100–200 ms |
| Gemini Nano v3, `clone()` per request (flag off) | 526 ms | Nano's clone path is cheaper than Gemma 4's |
| Floor: no system prompt, trivial prompt, fresh session | 36–50 ms | bench3 E6 |

Validity/accuracy across eight runs (both models): valid JSON 12/12 in all but one run (11/12); intent 8–10/12;
agent 8–11/12.

**Session strategy dominates latency, not the model.** `clone()` evidently re-processes the context (~1 s
after the first clone, whether or not clones are destroyed or the base is warm). A fresh `create()` benefits from
Chrome caching the prefilled system prompt across sessions, but inconsistently (2–3× swings between runs). One
dedicated long-lived router session is a steady ~300 ms — until another session's prompts interleave with it,
which doubles the route cost. Design consequences: give the router its own long-lived session, recycle it before
`contextWindow` fills (each decision adds ~50 tokens; the demo recycles at 80%, and `oncontextoverflow` exists),
accept a mild few-shot effect from earlier decisions staying in context, and do not expect a chat turn and a
routing decision on the same page to both hit the floor. Worth reporting the `clone()` cost to the Chrome team.

**Accuracy notes.** Consistent misses across runs and both models: "Make me a PDF report of this conversation"
(→ `out_of_scope`/`needs_research`), "How do I add a new channel…in Betty?" (→ `needs_research` instead of
`answer_from_knowledge`; arguably my label is the debatable one), and "Do you have anything on that?" (vague
follow-up → `needs_research`). Confidence values are not calibrated (mostly 0.85–1.0, including on wrong answers).
The same input produced different labels on different runs, so a real router needs a hedging policy, not a
threshold.

### Concurrency

Three concurrent constrained prompts on separate sessions completed in 0.7 / 1.4 / 2.5 s (Gemma 4) — the
on-device model service **serialises** requests. One page = one queue; plan on one in-flight local decision at a time.

## Hybrid path: local decision → network fetch → local answer

Added after the first round to test Amith's actual shape rather than a pure chat. With **Hybrid research** on, each
message goes: (1) local router; (2) for `needs_research` / `answer_from_knowledge`, a local planner picks
`wikipedia`, `github_latest_release` or `none` with a constrained JSON response; (3) the page fetches; (4) the chat
session answers over the retrieved text, and the UI appends the source URL. Steps 1, 2 and 4 never leave the device;
step 3 is the only network activity and is what the network badge counts.

| Question | Route → plan | Network | Local time | Total |
|----------|--------------|---------|-----------:|------:|
| "What's the latest MemberJunction release and what changed?" | needs_research → `github_latest_release MemberJunction/MJ` | 1 request, 2.9 KB, 284 ms | route 1,442 ms (cold) · plan 945 ms (cold) · answer 1,053 ms | 3.8 s — answered correctly with v5.51.2 and its notes |
| "Who founded the American Nurses Association and when?" | needs_research → `wikipedia "American Nurses Association founding"` | 2 requests, 4.1 KB, 1,888 ms | route 657 ms · plan 866 ms · answer 590 ms | 4.1 s — correct (1896, Nurses Associated Alumnae) with source |
| "What is 15% of 240?" | answer_from_knowledge → `none` | 0 | route ~300 ms · plan ~500 ms · answer 511 ms | ~1.3 s — "36", nothing fetched |

Observations: the two local decisions cost ~1.2–2.4 s together while their sessions warm up and ~0.8–1.4 s
afterwards, which is the real "tax" of a client-side pre-processor on a 2B model; the fetch is cheaper than either
decision. A grounded prompt that asked the model to end with "Source: …" contaminated later unrelated turns
("Source: (No context provided…)"), so the source line is now appended by the app, not requested from the model —
small models carry instructions across a shared session. Wikipedia and GitHub are stand-ins; in Betty the fetch is
the knowledge-base call and the planner's output is the skill/agent selection.

## Replay against production traffic (summary)

To get a number that a 12-item probe cannot give, the router was replayed over **~450 real turns** of a production
MJ-based assistant (255 conversations), with ground truth = whether the server-side agent actually ran its retrieval
sub-agent on that turn (about half did). The data and the harness stay outside this repository: they require that
assistant's database and contain member messages. Method: the same router prompt and schema as the app, one
long-lived session per tenant recycled at 80% of the context window; "local says research" = `Intent ==
needs_research` (rule A) or, conservatively, anything that is not `smalltalk` / `out_of_scope` (rule C).

| Variant | Agrees with the server | False skip (server researched, local said don't) | Server's skips caught | Decision time, median (p90) |
|---------|-----------------------:|-------------------------------------------------:|----------------------:|----------------------------:|
| **Server agent itself (reference)** — its first planning prompt; whole turn 21.9 s with research / 3.7 s without | — | — | — | **~1.5 s** either way |
| Message only, rule A | 76.9% | 24.3% | 78.1% | 263 ms (332) |
| + previous turn as context, rule A | 71.2% | 28.9% | 71.4% | 291 ms (370) |
| **Tenant-aware prompt** (organisation named), rule A | **78.7%** | 11.9% | 68.4% | 272 ms (607) |
| Tenant-aware, **rule C** (skip only smalltalk / out of scope) | 72.3% | **5.1%** | 47.2% | 272 ms (607) |
| Tenant-aware, rule C, structured form submissions excluded | 71.5% | **4.2%** | 47.2% | — |

Readings: naming the tenant in the prompt was the dominant lever (most false skips were "tell me about <org>" /
"<org>'s policy on X" labelled as general knowledge); conversation context *reduced* accuracy (the 2B model decided
the conversation already held the answer); what remains under rule C is non-language input (form submissions) and
vague follow-ups, where deferring to the server is right. About 22% of real turns were smalltalk or off-topic and
could be answered with no server call; on the rest a ~270 ms verdict replaces or pre-empts a ~1.5 s planning
prompt — the 18 s gap between researched and unresearched turns is retrieval and generation time the local model
cannot touch. The server's own decision is the reference, not audited truth.

## Implications for MJ

1. **A client-side "first opinion" is affordable now.** ~300 ms with a dedicated session (0.6–0.7 s if it shares
   the page with an active chat session), zero marginal cost, no data leaves the device.
   The realistic shape is *speculative*: fire the server request and the local classification together; use the
   local result to (a) pre-select a Betty skill/agent or skip the research step when it says
   `answer_from_knowledge`/`smalltalk`, (b) show intent-aware progress UI instantly, (c) suppress obvious
   `out_of_scope`/`smalltalk` round-trips entirely. The server remains the authority; the local model only
   removes latency and cost from the easy cases.
2. **Where it would plug in:** MJ's conversation UI (`mj-conversation-chat-area` / Betty chat host) as an
   optional pre-send hook that attaches a `RoutingHint {Intent, TargetAgent, Confidence, Model}` to the message;
   Betty's Loop/Flow agent treats it as advisory input. Nothing in MJ's server-side `BaseLLM` model needs to
   change for that; a browser-only provider class is a separate, later question.
3. **Voice:** 40–60 ms first token and >200 tok/s on a 2B model is the profile needed for "start speaking
   immediately" — and the same API reports image/audio input capability. Worth a follow-up once the tool-use
   flag (below) lands, because a voice front-end that can call tools locally is the interesting version.
4. **Not for members yet.** Web-page access is origin-trial only, Gemma 4 is Canary-flag only, and the
   hardware floor (>4 GB VRAM or 16 GB RAM + 4 cores, 22 GB free disk, unmetered network for the first download)
   excludes many association members' laptops. Availability must be probed at runtime and the feature must
   degrade to "server only" silently — the service already does that.
5. **Watch list in the same Canary build** (found in `about_flags.cc` @155, all `kOsDesktop`):
   `chrome://flags/#prompt-api-tool-use` (`AIPromptAPIToolUse` + `OnDeviceModelConversationBackend`, on Gemma 4 —
   the "advanced function calling" the EAP mail previews), `#semantic-embedder-api` (`AIEmbeddingsAPI`, also for
   Workers — a **local embeddings API**, relevant to client-side retrieval/pre-filtering),
   `#on-device-model-speculative-decoding` (+`AIPromptAPIParams`). None were exercised here.

## Recommendation

Worth a *small* second step, not a big investment yet — and the replay supplies the number that was missing:

- Keep this demo as the harness; add the tool-use and embeddings flags when they reach Canary stable enough to
  run, and re-run the router probe (and the private replay) on the 4B/12B components as soon as Chrome exposes a
  switch (the assets are already in the manifest).
- Prototype the speculative `RoutingHint` in Betty's chat host behind a feature toggle, with the tenant-aware
  prompt and the conservative rule (drop smalltalk / out of scope locally, pre-warm retrieval on `needs_research`,
  hint otherwise), and measure live what the replay predicts: ~79% agreement, 4–5% false skips, ~1.5 s of planner
  time saved per non-research turn.
- Re-run on a mid-range Windows laptop before drawing conclusions about member hardware; every number above is
  from an M5 Max.

## Decision and follow-ups (3 Sep 2026)

Amith's call after reading the findings: **wait and see, re-evaluate every three months.** The initial message routing
"could be good but not quite enough there to justify it" yet. Follow-ups agreed:

1. This PR: Gemma 4 in-browser support in the demo, this report, and the recommendations above.
2. A monthly Claude routine that scans the edge-inference landscape (Chrome built-in AI releases and flags, Gemma /
   Gemini Nano model updates, Prompt API / WebGPU / WebNN standards, Transformers.js / ONNX Runtime Web / WebLLM
   releases, Apple and Edge equivalents) and raises a PR with a dated report.
3. Design notes on a **blended inference** architecture — steps placed on the client/edge or the back end with
   speculation, policy and telemetry — in `BLENDED-INFERENCE-ARCHITECTURE.md`, so framework support can follow if
   the edge is much better in 3–6 months.
4. A brief demo to MJ Dev (core) — `DEMO.md`.

## Reproduce

```bash
brew install --cask google-chrome@canary            # 155.0.8038.2 at time of writing
# Enable chrome://flags/#gemma4-for-built-in-ai, relaunch
cd experiments/transformers-demo && nvm use 24 && npm install && npm start
# In Canary: http://localhost:4200 → "Chrome Built-in AI" → Connect (first time downloads ~2.4 GB)
```

`chrome://on-device-internals` (after enabling debug pages at `chrome://chrome-urls`) shows the installed model
components, use-case availability and a manual prompt tool.

## Gotchas hit along the way

- **Chrome rewrites `Local State` on shutdown.** Editing the flags file while Canary is running is silently undone
  when it exits. Quit first, then edit `browser.enabled_labs_experiments` (`"gemma4-for-built-in-ai@1"`), then launch.
  My first A/B run was invalid for exactly this reason.
- **Playwright's `connectOverCDP` fails on Canary 155** ("Browser context management is not supported");
  puppeteer-core's `connect({browserURL})` works. Launching with `--remote-debugging-port` requires a non-default
  `--user-data-dir`.
- **`chrome://on-device-internals` is disabled by default** in 155 — enable "internal debugging pages" via a
  `<cr-button>` inside shadow DOM on `chrome://chrome-urls`.
- (Historical) Angular 18's CLI flagged Node 24 as unsupported, and TS 5.5 needed the separate `dom.asynciterable` lib for
  `ReadableStream` async iteration. The experiment now runs on Angular 21.2.19 / TypeScript 5.9 / Node 24 (#4188).
- Model download progress arrives as a 0..1 fraction in `downloadprogress.loaded` (with `total` = 1).
