# OpenClaw 2.0 Architecture Review — What MJ Agents Should Absorb

## Technical Architecture Review & Recommendations

**Version**: 1.0
**Date**: September 2026
**Status**: Proposed — for review and prioritization
**Owner**: AI Agents subsystem
**Companions**: [`guides/AGENT_FRAMEWORK_COMPARISON.md`](../guides/AGENT_FRAMEWORK_COMPARISON.md) (MJ vs. the orchestration libraries), [`plans/agent-inflight-memory-writes.md`](agent-inflight-memory-writes.md), [`plans/agent-conversation-compaction.md`](agent-conversation-compaction.md)

---

## Executive Summary

**OpenClaw** (lineage Warelay → Clawdbot → Moltbot → OpenClaw) is the most-watched open-source personal-AI-agent platform. Its **v2026.8.1 release — "OpenClaw 2.0," end of August 2026** — merged 16,000+ PRs from 933 contributors in a single cycle and rebuilt memory, skills, automations, approvals, and collaboration. This review is based on a full clone of `openclaw/openclaw` at v2026.8.1 (docs + source), its release notes / `VISION.md` / `SECURITY.md`, and a matching deep map of MJ's agent stack at `6.1.0-edge.4`.

**The two architectures are near-perfect inverses**, and this document does **not** propose converging on theirs:

| | OpenClaw 2.0 | MemberJunction |
|---|---|---|
| Agent definition | Workspace files (`AGENTS.md`, `SOUL.md`, `USER.md`) + JSON5 config + per-agent SQLite | `MJ: AI Agents` row + ~30 related entities; generic `BaseAgent` runtime |
| Trust & tenancy | **One trusted operator per Gateway**; session keys are "routing controls, not authorization boundaries" (their words); tenants = separate containers (`openclaw fleet`) | Multi-tenant; agents run *as a user* through RLS/field perms/Record Changes; per-agent View/Run/Edit/Delete |
| Orchestration | Deliberately imperative — no graph DSL; sub-agent spawn + code-mode "Swarm" | Loop / Flow (metadata graph → durable TaskGraph) / Realtime, swappable per agent |
| Shared state | Transcript + files; no typed state | Typed payload with path-level ACLs and diff-based mutations |
| Observability | Metadata-only audit ledger, off by default | Every run/step/prompt a relational row: tokens, cache, cost rollups, payload before/after |

On governance MJ is structurally ahead, and OpenClaw's own docs concede it ("collaboration controls… not hostile-tenant isolation"). What OpenClaw has that MJ does not is **operational scar tissue from running always-on personal agents at enormous user scale**: mechanisms for memory trust, compaction safety, prompt-cache economics, governed self-improvement, and approval integrity. Most of them translate into MJ as **new columns, validation gates, and one background agent** — they fit MJ's metadata DNA rather than fighting it.

This document proposes **twelve recommendations**, ranked. R1–R6 are *adopt* (MJ-shaped already); R7–R12 are *adapt* (design work needed). A final section lists further candidates deliberately left out of the first wave.

---

## What we are explicitly NOT proposing

To prevent misreading, these OpenClaw traits were evaluated and rejected for MJ:

- **Single-operator trust model / session-keys-as-routing.** MJ's row-level, run-as-user model is the moat. OpenClaw needs a container per tenant to do what MJ does with rows.
- **Filesystem as the agent authoring surface.** MJ's DB metadata is what makes agents UI-editable, permissioned, diffable via `mj sync`, and auditable.
- **In-process trusted plugins.** ("Plugins are the trusted computing base" — their docs.) MJ's Actions boundary + `isolated-vm` code execution is the better governance posture.
- **Abandoning graph orchestration.** OpenClaw's "no graph DSL" stance fits personal assistants; MJ's `FlowAgentType` → durable TaskGraph serves governed business processes their audience doesn't have.

---

## Tier 1 — Adopt

### R1. Memory provenance as a structural boundary

