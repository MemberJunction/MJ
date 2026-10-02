# Content Pipeline Framework — Implementation Plan

**Branch**: `feat/content-pipeline-framework` (from `next`, tracking `origin/feat/content-pipeline-framework`)
**Shape**: ONE large PR covering the whole Framework track.
**Specs**: PR [#4744](https://github.com/MemberJunction/MJ/pull/4744) + the architecture artifact
(*The Content Pipeline*, 2026-09-29, Dray). **The artifact is canonical** where the two disagree.
**Status**: plan only — no code written yet.

---

## 1. Decisions taken

| # | Decision |
|---|---|
| 1 | **One PR**, not a series. Phases below are build order and review milestones, not separate PRs. |
| 2 | **Artifact numbering is canonical**: F0–F13, including the **Delete stage (F12)** and **metadata-only embed (F13)**. fw.md's F12 (per-record claiming) is deferred — the Work Queue's lease supersedes it. |
| 3 | **Build Work-Queue-compatible.** See §3 — "available" needs qualifying. |
| 4 | **No dependency on `AutotagBaseEngine`.** It stays in the tree, untouched, and is removed separately. We do not call it, extend it, or import it. |
| 5 | **No dependency on `@memberjunction/ai-knowledge-pipeline`.** Temporarily parallel, eventually removed. We do not call it. |
| 6 | **Fresh database.** Spin up a Docker SQL Server container at `next`'s migration level when build starts. |

---

## 1a. Standing rules

**Rule 1 — Layering. The artifact describes the whole product; this PR builds only the framework
half.** Where the artifact describes something the PR's plan does not, assume it is handled in the
application layer (Betty), and build the framework so that layer *can* do it — an overridable hook,
a registered class, a role already threaded through the contract. Do not build the feature here, and
do not design it away either.

Applied so far:
- **Access, credentials and roles (artifact §07) are not in MJ at all.** Base MJ holds content data
  and assumes its caller is entitled to reach the source; authentication handshakes, credential
  storage and role-based control belong to the layer above. What MJ keeps is the seam: `ExtractStage`
  takes an injectable fetcher, defaulting to a plain unauthenticated one, so a higher layer supplies
  authenticated retrieval without MJ knowing what a credential or a role is.

**Rule 2 — When the specs and MJ's own conventions conflict, MJ wins.** The specs describe intent; the
platform describes how that intent is expressed here. Recorded because it has already changed a
decision once:

- The artifact (§07) puts Access's role→credential mapping in `ContentSourceParam` rows, and argues
  for it. But `IContentSourceConfiguration` — MJ's existing JSONType for `ContentSource.Configuration`
  — already says those keys *"replace the legacy per-key ContentSourceParam rows"*, and MJ has moved
  source parameters into `Configuration.SourceSpecificConfiguration`, declared by the parent type's
  `Configuration.RequiredFields[].Key`. Access settings therefore live in
  `Configuration.Access`, alongside the existing `Website` sub-object, and no new column or table
  was added.

## 2. Ground truth as of this branch

Verified against `origin/next` @ `705ab4e7d5`.

| Fact | Consequence |
|---|---|
| PR #4744 is **docs-only** — 3 files, 860 lines, unmerged | The specs are not on our branch. Read from `origin/dray/content-pipeline-framework`. |
| The artifact names `content-pipeline-framework-merged.md` as its framework plan, but that file has **zero** F-phase references | The F track lives in `content-pipeline-framework.md` lines 222–293. That is the detailed source; the artifact overrides it where they differ. |

### Schema delta (verified in `packages/MJCoreEntities/src/generated/entities/__mj.ts`)

| Entity | Already has | We add |
|---|---|---|
| `MJContentItemEntity` | `TaggingStatus`, `EmbeddingStatus`, `Checksum`, `ParentID` | `FieldConfidence`, `ExtractionStatus`, `SegmentationStatus`, `DeleteStatus`, `ExtractorKey`, `ExtractorKeyOverride`, `Modality` |
| `MJContentItemChunkEntity` | `TaggingStatus`, `EmbeddingStatus`, `DeleteStatus`, `SegmenterKey`, `Modality` | `FieldConfidence` |
| `MJContentSourceEntity` | `SegmenterKey` | `FieldConfidence`, Access-driver reference, multi-modal flags, a file-reference field |

Plus a `WorkType` CHECK-constraint change to admit `'Pipeline Stage'`, and one new value on the embedding
status for F13. All additive.

### RSP seams

| Seam | State |
|---|---|
| `RecordProcessorRegistry.Instance.Register(workType, factory)` | ✅ exists — `'ML Model'` already uses it |
| `IRecordSetSource` | ✅ exists |
| `RecordSetProcessor.Instance.Process({ …, tracker })` | ✅ accepts an injected tracker |
| `RecordProcessExecutor.Run()` | ❌ **never passes one** — metadata-driven runs always get `GenericProcessRunTracker` |
| `RecordProcessExecutor.BuildSource` / `BuildProcessor` | ✅ both `public` — the workaround seam |

---

## 3. What "Work-Queue-compatible" actually means

**`feat/work-queue` changes ZERO files under `packages/RecordSetProcessor/`.** It ships the queue itself —
`@memberjunction/work-queue-{base,core,engine,server,aws}`, 257 files, transports (database + SNS/SQS), an
Explorer operator dashboard, Terraform. It does **not** ship the RSP↔queue bridge.

Nor does anything else. `RecordScopeProviderRegistry`, `BindRecord`, `QueueAwareTracker`, `WorkQueueSource`,
`ScopeType = 'Queue'` — the artifact's Substrate track (S0–S6) and the merged plan's M0–M7 — exist on **no
branch in this repo**. That track is unwritten work, and it is not ours: it belongs to Record Set Processing
and the queue, not to the content pipeline.

Two hard consequences:

1. **We cannot import `@memberjunction/work-queue-*`.** They are not on `next`; a dependency on them would
   not build or merge. Compatibility is achieved by **mirroring the contract shape**, not by importing it.
2. **We must not assume the bridge.** The pipeline runs on RSP alone in this PR, and plugs into the queue
   unchanged once someone builds the bridge.

### The compatibility contract

The queue's handler contract (from `packages/WorkQueue/samples/src/HelloWorldHandler.ts`) is:

```ts
@RegisterClass(BaseWorkHandler, 'samples.hello')
class H extends BaseWorkHandler<P> {
  Handle(message: WorkMessage<P>, context: WorkContext): Promise<WorkOutcome>
}
// context: { Log, SubscriptionName, DeliveryID, Attempt, MaxAttempts, IsReplay, Signal: AbortSignal }
// outcome: Outcome.Complete() | Outcome.Retry(reason) | throw TransientWorkError | throw FatalWorkError
```

`IPipelineStage` is therefore designed as a **structural superset** of that shape, defined in
`content-pipeline-base` with no queue import:

| Queue concept | `StageContext` / stage contract equivalent |
|---|---|
| `context.Signal: AbortSignal` | `context.Signal: AbortSignal` — same type, same semantics. A stage that ignores it is a bug. |
| `context.Attempt` / `MaxAttempts` | `context.Attempt` / `context.MaxAttempts` — RSP supplies 1/1 today |
| `context.Log` | `context.Log` + `context.ReportProgress(message)` |
| `Outcome.Complete() / Outcome.Retry()` | `StageOutcome.Complete() / .Retry(reason)` — our own type, 1:1 mapped by the future bridge |
| `TransientWorkError` / `FatalWorkError` | `TransientStageError` / `FatalStageError` — our own classes, same split |
| `context.IsReplay` | `context.IsReplay` — RSP supplies `false`; stages must be idempotent regardless |

### What RSP cannot supply, and who synthesizes it

`RecordProcessorContext` (`packages/RecordSetProcessor/base/src/interfaces.ts:54`) carries only
`contextUser`, `provider`, `processRunID`, `recordProcessID`, `entityID`. It has **no abort signal, no
progress hook, and no attempt/delivery facts**. RSP does have a pause/cancel handshake, but it lives at the
**checkpoint boundary** via the tracker (`RecordSetProcessor.ts:154`) — not per record. That is precisely
the "in-flight cancel" the artifact's S-track exists to add.

So `StageContext` is **built by `PipelineProcessor`**, which synthesizes the queue-shaped facts RSP lacks:

| `StageContext` member | Under RSP today | Under the queue later |
|---|---|---|
| `Signal` | an `AbortController` owned by `PipelineProcessor`, aborted when RSP's checkpoint handshake reports cancel — so it fires at batch boundaries | the delivery's own signal, firing in flight |
| `Attempt` / `MaxAttempts` | `1` / `1` | the delivery's real attempt counters |
| `IsReplay` | `false` | whatever the delivery says |
| `ReportProgress` | routed to `PipelineProcessRunTracker` | routed to the queue-aware tracker |

Stages are written against the richer contract from day one, so nothing in a stage changes when the
coarse values become real ones. This is the whole of what "Work-Queue-compatible" buys us.

The mapping is documented in `content-pipeline-base`'s README as the adapter spec, so the bridge is a thin
translation layer whenever it is written. **Design rules that follow from this** and apply to every stage:

- Stages are **idempotent** — re-delivery is normal in a queue, and `IsReplay` may be true.
- Stages **honor `Signal`** and return `Retry` rather than throwing when aborted mid-work.
- Stages classify failure as **transient vs fatal** explicitly; they never throw a bare `Error`.
- Stages never touch a tracker, a `ProcessRun`, or a delivery row. All status leaves through `StageContext`.
- Stages take **one record** and know nothing about batching, scope, or who handed it to them.

---

## 4. What we reuse instead of `AutotagBaseEngine`

Decision 4 removes the specs' assumed substrate for three stages. What replaces it, verified present on `next`:

| Stage | Spec said | We use instead |
|---|---|---|
| **F7 Segment** | "resolve an `IChunkingStrategy` by content type (same cascade pattern as readers)" | ✅ **`@memberjunction/ai-segmentation`** — already does exactly this. `BaseSegmenter.Resolve(key)`, `ResolveSegmenter(key, fallback)` with safe degradation, six built-in segmenters (Structural, Semantic, Transcript, FixedWindow, AdaptiveBoundary, Paged), plus content cleaners. `SegmenterKey` already exists on ContentItemChunk / ContentSource / ContentType. **The Segment stage shrinks to an adapter.** Remember `LoadContentSegmenters()` in the host bootstrap or the bundler tree-shakes the registrations and resolution silently degrades. |
| **F7 Tag** | "delegates classification to a registered classifier — an AI Prompt via the existing prompt-execution path, or a plain function" | ✅ Already independent of the autotagger. `@memberjunction/ai-prompts` via the normal prompt-execution path, behind a registered `IContentClassifier`. |
| **F8 / F13 Embed** | "batched generation and upsert through the existing batch hook" | ✅ **`@memberjunction/ai-vectors`** (`IEmbedding`, `IVectorDatabase`, `IVectorIndex`) + **`@memberjunction/ai-vectordb`** (`VectorDBBase`, `MetadataFilter`). No `EntityVectorSyncer`, no autotagger. |
| **F5 Extract** | "resolve file type, select a reader, read, with the plain-text fallback" | ⚠️ **The real gap.** Readers live inside `AutotagBaseEngine` today (`pdf-parse`, `officeparser`, `cheerio`). See decision below. |

### Open: where Extract's readers come from

Two viable routes; this is the one design choice the specs cannot answer for us because they assumed the
autotagger.

- **(a) Call existing CoreActions through the action engine** — `packages/Actions/CoreActions/src/custom/files/pdf-extractor.action.ts`,
  `get-file-content.action.ts`, `custom/web/web-page-content.action.ts` already exist. Highest-abstraction
  answer, no duplicated parsing dependencies, and actions are a supported boundary.
  Costs: action-engine overhead per record, and the reader cascade becomes partly metadata-driven.
- **(b) Own readers in `content-pipeline-engine`**, registered `@RegisterClass(BaseContentReader, 'pdf')`,
  declaring `pdf-parse` / `officeparser` / `cheerio` ourselves. Matches the spec's `ExtractorKey` /
  `ExtractorKeyOverride` cascade exactly and keeps Extract self-contained.
  Costs: a third copy of the parsing dependencies in the repo.

✅ **DECIDED (b): we own `BaseContentReader`.** Readers register as
`@RegisterClass(BaseContentReader, '<key>')` and `ExtractorKey` / `ExtractorKeyOverride` name our classes,
giving the spec's cascade exactly. A concrete reader stays free to delegate to an existing CoreAction
internally rather than re-implementing PDF parsing — that keeps a third copy of `pdf-parse` out of the repo
without putting the action engine in the cascade's contract.

---

## 5. Package shape

✅ **DECIDED.** Mirrors `packages/RecordSetProcessor/{base,engine}`, the closest precedent.

| Package | Path | Holds |
|---|---|---|
| `@memberjunction/content-pipeline-base` | `packages/ContentPipeline/base` | `WorkingRecord`, `WorkingRecordField`, `FieldConfidence` convention, `IPipelineStage`, `BasePipelineStage`, `StageContext`, `StageOutcome`, `TransientStageError` / `FatalStageError`, the extension-space convention, and the queue-adapter spec in its README. Plain classes — no `BaseEntity`, since a working record may not be persisted. |
| `@memberjunction/content-pipeline` | `packages/ContentPipeline/engine` | `PipelineProcessor implements IRecordProcessor`, registry wiring, `WorkingRecordHydrator` / `WorkingRecordCommitter`, `PipelineRecordProcessRunner`, `PipelineProcessRunTracker`, the stages, `BaseContentReader` + built-in readers, `LoadContentPipeline()` tree-shake guard. |

Stages register as `@RegisterClass(BasePipelineStage, 'Discover')` — the same factory pattern RSP's
`'ML Model'` work type and the queue's `BaseWorkHandler` both use.

---

## 6. Build order

Milestones within the one PR. Each is independently reviewable and leaves the branch green.

| # | Phase | Work |
|---|---|---|
| **1** | F0 | Migration: `FieldConfidence` ×3, `ExtractionStatus`, `SegmentationStatus`, `ContentItem.DeleteStatus`, `ExtractorKey`, `ExtractorKeyOverride`, `ContentItem.Modality`, Access-driver ref, multi-modal flags, file-reference field, `WorkType` CHECK + `'Pipeline Stage'`, embedding-status value for F13 — **one migration, all of it**, so CodeGen runs once. Then the base package: `WorkingRecord`, hydrators/committers, stage contract. |
| **2** ✅ | F1 | DONE — proven end-to-end on a real DB (work type registers, Record Process row accepts `Pipeline Stage`, NoOp runs, commit lands).  — `content-pipeline` engine: `EntityFieldMap`, hydrator, committer, `PipelineProcessor` (18 tests). Remaining: registry wiring, `PipelineRecordProcessRunner`, `NoOpStage` against a real Record Process row. Stage registry; `PipelineProcessor`; `PipelineRecordProcessRunner` (the `BuildSource`/`BuildProcessor` workaround that makes tracker injection possible); `NoOpStage` proven against a real `Record Process` row. |
| **3** ✅ | F2 | DONE — one detail row, opened `Pending` on start, carrying live progress, finalized in place. `PipelineProcessRunTracker` — `OpenDetail` on start, update in place via `ReportProgress`, finalize on `RecordResult`. Constructed **only** by the runner, so the queue bridge swaps it at one site. |
| **4** ⬆️ | F3 | **NOT IN MJ — higher layer.** Access, credentials and role-based control are application-layer concerns; base MJ holds content data and assumes the caller is entitled to it. MJ keeps only an injectable fetcher on Extract so a higher layer supplies authenticated retrieval. ~~Access as a registered driver contract: `OpenSession`, role-based credential resolution, promise-cached handshake, eviction on failure/staleness, directly-callable entry point. Metadata: `ContentSourceTypeParam` rows per type. |
| **5** | F4 | `DiscoverStage` — progress, stop signal, child results. |
| **6** | F5 | `ExtractStage` + `BaseContentReader` cascade + plain-text fallback. |
| **7** | F6 | Test mode — chained in-memory stage list, commit skipped, run-budget dial (record cap + per-stage wall clock). |
| **8** | F7 | `TagStage` (via `ai-prompts` behind `IContentClassifier`) + `SegmentStage` (via `ai-segmentation`). |
| **9** | F8 | `EmbedStage` — per-record step, batched generation + upsert in `finalize`, via `ai-vectors` / `ai-vectordb`. |
| **10** | F9 | Multi-modal default/override cascade + durable copies inside Extract, keyed via `FieldPathResolver`. |
| **11** | F10 | Archive reader — multi-block split via `ParentID`, per-child detail rows. |
| **12** | F11 | Change detection (checksum), flat reset (`ContentPipelineResetService`), parent/child reconciliation by URL. |
| **13** | F12 | **Delete stage** — chunk purge as a callable stage operation, pending-delete skip in every stage, conditional commit. |
| **14** | F13 | Embed's metadata-only operation; vector-store provider update awaited, routed by namespace + index, batched. |

Out of scope, stated explicitly in the PR body: the RSP↔queue bridge (S/M track), per-record claiming,
`AutotagBaseEngine` retirement, `ai-knowledge-pipeline` retirement, and the PG migration counterpart.

---

## 7. Procedural rules this work is bound by

From the root `CLAUDE.md`, `CONTRIBUTING.md`, `migrations/CLAUDE.md`, `.claude/rules/changesets.md`.
Several are PR-blocking gates.

**Git** — never `git commit` without explicit per-commit approval, and never ask. Never `git checkout --`,
`git restore`, or `git reset --hard` without approval. Branch tracks its same-named remote (✅ verified).

**Build / test (Definition of Done)** — pnpm only (`corepack pnpm`), never `npm install`, install from the
repo root only. Changed a package → `cd packages/X && pnpm test`. Then `pnpm run test:integration` after
migrations + CodeGen. Report pass/fail/skip counts.

**Migration** — one file, `migrations/v6/V[YYYYMMDDHHMM]__v6.2.x__Content_Pipeline_Framework.sql`
(newest era is `v6.2.x`; the folder follows the version in the filename).
- DDL + `sp_addextendedproperty` only. No views, procs, `EntityField` rows, `EntityFieldValue` rows, or
  metadata inserts — CodeGen owns all of it.
- `'Pipeline Stage'` is a **CHECK-constraint change**, not a metadata insert: drop and re-add the constraint
  in this migration, then let CodeGen re-sync the value list and the generated union.
- Hardcoded UUIDs (`uuidgen | tr '[:lower:]' '[:upper:]'`), never `NEWID()`.
- Omit `__mj_CreatedAt` / `__mj_UpdatedAt` and FK indexes — CodeGen adds them.
- One grouped `ALTER TABLE` per table.
- Nullable-column CHECK constraints: no `OR col IS NULL` — it breaks CodeGen's parser.
- **No `migrations-pg/**` counterpart.** Build-engineer work at release time; say so in the PR body.
- Appended CodeGen output: ≥50 blank lines, then the standard generated-code banner; delete the standalone
  `CodeGen_Run_*.sql`. `EntityField` INSERTs must carry an **apply-time** `MAX(Sequence)+1` expression,
  never a literal — gate: `node .github/scripts/check-migration-entityfield-sequence.mjs`.

**CodeGen ordering** — these are *new* columns, so it is the four-step form:
```
mj migrate                        # 1. schema
mj codegen --skipfiles            # 2. DB only: creates EntityField rows, emits CodeGen_Run_*.sql
mj sync push --dir=metadata --ci  # 3. JSONType definitions land (FieldConfidence)
mj codegen --skipdb               # 4. files only: regenerate TS incl. typed accessors
```
Never a full `mj codegen` at step 2 — it regenerates `remote_operations.ts` from an unseeded DB and deletes
every remote-operation class, which then breaks `mj sync push` at import time. Revert the `sync` block
write-back into `metadata/**/*.json` before committing.

**Database** — one database per agent. We use a **fresh Docker container** at `next`'s level, not the
`.env` default (`MJ_6_1_0` on localhost), which is behind the `v6.2.x` migrations and may be in use.

**Changeset** — `minor` (we carry a migration and metadata). Write the file directly; never
`npx changeset add`. Verify with `npm run check:changeset`.

**Pre-push gates**
```
pnpm run check:standards  check:naming  check:esm  check:browser-manifest  check:codegen-tail
npm run check:changeset
node .github/scripts/check-migration-entityfield-sequence.mjs
```

**Style** — no `any`, no `.Get()`/`.Set()` in place of generated properties, PascalCase public /
camelCase private, ~30–40 line functions, `BaseSingleton` for singletons, no cross-package re-exports.
Data access via `RunView`/`RunViews`/engines — never hand-rolled SQL or GraphQL.

---

## 8. Next step

Launch the Docker SQL Server container at `next`'s migration level, confirm it is exclusively ours, then
begin milestone 1 with the F0 migration.
