# Edge / In-Browser AI Inference — Monthly Landscape Scan

**Scan date**: October 1, 2026
**Baseline**: [`FINDINGS-CHROME-BUILTIN-AI.md`](../FINDINGS-CHROME-BUILTIN-AI.md) (September 2, 2026; Chrome Canary 155,
`#gemma4-for-built-in-ai`, `gemma4-2b-it`, 212–241 tok/s, ~300 ms/routing decision, 78.7% replay agreement)
**Cadence**: per the decision in that document, re-evaluate every three months; this is a monthly interim scan to
catch anything that should move that date up.

## Recommendation: **no change**

Nothing found this month alters the September "wait and see, re-evaluate quarterly" call. The two items on the
baseline's own watch list — Prompt API tool use and the 4B/12B switch — are both still unresolved by name, confirmed
directly against primary sources below. The most consequential new item (AceSpec, an edge-cloud speculative-decoding
paper) is research, not something shippable in Chrome today, and is more relevant to the `BLENDED-INFERENCE-ARCHITECTURE.md`
design notes than to this month's "should we invest" question.

---

## What changed

### 1. Chrome built-in AI

- **Release cadence changed.** Chrome moved to a two-week release cycle starting with Chrome 153 (stable Sept 8,
  2026) — [Chrome's two-week release cycle](https://developer.chrome.com/blog/chrome-two-week-release). Chrome 154
  reached stable, Chrome 155 stable is expected **October 6, 2026** (i.e., days after this scan), and Canary was
  already at 157.0.8079.0 on September 30, 2026 — [Chrome Release Notes](https://releases.sh/google/chrome). This
  means the exact Canary build number used in the baseline (155) is about to become a stable-channel number; it does
  **not** mean the Gemma 4 flag ships to stable users — that's gated separately by Finch config, unverified this
  month.
- **`#gemma4-for-built-in-ai` still a flag, still switches every built-in AI API (Prompt, Summarizer, Writer, …)
  from Gemini Nano to Gemma 4**, reported present as of Chrome 154 — [PiunikaWeb, June 8 2026](https://piunikaweb.com/2026/06/08/google-chrome-gemma-4-built-in-ai/)
  (older item, still the most specific public description; no newer flag-removal or stable-promotion news found).
  No change to the baseline's mechanism (`AIApiFoundationalModel:model_version/v4` + `OptimizationGuideManifestBroker`).
- **Prompt API tool use: still not implemented**, directly confirmed. On the `chrome-ai-dev-preview-discuss` thread
  "Prompt API tools," Google's Thomas Steiner states tool use "is specified, but not fully implemented yet," owned
  by the Microsoft Edge team (crbug/422803232), with an announcement to come on the mailing list when ready —
  [groups.google.com thread](https://groups.google.com/a/chromium.org/g/chrome-ai-dev-preview-discuss/c/EfDKtQiNl3E).
  No date given. This is the baseline's `#prompt-api-tool-use` watch-list item — unresolved, not newly resolved.
- **Semantic Embedder API: still an unapproved early design sketch**, Canary-only behind `#semantic-embedder-api`,
  per the explainer repo — [explainers-by-googlers/semantic-embedder-api](https://github.com/explainers-by-googlers/semantic-embedder-api).
  No `taskType` shape finalized, nothing ships yet. Separately and not the same thing: Chrome's *internal* history/
  omnibox embedding model got 57% smaller via int8 quantization, but that's not an exposed web API —
  [dejan.ai](https://dejan.ai/blog/chromes-new-embedding-model/).
- **Web Prompt API status unchanged**: core API stable for web pages since Chrome 138, origin trial for sampling
  parameters (`topK`/`temperature`) since Chrome 148, GA for extensions only — confirmed directly on
  [developer.chrome.com/docs/ai/prompt-api](https://developer.chrome.com/docs/ai/prompt-api) (last updated
  August 26, 2026 — i.e., the page itself was touched last month but the substance matches baseline). Still only
  mentions Gemini Nano by name on that page; Gemma 4 remains flag-only and undocumented there.
- **New, outside the baseline's scope**: **WebMCP** moved from a behind-a-flag prototype to a public **origin trial
  in Chrome 149, running through Chrome 156**, announced at Google I/O 2026 — [tabsprompt.com](https://tabsprompt.com/blog/webmcp-origin-trial-agent-ready-tabs),
  [WebMCP explainer coverage](https://dev.to/soumyadeepdey/why-webmcp-is-the-most-important-thing-google-announced-at-io-2026-and-nobodys-talking-about-it-2edf).
  This is a *different* mechanism than the Prompt API — it lets a web page register JS functions as MCP-style tools
  for an in-browser agent to call, incubating in the W3C Web Machine Learning group with Microsoft co-editing. It's
  about an agent calling *page* tools, not a page running local inference, so it doesn't bear on the router
  experiment directly — noted here because it's the most concrete near-term standards movement in the "agent +
  browser" space and worth knowing about for any future MJ in-browser-agent work.

### 2. Models (Gemma / Gemini Nano)

- **Gemma 4 stable family unchanged since its April 2, 2026 release** (Apache 2.0, 2B/4B "ultra-mobile/edge/browser"
  sizes plus a 12B encoder-free multimodal model) — [Google DeepMind, Gemma 4](https://deepmind.google/models/gemma/gemma-4/).
  No new size or quantization news this month.
  **A further `gemma-4-31B-it` is listed on Hugging Face** (Unsloth GGUF build) — larger than anything in the
  baseline's manifest table; it is not Chrome-relevant (far too large for in-browser use) but marks that the Gemma 4
  family has grown since September.
- **Gemini Nano 4** (Gemma-4-based) remains a developer preview per Android's AICore blog (April 2026); "consumer
  hardware deployment planned for later in 2026" — [android-developers.googleblog.com](https://android-developers.googleblog.com/2026/04/AI-Core-Developer-Preview.html).
  No GA date found this month, and this is Android/AICore, not the Chrome browser Prompt API the baseline tested.
- **4B/12B still not switchable from Chrome's built-in AI flags.** No source found contradicting the baseline's
  "Pending Usage" finding in `chrome://on-device-internals`; all Gemma-4-in-Chrome coverage this month still
  describes only the 2B (`gemma4-2b-it`) path.

### 3. Standards (WebNN, WebGPU)

- **WebGPU reached cross-browser "Baseline"** (Chrome, Edge, Firefox on Windows/macOS, Safari 26 on iOS/macOS) as of
  January 2026 — [vr.org](https://vr.org/articles/webgpu-baseline-2026-three-js-webxr-default). This predates the
  September baseline document (which already assumed WebGPU-class hardware) and isn't new this scan, but is useful
  context: Linux and mobile remain the gaps (Firefox Linux in Nightly only; Chrome Android needs recent hardware;
  Safari iOS needs the latest OS).
- **WebNN: no change.** Still Chrome-only, origin trial in Chrome 147–149, no Safari or Firefox implementation found
  — same conclusion as baseline implicitly assumed (the baseline didn't test WebNN directly). Current practical path
  for in-browser ML inference remains WebGPU + Transformers.js/ONNX Runtime Web, not WebNN.

### 4. Libraries (Transformers.js, ONNX Runtime Web, WebLLM/MLC)

- **Transformers.js v4.3** shipped with structured output support, three new model architectures, and — notably —
  **WebGPU support for Safari 26+** (previously Chrome/Edge-only in practice), plus fixes for duplicate model
  downloads — [huggingface.co/blog/transformersjs-v4](https://huggingface.co/blog/transformersjs-v4),
  [GitHub 4.3.0 release notes](https://github.com/huggingface/transformers.js/releases/tag/4.3.0). This is the
  demo's existing non-built-in mode; the Safari WebGPU support is a genuine capability gain for that mode, not the
  Chrome built-in AI path.
- **ONNX Runtime Web** is at 1.30.0, with June 2026's 1.27.0 WebGPU release and ongoing work on WebGPU
  PagedAttention, INT8 KV-cache quantization, and new kernels for Qwen-3.5/DeepSeek-style ops —
  [onnxruntime.ai/roadmap](https://onnxruntime.ai/roadmap), [GitHub releases](https://github.com/microsoft/onnxruntime/releases).
  Incremental; no new WebNN execution-provider milestone found this month.
- **WebLLM v0.2.85** added OPFS synchronous-access-handle caching, service-worker registration at startup so a
  restarted worker can keep serving requests, and recovered-worker model-state preservation to avoid reloads —
  [newreleases.io](https://newreleases.io/project/github/mlc-ai/web-llm/release/v0.2.85). Reliability/ops
  improvements to an already-known runtime; no new model support claimed this cycle.

### 5. Platforms (Apple, Microsoft)

- **Apple: Foundation Models framework opened to third-party LLM providers at WWDC 2026** (held mid-year, so this
  predates the September baseline but is new to this report's scope) — a public protocol now lets any Swift
  package — Apple's on-device model, Apple's Private Cloud Compute model, an MLX model from Hugging Face, or a
  vendor package — plug into the same session API; Anthropic and Google (via Firebase) are named launch partners —
  [Apple Developer, WWDC26 session 339](https://developer.apple.com/videos/play/wwdc2026/339/),
  [ivanmagda.dev write-up](https://ivanmagda.dev/posts/wwdc26-foundation-models-year-two/). **This is still Swift/
  native-app only — no web-content exposure was found or claimed anywhere.** Not relevant to MJ's browser-based
  router unless/until Apple exposes an equivalent to web pages.
- **Microsoft Edge**: the Aion-1.0-Instruct on-device SLM (successor to Phi-4-mini, smaller/faster, broader hardware
  reach) and the Language Detector/Translator/Prompt APIs were announced at Build 2026 (June 2026) —
  [Microsoft Edge Blog](https://blogs.windows.com/msedgedev/2026/06/02/expanding-on-device-ai-in-microsoft-edge-new-models-and-apis-for-the-web/).
  This predates the September baseline and nothing newer was found this month; included because the baseline
  document didn't cover Edge at all. Edge's on-device Prompt/Writing-Assistance APIs are a second, Chromium-based
  but Microsoft-model-backed surface worth keeping on the radar alongside Chrome's.

### 6. Techniques (routing, speculative decoding, blended inference)

- **AceSpec** (arXiv, September 2, 2026 — within this scan window) proposes asymmetric edge-cloud speculative
  decoding: a small draft model on the edge device, a large target model in the cloud, connected over a real WAN,
  with a probabilistic state cache that turns network round-trip rejections into local O(1) lookups — claims up to
  **3.52× throughput** under constrained bandwidth versus naive edge-cloud speculative decoding —
  [arXiv:2609.02514](https://arxiv.org/abs/2609.02514). Directly relevant to the *shape* of MJ's blended-inference
  idea (local router/draft + server authority) described in `BLENDED-INFERENCE-ARCHITECTURE.md`, though it targets
  model-level token speculation, not the intent/routing classification the MJ replay tested.
- **"An Empirical Study of Speculative Decoding for Small Language Models"** (EACL 2026, published March 2026, so
  not new this month but newly surfaced in this search) finds most speculative-decoding research targets 7B–70B
  models and that the picture for genuinely small (sub-3B, on-device-class) models is under-studied —
  [ACL Anthology](https://aclanthology.org/2026.eacl-long.255/). Reinforces that the baseline's own router-latency
  findings (session-strategy dominates, not raw model speed) are still close to the open research frontier, not
  behind it.
- **"Micro Language Models Enable Instant Responses"** describes model cascading/routing — a router sending queries
  to either a small on-device model or a cloud model — structurally the same shape as MJ's `RoutingHint` idea; no
  numbers pulled from it this pass, flagged for a closer read if the quarterly re-evaluation goes ahead —
  [arXiv:2604.19642](https://arxiv.org/pdf/2604.19642).

---

## What it means against the baseline

- **Throughput/latency numbers (212–241 tok/s, 38–59 ms TTFT, ~300 ms/routing decision)**: no new benchmark,
  hardware, or model-size data this month that would move these. The underlying flag, model (`gemma4-2b-it`), and
  `clone()`-vs-long-lived-session cost structure are all unchanged in every source checked.
- **"Deployment reality check" (origin trial for web, GA only for extensions, Gemma 4 Canary-flag-only)**: unchanged
  on all three counts, confirmed against the current `developer.chrome.com/docs/ai/prompt-api` page itself (last
  updated Aug 26, 2026) and against the dev-preview mailing list. The approaching Chrome 155 stable promotion
  (Oct 6, 2026) is worth a one-line check next month — specifically, whether `#gemma4-for-built-in-ai` is present
  and functional on a stable-channel install, not just Dev/Canary — but nothing indicates it will be.
- **Replay accuracy (78.7% agreement, 4–5% false skips)**: nothing this month changes the 2B model identity, so no
  reason to expect those numbers to move; no re-test triggered.
- **Watch-list items** (`#prompt-api-tool-use`, `#semantic-embedder-api`, `#on-device-model-speculative-decoding`,
  4B/12B switch): all four remain unresolved. Tool use and the embedder API both have primary-source confirmation
  this month that they are still pre-ship; no information found on the speculative-decoding flag specifically.
- **New information not in the baseline's frame**: WebMCP (agent-calls-page-tools, not page-runs-inference) and
  AceSpec (model-level edge-cloud speculative decoding) are both adjacent to, not overlapping with, what was
  tested. Neither suggests the September "small second step" recommendation should become a bigger one yet.

## Suggested next check

1. **When Chrome 155 reaches stable (~Oct 6, 2026)**, do a five-minute check of whether `#gemma4-for-built-in-ai`
   is present/functional there, purely to track whether Gemma 4's built-in-AI path is moving off Canary — not a
   trigger for re-running benchmarks by itself.
2. **Subscribe-style watch, not act-on-sight**: the `chrome-ai-dev-preview-discuss` tool-use thread said an
   announcement will go to the mailing list when tool use is ready — that announcement, if it lands, should trigger
   a **re-test** (tool use would change the router's design space materially, per the baseline's Implications #3).
3. **No action needed** on WebNN, the Semantic Embedder API, or the 4B/12B switch until one of them ships past
   "early design sketch" / "Pending Usage."
4. Next scheduled full re-evaluation per Amith's decision: **December 2026** (three months from the September
   baseline); this monthly scan continues in the interim.