**Impact: High · Effort: Medium · Touches**: `MJ: AI Agent Notes` schema, `packages/AI/Agents/src/MemoryWriteManager.ts`, `packages/AI/Agents/src/memory-manager-agent.ts`, `packages/AI/Agents/src/AgentContextInjector.ts`

**What OpenClaw does.** Every memory candidate carries an **origin class** (`owner / agent / untrusted / system`) and a **session kind** (interactive / cron / heartbeat / subagent) as unforgeable SQLite columns — never prose. A tool result that declares network-sourced content **taints the remainder of the turn**: every subsequent assistant message in that turn is classified `untrusted` even inside an owner conversation. During nightly consolidation, candidates with origin `untrusted`/`system` are **removed structurally before any prompt is built** — a precondition, not a score penalty. Untrusted content remains storable, indexable, and explicitly searchable, but is barred from the curated core and from automatic injection. Content injected into context *from* memory is marked and never re-extracted ("a fact recalled one hundred times stays one fact"). `openclaw memory forget` purges derived memory **by recorded provenance**. Cron/heartbeat/sub-agent sessions produce no durable memory candidates at all. Their docs name the threat directly: memory poisoning (OWASP Agentic ASI06, MINJA) — "content-level scanning can't catch a poisoned fact; the write path is the security boundary."
*(Evidence: `docs/concepts/memory-architecture.md`, `memory-provenance.md`, `extensions/memory-core/`, taint propagation in `packages/agent-core/src/agent-loop.ts`.)*

**MJ today.** `MemoryWriteManager` is a strong **content** gate — type restrictions (no behavioral `Constraint` writes in-flight, already documented as a prompt-injection defense), scope clamps, vector near-dup handling, per-run caps, provisional TTL. But `AIAgentNote` records nothing about *where a memory came from*: no origin class, no session kind, no taint, no recall-loop marking, no provenance-driven purge. A note extracted from a web page an agent scraped is indistinguishable from one the record owner stated directly — and both harden identically in the Memory Manager.

**Proposed.**
1. Add `OriginClass` (`Owner | Agent | Untrusted | System`), `SessionKind`, and `ProvenanceDetail` (JSON: source run/step/action, taint reason) to `MJ: AI Agent Notes` (and `Examples`). Conservative default: never `Owner` unless the content came from the context user's own turns.
2. Propagate **turn taint** in `BaseAgent`: when an executed action's result is marked externally sourced (see R6's `ContentTrust`), tag subsequent `memoryWrites` in that turn `Untrusted`.
3. Gate the pipeline on origin: `Untrusted` notes are never auto-injected by `AgentContextInjector` (explicit search only) and are excluded from Memory Manager hardening/consolidation input **before** the consolidation prompt is assembled.
4. Mark injected-note text in context so `MemoryWriteManager` skips re-extraction (recall-loop prevention).
5. Add a provenance purge: delete/archive notes by source run/conversation/action, following `DerivedFromNoteIDs` lineage.

### R2. Compaction that proves it didn't lose anything

**Impact: High · Effort: Low–Medium · Touches**: `packages/AI/Agents/src/ConversationCompactionManager.ts`, `base-agent.ts` compaction paths, IT30 integration bundle

**What OpenClaw does.** Their default "safeguard" compaction mode enforces a survival contract on the summary: required headings, **pending asks**, and **exact identifiers** must survive in the exact stored text; a bounded number of corrective attempts; and if none pass, compaction **aborts without writing a transcript entry** and keeps the original history — a failed summary is never persisted. A silent **memory-flush turn runs *before* compaction** (routable to a cheap model) so durable notes hit disk before the context that produced them is folded away. Tool calls stay paired with their results across split points, and `maxActiveTranscriptBytes` triggers semantic compaction on transcript growth even when the provider-side token count looks healthy.
*(Evidence: `docs/concepts/compaction.md`; `agents.defaults.compaction.mode: "safeguard"`, `identifierPolicy: "strict"`, `memoryFlush.model`.)*

