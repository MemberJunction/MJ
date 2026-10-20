# Feature Pipelines — Build Plan

**Status:** For approval (precedes any code)
**Date:** 2026-09-20
**Supersedes:** the 2026-09-20 draft build plan (§0 records every correction and decision taken since)
**Companions:** [`predictive-studio.md`](predictive-studio.md) (§5.4 / SP6) · [`record-set-processing-and-record-processes.md`](record-set-processing-and-record-processes.md) (the substrate) · [`embedded-records.md`](embedded-records.md) (the mechanism P1-8b uses) · [`guides/RECORD_SET_PROCESSING_GUIDE.md`](../guides/RECORD_SET_PROCESSING_GUIDE.md) · [`guides/PREDICTIVE_STUDIO_GUIDE.md`](../guides/PREDICTIVE_STUDIO_GUIDE.md)

---

## How to use this document

Every "current state" claim below was verified by reading source at `origin/next` on 2026-09-20 and carries an exact path. Work items keep the P-item IDs from the draft (`P1-1` … `P3-3`) so cross-references survive; items added since carry a letter suffix (`P1-8b`).

**Re-verify the current-state claims for the files you are about to touch before starting an item.** This plan is a point-in-time snapshot and MJ moves fast.

---

## 0. What changed from the 2026-09-20 draft

### 0.1 Corrections — things the draft asserted that the source contradicts

| # | The draft said | The source says |
|---|---|---|
| C1 | The CRM sentiment case "is already expressible today" via nested Entity Documents. | **Nested rendering has never worked.** `EntityDocumentTemplateParser.ts:70` passes `doc.Template` into the child parse, and on `MJ: Entity Documents` that field is the template's **name** (`nvarchar(255)`, display name "Template Name"), not its text. Every nested render has been parsing a template name as a template. P1-8 fixes it. |
| C2 | Dedup has no substrate; use prior Process Runs. | **A watermark substrate already exists and is 100% unimplemented.** `RecordProcess.SkipUnchanged` + `WatermarkStrategy` (`Checksum`/`UpdatedAt`/`None`) are shipped columns; `__mj.RecordProcessWatermark` is a shipped table (`ID`, `RecordProcessID`, `EntityID`, `RecordID`, `Hash`, `LastProcessedAt`, UNIQUE on the triple). `grep -i watermark packages/RecordSetProcessor` returns **nothing**. The flag is stored and ignored. |
| C3 | Write-back's composite-key restriction is a limitation to lift or surface in UI. | **The restriction is already obsolete.** `writeBack.ts:77` throws on composite keys, but the loader three lines below it (`CompositeKey.FromURLSegment`) handles them correctly, and a test already asserts composite-key child behavior (`facade.test.ts:233`). Delete the throw, add a test. |
| C4 | There is one Feature Pipeline engine, in the wrong package. | **There are two, and they duplicate each other.** `PredictiveStudio/Engine/src/feature-pipelines/feature-pipeline-engine.ts` (341 lines) and `Angular/Explorer/dashboards/src/KnowledgeHub/components/feature-pipelines/feature-pipeline.engine.ts` (259 lines) both implement `BuildSummaries` / `deriveOutputAttribute`. |
| C5 | Pin the prompt version (D8). | **No version concept exists.** Neither `MJ: AI Prompts` nor `MJ: Template Contents` carries a version field, and there is no prompt-version entity. The term has to be defined before it can be pinned (D13). |
| C6 | `LLMDerivedFeatureStep` just needs a `FeaturePipelineRef`. | **The ref is overloaded.** `feature-assembly-executor.ts:525-535` treats `FeaturePipelineRef` as *both* the pipeline reference *and* the persisted column name "by convention". One pipeline emitting two outputs breaks it. |
| C7 | P2-1 pulls a contact's prior activities through `Relationship()`. | **Not reachable that way.** In bizapps-common, `Activity` links to a person through `ActivityLink` — a polymorphic `EntityID`/`RecordID` junction with a `Role` CHECK, deliberately not an FK. A relationship walk cannot express it; an approved Query can. |
| C8 | P2-2 writes normalized job function to a Person column. | **`People.CurrentJobTitle` is a view column**, derived from the employment `Relationship.Title` (`V202608132240__v5.34.x__Layered_Base_Views_People_Organizations.sql:79`). It is readable as a cache key, never writable. The write target needs designing — see D24. |
| C9 | P1-5 is a builder refresh. | **It is a build.** The `mj-record-process-editor` work-type `<select>` has exactly one `<option>` (`FieldRules`), and the Explorer form is a 24-line subclass that wraps it. There is no prompt, input-mapping, or output-mapping surface anywhere. |
| C10 | Predictive Studio's scoring path deliberately excludes `childRecord` (P3-3 to review). | Correct as stated, and the exclusion is sound: `MLInferenceResultPayload` is a flat score/class with nothing to fan out. P3-3 stays a documentation item, not a change. |

