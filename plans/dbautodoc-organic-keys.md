# DBAutoDoc Organic-Key Detection + Findings App

> Working spec. Not a PR yet. Goal: prove a parsimonious alternative to PR #2582 head-to-head against the same benchmark schemas, then decide whether to ship.

## Context

[PR #2193](https://github.com/MemberJunction/MJ/pull/2193) (merged March 2026) shipped the **Entity Organic Keys** runtime: two metadata tables (`EntityOrganicKey` + `EntityOrganicKeyRelatedEntity`), `EntityInfo.OrganicKeys`, `BuildOrganicKeyViewParams()` SQL generation, Angular form panels with collapsible sections + lazy-loaded `EntityDataGrid`, detail-panel match counts, Entity admin "Organic Keys" rail, and CodeGen ingest of `additionalSchemaInfo.json` `OrganicKeys[]` per-table arrays. The runtime is fully working; what's missing is anything that *proposes* organic keys automatically.

[PR #2582](https://github.com/MemberJunction/MJ/pull/2582) (open) attempts that proposal layer with 8,200+ lines: agglomerative clustering, business-concept projector, business gate, semantic expansion, missing-concepts discovery, concept-merge pass, convergence loop, MinHash, embeddings, and several LLM passes. The output lands in a top-level `OrganicKeyClusters` array that **no consumer reads** — there is no bridge to PR #2193's per-table `OrganicKeys[]` shape, so the proposals never reach MJ Explorer.

The empirical APTIFY run produced 204 clusters in ~40 minutes at ~1.4M tokens **with MinHash and business projection both defaulted OFF** — meaning the heavyweight infrastructure didn't even participate in the headline result.

## What we're building

A complete alternative on this branch:

1. **A clustering algorithm** at roughly 1/5 the LOC, doing one LLM call per cluster with a business-aware prompt instead of six bolted-on LLM passes.
2. **A translator** that turns clusters into PR #2193's per-table `OrganicKeys[]` shape so CodeGen and the existing Explorer panels just work.
3. **A `DBAutoDoc` app** in MJ Explorer (opt-in) that browses everything DBAutoDoc produces — descriptions, soft PK/FK candidates, organic-key clusters, value lists, sample queries, runs — with approve/reject actions that persist across server restarts.
4. **Two new MJ entities** for persistence: `MJ: DBAutoDoc Run` (per-run summary, written by CodeGen) and `MJ: DBAutoDoc Run Finding Decision` (human approve/reject log).

## Algorithm — five steps, one LLM pass

1. **Prefilter** (deterministic, no API): drop tables matching `mj.config.cjs schemaScope.excludeTablePatterns`; drop columns already classified by soft-FK to a single target; drop low-cardinality, binary/blob/float, and well-known audit columns.

2. **Embed column descriptors** (batched, disk-cached). Each input is *description + a few sample values* with a clustering task hint. Sample values are the key signal — they let the embedding model see `alice@acme.com`-shaped values vs `internal-bot@company.com`-shaped values and discriminate. Sample values are already available from `ColumnStatsCache`; no extra DB work.

3. **Average-linkage agglomerative clustering** on cosine distance. Average-linkage (not complete-linkage as PR #2582 uses) means clusters are "similar on average" rather than "every pair must be close" — this eliminates the same-concept-multiple-clusters problem PR #2582 needs `ConceptMergePass` to fix. Filter: ≥2 members, ≥2 distinct tables.

4. **One LLM call per cluster** with a single prompt that handles keep/split/reject + canonical concept naming + normalization choice + outlier ejection. Canonical concept names (`email_address`, `customer_id`, etc.) instructed in the prompt mean same-concept clusters from disconnected geometric regions converge to the same output name — eliminating the need for a post-pass.

5. **Translate keeps to PR #2193's hub-and-spoke shape**. Each cluster fans out: N members → N hub-and-spoke entries with the other N-1 as spokes. Skip `fk-redundant-single-target` clusters (declared FK already does the job). Set `AutoCreateRelatedViewOnForm = true` so the runtime knows these are detected, not curated. Output to a separate file (`detected-organic-keys.json`), not directly into `additionalSchemaInfo.json` — human curation required to promote.

## What we explicitly do NOT build (v1)

| Feature in PR #2582 | Why deferred |
|---|---|
| `BusinessConceptProjector` (anchor-axis projection) | LLM prompt encodes business judgment; projecting generic embeddings into a 14-axis space over-merges distinct concepts (author confirmed empirically). |
| `MinHash` value-overlap signatures | Organic keys describe *schema capacity* for value matching, not proof of current overlap. The Mailchimp-just-connected case shows why value overlap as a hard filter would reject the most valuable proposals. Sample values in the embed input give us value-awareness implicitly. |
| Convergence loop (multi-iteration) | One pass is sufficient; iteration is unjustified without ablation. |
| `SemanticClusterExpander` | If embedding misses a member, lower the merge threshold — fix clustering, don't bolt on a second pass. |
| `MissingConceptsDetector` | Same. |
| `ConceptMergePass` | Eliminated by average-linkage + canonical concept names in the refiner prompt. |
| Schema-level hierarchical clustering | v2 — promising direction for dirty production schemas but ship flat first, measure, then layer. |
| Cluster-shape metadata table (Option C) | Translate to existing PR #2193 schema; revisit only if N²-expansion proves painful. |

Each of these is add-back-able if v1 measurement shows it's needed. Default: simplest thing that could work.

## App — `DBAutoDoc`

Opt-in MJ Explorer app (`DefaultForNewUser: false`). Nine dashboards:

| Dashboard | Reads from |
|---|---|
| Overview | Run summary entity + state.json coverage stats |
| Tables | state.json table descriptions |
| Columns | state.json column descriptions (searchable) |
| PK Candidates | state.json soft-PK detections + decisions log |
| FK Candidates | state.json soft-FK detections + decisions log |
| Organic Key Clusters | state.json organic-key output + decisions log |
| Value Lists | state.json valueListVerdict + decisions log |
| Sample Queries | state.json sampleQueries |
| Analysis Runs | `MJ: DBAutoDoc Run` entity (timeline + diff) |

GraphQL resolver reads `state.json` (path stored on the Run record) and joins with the decisions table. Gracefully degrades when state.json isn't accessible (DB summary still works; deep audit shows "state file not available on this server").

Plus the inline tweak: PR #2193's form-component organic-key panels render with a small `[auto-detected ●]` badge when `AutoCreateRelatedViewOnForm = true`, with `[Confirm] [Hide]` actions that write to the decisions log via the same mutation the dashboard uses.

## Persistence — two new MJ entities

```sql
MJ: DBAutoDoc Run
  ID, RunStartedAt, RunCompletedAt, Status,
  DatabaseName, SchemaCount, TableCount, ColumnCount,
  DescriptionsGenerated, PKCandidatesFound, FKCandidatesFound,
  ValueListsFound, OrganicClustersFound, SampleQueriesGenerated,
  TokensUsed, EstimatedCost, StateFilePath, GitCommit, Notes

MJ: DBAutoDoc Run Finding Decision
  ID, DBAutoDocRunID (FK), FindingType, FindingKey,
  Decision (Approved | Rejected | Modified | Pending),
  ConfidenceAtDecision, ModificationData (JSON),
  DecidedByUserID, DecidedAt, Status (Active | Superseded), Notes
```

CodeGen writes the Run row after consuming output. CodeGen also reads prior decisions from the Decision table on each run and honors them (Approved → applied, Rejected → skipped, Pending → applied with `AutoCreateRelatedViewOnForm = true`). Closes the feedback loop: human curation persists across runs.

Retroactive benefit: soft PK/FK detection has never had a curation surface. Building these entities for organic keys gives PK/FK detection the same approve/reject workflow for free.

## Sequencing — three slices, each independently shippable

### v0 — App + existing DBAutoDoc output (no algorithm work yet)
Two new entities + migration. App metadata + lazy nav. `DBAutoDocFindingsResolver` reads state.json. Dashboards: Overview, Tables, Columns, PK Candidates, FK Candidates, Sample Queries, Runs. Approve/reject actions for PK/FK. CodeGen writes Run rows. Surfaces 6+ months of DBAutoDoc output that was previously invisible. **Zero algorithm risk.**

### v1 — Algorithm + Organic Clusters dashboard
The clustering pipeline (~1,000 LOC source + tests). Organic Clusters dashboard. Inline `[auto-detected]` badge on form panels. Value Lists dashboard. Run-diff view. Completes the end-to-end story.

### v2 — Polish
Iteration Detail view (LLM transcript audit). Save sample queries as MJ Queries. Schema-level hierarchical clustering. Knowledge Hub cross-linking. CLI for disconnected workflows.

**Disk embedding cache** (deferred from v1): a small persistent cache that writes embedding vectors to a JSON file after each run so re-runs skip the API call. Costs cents to skip in v1 (embeddings on free tiers, ~5 min wallclock at APTIFY scale) but saves real wallclock during development iteration on clusterer/refiner tuning. Worth ~30-50 LOC when added; deferred until needed.

## How we decide v1 ships

Three acceptance criteria against the same benchmarks PR #2582 ran:

1. **Precision**: ≥80% of KEEP clusters at confidence ≥0.85 are genuinely useful organic keys (manual review of 50 random clusters).
2. **Recall**: every canonical concept from PR #2193's Hubspot+Mailchimp example is found.
3. **Cost**: APTIFY-scale (~5K columns post-filter): <200K tokens, <5 min wallclock on Gemini Flash.

If v1 hits all three, ship v0+v1 to `next`. If v1's algorithm is comparable to or better than PR #2582 on these benchmarks, PR #2582 doesn't merge.

## Branch hygiene

- Branched from `origin/next` (NOT from PR #2582). Clean base.
- No push, no PR until v1 is proven against the acceptance criteria.
- Worktree at `../MJ-dbautodoc-organic-keys` keeps this work isolated from any other in-flight branches.

## Scope additions during build

### MJ-dependency removal (bundled into this branch)

Mid-build, the team identified that DBAutoDoc's `package.json` was declaring four `@memberjunction/*` runtime dependencies (`@memberjunction/ai`, `@memberjunction/global`, `@memberjunction/core`, `@memberjunction/server-bootstrap`), contradicting the package's own description as a "standalone" tool. Removed in scope rather than as a separate PR — the new organic-key code would have either inherited the coupling or introduced inconsistency between new and existing code paths.

What changed:

| Component | Replacement |
|---|---|
| `@memberjunction/ai`'s `BaseLLM` / `ChatParams` / `ChatResult` | New `src/llm/LLMProvider.ts` — direct-REST clients for Anthropic + Gemini + OpenAI; abstract base class with default batch `ChatCompletions` |
| `MJGlobal.ClassFactory` dispatch (LLMs) | Plain `switch` in `createLLMInstance()` |
| `MJGlobal.ClassFactory` dispatch (DB drivers) | Plain `switch` in `createDriver()` with named imports |
| `@RegisterClass` decorators on three drivers | Removed; drivers become plain classes |
| `CleanAndParseJSON` from `@memberjunction/global` | New `src/utils/json.ts` — faithful port preserving the multi-stage fallback chain (direct parse → trailing-`}` recovery → newline/tab strip → double-escape undo → markdown fence extraction → balanced-`{...}` extraction) |
| `LogError` / `LogStatus` from `@memberjunction/core` | `console.error` / `console.log` (DBAutoDoc is a CLI tool; console is appropriate) |
| `utils/llm-factory.ts` (MJ ClassFactory wrapper) | Deleted; `createLLMInstance` lives in `llm/LLMProvider.ts` |

Verification: `npm run build` clean, `npm ls @memberjunction/ai @memberjunction/global @memberjunction/core @memberjunction/server-bootstrap` returns empty for DBAutoDoc's tree. JSON parser behavior is byte-for-byte equivalent to MJ's implementation per the port checklist.

### What this enables

DBAutoDoc can now be installed as a standalone npm package — `npm install -g @memberjunction/db-auto-doc` pulls in DBAutoDoc + its DB driver + LLM client deps and nothing else from MJ. Users running DBAutoDoc against an arbitrary SQL Server / PostgreSQL / MySQL database don't need MJ's server, schema, or runtime at all. The `@memberjunction/` scope on the package name is now branding-only (which was always the intent).

Cross-MJ-tool concerns (e.g., the project-wide `schemaScope.excludeTablePatterns` in `mj.config.cjs`) remain unaddressed here — that's a separate workstream because it requires MJ to be present.