**MJ today.** `ConversationCompactionManager` has excellent economics — post-turn fire-and-forget summarization, recursive prior-summary+delta folding, pre-turn synchronous fallback, `ConversationCompactionRun` audit rows — and the in-turn ladder (`attemptContextRecovery`) degrades tool results progressively. But nothing validates the summary's *output*. MJ is UUID-everything: a summary that paraphrases away a record ID, or drops an open question the agent asked the user three turns ago, silently corrupts the run — and the framework currently cannot notice.

**Proposed.**
1. Add a post-summary validation gate: extract UUIDs / entity keys / open `MJ: AI Agent Requests` prompts from the folded window; assert their presence in the summary; bounded corrective retries; **abort-don't-write** on final failure (the audit row already exists to record why).
2. Sequence a memory flush (the [in-flight memory write](agent-inflight-memory-writes.md) path) ahead of *pre-turn* compaction, so provisional notes are committed before their source context is folded.
3. Add a transcript-size trigger alongside the token-percent trigger.
4. Pin the contract in the IT30 deterministic bundle (inject known UUIDs + a pending ask; compact; assert survival; assert abort-on-unfixable).

### R3. Prompt-cache economics as an architectural constraint

**Impact: High (cost) · Effort: Low · Touches**: agent-type prompt templates (metadata), `base-agent.ts` `gatherPromptTemplateData`, AI dashboard

**What OpenClaw does.** The system prompt is assembled around an **explicit cache boundary**: large stable content (workspace, tool guidance, skills) above it; volatile per-turn sections (temporal context, runtime facts) below it — so provider prefix caches reuse the stable prefix across every turn. Session pruning is **cache-TTL-gated**: don't trim while the provider cache is warm, because trimming invalidates the cache and costs more than it saves; their Anthropic plugin auto-configures pruning TTL to 1h and adds a heartbeat that keeps the cache warm. Repo-wide doctrine: deterministic ordering for any map/set/registry/file list entering a prompt; "preserve old transcript bytes when possible"; prompt-state mutations (skills/tools/memory) default to **deferred cache invalidation** — effective next session, not mid-conversation.
*(Evidence: `docs/concepts/system-prompt.md` cache-boundary section, `docs/concepts/session-pruning.md`, root `AGENTS.md` "Prompt cache" doctrine.)*

**MJ today.** MJ already tracks `TokensCacheRead/Write` per prompt run with rollups — the measurement exists. But nothing governs prompt *layout* for cacheability: Nunjucks system placeholders (`_CURRENT_DATE`, `_CURRENT_TIME`, `_CURRENT_TIMESTAMP_UTC`) are resolvable anywhere in a template, and a timestamp early in the system prompt breaks prefix caching on **every turn** for every agent using that template. Catalog assembly (`subAgentDetails`, `actionDetails`, notes injection) has no specified deterministic ordering.

**Proposed.**
1. Define a **prompt-layout contract** for agent-type system templates: stable catalog blocks first (identity, actions, sub-agents, skills), volatile blocks last (temporal placeholders, payload state, injected notes). Audit the seeded agent-type prompts against it.
2. Make every catalog render deterministically ordered (name or ID sort) in `gatherPromptTemplateData` and `formatActionDetails`.
3. Treat mid-conversation catalog changes (actionChanges, skill activation) as *next-turn-boundary* mutations where possible, rather than reshuffling the cached prefix mid-run.
4. Surface **cache-hit rate per agent / per agent type** on the AI dashboard — the data is already in `AIPromptRun`; this makes the savings from 1–3 visible and keeps them from regressing.

### R4. Governed self-improvement — the "Skill Workshop" pattern

**Impact: Very high (product) · Effort: High · Touches**: new entity + scheduled agent + Explorer surface; builds on `MJ: AI Skills`, `MJ: AI Agent Requests`, Record Changes, `memory-manager-agent.ts` as the template