Two draft claims **verified as correct** and kept: child-record write-back exists and is tested (the draft's own correction to an earlier finding stands), and `MJ: AI Result Cache` is inert — `CheckResultCache` exists at `BaseAIEngine.ts:2515` and `AIPromptRunner` never calls it (`prompt-runner-todo.md` lists the whole caching block as unimplemented).

### 0.2 Decisions taken since the draft

Recorded as D13–D25 in §3. In brief: prompt version is a content hash; nested renders get a reserved `__Parent` context chain; Entity Documents lose their vector-only NOT NULLs and gain an embedded Template; one server-only engine with remote-op access; RSU deferred in favour of existing-columns-only; the editor is generalized per work type; three output modes (field / child row / tags); a generic history table with a `Reasoning` column; an explicit, clearable cache table; the Integration content-hash generalized onto `BaseEntity` and the Record Process watermark implemented on it; typed in-row writes derived from field metadata; and a real people model in bizapps-common.

### 0.3 Verification debt from the draft — now closed

| Draft item | Resolution |
|---|---|
| Contents of the `"Feature Pipeline"` category seed | `metadata/record-process-categories/.record-process-categories.json`, ID `DF605624-5E5F-4508-A691-9E573FF3F3C3`. Its description already frames Feature Pipelines as the generalization of Content Autotagging. |
| Whether `Configuration` is occupied for `Infer` | It is not. `FieldRules` stores a `FieldRuleSet` there and `ML Model` stores `{modelId, primaryKeyField}`; the column's own extended property says "used by work types that need structured config beyond Input/Output mappings". `Infer` writes nothing. **`DataFeatureSpec` lands here** (D-spec). |
| RSU API surface | `@memberjunction/schema-engine` → `RuntimeSchemaManager.RunPipeline(RSUPipelineInput{MigrationSQL, Description, AffectedTables, …})` and `.Preview(...)` → `RSUPreviewResult{MigrationSQL, ValidationErrors, WouldExecute}`. Recorded for the later phase; **not used in this build** (D17). |

### 0.4 Adjacent work in flight

MJ **#4166** (`feat/ps-sequence-problem-type`, draft, MS-BC) stacks on **#4104** (typed ML component model, open). Between them they edit four files this plan touches: `Core/src/feature-steps.ts`, `Core/src/modeling-plan-spec.ts`, `Core/src/modeling-plan-schema.ts`, `Engine/src/agent/modeling-plan-to-pipeline.ts`. **Neither PR is superseded by this work and neither should be closed for it** — the overlap is four files, not a capability. A heads-up comment is posted at #4166 ([comment](https://github.com/MemberJunction/MJ/pull/4166#issuecomment-5751886846)). Whichever lands first, the other rebases; Part 3 is sequenced last partly for this reason.

Downstream, **eight sibling PRs opened 2026-09-19** (bizapps-tasks #70, orders #223, accounting #164, contracts #59, issues #44, fpna #15, sales #111, more-cheese #62) ship prebuilt Predictive Studio pipelines. They are this plan's best evidence and its first consumers:

- Each adds three materialized columns (probability `DECIMAL(5,4)`, risk band `NVARCHAR(20)` + CHECK, scored-at `DATETIMEOFFSET`) with extended properties and an appended CodeGen tail. **That migration is the shape P1-4 validates against** — the developer writes it; the pipeline populates it.
- Each derives the risk band in a server pre-save hook with **per-app hardcoded thresholds** (tasks: .30/.70/.90; orders: .10/.25/.50). A banding output mode could express these declaratively later; out of scope here, noted so it is not re-derived.
- **Not one of the eight uses `llm-derived` or a Feature Pipeline**, including on entities with free text. G1 and G3 are confirmed in production code, not just in theory.
- All seven scoring Record Processes set `SkipUnchanged: true`, which does nothing today (C2). **P1-7 makes that flag real.**

---

## 1. The thesis (unchanged)

LLMs do one thing classical ML cannot: collapse a high-cardinality free-text column into a low-cardinality, semantically meaningful code. Hundreds of thousands of job-title strings become a handful of function codes and seniority levels. A call transcript becomes a sentiment score and a tag set.

That is valuable twice over, and this plan treats both as first-class:

1. **As business data.** Normalized job function drives segmentation, reporting and routing whether or not a model is ever trained. Consistent unhappiness across a contact's calls is actionable today.
2. **As model features.** These derived columns are frequently the highest-signal features available, precisely because the raw text was unusable.

Because (1) is strictly broader than (2), **Feature Pipelines live in Knowledge Hub** and Predictive Studio becomes a consumer.

**Name kept:** *Feature Pipeline*. It is already in the metadata seed, both engines, the UI, and the remote-operation key. The new specification object is the **`DataFeatureSpec`** — named to signal *data* feature, not exclusively *model* feature.

---

## 2. Current state (verified 2026-09-20 @ `origin/next`)

### 2.1 A Feature Pipeline is a categorized Record Process

No dedicated entity, no table — a good decision worth preserving. A Feature Pipeline **is** an `MJ: Record Processes` row whose `WorkType` is `Infer` / `Action` / `Agent`, categorized into the seeded `"Feature Pipeline"` category, with an `OutputMapping` defining write-back. It therefore inherits the whole Record Set Processing substrate: concurrency, rate limiting, circuit breaker, pause/resume, dry-run, and audit via `MJ: Process Runs` / `MJ: Process Run Details`.

| Concern | Path |
|---|---|
| Server discovery/monitoring cache | `packages/AI/PredictiveStudio/Engine/src/feature-pipelines/feature-pipeline-engine.ts` (341) |
| **Duplicate** client cache | `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/feature-pipelines/feature-pipeline.engine.ts` (259) |
| Run entry point | `PredictiveStudio.RunFeaturePipeline` (LongRunning, scope `predictive:execute`) → `RecordProcessExecutor.RunByID` |
| Executor + processor build | `packages/RecordSetProcessor/engine/src/RecordProcessExecutor.ts` |
| Write-back | `packages/RecordSetProcessor/engine/src/writeBack.ts` (131) |
| Infer work | `packages/RecordSetProcessor/engine/src/processors/InferProcessor.ts` (72) |
| UI | `packages/Angular/Explorer/dashboards/src/KnowledgeHub/components/feature-pipelines/` (994 across 5 files) |
| Editor (FieldRules-only) | `packages/Angular/Generic/record-process-studio/src/lib/record-process-editor/` (264) |

### 2.2 The extensibility seams that already exist

- **`RecordProcessorRegistry`** (`base/src/registry.ts`) — an open, `BaseSingleton`-backed registry letting external packages register **new work types**. `buildProcessor()` handles the built-ins then consults it. Predictive Studio's `'ML Model'` scoring registers through it. Proven.
- **`IRecordProcessor`** (`base/src/interfaces.ts:68`) — one method, `ProcessRecord(record, context)`.

**What does not exist:** any way to hook into the *existing* `Infer` lifecycle to customize one stage. That is P1-6.

### 2.3 Write-back today

`OutputMappingConfig` supports `fields` (map of entity field → result ref) and a single `childRecord` (`entity`, `parentField`, `map`). Refs resolve through `resolveMappingRef(ref, { $: result, record: record.Record })` — so **parent values are already reachable in a child map** via `record.X`. Full dry-run support returns `previewFields` / `previewChild` without saving. Tested at `facade.test.ts:216,233,262`.

Real limitations: one child row per record (no array fan-out); an obsolete composite-key throw (C3); **no provenance** — nothing stamps prompt, run, or model, and neither `$` nor `record` exposes them; **no authoring surface at all** (zero non-test references to `childRecord` outside the engine); and it is excluded from the PS scoring path by design (`score-record-set.runner.ts:58`).

### 2.4 The discipline is already encoded

`PredictiveStudio/Core/src/feature-steps.ts:115` — `LLMDerivedFeatureStep` documents that LLM-synthesized features are **persisted and version-pinned, never recomputed inline, to avoid train/serve skew (§6.5)**. `VisionLLMOutput.AllowedCategories` already does closed-set coercion for the vision step. `FeatureKind = 'numeric' | 'categorical' | 'embedding' | 'llm-derived'`.

### 2.5 Entity Documents — the right context machinery, mis-wired

`MJ: Entity Documents` + `MJ: Templates` render a record to text. Two-pass: Nunjucks `{{ }}` via `TemplateEngineServer.RenderTemplateSimple`, then `${ }` placeholders resolved by regex where a function match dispatches to a parser method — including `Relationship(name, maxRows, entityDocumentName)`, which loads related rows and recursively renders a *different* entity document over each.

Three problems: **the nested render is broken** (C1); the parser lives in `@memberjunction/ai-vector-sync`, whose dependency tree (vector DBs, Pinecone, credentials, `mssql`) the substrate must not inherit; and the child render receives only the child row — **no parent context**, so a child template cannot say "relative to this person's baseline".

The table also forces vector-only columns: `VectorDatabaseID`, `AIModelID`, `TemplateID`, `TypeID` are all `NOT NULL`. A context-only document must name a vector DB and embedding model it never uses.

`FieldRulesProcessor.buildEntityDocumentResolver` (`:138-155`) already loads and renders an Entity Document *inside the Record Set Processor engine* — Nunjucks pass only, no `${}`, no `Relationship()`. It is the proof the wiring is cheap and the evidence that the heavyweight parser is what is missing.

### 2.6 Prior art worth reusing rather than reinventing

| Capability | Where it already exists |
|---|---|
| Deterministic content hash + canonical sorted-key JSON | `packages/Integration/engine/src/ContentHash.ts` — `computeContentHash`, SHA-256 over canonicalized mapped fields, identity-keyed not position-keyed |
| Sync cursor watermarks (a **different** thing) | `packages/Integration/engine/src/WatermarkService.ts` — Timestamp/Cursor/ChangeToken/Version per entity map |
| Checksum-skip over rendered text | `ContentAutotagging` — `getChecksumFromText` → skip when `existing.Checksum === checksum` (`AutotagEntity.ts:687`) |
| Closed-vocabulary tag resolution | `TagEngine.ResolveTag(text, weight, mode, rootID, threshold)` with `constrained` / `auto-grow` / `free-flow` / `hybrid`, plus `TaxonomyContext` prompt injection |
| Structured-output validation + retry | `AIPromptRunner` — `OutputType`, `OutputExample` schema validation, `ValidationBehavior: None/Warn/Strict`, retries, and full validation telemetry on `MJ: AI Prompt Runs` |
| Type coercion to a field's TS type | `EntityFieldRules.coerceToType` (`MJCore/src/generic/EntityFieldRules.ts:188`) |
| Lookup-to-related-row resolution | `FieldRuleLookup { Entity, MatchField, MatchValue, ReturnField, Default }` |
| Reading a cached value set without a query | `BaseEngineRegistry.Instance.TryGetCachedRecords<T>(name, { unfilteredOnly: true })` |
| Isomorphic SHA-256 in a browser package | `React/runtime/src/registry/component-registry-service.ts:202-216` — `crypto.subtle` with an availability guard |

---

## 3. Decisions

Carried from the draft, unchanged:

| # | Decision |
|---|---|
| D1 | Keep the name **Feature Pipeline**. |
| D2 | **Knowledge Hub owns it; Predictive Studio consumes it.** |
| D3 | The spec object is **`DataFeatureSpec`**. |
| D4 | **Do not use the Nunjucks `AIPrompt` template extension.** It exists (`Templates/engine/src/extensions/AIPrompt.extension.ts`) but calling an LLM from inside a template diverges from MJ's prompting model. Entity Documents build **context only**; prompting is composed outside. |
| D6 | Closed value sets are **declared in the spec and enforced at runtime**. |
| D7 | Cacheability and TTL are **per-feature, declared in the spec**. |
| D8 | The dedup cache key **must include the prompt version** (see D13 for what that means). |
| D9 | Extensibility extends **`IRecordProcessor`** and the existing registry — no parallel extension point. |
| D10 | Agent-proposed pipelines require **explicit user review and approval**. |
| D11 | Prompts are **visible and editable by the user** in the Feature Pipeline UI. |
| D12 | `Relationship()` N+1 batching is **out of scope**, deferred. |

Superseded: **D5** (the draft's "support both RSU and migration-based materialization") is replaced by **D17**.

New:

| # | Decision | Why |
|---|---|---|
| **D13** | **Prompt version = a content hash** over the rendered template text, `OutputExample`, `OutputType`, and the injected constraint block. Computed at run start, stamped on the run and on every history/cache row. | No version field exists (C5). A hash is honest, needs no schema on `AI Prompts`, and makes drift visible: edit the prompt and the hash moves, invalidating cache and re-requesting work. Not worth more machinery than this. |
| **D14** | Nested Entity Document renders receive the parent's data context as a reserved **`__Parent`** property, chainable (`__Parent.__Parent`). | Sentiment is relative to the individual; a child template must be able to reach its parent. `__`-prefixed names follow the `__mj_` reserved convention so they cannot collide with a real column. |
| **D15** | `MJ: Entity Documents`: **`VectorDatabaseID` and `AIModelID` become nullable** (validated at vectorization time, not at insert); **`TypeID` stays required** (it is categorization); **`TemplateID` becomes an embedded record**. | A context-only document should not have to name a vector DB it never uses. The embedded record (shipped in 6.1, `EntityField.EmbeddedRecord`) retires the hand-written virtual-`TemplateText` hack in `MJEntityDocumentEntityExtended`. |
| **D16** | **One server-only engine.** The browser reads prior-run state directly from `MJ: Record Processes` / `MJ: Process Runs` / `MJ: Process Run Details` (already browser-safe), and invokes work through remote operations. | Kills the duplicate (C4) without shipping server dependencies to the browser. Five `RecordProcess.*` and eight `PredictiveStudio.*` ops already exist; this adds one. |
| **D17** | **RSU deferred.** First cut assumes a developer wrote and tested a real migration; the pipeline only populates fields that already exist. Validate targets exist, are base-table (non-virtual) fields, and are type-compatible — fail before any LLM call otherwise. | Matches how the eight downstream PRs already work. Migration generation and RSU become a later phase with a proven column contract behind them. |
| **D18** | The Record Process editor is **generalized per work type** in `Angular/Generic`, FieldRules becoming one panel and Infer a new one. Generic raises events only; Explorer owns navigation. | C9 — there is no Infer surface at all. Generic/Explorer layering is the house rule (`packages/Angular/Generic/CLAUDE.md`). |
| **D19** | A feature output targets one of **three modes**: a **field** on the source row, a **related child row**, or a **tag** via the MJ Tagging system with per-output root/depth/growth controls. | Tags are a first-class output, not an enum plus child rows. The `OutputMapping` column's own description already promises "to fields, a child record, **or tags**". |
| **D20** | A **generic history table** in core records every computed value with full provenance, including a nullable **`Reasoning`** column populated from a well-known `Reasoning` property in the prompt's structured output. App columns hold **latest value only**. | Complete audit of how and why a value was computed, the MJ way (Record Changes is the precedent). `Reasoning` maps by convention so it works regardless of who authored the prompt. |
| **D21** | Dedup lives in an **explicit, clearable cache table**, not folded into history. | Prompt Runs get archived; the cache must own its payload. An explicit table is also readable business data — a job-title dictionary any app can join. |
| **D22** | Extract the Integration **content-hash** into a shared, browser-safe canonicalizer + an async `BaseEntity.ComputeContentHash`, and implement the Record Process **watermark** on it. | C2. One algorithm serving Integration, feature pipelines, and anything else. SHA-256 over the same canonical string is identical from `node:crypto` and Web Crypto, so Integration's sync path and BaseEntity's async path agree byte for byte. |
| **D23** | **Typed in-row writes derive from field metadata**, not from the spec. Numeric/date/boolean coerce; a value-listed string takes its enum from `EntityFieldValues`; a foreign key takes its allowed values from `RelatedEntityID` — served from `BaseEngineRegistry.TryGetCachedRecords` when an engine already holds the type table. The spec only narrows or adds policy. | Everything needed is on `EntityFieldInfo` (`TSType`, `ValueListType`, `EntityFieldValues`, `RelatedEntityID`, `IsVirtual`, `AllowsNull`). Declaring it twice is how the two copies drift. |
| **D24** | bizapps-common gains a real people model: **`JobFunction`** and **`SeniorityLevel`** type tables, a **`PersonJobFunction`** 1:M with `Sequence`, `Person.SeniorityLevelID`, **`Relationship.JobFunctionID` + `Relationship.SeniorityLevelID`** (a person's function differs per company link), and **`Person.PrimaryJobFunction*` as virtual view columns** off the lowest-`Sequence` row. | Mirrors how `CurrentJobTitle` is already derived (C8) — no physical column that can drift from the list it summarizes. |
| **D25** | **#4166 is not closed.** A heads-up comment names the overlap; whoever lands second rebases. | The overlap is four files, not a capability (§0.4). |

### Explicit non-goals

Reviving `MJ: AI Result Cache` · vector-similarity cache matching (`CacheMatchType = Vector`) · batch-optimizing `Relationship()` loading · RSU / migration generation in this cut · inventing a fourth AI confidence scale (see §9) · letting an LLM improvise the training run — the `ModelingPlanSpec` → `modeling-plan-to-pipeline.ts` → `ExperimentOrchestrator` seam stays deterministic TypeScript. P3-1 makes that seam **loud and complete**, never *smart*.

---

## 4. `DataFeatureSpec` — the artifact

Persisted as JSON in `MJ: Record Processes.Configuration` (§0.3 confirms it is free for `Infer`). It is what an agent emits, what a user edits, and what the engine executes — the role `AgentSpec` plays for agents and `ModelingPlanSpec` for modeling.

```ts
export interface DataFeatureSpec {
  Name: string;
  Description: string;

  /** How prompt context is built for each row. Exactly one Source is required. */
  Context: {
    /** Render an Entity Document (supports ${Relationship(...)} and __Parent chaining). */
    EntityDocumentID?: string;
    /** Run an APPROVED MJ: Query, parameterized from the row. The reach a relationship walk cannot give. */
    QueryID?: string;
    /** Parameter name -> row-field ref, for QueryID. */
    QueryParams?: Record<string, string>;
    /** Simplest form: project these fields. Default when nothing else is set. */
    Fields?: string[];
    /** Optional value remap layered on whatever the above produced. */
    InputMapping?: Record<string, string>;
  };

  /** The prompt. User-visible and user-editable (D11). */
  PromptID: string;

  /** One or more outputs produced per row. */
  Outputs: DataFeatureOutput[];

  /**
   * Reuse policy (D7). KeyFields name the row fields whose values form the dedup
   * key; omit for whole-rendered-context keying. Scope defaults to this pipeline
   * so a shared dictionary is opt-in and readable.
   */
  Caching: {
    Cacheable: boolean;
    KeyFields?: string[];
    TTLSeconds?: number;
    Scope?: 'pipeline' | 'prompt';
  };

  /** Skip rows whose watermark says nothing they depend on has changed (P1-7). */
  Watermark?: { Enabled: boolean; Strategy: 'Checksum' | 'UpdatedAt' | 'None' };

  /** Capture the model's rationale into the history row's Reasoning column (D20). */
  CaptureReasoning?: boolean;

  /** Optional subclass hook registration (P1-6). */
  ProcessorExtensionKey?: string;
}

export interface DataFeatureOutput {
  /** Result path, e.g. "$.seniority". */
  Ref: string;
  /** Stable name — the history row's FeatureName and the model-feature column name. */
  Name: string;
  /** Narrowing/policy ON TOP of what field metadata already implies (D23). */
  Constraint?: ValueConstraint;
  /** Where this output lands (D19). */
  Target: OutputTarget;
  /** How Predictive Studio should treat it when consumed as a model feature. */
  FeatureKind?: 'numeric' | 'categorical' | 'embedding' | 'llm-derived';
}
```

### 4.1 The three output modes (D19)

```ts
export type OutputTarget =
  /**
   * MODE 1 — a field on the processed row. Write semantics are DERIVED from the
   * field's metadata (D23): TSType coercion for numeric/date/boolean, the CHECK
   * value list for an enum, and for a foreign key the allowed set comes from
   * RelatedEntityID — resolved by matching MatchField and writing the related row's
   * ID. The spec never restates what metadata already knows.
   */
  | { Mode: 'field';
      EntityFieldName: string;
      /** FK only: which column of the related entity the model's answer matches. Default 'Name'. */
      LookupMatchField?: string;
      /** FK only: what to do when no related row matches. Default 'null'. */
      OnLookupMiss?: 'null' | 'fail' | 'create'; }

  /**
   * MODE 2 — a related child row. FanOutRef promotes an array result to N rows
   * (one per element). Values resolve from $ (result), record (parent row) and
   * $run (provenance) alike.
   */
  | { Mode: 'child';
      EntityName: string;
      ParentField: string;
      Map: Record<string, string>;
      FanOutRef?: string; }

  /**
   * MODE 3 — a tag, through the MJ Tagging system. The pipeline states WHERE in the
   * taxonomy this feature is allowed to live and how far it may grow, so one entity
   * can constrain different features to different subtrees.
   */
  | { Mode: 'tags';
      /** Root tag this feature's values must live under. Required — an unrooted feature pollutes the taxonomy. */
      RootTagID: string;
      /** How deep below the root a value may be placed/created. 1 = direct children only. */
      MaxDepth?: number;
      /** Maps to TagEngine's TaxonomyMode. Default 'constrained'. */
      Growth?: 'constrained' | 'auto-grow' | 'hybrid';
      /** Minimum semantic-match score to accept an existing tag. */
      MatchThreshold?: number;
      /** Entity the TaggedItem points at. Default: the processed entity. */
      TaggedEntityName?: string; };
```

**Why tags are their own mode and not an enum written to child rows.** The taxonomy is shared, hierarchical, semantically searchable, and already governed: `TagEngine.ResolveTag` does exact → fuzzy → semantic matching and honours `constrained` / `auto-grow` / `hybrid`, ContentAutotagging already injects `TaxonomyContext` into its prompt so the model sees existing tags, and `TaggedItem` is the established link. A pipeline that re-implements any of that in child rows gets a second, worse taxonomy. The per-pipeline root/depth/growth controls are what makes it safe: "activity sentiment tags live under *Sentiment*, may not grow, and must score ≥ 0.8" is a different policy from "topic tags live under *Topics* and may auto-grow one level", on the same entity.

### 4.2 Constraints

```ts
export type ValueConstraint =
  | { Type: 'enum'; Values?: string[]; FromFieldMetadata?: boolean; OnViolation: ViolationPolicy }
  | { Type: 'lookup'; Entity?: string; MatchField?: string; OnViolation: ViolationPolicy }
  | { Type: 'numeric'; Min?: number; Max?: number; Integer?: boolean; OnViolation: ViolationPolicy }
  | { Type: 'money'; Min?: number; Max?: number; CurrencyCode?: string; OnViolation: ViolationPolicy }
  | { Type: 'date'; Min?: string; Max?: string; OnViolation: ViolationPolicy }
  | { Type: 'boolean'; OnViolation: ViolationPolicy }
  | { Type: 'freetext'; MaxLength?: number };

export type ViolationPolicy = 'fail' | 'null' | 'coerce-to-other';
```

`FromFieldMetadata: true` (the default for a `field` target) means "the allowed set is whatever the column's CHECK constraint or related entity says" — one source of truth, and the prompt's injected list can never drift from what the database will accept.

### 4.3 Three enforcement layers, in order

1. **Prevention** — the allowed set is rendered into the prompt, and `MJ: AI Prompts` already carries `OutputExample` + `OutputType` + `ValidationBehavior: Strict` with retries. A well-configured pipeline mostly never reaches layer 2.
2. **Validation** — every output is checked against its resolved constraint after the call, and `OnViolation` applies: `fail` marks the record `Failed` with a precise message; `null` writes null and counts a violation; `coerce-to-other` writes a reserved `"Other"` sentinel (enum only).
3. **The database** — the CHECK constraint or FK the developer's migration already created. If layers 1 and 2 are right, layer 3 never fires; when it does, that is a bug worth the loud failure.

Violation counts land on the run so drift is visible in history, and a run with zero violations is marked clean in the UI.

---

## 5. Schema — five core tables/changes, one migration

One MJ core migration (`migrations/v6/V<ts>__v6.2.x__Feature_Pipelines.sql`) plus its CodeGen tail.

### 5.1 `MJ: Feature Values` — the history table (D20)

Every value ever computed, with provenance. The app's own column holds only the latest.

| Column | Notes |
|---|---|
| `ID` | |
| `RecordProcessID` | FK → `RecordProcess`. The pipeline that produced it. |
| `EntityID` / `RecordID` | The row the value is about. `RecordID` is the serialized composite key, matching `ProcessRunDetail`. |
| `FeatureName` | From `DataFeatureOutput.Name`. |
| `ValueText` / `ValueNumeric` / `ValueDate` / `ValueBoolean` | Typed columns so history is queryable without parsing JSON; one is populated per row. |
| `ValueJSON` | The raw output fragment, for array/object outputs. |
| `Reasoning` | **Nullable.** Populated from the well-known `Reasoning` property (D20). |
| `Confidence` | **Nullable.** See §9 — the scale is deliberately not defined here. |
| `PromptID` / `PromptVersionHash` | D13. |
| `ConstraintHash` | So a changed closed set is a changed lineage. |
| `ProcessRunID` / `ProcessRunDetailID` | Back-links into the run audit. |
| `AIPromptRunID` | Soft reference — Prompt Runs get archived (D21). |
| `FeatureValueCacheID` | **Nullable.** Set when this row was served from cache; lineage survives archival. |
| `ComputedAt` | |

Indexed on `(EntityID, RecordID, FeatureName, ComputedAt DESC)` for "history of this feature on this row" and on `(RecordProcessID, ComputedAt DESC)` for run rollups.

### 5.2 `MJ: Feature Value Cache` — the dedup dictionary (D21)

One row per distinct input key per scope. Clearable wholesale without touching history.

| Column | Notes |
|---|---|
| `ID` | |
| `RecordProcessID` | **Nullable** — null when `Caching.Scope = 'prompt'` (shared across pipelines sharing a prompt). |
| `PromptID` / `PromptVersionHash` / `ConstraintHash` | The identity of the computation. |
| `KeyHash` | SHA-256 over the canonicalized key values. The lookup column. |
| `KeyDisplay` | **Plain text**, e.g. `Senior Director, Field Marketing`. What makes this a joinable dictionary rather than an opaque blob. |
| `KeyJSON` | The full key field/value set. |
| `OutputsJSON` | The computed outputs — **the cache's own copy**, so archiving Prompt Runs loses nothing. |
| `Reasoning` | Nullable, same convention. |
| `AIPromptRunID` | Soft reference to the run that first computed it. |
| `HitCount` / `LastHitAt` / `ComputedAt` / `ExpiresAt` | `ExpiresAt` null = no expiry. |

UNIQUE on `(RecordProcessID, PromptID, PromptVersionHash, ConstraintHash, KeyHash)`, with `RecordProcessID` null-able in the unique via a filtered index per dialect.

> **Why this earns its own table.** Six thousand rows mapping title text → function + seniority is *reference data*. An app can join it, a report can read it, a new Person created on-change resolves against it for zero LLM cost, and an operator can clear it after a taxonomy change without destroying the audit trail. Folding it into history would have made all four awkward.

### 5.3 `MJ: Record Process Watermarks` — no schema change, finally implemented (D22)

The table already exists with exactly the right shape (`RecordProcessID`, `EntityID`, `RecordID`, `Hash`, `LastProcessedAt`, UNIQUE on the triple). P1-7 writes the engine half.

**The basis is what matters.** For a feature pipeline the hash covers **the rendered context + prompt version hash + constraint hash**, never the row's `__mj_UpdatedAt`. An order's prior-orders count changes when *other* orders arrive; an updated-at watermark would serve a stale score with total confidence. `WatermarkStrategy: 'UpdatedAt'` stays available for pipelines whose context is genuinely just the row, and the UI says plainly which one a pipeline is using and why.

### 5.4 `MJ: Entity Documents` — loosened (D15)

`VectorDatabaseID` and `AIModelID` → `NULL`able. `TypeID` stays `NOT NULL`; seed a new **`Context`** row in `MJ: Entity Document Types` alongside `Search` and `Record Duplicate`. `TemplateID` gains an `EmbeddedRecord` declaration on its `EntityField` row.

Vectorization paths must now **validate** rather than assume: `EntityVectorSyncer` and the Dupe detector fail with a clear message when a document selected for vectorization has no vector DB or model. That is a strictly better error than the current "NOT NULL means it's always there".

### 5.5 `MJ: Record Processes` — no schema change

`DataFeatureSpec` goes in `Configuration`. `SkipUnchanged` and `WatermarkStrategy` finally do something.

---

## 6. Packages

Three new packages, all at `6.1.0` to match the workspace.

| Package | Path | Tier | Holds |
|---|---|---|---|
| `@memberjunction/entity-documents` | `packages/AI/EntityDocuments` | server | The Entity Document template parser lifted out of `ai-vector-sync` — `EntityDocumentTemplateParserBase`, `EntityDocumentTemplateParser`, `EntityDocumentCache`. Depends on `core`, `core-entities`, `global`, `templates`. **Nothing vector.** |
| `@memberjunction/feature-pipelines` | `packages/AI/Knowledge/FeaturePipelines` | server | `DataFeatureSpec` + types, the single engine, constraint validation, the cache + watermark services, the preview remote operation. |
| `@memberjunction/ng-feature-pipelines` | `packages/Angular/Generic/feature-pipelines` | client | The builder, prompt editor, context preview, dry-run panel, run monitor. **Events only** — no Router, no Explorer imports (`packages/Angular/Generic/CLAUDE.md`). |

**Dependency direction.** `templates` → `entity-documents` → { `ai-vector-sync`, `record-set-processor`, `feature-pipelines` }. Entity Documents are a layer *downstream* of generic Nunjucks rendering and *upstream* of both vectorization and feature pipelines, so no cycle exists and `record-set-processor` gains a light dependency instead of the vector stack.

`ai-vector-sync` re-points its imports at the new package. Per the no-re-export rule its consumers (`ContentAutotagging`, `Vectors/Dupe`) import `EntityDocumentTemplateParser` **from `@memberjunction/entity-documents` directly**, not through `ai-vector-sync`.

Explorer's Knowledge Hub resource component becomes a thin host over the Generic components, owning navigation and agent-tool registration; its 259-line duplicate engine is deleted (D16).

---

## 7. Phasing & PR boundaries

| PR | Contents | DB? | Gate |
|---|---|---|---|
| **FP-0** | P3-1 step 1 in isolation — stop dropping `llm-derived` silently. | no | ship first, independently useful |
| **FP-1** | P1-1 spec types · P1-2 constraints · P1-3 write-back (expose, `$run`, fan-out, composite fix) · the core migration (§5) + CodeGen | **yes** | migration + CodeGen tail, changeset ≥ minor |
| **FP-2** | P1-8 entity-document package extraction + `__Parent` + `InferProcessor` wiring · P1-8b Entity Document loosening | **yes** (5.4) | vectorization validation must not regress |
| **FP-3** | P1-7 generic content hash + watermark + dedup cache · P1-4 materialization validation | no | benchmarked: distinct-key count, not row count |
| **FP-4** | P1-5 builder (Generic + Explorer host) · P1-6 lifecycle hooks | no | a pipeline authorable end to end without JSON |
| **FP-5** | P1-9 engine relocation + duplicate deletion | no | pure refactor, zero behavior change |
| **FP-6** | P2-2 job titles (bizapps-common D24 model + pipeline) | **yes** (common) | separate repo, own PR |
| **FP-7** | P2-1 activity sentiment + tags | **yes** (common) | separate repo |
| **FP-8** | P3-1 steps 2–3 · P3-2 agent guidance · P3-3 review note | no | rebased onto whatever of #4104/#4166 landed |

**FP-0 and the FP-1 write-back half are the ship-early candidates** — a warning is a few lines and removes an active source of confusion, and child write-back is already built and tested.

---

# Part 1 — Knowledge Hub Feature Pipelines

Goal: make Feature Pipelines a robust, general, beautiful, agent-buildable capability.

## P1-1 — Define `DataFeatureSpec`

**Intent.** A typed, persisted artifact describing one derived feature end to end.

**Files.** New: `packages/AI/Knowledge/FeaturePipelines/src/spec/data-feature-spec.ts`, `value-constraint.ts`, `output-target.ts`. The spec is pure types + pure validators — no entity or provider dependency — so it unit-tests with zero setup, the same property `modeling-plan-to-pipeline.ts` has.

**Work.**
1. The interfaces in §4, exactly.
2. `validateSpec(spec, entityInfo, fieldResolver)` — a pure function returning structured problems: unknown target field, virtual target field, type mismatch between constraint and column, a `field` target whose FK has no `LookupMatchField` resolvable, a `tags` target with no `RootTagID`, `KeyFields` naming a field that does not exist, an empty `Outputs`.
3. `resolveConstraint(output, entityInfo)` — materializes `FromFieldMetadata` into a concrete allowed set from `EntityFieldValues` or the related entity (D23).
4. `renderConstraintBlock(outputs)` — the exact text injected into the prompt, so the same function feeds the prompt *and* the UI preview and they cannot diverge.

**Acceptance criteria.**
- Round-trips through `mj-sync` with `@file:` for prompt text.
- A spec with an enum constraint renders its allowed values into the prompt automatically — the model is told the closed set, not silently corrected afterwards.
- `validateSpec` catches every problem in the list above, each with a message naming the field and the fix.
- Zero imports from `@memberjunction/core` in the spec module itself.

---

## P1-2 — Enforce value constraints at runtime

**Intent.** Guarantee the declared closed set actually holds (D6).

**Files.** `FeaturePipelines/src/validation/constraint-validator.ts`; `RecordSetProcessor/engine/src/processors/InferProcessor.ts`.

**Work.** Implement §4.3's three layers. Layer 1 injects `renderConstraintBlock` output into the prompt data and, where the pipeline owns its prompt, sets `ValidationBehavior: 'Strict'` so `AIPromptRunner`'s existing retry does the first round of work for free. Layer 2 validates each output and applies `OnViolation`. Violation counts roll up onto the Process Run.

**Acceptance criteria.**
- A deliberately out-of-vocabulary response is caught and handled correctly in all three `OnViolation` modes.
- Violation counts surface in run detail; a clean run is visibly marked clean.
- A numeric constraint rejects a string the model wrapped in quotes rather than coercing it silently, unless the field's own `TSType` says numeric (then it coerces, via `EntityFieldRules.coerceToType`).

---

## P1-3 — Write-back: expose, extend, stamp

**Intent.** Close G4. The single-child path already works; this is **expose + extend**, not build.

**Files.** `RecordSetProcessor/engine/src/writeBack.ts`, `processors/WriteBackProcessor.ts`, `RecordProcessExecutor.ts`.

**Work.**
1. **Expose.** `childRecord` and the tags mode become authorable (UI lands in P1-5; the spec supports them now).
2. **Provenance (`$run`).** Extend `applyOutputMapping`'s `sources` from `{ $, record }` to `{ $, record, $run }`, where `$run` carries `ProcessRunID`, `RecordProcessID`, `PromptID`, `PromptVersionHash`, `AIPromptRunID`, `ExecutedAt`, `FeatureValueCacheID`. Authors then map `"$run.PromptVersionHash"` like any other ref. **Prefer this over auto-stamping fixed column names** — it keeps the resolver uniform and imposes no schema.
   `WriteBackProcessor` needs those IDs passed down; `buildProcessor` supplies them.
3. **Fan-out.** Add `childRecords?: ChildRecordMapping[]` with `FanOutRef` promoting an array result to N rows. `childRecord` keeps working unchanged.
4. **Composite keys.** Delete the `writeBack.ts:77` throw (C3) and add a field-update test over a composite-key entity.
5. **Tags target.** A new write-back branch calling `TagEngine.ResolveTag` under the output's root/depth/growth policy, then creating the `TaggedItem`. Dry-run previews the resolved tag and whether it would be created or matched.

**Acceptance criteria.**
- A user can configure, through the UI, a pipeline that writes a normalized code to a column **and** appends a timestamped child row carrying the prompt version.
- Dry-run shows `previewFields`, `previewChildren`, and previewed tag resolutions accurately.
- Existing single-`childRecord` configurations are byte-identical in behavior.
- A tag output with `Growth: 'constrained'` never creates a tag; with `MaxDepth: 1` never places one two levels below the root.

---

## P1-4 — Materialization targets (existing columns only)

**Intent.** Satisfy D17 — the developer's migration is the contract; the pipeline validates against it and fails early.

**Files.** `FeaturePipelines/src/materialization/target-validator.ts`; wired into `buildProcessor` and the builder's save path.

**Work.** Before any LLM call, for every `field` target: the entity field exists; it is **not** `IsVirtual` (C8); its `TSType` is compatible with the output's constraint; if it is an FK, the related entity resolves and `LookupMatchField` exists on it; if the column has a CHECK value list and the constraint declares its own enum, the two agree. Every failure names the column and the fix.

For a `child` target: the entity exists, `ParentField` exists on it and is type-compatible with the parent key, and every mapped field exists.

**Deferred to a later phase, explicitly:** generating the migration, and RSU (`RuntimeSchemaManager.RunPipeline` / `.Preview`, §0.3). The column contract this item establishes is what that phase will generate *to*.

**Acceptance criteria.**
- Pointing a pipeline at a nonexistent or virtual column fails at save time with a precise message, never at row 4,000.
- A `DECIMAL(5,4)` target with a numeric constraint of `Min: 0, Max: 1` validates; the same target with `Max: 100` is rejected with the reason.
- The three-column shape the eight downstream PRs ship validates cleanly as a fixture.

---

## P1-5 — Visual builder

**Intent.** Feature Pipelines should be genuinely pleasant to build by hand and by talking to an agent. Today there is no Infer surface at all (C9).

**Files.** New `packages/Angular/Generic/feature-pipelines/`; Explorer's `KnowledgeHub/components/feature-pipelines/` becomes a thin host. `Angular/Generic/record-process-studio/`'s editor gains per-work-type panels (D18).

**Surfaces.**
1. **Pipeline list** — status, last run, records processed, **cache hit rate**, **violation count**.
2. **Builder** — a staged flow mirroring Predictive Studio's five-stage Training Pipelines UI for visual consistency: *Source → Context → Prompt → Outputs & Constraints → Materialization*.
3. **Prompt editor** — full view and edit of the real prompt (D11), with the injected constraint block rendered from the same `renderConstraintBlock` the engine uses, so what is shown is what is sent.
4. **Context preview** — render the Entity Document or run the Query against a real sample row and show the true context window, including nested `Relationship()` output, before anything runs.
5. **Dry-run panel** — N sample rows: resolved outputs, constraint violations, and `previewFields` / `previewChildren` / previewed tags side by side with current values.
6. **Run monitor** — the existing Process Run monitoring plus cache-hit, violation and skipped-by-watermark counters.

**Acceptance criteria.**
- A user builds a working job-title-normalization pipeline end to end without writing JSON.
- Dry-run is one click from any stage after Outputs.
- The prompt shown is byte-identical to what is sent (assert against `AI Prompt Runs.Messages`).
- Generic components import no Router and no Explorer package; the Explorer host owns navigation and agent tools.

---

## P1-6 — Lifecycle hooks for Infer feature pipelines

**Intent.** Feature Pipelines will be ~90% of the solution. The other 10% must stay *inside* the engine rather than escaping it.

**Design.** No parallel extension point (D9). Two layers, both on existing seams:

1. **Whole-processor replacement** — already available via `RecordProcessorRegistry`. Document it; no code change.
2. **Lifecycle hooks (new)** — make `InferProcessor` subclassable with protected, overridable hooks:

```ts
protected async beforeBuildContext(record, ctx): Promise<void>
protected async buildPromptData(record, ctx): Promise<Record<string, unknown>>   // exists; make protected
protected async beforePromptExecute(params, record, ctx): Promise<void>
protected async afterPromptExecute(result, record, ctx): Promise<unknown>
protected async validateOutputs(outputs, spec, ctx): Promise<ValidationOutcome>
protected async resolveCacheKey(record, spec, ctx): Promise<string | null>
protected async beforeWriteBack(mapping, result, record, ctx): Promise<void>
```

A subclass registers under `DataFeatureSpec.ProcessorExtensionKey`, resolved through the existing registry via `RegisterClass`.

**Acceptance criteria.**
- A sample subclass overriding exactly one hook works without reimplementing the rest.
- Base behavior is unchanged when no extension key is set.
- Hooks documented with a worked example in the package README.

---

## P1-7 — Watermarks and dedup

**Intent.** Close G2 and C2 — two different savings that people conflate.

| | Watermark (per **row**) | Cache (per **distinct key**) |
|---|---|---|
| Question | "has anything this row's answer depends on changed?" | "have we ever computed this answer before?" |
| Saves | re-running an unchanged row on a **re-run** | re-asking the same question on a **first run** |
| Storage | `MJ: Record Process Watermarks` (exists) | `MJ: Feature Value Cache` (new) |

### P1-7a — Generic content hash (D22)

**Files.** New in `MJGlobal`: `src/hashing/canonicalize.ts` + `content-hash.ts`. `MJCore`: `BaseEntity.ComputeContentHash(options?)`. `Integration/engine/src/ContentHash.ts` re-points at the shared canonicalizer.

**Work.** Lift Integration's `canonicalize` verbatim into `@memberjunction/global` — it is pure, dependency-free and browser-safe (sorted keys recursively, arrays order-preserved, `undefined` dropped, Dates as ISO). Add `computeContentHashAsync(fields)` over **Web Crypto** (`crypto.subtle.digest('SHA-256', …)`), guarded exactly as `React/runtime/src/registry/component-registry-service.ts:202` already does, with a clear message when it is missing.

Add `BaseEntity.ComputeContentHash(options?: { Fields?: string[]; ExcludeSystemFields?: boolean })` — async, defaulting to all non-system fields.

> **Why the split is safe.** SHA-256 over the same canonical string is the same hex digest whether `node:crypto`'s `createHash` or Web Crypto computes it. So Integration keeps its synchronous hot-loop path, `BaseEntity` gets the isomorphic async one, and the two agree byte for byte. Integration's existing hashes stay valid — **no rewrite wave**, which is the property that makes this extraction shippable at all.
>
> **Browser caveat, stated once:** `crypto.subtle` requires a secure context. HTTPS and localhost qualify (MJExplorer dev on `:4201` does); a non-localhost plain-HTTP deployment does not, and there the guard throws rather than silently returning a weaker digest.

### P1-7b — Record Process watermark

**Files.** `RecordSetProcessor/engine/src/watermark/WatermarkService.ts` (new, distinct from Integration's sync-cursor service of the same name — different concern, §2.6); `RecordSetProcessor.ts` batch loop.

**Work.** When `SkipUnchanged` is on: compute the row's basis hash, compare against `RecordProcessWatermark.Hash`, skip with `Status: 'Skipped'` when equal, upsert after a successful process. `WatermarkStrategy: 'Checksum'` hashes **the rendered context + prompt version hash + constraint hash** (§5.3); `'UpdatedAt'` compares `__mj_UpdatedAt` and stores nothing; `'None'` disables.

**Acceptance criteria.**
- A second identical run of a 40k-row pipeline processes ~0 rows and costs ~0 LLM calls.
- Changing the prompt moves the version hash, so the next run re-processes everything — *without* anyone clearing a watermark by hand.
- A pipeline whose context includes a `Relationship()` or Query pulls **does** re-process when the related data changes, and a test proves the `UpdatedAt` strategy would have missed it.
- The seven scoring Record Processes in the downstream PRs start honouring the flag they already set.

### P1-7c — Dedup cache

**Files.** `FeaturePipelines/src/cache/FeatureValueCacheService.ts`; two-phase execution in the Infer path.

**Work.** Key = SHA-256 over canonicalized `KeyFields` values (or the rendered context when `KeyFields` is absent). Lookup by `(scope, PromptID, PromptVersionHash, ConstraintHash, KeyHash)` honouring `ExpiresAt`.

**Two-phase execution for keyed pipelines:** resolve the distinct key set across the record set first, execute once per *distinct key*, then fan results back across every matching row. That is the difference between 40,000 calls and 6,000.

Every row still gets its own `Feature Values` history row, with `FeatureValueCacheID` set when served from cache, so lineage survives Prompt Run archival (D21).

**Acceptance criteria.**
- A 40,000-row job-title pipeline over ~6,000 distinct titles makes **~6,000** LLM calls, verified in run stats (distinct-key count reported alongside processed/hit/miss).
- Bumping the prompt fully invalidates; the next run makes the full distinct-key set of calls again.
- `Cacheable: false` (per-activity sentiment) always executes per row and never consults the cache.
- Clearing the cache for a pipeline leaves every history row intact and readable.
- `KeyDisplay` is human-readable for the job-title dictionary — the table is legible as reference data.
- **No new dependency on `MJ: AI Result Cache`.**

---

## P1-8 — Entity Documents into `InferProcessor`

**Intent.** Close G5 and fix C1 — the highest leverage per line in the plan.

### P1-8a — Extract the parser + parent context

**Files.** New `packages/AI/EntityDocuments/`; `ai-vector-sync` re-points; `RecordSetProcessor/engine/src/processors/InferProcessor.ts` gains the context path.

**Work.**
1. Move `EntityDocumentTemplateParserBase`, `EntityDocumentTemplateParser` and `EntityDocumentCache` into the new package. Drop the `EntityVectorSyncer` dependency — `GetEntityDocumentByName` becomes a cache/RunView lookup owned by the new package.
2. **Fix the nested render (C1):** `Relationship()` must render the child document's **text**, not its `Template` name. With D15's embedded record that becomes `doc.TemplateID_Object` → its content; until then it is a `TemplateContents` lookup. **Add a test that would have caught this** — a nested render whose child template contains a placeholder, asserting the placeholder resolved.
3. **`__Parent` (D14):** the child render's data context gains `__Parent` = the parent's data context, chainable to arbitrary depth. Both passes see it: Nunjucks (`{% if __Parent %}`) and `${}`. Document that `__` is reserved.
4. **Wire `InferProcessor`:** when `Context.EntityDocumentID` is set, render it for the record and pass the text as prompt context; when `Context.QueryID` is set, run the approved Query with row-derived parameters (C7); otherwise keep today's flat-record path. `InputMapping` layers on top.
5. Per D4, **do not** enable the Nunjucks `AIPrompt` extension in these templates.
6. Mark the N+1 cost site in `Relationship()` with a comment referencing G6 so the later optimization has a map.

**Acceptance criteria.**
- A pipeline scores an activity using that contact's prior N activities — through a **Query** (C7), since `ActivityLink` is polymorphic.
- A nested Entity Document render resolves its placeholders (the regression C1 describes fails before this item and passes after).
- A child template reads a parent value via `__Parent` and the result appears in the rendered context.
- Rendered context is visible in the builder preview and in the Process Run trace.
- Existing flat-record pipelines are byte-identical.
- `ContentAutotagging` and `Vectors/Dupe` import the parser from the new package directly (no re-export).

### P1-8b — Entity Document loosening (D15)

**Files.** The core migration; `MJCoreEntities` regenerated; `AI/CorePlus/src/MJEntityDocumentEntityExtended.ts`; `EntityVectorSyncer` + Dupe validation.

**Work.** `VectorDatabaseID` / `AIModelID` → nullable. Seed a `Context` entity-document type. Declare `TemplateID` as an embedded record — **Entity Documents become the first production core entity to adopt embedded records**, which `plans/embedded-records.md` §3 note 12 explicitly anticipates ("no production core entity is opted in"). Retire the hand-written virtual-`TemplateText` machinery in `MJEntityDocumentEntityExtended` in favour of `TemplateID_Object`. Vectorization paths validate and fail clearly when the vector fields are absent.

**Acceptance criteria.**
- A context-only Entity Document saves with no vector DB and no AI model.
- Vectorizing a document that lacks them fails with a message naming the document and the missing field — not a NOT NULL violation.
- `mj sync push` round-trips a context document with `@file:` template text.
- Existing search/dupe documents are unaffected.

---

## P1-9 — One engine, server-side (D16)

**Intent.** Match ownership to D2 and kill the duplicate (C4).

**Work.** Move the server engine into `@memberjunction/feature-pipelines`. **Delete** the Explorer client engine; the UI reads prior-run state from `MJ: Record Processes` / `MJ: Process Runs` / `MJ: Process Run Details` directly (already browser-safe, already reactive through `BaseEngine`). Add one remote operation for what the browser cannot compute:

- **`FeaturePipeline.Preview`** (Sync, scope `predictive:execute`) — given a pipeline id and a sample size, return per-row rendered context, raw output, validation outcome, and the write-back preview. This is what powers P1-5's dry-run panel; `RecordProcess.GetRunStatus` returns counts only and cannot serve it.

Preserve `PredictiveStudio.RunFeaturePipeline`'s operation key and metadata ID — callers must not break.

**Sequencing note.** Do this **after** the Part 1 surface stabilizes, to avoid rebasing every other item across a package move. Pure refactor; if schedule pressure appears, this is the item to defer.

**Acceptance criteria.** No behavior change; every existing remote-operation caller works unmodified; `deriveOutputAttribute` exists exactly once and understands all three output modes.

---

# Part 2 — Dogfood in BizApps Common

Goal: stress-test Part 1 by using it for real, and produce genuinely useful business data doing it.

**Order note.** The draft ran P2-1 first. **P2-2 goes first here** — single-row context, no new schema beyond the people model, and it is the item that proves dedup. P2-1 needs P1-8's Query context path and the tags output, so it benefits from going second.

## P2-2 — Job function and seniority (the dedup proof)

### P2-2a — The people model (D24)

**Repo.** `bizapps-common`, migration `V<ts>__v5.45.x__Job_Function_Seniority.sql`.

| Object | Shape |
|---|---|
| `JobFunction` | Type table → `MJ_BizApps_Common: Job Functions`. `Name`, `Description`, `Sequence`, `Status`. Seeded via `metadata/`, never a SQL `INSERT`. |
| `SeniorityLevel` | Type table → `MJ_BizApps_Common: Seniority Levels`. Same shape, `Sequence` carrying rank order (IC → Manager → Director → VP → C-level). |
| `PersonJobFunction` | 1:M. `PersonID`, `JobFunctionID`, `Sequence`, `Source` (`Manual`/`Derived`), `Confidence` nullable. UNIQUE `(PersonID, JobFunctionID)`. |
| `Person.SeniorityLevelID` | Nullable FK. A person has one seniority at a time; functions are plural. |
| `Relationship.JobFunctionID` + `Relationship.SeniorityLevelID` | Nullable FKs — **a person's function and seniority differ per company link**, which is the whole reason these also live on the relationship. |
| `Person.PrimaryJobFunctionID` / `PrimaryJobFunction` | **Virtual view columns** off the lowest-`Sequence` `PersonJobFunction` row — exactly how `CurrentJobTitle` is already derived (C8). No physical column to drift. |

**UX (this is a requirement, not a nicety).** The relationships section already shows title, dates and status. Function and seniority arrive under **progressive disclosure**: collapsed by default, surfaced only when set or when the user expands. Someone who does not care about this model must not notice it appeared. The person form shows primary function and seniority as compact read-mostly chips with an expand for the full function list.

### P2-2b — The pipeline

Context: `Fields: ['CurrentJobTitle']` — a view column, legal as a cache key, illegal as a write target (C8).
Outputs: `JobFunction` → `child` rows into `PersonJobFunction` with `FanOutRef` (a person can be both *Marketing* and *Operations*); `SeniorityLevel` → `field` on `Person.SeniorityLevelID`, an **FK target** resolving the model's code against `MJ_BizApps_Common: Seniority Levels` by `Name` (D23 — the allowed set comes from metadata and is served from `BaseEngineRegistry.TryGetCachedRecords` when the type table is already cached).
Caching: `Cacheable: true`, `KeyFields: ['CurrentJobTitle']`, long TTL, `Scope: 'pipeline'`.
`CaptureReasoning: true` — "Senior Director, Field Marketing" → *Marketing* + *Director* deserves a recorded rationale.

**Acceptance criteria.**
- Distinct-key call count matches distinct titles, **not** row count — the headline number for P1-7c.
- Both outputs are directly usable as `categorical` model features.
- A new Person created with an already-seen title resolves from cache with **zero** LLM calls.
- `MJ: Feature Value Cache` reads as a legible job-title dictionary (`KeyDisplay`).
- A person with two functions gets two `PersonJobFunction` rows; the primary virtual column returns the `Sequence`-lowest.
- Relationship-level function/seniority is settable and invisible until used.

**This exercises all three output modes**: field (FK), child rows (fan-out), and — if we mirror functions into the taxonomy — tags.

---

## P2-1 — Activity tagging and sentiment

**Intent.** The flagship: an LLM reads an activity **plus that person's other activities** and extracts tags and sentiment.

**Why the prior-activities context matters.** Sentiment is relative to the individual. A terse reply from someone habitually terse means nothing; the same from someone habitually effusive means a great deal. Absolute sentiment with no personal baseline is close to useless — this is exactly what `__Parent` (D14) and nested context exist to serve.

**Design.**
- **Context: a Query, not a relationship walk** (C7). `Activity` reaches a person through `ActivityLink` (polymorphic `EntityID`/`RecordID` + `Role`), so the context is an approved `MJ: Query` parameterized by the activity's id, returning the activity plus the linked person's prior N activities. That also satisfies Data Scout's approved-query doctrine, so the same source is reusable as a model feature source.
- **Outputs.** `Sentiment` → numeric constraint, bounded, `field` on Activity (latest) **and** a `child` history row so sentiment becomes a **time series** rather than a value that silently overwrites itself. `Tags` → **tags** mode under a `Sentiment`/`Topics` root with `Growth: 'constrained'` and a match threshold (D19). `Reasoning` → captured to the history row (D20).
- **Caching: `Cacheable: false`.** Every activity is genuinely distinct. This is the pipeline that proves the cache is honestly opt-out.
- **Transcripts where available.** `ActivityFile` (`Kind: 'Body' | 'Attachment'`) → `MJ: Files` — an optional branch in the context Query, not a hard requirement.

**Acceptance criteria.**
- Sentiment history is queryable per contact over time, from `MJ: Feature Values` **and** the app child rows.
- Tag vocabulary stays inside its root; violations are zero on a clean run; nothing is auto-created under `constrained`.
- The feature is usable as business data — surfaced for a salesperson — **independent of any model**.
- A rerun with no new activities processes ~0 rows (watermark), while a genuinely new activity always processes (`Cacheable: false`).

---

## P2-3 — Roll out across additional published applications

**Intent.** Stress-test breadth. Pick applications with materially different shapes: different entity graphs, different text characteristics, at least one fan-out, at least one FK-lookup target, at least one tags target.

**Acceptance criteria.** Every gap or awkwardness found is filed against Part 1 and fixed **there**, not worked around locally. **That is the real output of Part 2.**

---

# Part 3 — Predictive Studio integration

Do this **last**. It depends on Feature Pipelines being genuinely good, which Part 2 is what proves. Rebase onto whichever of #4104 / #4166 has landed (§0.4).

## P3-1 — Stop dropping `llm-derived` features

**Intent.** Close G1 — confirmed in production by all eight downstream PRs (§0.4).

**Files.** `PredictiveStudio/Engine/src/agent/modeling-plan-to-pipeline.ts` (the filter at `:61` and the comment at `:66`), `Core/src/feature-steps.ts`, `Core/src/modeling-plan-spec.ts`.

**Work, in increasing ambition — ship (1) immediately regardless:**

1. **Stop the silence.** A dropped candidate produces a loud, structured warning surfaced in the UI, naming the feature and the reason. **A silent filter whose comment claims the case is "handled by their own step kinds" is the actual defect.** Small; ships as FP-0 ahead of everything else.
2. **Resolve existing pipelines.** When a candidate references an already-run Feature Pipeline with persisted results, construct a proper `LLMDerivedFeatureStep`. **Fix the overloaded ref (C6):** the step carries explicit output columns (resolved from the pipeline's `Outputs`) plus the pinned `PromptVersionHash`, instead of doubling `FeaturePipelineRef` as the column name. `feature-assembly-executor.ts:525` reads the explicit list.
3. **Propose new pipelines.** When Data Scout proposes an LLM feature that does not exist yet, emit a `DataFeatureSpec` **proposal** into `ModelingPlanSpec`, held behind the existing `Approved` gate (D10). On approval: create the Record Process, run it, wait for persistence, *then* bind the step. **That new stage is the actual missing machinery** — the draft was right that this is deeper than a filter fix.

**Keep the seam deterministic.** `ModelingPlanSpec` → `modeling-plan-to-pipeline.ts` → `ExperimentOrchestrator` stays plain TypeScript. Nothing here lets an LLM improvise the training run.

**Acceptance criteria.**
- No candidate is ever dropped silently — every drop warns, naming feature and reason.
- An approved proposed pipeline yields a trained model whose feature set includes the derived column.
- A two-output pipeline binds **both** columns (the C6 regression).
- Train and serve read the *same persisted, version-pinned* values — no recomputation (§6.5).

---

## P3-2 — Teach the agent about Feature Pipelines

**Intent.** Close G3. `llm-derived` currently appears **once** in the entire Data Scout prompt — as an enum value in the output schema, with no guidance whatsoever.

**Placement (resolving the draft's open question 4).** Split by role, matching how the agent already delegates:
- **Data Scout** (`metadata/prompts/templates/model-development-agent/data-scout.template.md`) owns **discovery and proposal** — it already owns `CandidateSources` / `CandidateFeatures`, and its existing *"CRITICAL: Multi-Entity Graph Traversal — Never Settle for Single-Entity Demographic Features"* mandate is the precedent for tone and force.
- **The Loop agent** (`model-development-agent.template.md`) gets **capability awareness** — enough to raise Feature Pipelines conversationally, route to Data Scout, and run the approval gate for proposed pipelines. It already enumerates its tools and owns the approval beat.

**Content for Data Scout.**
- The high-cardinality-string → low-cardinality-code move, stated as forcefully as the graph-traversal mandate.
- **Enumerate and prefer existing Feature Pipelines before proposing new ones** (the engine's summaries make this answerable).
- Worked examples: job title → function + seniority; activity text → sentiment + tags; free-text notes → structured attributes.
- Any proposed feature **must declare a closed value set**.
- New pipelines need user approval and may imply schema changes.
- **Say what does *not* belong here:** anything SQL can derive is a view column or an approved Query, not an LLM call. All eight downstream PRs correctly engineer their features in SQL; the boundary needs stating so the agent does not reach for an LLM to count order lines.

**Acceptance criteria.**
- Given an entity with a high-cardinality free-text column, Data Scout proposes an `llm-derived` candidate with a closed value set.
- Given a relevant existing pipeline, it references that rather than proposing a duplicate.
- Given a SQL-derivable feature, it proposes a Query — **not** a Feature Pipeline.
- The Loop agent answers "what could we do with this messy text column?" without being prompted about Feature Pipelines by name.

---

## P3-3 — Reconsider `childRecord` in the scoring path

`score-record-set.runner.ts:58` deliberately excludes `childRecord`. Re-read it once child write-back is exposed and provenance-stamped.

**Current reading (C10): the exclusion is correct and should stay.** `MLInferenceResultPayload` is a flat score/class — there is no array to fan out — and prediction results already have their own standardized rows, so admitting `childRecord` would add a redundant second mechanism. **This is a review item, not a change order.** Document the conclusion either way.

---

## Sequencing & dependencies

```
FP-0 ── P3-1 step 1 (warning only) ─────────────── ships first, standalone

P1-1 DataFeatureSpec ──┬── P1-2 Constraints
                       ├── P1-3 Write-back (+ $run, fan-out, tags)
                       ├── P1-4 Materialization validation
                       └── P1-8 Entity Documents ──┬── P1-8b EntityDoc loosening
                                                   │
P1-7a Content hash ──┬── P1-7b Watermark           │
                     └── P1-7c Dedup cache ────────┤
                                                   │
P1-5 Builder ◄── needs 1,2,3,4,8                   │
P1-6 Hooks   ◄── independent, any time after P1-1  │
                                                   │
P2-2 Job titles ◄── needs P1-7c (+ common D24 schema)
P2-1 Activities ◄── needs P1-8 (Query context) + P1-3 (tags) ─┘
P2-3 Breadth    ◄── needs P2-1, P2-2

P1-9 Relocate ◄── after Part 1 stabilizes (deferrable)

P3-1 steps 2-3 ◄── needs Part 1 complete + Part 2 confidence
P3-2 ◄── needs P3-1
P3-3 ◄── needs P1-3 (review only)
```

**Critical path:** `P1-1 → P1-8 → P2-2 → P2-1`. That chain proves the thesis. Everything else parallelizes around it.

**Ship-early candidates:** FP-0 (a warning, a few lines, removes live confusion) and the expose half of P1-3 (the capability is already built and tested).

---

## Open questions

1. **Confidence disclosure.** Feature Pipelines will emit confidence alongside derived values; `MJ: Feature Values.Confidence` is reserved for it. **Do not invent a fourth scale.** PR **#4612** documents that Duplicate Detection, ContentAutotagging and Predictive Studio each invented their own (a 0–1 `LLMConfidence`, a `Weight`, a banded `TrustGrade`) and proposes a shared `AIConfidenceSignal` + `AIConfidenceBadge` / `AIExplanationPanel`; `plans/predictive-studio.md:644` names the same gap and never answers it. **This plan takes a dependency on that work rather than a position.** Until it lands, `Confidence` is written and not rendered.
2. **Banding as an output mode.** All eight downstream PRs hand-code numeric→enum banding in a pre-save hook with per-app thresholds (§0.4). A declarative banding output would consolidate them — and #4104 already ships an `assignBand` with half-open, top-inclusive, order-independent semantics. Deliberately **not** in this cut; revisit after P2-3.
3. **Cross-pipeline cache scope.** `Caching.Scope: 'prompt'` is specified and defaults off. Confirm during P2-3 whether any real pair of pipelines shares a prompt and key; if none does, consider dropping the option rather than carrying an untested path.
4. **Watermark basis for Query context.** Hashing the rendered context is correct and costs a render per row even when the row is skipped. If that proves expensive at 40k rows, a cheaper two-tier check (max `__mj_UpdatedAt` across the Query's contributing rows, then full hash) is the fallback. **Measure in P2-1 before optimizing.**

---

## Verification debt

Everything in §2 was verified against `origin/next` on 2026-09-20, **except**:

- Whether `MJ: ML Model Scoring Bindings.Mode = 'Materialized'` has any runtime meaning today (`plans/predictive-studio.md` says SP5 is deferred and gated on #2770 — read as: it does not).
- The CodeGen tails of the two downstream migrations read (tasks #70, orders #223); the hand-written DDL halves were read in full.
- Five of the eight downstream PRs were read by title and summary only (accounting #164, contracts #59, issues #44, fpna #15, sales #111). Tasks #70, orders #223 and more-cheese #62 were read in full.
- Whether `MJ: Templates` already declares a related-record collection for `MJ: Template Contents` — relevant only to how P1-8b reaches template text through the embedded record.

**One draft claim was corrected by this document rather than merely refined:** nested Entity Document rendering does not work today and never has (C1). Any plan step that assumed a working baseline there is re-scoped accordingly.
