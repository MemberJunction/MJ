# Agent Token Optimization — Headroom-Inspired Primitives + Framework Wiring

**Status:** Proposed
**Owner:** AI / Agents
**Branch:** `claude/quirky-feynman-tup6u8`
**Last updated:** 2026-06-16

---

## 0. Attribution

Several ideas in this plan are **inspired by — and in two cases are partial TypeScript re-implementations of — algorithms from [Headroom](https://github.com/chopratejas/headroom)** (`chopratejas/headroom`), an Apache-2.0 context-compression system for AI agents. We are **not** vendoring, forking, or depending on Headroom. We are porting a small number of *concepts* (structural JSON compression, cache-aligned prompt prefixes, AST-aware code reduction) into native, dependency-light TypeScript primitives, and crediting the source in code, package metadata, and this doc.

> "Headroom" is the original project's brand — we do **not** use that name for our package or in published identifiers. We credit it as the conceptual source in comments, the package README, and `NOTICE`.

Headroom components referenced below and the MJ analog we build:

| Headroom component | What it does | Our action |
|---|---|---|
| **SmartCrusher** | Structural JSON compression (collapse repeated arrays to schema+rows, drop nulls) | **Port to TS** (Priority 1) — flagship of the new package |
| **CacheAligner** | Stabilizes prompt prefix to maximize provider KV-cache hits | **Port the principle** (Priority 2) — fix our mid-prefix mutation |
| **CodeCompressor** | AST-aware source reduction | **Port to TS** (Priority 3) — narrow surface |
| **`headroom learn`** | Mines failed sessions for corrective memory | **Adapt the concept** (Priority 4) into our Memory Manager |
| CCR (reversible offload + `headroom_retrieve`) | Offload big blobs, retrieve on demand | **Already have** — our Artifact Tools layer (`ArtifactToolManager`) is a semantically richer equivalent; no work needed |
| Kompress-base (trained prose model) | ML prose compression | **Out of scope** — keeps a Python/HF/ONNX runtime we don't want; our `AI Summary` compaction covers the LLM-summarization path |

---

## 1. Background

Our agent framework (`packages/AI/Agents`) already implements the core of Headroom's thesis — reversible offload of large payloads with on-demand structured retrieval — and in places does it *better* because we own the data model:

- **Artifact tools** (`ArtifactToolManager.ts`, `artifact-tools/*`): large result sets never enter the prompt; only a manifest + tool docs do. The LLM calls `filter`/`sort`/`paginate`/`aggregate`/`getRow` on demand. This is CCR with structured operations instead of "give me the blob back".
- **Alpha-ID convention** (`SearchResultSetToolLibrary.ts`): UUIDs replaced with short `A,B,…AA` handles so 36-char IDs never cost prompt tokens.
- **Media interception** (`base-agent.ts` `interceptLargeBinaryContent`): base64 >10KB → `${media:refId}` placeholders, persisted out-of-band.
- **Message lifecycle / TTL** (`base-agent.ts` `pruneAndCompactExpiredMessages`): `expirationTurns` + `expirationMode` (None/Remove/Compact), per-action configurable via `ResultExpirationTurns`/`ResultExpirationMode`.
- **Escalating context recovery** (`attemptContextRecovery`): remove oldest tool results → compact old → compact all → trim user message, on context-overflow.

The gaps Headroom exposes — and this plan closes:

1. Plain Action results that return a **big repetitive JSON blob below the artifact threshold** still go into the prompt verbatim through `ActionResultSummary`. No structural compression.
2. Our **mid-run history mutation** (prune/compact) silently **invalidates the provider KV-cache prefix**, which can cost more in re-billed prefix tokens than the prune saves. We have no cache-stability discipline.
3. **Code-bearing agents** (query builder, codegen-adjacent) pass source verbatim with no structural reduction.
4. The Memory Manager extracts from **rated conversations and high-value (high-artifact-usage) runs** — it does **not** specifically mine **failed runs** for "avoid this" corrective memory. Headroom's `headroom learn` does exactly that.

---

## 2. New package: `@memberjunction/context-crush`

A **framework-agnostic, dependency-light** TS package of token-optimization *primitives* that any TS dev can use standalone, and that our agent framework consumes internally.

**Name candidates** (homage to the *algorithm* — "crush"/"crusher" — not the Headroom brand):
- `@memberjunction/context-crush` ✅ *(recommended — "crush" credits SmartCrusher; "context" states the purpose)*
- `@memberjunction/token-crush`
- `@memberjunction/payload-crush`

**Location:** `packages/AI/ContextCrush`

**Dependencies:** none beyond `@memberjunction/global` (and only if we need its types). The JSON crusher and prefix-alignment primitives are pure functions over strings/objects — they must be usable by a TS dev with zero MJ entity coupling. Code compression (Priority 3) adds one parser dep behind a subpath export so the base import stays light.

**Public surface (v1):**

```ts
// Structural JSON compression (Priority 1)
export function crushJSON(value: unknown, opts?: CrushOptions): CrushResult;
export function describeCrush(result: CrushResult): string; // human/LLM-readable legend

// Cache-aligned prefix helpers (Priority 2)
export function partitionStablePrefix(messages, opts): { stable, volatile };

// Code reduction (Priority 3, behind subpath: @memberjunction/context-crush/code)
export function crushCode(source: string, lang: CodeLang, opts?): CrushResult;
```

Every file carries an attribution header (see §7). The README and `NOTICE` credit Headroom and link the upstream algorithm.

---

## 3. Priority 1 — Structural JSON compression (SmartCrusher port)

**Goal:** deterministically shrink large, repetitive JSON in inline action results before it reaches the model, with **no LLM call** (fast, deterministic, idempotent).

### 3.1 Algorithm (`crushJSON`)

Port the SmartCrusher *idea*, implemented fresh in TS:

1. **Array-of-objects → tabular form.** An array of objects sharing keys becomes a `{ columns: [...], rows: [[...]] }` shape — the keys are stated once, not per element. This is the dominant win for query results / record lists.
2. **Null/empty elision.** Drop `null`/`undefined`/`""` fields (recorded in a legend so meaning isn't lost), opt-out via options.
3. **Value interning.** Repeated long string values (status codes, type names) replaced by short refs with a legend, above a frequency/length threshold.
4. **Depth/whitespace normalization.** Emit minified, deterministic key order so the *same* logical payload always crushes to byte-identical output (critical for cache stability — see Priority 2).
5. **Budget guard.** `maxChars` option: if a sub-tree is still too big after crushing, truncate with an explicit `…(+N more rows)` marker rather than silently dropping.

`CrushResult` carries `{ text, originalChars, crushedChars, legend }`. `describeCrush` renders a compact legend the model can read (e.g. "rows are [id, name, status]; status legend: A=Active…").

### 3.2 Where it plugs in

`base-agent.ts` — the `ActionResultSummary` build path (around `interface ActionResultSummary` / the markdown summary builder that feeds action results into conversation messages). Apply `crushJSON` to each output param `Value` that is (a) an object/array and (b) over a size threshold, **before** it is stringified into the summary. Gate behind a new agent-level/global flag (default **on**) so it can be disabled per agent if a downstream consumer needs raw JSON.

> **Implementation note (JSON-string params):** Some actions return their payload as a **JSON string** (e.g. `run-adhoc-query`'s `Results = JSON.stringify(rows)`), so the param `Value` is `typeof === 'string'`, not an object/array. `formatParamValueForResult` therefore tries `crushJSON` on **string** values too — `crushParamValue` parses the string inside a try/catch, so non-JSON strings (SQL, plain text) fall through safely to the opt-in code crusher (`crushCode`) and then verbatim. Order for strings: **crushJSON → crushCode → verbatim**. Without this, the most common large-result shape (a stringified JSON array) would bypass crushing entirely.

Interaction with existing layers (ordering matters):
1. `interceptLargeBinaryContent` runs first (pulls media out).
2. Artifact-tool offload remains the path for recognized artifact types (unchanged).
3. `crushJSON` is the **new middle tier** for everything still inline and large.

### 3.3 Tests

- Unit (in `@memberjunction/context-crush`): round-trip *semantic* equivalence (crushed legend + rows reconstructs the original set), idempotency, byte-stability, budget truncation, edge cases (empty, scalars, deeply nested, mixed-type arrays).
- Integration (in `packages/AI/Agents/__tests__`): an action returning a 200-row repetitive result produces a crushed summary; flag-off restores verbatim behavior.
- Target: report measured char/token reduction on a representative fixture in the PR.

---

## 4. Priority 2 — Cache-aware expiration (CacheAligner principle)

**Problem:** `pruneAndCompactExpiredMessages` mutates messages *in place anywhere in the array*. Removing/compacting a message that sits **before** stable tail content shifts the prefix, so the provider's KV cache (system prompt + manifest + tool docs + early turns) misses and is re-billed. With cache reads at ~10% of fresh-token cost, an ill-placed prune can be a **net loss**.

**Fix (principle ported from CacheAligner — stabilize the prefix):**

1. **Classify the stable prefix.** Identify the contiguous front-of-conversation block that is intended to be byte-stable across turns: system prompt, `_ARTIFACT_MANIFEST`/`_ARTIFACT_TOOLS`, injected memory block, original user request. `partitionStablePrefix` (new primitive) returns `{ stable, volatile }`.
2. **Confine mutation to the volatile region.** Prune/compact only operate on the volatile tail. An expired message inside the stable prefix is either left intact or, if it must go, the prune is **deferred** until it is no longer load-bearing for cache (or until context-overflow recovery forces it — overflow recovery already accepts cache loss as the cost of not failing).
3. **Compact-in-place must preserve byte offsets where feasible.** Where a message *is* compacted in the volatile region, do it in a way that doesn't perturb the stable prefix (it already won't, by construction).
4. **Make crush output deterministic** (Priority 1 already guarantees byte-stable crush) so re-rendering the same action result across turns doesn't itself break cache.

**Scope note:** this is primarily a sequencing/guard change in `pruneAndCompactExpiredMessages` + a small primitive; it does **not** change the `expirationTurns`/`expirationMode` metadata model. Behaviorally conservative: when in doubt, prefer keeping cache over a marginal token save, because the prune still fires under genuine overflow via `attemptContextRecovery`.

**Tests:** given a conversation with a stable prefix + expiring tail messages, assert (a) the prefix is byte-identical before/after a prune cycle, (b) volatile expirations still fire, (c) overflow recovery still reaches into the prefix when it must.

---

## 5. Priority 3 — AST-aware code compression (CodeCompressor port)

**Goal:** for agents that move source code through context (e.g. `query-builder-agent.ts`, codegen-adjacent flows), reduce code the agent isn't actively focused on while preserving structure.

**`crushCode(source, lang, opts)`** (subpath export `@memberjunction/context-crush/code`):
- Keep signatures, declarations, and structure; collapse function bodies the caller marks non-focal to `{ … }` with a one-line summary.
- Preserve comments that are docstrings/contracts; drop noise on request.
- Start with **SQL + TypeScript** (our two highest-volume code-in-context languages); add others only on demand. Parser dep lives behind the subpath so the base package stays zero-dep.

**Where it plugs in:** opt-in, per-agent-type, at the point code blocks are assembled into prompt context. Lower priority and narrower; ship after 1 & 2 prove out. No core-path default-on behavior in v1.

**Tests:** structural-preservation assertions per language; "focal region kept verbatim, non-focal summarized"; idempotency.

---

## 6. Priority 4 — Memory: learn from failed runs (`headroom learn` concept)

> **Status: DEFERRED to a follow-up PR.** The first implementation narrowed the §6.1 selector to a single
> literal filter (`Status IN ('Failed','Cancelled')`). Investigation found that in this codebase `Success` is
> redundant with `Status` (a run's `Success=false` only ever pairs with `Status='Failed'`/`'Cancelled'`), so
> the only failure signal that would add real coverage — **repeated `AwaitingFeedback`** (a run that keeps
> stalling for human help on the same issue; these have `Success=true`, `Status='AwaitingFeedback'`) — was the
> one not implemented. Combined with agents recovering gracefully to `AwaitingFeedback` rather than ending
> `Failed`, the feature mined effectively nothing. P4 was removed from the ContextCrush PR so P1–P3 could land
> clean; it should return as its own PR built around the recurrence-based signal below, not the Status/Success
> literal.

**Where this lands in our system** (studied against the in-flight memory writes work and `MemoryManagerAgent`):

Our memory architecture (see `guides/AGENT_MEMORY_GUIDE.md`) is three-tier: in-flight `memoryWrites` (Provisional, `MemoryWriteManager`) → scheduled `MemoryManagerAgent` (extraction + hardening + consolidation/decay). Extraction today draws from:
- **Rated conversations** (positive/negative/unrated message ratings), and
- **High-value agent runs** selected by `LoadHighValueAgentRuns()` — which keys on **high artifact usage** (shared ≥2 or used ≥5×).

**Gap:** failed runs are never specifically mined. A run that errored, looped, or was abandoned carries exactly the corrective signal `headroom learn` targets ("this approach didn't work").

**Design — additive, reuses existing machinery:**

1. **New source selector** alongside `LoadHighValueAgentRuns`: `LoadInstructiveFailedAgentRuns(since, contextUser)` — selects recent runs where `Status`/`Success` indicates failure, the consecutive-failed-steps/unproductive-retry safety nets tripped, or context-recovery was invoked. ID-only `simple` projection, same shape/caps as the existing loader (MaxRows ~50, cooldown-respecting).
2. **Extraction prompt variant / mode:** feed failed-run transcripts through extraction with a *corrective* framing → candidate notes of type **`Issue`** (already in the `Type` enum) or `Context`, **never `Constraint`/behavioral** in-flight-equivalent (preserve the prompt-injection defense: a mined failure can't become an instruction without MM/human promotion).
3. **Provenance & lifecycle:** notes written as `AuthorType='MemoryManager'`, normal Provisional→hardening→consolidation flow. Corrective notes get standard scope clamping; they decay like any other unless reinforced.
4. **Sparsity & safety:** reuse `minConfidenceThreshold` (80) and `cooldownHours` (24) so we don't flood the pool with low-signal "it failed" notes. Confidence must reflect that the *lesson* is generalizable, not that a one-off transient error occurred.
5. **Observability:** emit the same `AIAgentRunStep` rows the other extraction phases do, so failure-mined notes are auditable end-to-end.

**Open question for review:** should failure-mined notes be a distinct `ProtectionTier` (e.g. `Ephemeral`) so they decay faster than success-derived knowledge? Lean **yes** for v1 (fast decay; only survive if reinforced by recurrence).

**Tests:** extraction over a fixture failed-run transcript yields an `Issue`/`Context` candidate, never a `Constraint`; cooldown + confidence gating honored; injection respects existing scoping.

---

## 7. Attribution & tagging conventions

So credit is unambiguous wherever a reviewer or downstream dev looks:

1. **Per-file header** in every ported primitive:
   ```ts
   /**
    * Structural JSON compression — partial TypeScript port of the SmartCrusher
    * concept from Headroom (https://github.com/chopratejas/headroom, Apache-2.0).
    * Re-implemented from the published algorithm description; not a copy of source.
    * See plans/agent-token-optimization.md §0 for attribution.
    */
   ```
2. **Package `README.md`** of `@memberjunction/context-crush`: a "Credits & prior art" section naming Headroom, linking the repo, stating Apache-2.0, and clarifying these are independent TS re-implementations of *concepts*.
3. **`NOTICE`** file in the package crediting Headroom for the originating algorithms.
4. **Code comments at each integration site** in `base-agent.ts` and `memory-manager-agent.ts`: a one-line `// token optimization via @memberjunction/context-crush (SmartCrusher-inspired)` so the wiring is discoverable.
5. **This plan** is the canonical attribution record; link it from the package README.

---

## 8. Rollout phases

| Phase | Deliverable | Gating |
|---|---|---|
| **P1a** | Scaffold `@memberjunction/context-crush` (package, build, vitest, README, NOTICE, attribution headers) | — |
| **P1b** | `crushJSON` + `describeCrush` + full unit tests | P1a |
| **P1c** | Wire `crushJSON` into `ActionResultSummary` path in `base-agent.ts` behind default-on flag; integration tests; measured savings in PR | P1b |
| **P2** | `partitionStablePrefix` primitive + cache-aware guard in `pruneAndCompactExpiredMessages`; prefix-stability tests | P1b |
| **P3** | `crushCode` (SQL + TS) behind subpath export; opt-in wiring for query-builder agent | P1 |
| **P4** | _Deferred_ — `LoadInstructiveFailedAgentRuns` + corrective extraction mode in `MemoryManagerAgent` (see §6 status note; removed from this PR, returns as its own follow-up) | independent of P1–P3 |

Each phase ships as its own PR off this branch (or follow-ups), with measured before/after token counts where applicable. **This PR delivers the plan only.**

---

## 9. Risks & non-goals

- **Don't double-compress.** Artifact-tool offload and media interception run first; `crushJSON` only touches what's still inline. Verify no path crushes an artifact manifest.
- **Determinism is load-bearing.** Priority 2 depends on Priority 1's byte-stable output. Any nondeterminism in `crushJSON` (key ordering, map iteration) breaks cache stability — enforced by tests.
- **Semantic loss.** Crushing must be reversible *in meaning* via the legend; never drop data without a legend marker. The agent must be able to read the legend.
- **Memory pool flooding (P4).** Failure mining without strict confidence/cooldown/decay would degrade the note pool. Conservative gating + fast decay tier in v1.
- **Non-goals:** no Python/Rust/ONNX runtime; no trained prose model (Kompress-base); no transparent LLM proxy; no dependency on `headroom-ai`. We port concepts, not infrastructure.

---

## 10. References

- Headroom: https://github.com/chopratejas/headroom (Apache-2.0) — SmartCrusher, CacheAligner, CodeCompressor, `headroom learn`, CCR.
- Our analog layers: `packages/AI/Agents/src/ArtifactToolManager.ts`, `artifact-tools/*`, `base-agent.ts` (`interceptLargeBinaryContent`, `pruneAndCompactExpiredMessages`, `attemptContextRecovery`, `ActionResultSummary`).
- Memory: `guides/AGENT_MEMORY_GUIDE.md`, `packages/AI/Agents/src/memory-manager-agent.ts` (`LoadHighValueAgentRuns`, extraction pipeline), `MemoryWriteManager.ts`, `plans/agent-inflight-memory-writes.md`.
</content>
</invoke>