**What OpenClaw does.** OpenClaw 2.0's defining feature: agents that get better at your work, with every change reviewable and reversible. After substantial work, a **detached background review** runs (reusing the foreground session's prompt cache; the reviewed transcript is treated as *evidence, not instructions*) and drafts skill improvements as **proposals — never live writes** (`PROPOSAL.md`, not `SKILL.md`). Apply is the only live write: a security scanner reruns at apply time (critical prompt-injection findings block); update proposals are **hash-bound to the live target** (if the target changed since review, the proposal goes stale and returns for review); rollback metadata is written before the write; a weekly collection review reconciles the whole set with recoverable backups. Same-turn repair is allowed but requires a **runtime usage receipt** — an agent can only patch a skill the run actually used. Operator modes: `off / propose / auto`.
*(Evidence: `docs/tools/skill-workshop.md`, `docs/tools/self-learning.md`, `src/skills/workshop/`, `src/skills/security/scanner.ts`.)*

**MJ today.** Skills are first-class, permissioned, double-gated, with progressive disclosure. `MJ: AI Agent Learning Cycles` exists. The Memory Manager improves *memory* on a schedule. But nothing closes the loop from run experience → proposed improvements to skills/prompts/agent metadata → review → apply. Agents accumulate experience in notes; their instructions never improve.

**Proposed.** Build the MJ analog from parts MJ already has:
1. **`MJ: AI Agent Improvement Proposals`** entity: target (Skill / Prompt / Agent metadata field), proposed content, source run(s), `TargetContentHash` captured at proposal time, scanner verdict, status (`Pending / Applied / Rejected / Quarantined / Stale`).
2. A scheduled **Improvement Reviewer agent** (Memory Manager pattern) that mines settled `AIAgentRun`s meeting substantiality thresholds and drafts proposals — transcript as evidence, never as instructions.
3. Review routing via `MJ: AI Agent Requests` assignment strategies (this is where MJ *exceeds* OpenClaw: per-user/role review queues, shared inboxes).
4. Apply = ordinary metadata write → **Record Changes provides versioning and rollback for free**; re-verify `TargetContentHash` at apply; a scanning Action gates critical findings.
5. Per-agent policy column: `ImprovementMode` (`Off / Propose / Auto`), with `Auto` restricted to proposals whose target the platform owns (mirroring their "Workshop-owned skills only" rule).

"Self-improving agents with enterprise governance" is a story neither the orchestration libraries nor OpenClaw can tell — MJ's substrate is uniquely suited to it.

### R5. Approvals bound to exact content

**Impact: Medium-high (integrity) · Effort: Low · Touches**: `MJ: AI Agent Requests` schema, `base-agent.ts` `createFeedbackRequest` / resume path, Plan Mode, cancellation path

**What OpenClaw does.** An exec approval binds the canonical execution context: cwd, exact argv, env binding, pinned executable path, and — for scripts — a **snapshot hash of the one concrete file operand**. If the file changed between approval and execution, the run is **denied**; if exactly one concrete file can't be identified, OpenClaw **refuses to mint an approval-backed run** rather than pretend coverage. Approval records are durable and first-valid-answer-wins; reconnecting cannot revive a settled request; **aborting a run cancels the approvals it left pending**. Skill Workshop decisions bind to the exact proposal revision reviewed — a later revision returns for review.
*(Evidence: `docs/tools/exec-approvals.md`, `docs/tools/skill-workshop.md`.)*

**MJ today.** HITL *routing* is stronger than OpenClaw's (assignment strategies, shared inboxes, category inheritance). But the approval object is soft: Plan Mode approves "the plan" as presented with no hash; the code-approval workflow for AI-generated actions approves a version but `AIAgentRequest` isn't content-bound; and the effect of run cancellation on pending requests is undefined.

**Proposed.**
1. Add `ContentHash` (+ optional `ContentSnapshot`) to `MJ: AI Agent Requests`, stamped at creation from what is being approved: plan text, action code version, relevant payload subtree.
2. On resume, re-verify the hash against current state; drift ⇒ status `Stale`, forcing re-approval (Plan Mode rejection already forces a re-plan — reuse that path).
3. On run cancellation/supersession, transition that run's `Requested` rows to `Cancelled` so stale approvals can't be answered into a dead run.

### R6. An untrusted-content envelope at the framework boundary

**Impact: High (security) · Effort: Medium · Touches**: `packages/Actions/Base` result metadata, `base-agent.ts` `formatActionResultsAsMarkdown`, local-model providers (`packages/AI/Providers/{Ollama,LMStudio,LlamaCpp}`), `packages/MessagingAdapters`

**What OpenClaw does.** All network-backed tool text (search, fetch, MCP, browser) is bounded, normalized, and wrapped in `EXTERNAL_UNTRUSTED_CONTENT` boundary markers with source metadata before the model sees it. The wrapping layer also **strips chat-template special-token literals** (`<|im_start|>`, `<|start_header_id|>`, and peers across Qwen/Llama/Gemma/Mistral/Phi/GPT-OSS families) because self-hosted OpenAI-compatible backends (vLLM, SGLang, TGI, LM Studio) sometimes tokenize those literals as *structural role boundaries* — a forged-role injection. A **separate outbound sanitizer** strips leaked tool-call scaffolding at final channel delivery. High-exposure flows go further: group-join context snapshots get the wrapper *plus* a no-tools turn.
*(Evidence: `src/security/external-content.ts`, `SECURITY.md`, `docs/gateway/security/index.md`.)*

**MJ today.** Action results are formatted to markdown and injected as user-role environment annotations — a good anti-imitation device, but carrying no trust marking. There is no template-token stripping (MJ ships Ollama/LMStudio/LlamaCpp providers, so the forged-role vector is live for local-model deployments), and MessagingAdapters do no outbound scrubbing of tool scaffolding that leaks into replies.

**Proposed.**
1. Add a `ContentTrust` declaration to Action result metadata (per action, or per result at runtime): `Trusted | External`.
2. In `formatActionResultsAsMarkdown`, wrap `External` results in an explicit boundary envelope with source labeling; feed the same flag into R1's turn taint.
3. Strip known chat-template token literals from externally sourced text in the local-model provider path.
4. Add an outbound sanitizer in MessagingAdapters (and conversation delivery) for leaked tool-call/scaffolding markup.

---

## Tier 2 — Adapt

### R7. Mid-run steering and follow-up queueing

**Impact: High (UX) · Effort: Medium · Touches**: `ExecuteAgentParams`, `executeAgentInternal` loop, PubSub resolvers, conversations UI

Their loop polls a steering queue at defined checkpoints (loop start, after each tool batch, before end); a queued user message redirects the run mid-flight, with skipped tool calls given **synthetic paired error results** so the transcript stays valid; follow-ups arriving as the agent finishes extend the run instead of starting a new one. MJ supports only cancel/pause mid-run — a user watching a streaming run can't say "no, the other customer" without killing it. Proposed: a steering queue on the run (PubSub in → checked between steps in `executeAgentInternal` → injected as a user turn; synthesize paired results for skipped actions; surface a "steer" affordance in the conversations widget).

### R8. Writer fencing on run and conversation state

**Impact: Medium (correctness) · Effort: Low · Touches**: `AIAgentRun`/`ConversationDetail` write paths, `agent-run-watchdog.ts`

OpenClaw records a durable `activeWriterRunId` at admission; every transcript append supplies the expected writer ID, verified inside the commit transaction — a superseded or zombie run cannot commit stale data. Their repo doctrine: run authority is closure-bound and revalidated after every await; terminal state fails closed. MJ's watchdog (heartbeats, stale sweeper, graceful shutdown) handles *stuck* runs but not *racing* ones — a swept-then-actually-alive run, or a retry racing its original, can interleave writes. Proposed: an expected-writer check (run ID + generation) on conversation-detail and agent-run mutations; the sweeper bumps the generation when it cancels.

### R9. Failover that respects who chose the model

**Impact: Medium (governance) · Effort: Low–Medium · Touches**: `AIPromptRunner` failover, `AIAgentRun.OverrideModelID` semantics, credential bindings

Their rules: an **explicit user model choice is strict** — fail visibly, never silently substitute; only auto-selected defaults and scheduled primaries use fallbacks; fallback is **turn-local** and never persisted as the session's model; auth-profile rotation with per-account cooldowns runs *inside* a provider before the next model is tried; **subscription-billed runs never silently switch to pay-per-token**. MJ's failover is richer in classification and persistence but has no selection-source semantics: a user-picked `OverrideModelID` can fail over like any candidate, and nothing distinguishes billing classes. Proposed: tag selection source on the run (`UserExplicit | Auto | Scheduled`); strict-fail (or loudly surface substitution for) user picks; keep fallback turn-local; add a small durable cooldown keyed by credential binding; adopt "never silently change billing class" into the cost-governance rules.

### R10. Standing intents — event-based prospective memory

**Impact: Medium-high (capability) · Effort: Medium · Touches**: new entity + deterministic matcher in conversation ingest; complements User Routines

OpenClaw compiles "when X happens, do/remind Y" *out of the model* into a SQLite row: keywords, optional trigger embedding, channel/sender scope, expiry, fire budget, cooldown. A deterministic prefilter runs on every inbound message — **no model call in the matching path**; a hit injects hidden context. Anti-nagging is structural: 24h cooldown, 3-fire budget, 90-day expiry, ≤3 intents injected per turn. Time-based intents become cron jobs at utterance time. MJ's time-based proactivity is strong (Scheduled Jobs, User Routines with claim-before-run and OnChange hashing) but there is no event-based primitive — "next time this customer emails, mention the renewal" has nowhere to live except a note that may or may not be retrieved. Proposed: `MJ: AI Agent Intents` (keywords/embedding/scope/expiry/budget/cooldown, lifecycle `Pending→Armed→Fired→Done/Cancelled/Expired`) + a deterministic matcher in message/conversation ingest with the same structural bounds, riding MJ's existing vector infrastructure.

### R11. Budget the model-visible surface

**Impact: Medium (cost + reliability) · Effort: Low · Touches**: `formatActionDetails`, agent prompt review practice, Actions authoring guidance

Their doctrine (root `AGENTS.md`): every injected prompt/tool-schema/context item is bounded with a hard cap; **new model-visible text over ~1K tokens is a P0 review flag** ("the per-call tax" — each core prompt line reaches every operator on every model request); tool descriptions never statically reference tools from other toolsets (gating turns the reference into hallucination bait — cross-references are injected at build time from what's actually available); instructions the model must apply in full are served whole, never windowed. MJ's `formatActionDetails` renders every granted action — params, outputs, result codes — as unbounded prose; an agent with 40 actions pays that tax on every call. Proposed: cap per-action and total catalog rendering with overflow-to-on-demand expansion (skills already do name+description progressive disclosure — extend the pattern to large action catalogs); adopt the per-call-tax review lens for agent-type template changes; audit action descriptions for references to non-granted capabilities.

### R12. Prompt snapshots in CI

**Impact: Medium (regression safety) · Effort: Low · Touches**: TestingFramework, seeded agent-type prompts

OpenClaw commits rendered-prompt fixtures and drift-checks them in CI (`pnpm prompt:snapshots:check`) — a template edit that reorders the cacheable prefix, bloats a catalog, or changes tool guidance is visible in review as a snapshot diff. MJ prompts are metadata, which makes this *easier*: render the composed system prompt per seeded agent type against a fixed catalog fixture and snapshot it in the deterministic integration tier. This is also the enforcement mechanism for R3's layout contract.

---

## Further candidates (not in the first wave)

- **Multiplayer agent sessions** — OpenClaw 2.0's headline: join a live session, read/suggest/draft/participate roles per conversation, presence, per-person attribution, durable progress cards. MJ's data layer (conversation/artifact permissions, `ConversationDetail` attribution) already supports most of it; this is a conversations-UX roadmap item rather than an agent-framework change.
- **Actions as callables in sandboxed code** — their Code Mode makes authorized tools async functions in one QuickJS program ("latency is model round-trips, not milliseconds"); MJ's Pipelines + `packages/Actions/CodeExecution` are 80% of the way there. Candidate follow-up: expose granted Actions and artifact tools inside the `isolated-vm` sandbox as a fourth composition mode alongside Actions/Pipelines/Flow.
- **`mj doctor`** — their rule that every breaking config change ships a `doctor --fix` migration (runtime reads canonical shapes only, no compat shims) suggests a CLI doctor that mechanically checks the known silent-failure traps our instruction files currently defend with prose (metadata/CodeGen ordering, sync watermarks, registration drift).
- **Maturity scorecards** — a lightweight `taxonomy`-style scorecard over the AI packages (which capabilities have deterministic integration coverage vs. live-only vs. none), rendered by CI.

---

## Suggested sequencing

| Phase | Items | Rationale |
|---|---|---|
| 1 | R2, R3, R5, R12 | Small, self-contained gates and contracts; immediate cost/integrity wins; R12 enforces R3 |
| 2 | R1 + R6 | One coherent provenance/trust wave — schema change + taint propagation + envelope, shipped together |
| 3 | R8, R9, R11 | Runtime-hardening cluster |
| 4 | R4, R7, R10 | The feature-scale items — governed self-improvement, steering, intents |

---

## Sources

- Primary: full clone of [`openclaw/openclaw`](https://github.com/openclaw/openclaw) @ v2026.8.1 — `docs/releases/2026.8.1.md`, `VISION.md`, `SECURITY.md`, root `AGENTS.md`, `docs/concepts/*` (memory-architecture, memory-provenance, dreaming, compaction, session-pruning, system-prompt, context-engine, model-failover), `docs/tools/*` (skill-workshop, self-learning, exec-approvals, secrets), `src/` (agents, context-engine, skills/workshop, cron, gateway, security, audit).
- MJ internals referenced at `6.1.0-edge.4`: `packages/AI/Agents` (`base-agent.ts`, `MemoryWriteManager.ts`, `ConversationCompactionManager.ts`, `AgentContextInjector.ts`, `memory-manager-agent.ts`, `agent-run-watchdog.ts`), `packages/AI/Prompts/src/AIPromptRunner.ts`, `packages/MessagingAdapters`, `packages/Actions/CodeExecution`, [`guides/AGENT_MEMORY_GUIDE.md`](../guides/AGENT_MEMORY_GUIDE.md), [`guides/AGENT_FRAMEWORK_COMPARISON.md`](../guides/AGENT_FRAMEWORK_COMPARISON.md).
- Coverage: [VentureBeat](https://venturebeat.com/technology/openclaw-2-0-is-here-what-it-means-for-enterprises) · [The Decoder](https://the-decoder.com/openclaw-2-0-brings-simplified-setup-a-rebuilt-browser-app-and-multiplayer-sessions/) · [OpenClaw blog — "OpenClaw 2.0, Accidentally"](https://openclaw.ai/blog/openclaw-2-accidentally) · [Implicator — "OpenClaw 2.0 Ships Multiplayer, Not a Security Boundary"](https://www.implicator.ai/openclaw-2-multiplayer-not-security-boundary/) · [Help Net Security](https://www.helpnetsecurity.com/2026/08/31/openclaw-2-0-released/) · [MarkTechPost](https://www.marktechpost.com/2026/08/30/openclaw-releases-openclaw-2-0-guided-model-setup-575-ms-control-ui-startup-and-one-trust-boundary-per-gateway/amp/).
