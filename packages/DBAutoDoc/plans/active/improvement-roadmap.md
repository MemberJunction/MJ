# DBAutoDoc improvement roadmap

*Plan only. Nothing here is implemented yet. Written 2026-11-12.*

This plan collects three inputs:

1. A line-by-line audit of `packages/DBAutoDoc` against its own benchmark results and paper
   ([arXiv:2603.23050](https://arxiv.org/abs/2603.23050)).
2. Ideas from **NVIDIA Auto-Ontology** ([github.com/NVIDIA/auto-ontology](https://github.com/NVIDIA/auto-ontology),
   Apache-2.0), studied at commit `fc43a82`. Items that come from it are marked **[from NVIDIA
   Auto-Ontology]**; the credit is theirs. The full comparison is in
   [`research/related-work/nvidia-auto-ontology.md`](../../research/related-work/nvidia-auto-ontology.md).
3. Open MJ issues, pull requests and branches that touch the same ground (§12), so efforts are
   unified rather than duplicated.

Sizes: **S** = up to a day, **M** = a few days, **L** = a week or more.

---

## 1. Principles

- **DBAutoDoc stays below MJ.** It must run against any supported database with no MJ database,
  metadata or server. MJ is one consumer of its output (extended properties,
  `additionalSchemaInfo`), not a prerequisite. Changes that tie it tighter to MJ are out of scope;
  changes that loosen it are in.
- **Measure before tuning.** Phase 1 (evaluation) comes before Phase 2 (accuracy) so every
  accuracy change reports a before and after on databases it was not tuned on.
- **Customer values stay in the database by default.** Anything that sends a value to an LLM,
  an embedding service or a file must be a visible, documented choice.
- **A key we emit is a claim that a join works.** Every path that emits a key must have checked it
  against the data.

---

## 2. Phase 0 — correctness bugs (do first, each S unless noted)

These are defects, not features. Several plausibly explain the weakest benchmark numbers, so
fixing them is also the cheapest accuracy work available.

| # | Bug | Evidence | Fix |
|---|---|---|---|
| 0.1 | **Binary and LOB values are sampled into prompts uncapped.** AdventureWorks `Production.ProductPhoto` and `Document` produced prompts of 754K–1M+ tokens and failed analysis. The paper (§7.2.3) attributes GPT-5.4-mini's extra FK misses to its context window; the blob prompts are the more direct cause. | `src/drivers/SQLServerDriver.ts:445-461` (no type filter); `prompts/PromptEngine.ts:92-98` (`jsoninline` has no length cap); `research/v1/results/adventureworks/gemini/analysis-report.md:32` | Never sample binary/LOB/xml/spatial types; cap each rendered value (for example 64 chars) and each column's sample block; record the type as "not sampled". |
| 0.2 | **Pruned keys still reach outputs.** Discovery sets `isPrimaryKey`/`isForeignKey` on columns for every candidate above the minimum; pruning only sets `status='rejected'` and never clears the flags; generators emit the flags ungated. `collectDiscoveredPKs` unions the columns of several candidates into one "primary key". | `src/discovery/DiscoveryEngine.ts:1118-1160`; `src/core/AnalysisEngine.ts:462-470`; `src/generators/AdditionalSchemaInfoGenerator.ts:422-433, 446-466, 552-576`; visible in `research/v1/results/lousydb/additionalSchemaInfo.json` | One winning PK per table; clear column flags on rejection; generators read candidate status, not column flags. M. Likely a large share of the LousyDB FK gap. |
| 0.3 | **LLM-proposed FKs are checked for containment but not target uniqueness**, so sibling columns sharing a parent (`whs_id` in three tables) pass at ~100%. FKDetector pattern 2 skips the PK-eligibility gate for members of composite PKs. | `AnalysisEngine.ts:1540-1720`; `src/discovery/FKDetector.ts:235-257` | Require the target to be a PK or unique column, or a full composite key. |
| 0.4 | **Holistic pruning failure is destructive.** If the holistic call fails, every pass-1 removal is applied; the holistic prompt is not chunked. | `AnalysisEngine.ts:465-472`; `prompts/fk-pruning-holistic.md` | On failure keep the keys; batch the holistic pass (see 5.8). Match decisions on stable keys, not list indexes (`AnalysisEngine.ts:459-461`). |
| 0.5 | **The evaluation script does not compute the published score.** `compare.py` averages four metrics equally; the paper weights them 0.35/0.30/0.20/0.15. Ground-truth paths are hard-coded to `/workspace/...`; schema is dropped from FK keys; a block reads a field `state.ts` does not have. | `research/v1/scripts/compare.py:11-19, 99-117, 193` | Superseded by the eval command in Phase 1; until then fix the weights and keep schema in keys. |
| 0.6 | **Hitting the iteration cap reports "converged".** Every benchmark run used `maxIterations=2` and reports convergence. | `src/core/ConvergenceDetector.ts:30` | Separate `stopReason` (`converged` / `iteration-cap` / `budget` / `error`). |
| 0.7 | **Probe errors read as negative evidence.** Value-overlap errors return 0% (silently failing gate 6); composite-uniqueness errors return "not unique"; statistics errors become zeros. | `SQLServerDriver.ts:829-875, 975-1020, 660-669` | Use the tri-state `DriverProbeOutcome` that `ProbeJoinContainment` already uses; record "unknown" and skip the gate rather than failing it. |
| 0.8 | **LLM FK confirmation is keyed on source column only**, so a confirmation for a different target overwrites the reference and inconsistent state follows; rejected FKs are re-pushed every iteration. | `AnalysisEngine.ts:1644-1648` | Key on (source, target); never resurrect a rejected candidate without new evidence. |
| 0.9 | **Unknown `provider` silently becomes SQL Server.** | `src/database/Database.ts:18-22` | Hard error listing supported providers. |
| 0.10 | **Identifiers are not escaped** (delimiters not doubled; filter literals and generated SQL interpolate names). | `SQLServerDriver.ts:511-513`, `PostgreSQLDriver.ts:511-513`, `MySQLDriver.ts:504-506`, `BaseAutoDocDriver.ts:349-385`, `generators/SQLGenerator.ts:147,153,262-264` | Double the delimiter; use `EscapeSQLString` for literals. |
| 0.11 | **Sample-query validation injects `TOP 10` on PostgreSQL and MySQL.** | `src/generators/SampleQueryGenerator.ts:1060-1080` | Dialect-aware limit. |
| 0.12 | Smaller defects: failed LLM calls report 0 tokens (`PromptEngine.ts:202-207`); LLM-discovered FKs hard-code `discoveredInIteration: 1` (`AnalysisEngine.ts:1476,1702`); `isNumericType` matches `int` inside `interval`/`point` (`BaseAutoDocDriver.ts:316-322`); dead `start` script in `package.json`; dead stub behind the only TODO (`AnalysisEngine.ts:1358-1380`); placeholder text ("AI-discovered primary key (confidence: 100%)") becomes a column description (`AdditionalSchemaInfoGenerator.ts:570`). | as listed | Fix each. |

---

## 3. Phase 1 — evaluation you can trust (M overall)

Accuracy work is only as good as the yardstick, and today's yardstick has gaps.

1. **`db-auto-doc eval --ground-truth gt.json`** in TypeScript, replacing `compare.py`: the
   paper's weights, schema-qualified keys, composite FKs scored as one key, separate numbers for
   surrogate / natural / composite PKs, cross-schema FKs and self-references, partial credit for
   right column / wrong target. M.
2. **Commit the benchmark kit**: ground-truth JSON, key-stripping scripts, configs, final
   `state.json` and code SHA per published run. The paper cites `research/v1/configs/` and
   stripping scripts that are not in the repo. Then regenerate every table in `research/v1`
   and the paper from committed artifacts. S/M.
3. **Held-out databases.** Heuristics were tuned on AdventureWorks and LousyDB (for example the
   position-0 PK rule cites AdventureWorks, and the name blacklist includes LousyDB column
   names). Freeze those as the dev set and report on databases never tuned on: WideWorldImporters,
   Sakila/Pagila, TPC-H and TPC-DS with keys stripped, BIRD/Spider schemas. M.
4. **Contamination control**: consistently rename every table and column of a public database,
   keep the values, re-run. The cleanest test of memorisation (paper future work 4). M.
5. **Real ablations** on one frozen commit via config flags, at least three seeds, mean ± std.
   The current ablation table is development history across code versions. M.
6. **Run with `maxIterations` ≥ 5** and report the actual stop reason and per-iteration change.
   S.
7. **Honest cost and token reporting**: per-model price table (`modelOverrides` currently priced
   as the default model), warn when pricing is unknown, audit token usage mapping per provider
   (the Claude AdventureWorks run's input-token count looks undercounted next to Gemini's). S.
8. **Description quality**: an LLM judge against AdventureWorks' original `MS_Description`
   values, plus a small human Likert study with agreement statistics (paper future work 3). M/L.
9. **End-to-end fixture tests in CI**: Chinook in SQLite/DuckDB and Postgres (Testcontainers),
   stubbed LLM, assert PK/FK F1 does not regress. M.
10. **Text-to-SQL as a downstream metric** **[from NVIDIA Auto-Ontology]**: BIRD accuracy with
    and without DBAutoDoc's keys and descriptions, keys stripped. This measures what the
    documentation is ultimately for. Their harness: [NVIDIA/ontology-sql-eval](https://github.com/NVIDIA/ontology-sql-eval). M.

---

## 4. Phase 2 — key-discovery accuracy

Ranked by expected gain per effort. Every item reports before/after from Phase 1.

1. **One name normaliser for keys**: underscores (`cst_id` currently becomes `cst_`, so snake-case
   pattern 1 never matches), singular/plural (`CategoryID` vs `Categories` is scored FK-like and
   penalised as a PK), common prefixes (`tbl_`, `t_`). `FKDetector.ts:195-200, 305-319`;
   `PKDetector.ts:528-531, 601-631`. Plausibly the main Northwind PK cause. S.
2. **Identity and sequence evidence**: `sys.columns.is_identity`, MySQL `AUTO_INCREMENT`,
   PostgreSQL identity / `nextval` defaults. Survives constraint stripping and is close to
   decisive for surrogate keys. `defaultValue` is already collected and unused. S.
3. **Minimal composite PKs**: reject a composite when a proper subset is already unique (a superset
   of a key is always unique). `PKDetector.ts:649-730`. S.
4. **Deterministic, full-table checks** in place of 20-row samples for "contains zero/blank"
   (`PKDetector.ts:220-222`) and `TOP N`-without-`ORDER BY` composite uniqueness
   (`SQLServerDriver.ts:975-1020`). Bounded `COUNT(*)` vs `COUNT(DISTINCT)`, or
   `APPROX_COUNT_DISTINCT` past a row limit. S/M.
5. **Name blacklist becomes a soft penalty** with anchored rules; it currently rejects outright
   names like `rcv_*`, `act_*`, `start*`, `time*` and literal LousyDB columns
   (`PKDetector.ts:471-519`). S.
6. **Type compatibility instead of string equality** in pattern 3 (int vs bigint, nchar vs
   nvarchar; `FKDetector.ts:264-266` — `isDataTypeCompatible` exists). Allow scale-0 numerics and
   fixed-length binary keys (`FKDetector.ts:549-557`). S.
7. **Statistical self-references** (`parent_id`, `manager_id`, `reports_to`) with a containment
   check; today patterns 1 and 3 skip the source table. S.
8. **Empty tables** fall back to naming, position and unique indexes instead of being
   PK-ineligible (`PKDetector.ts:240`). S.
9. **Query history as join evidence** **[from NVIDIA Auto-Ontology]**: equality join conditions
   people actually run are high-precision FK evidence. Sources: SQL Server Query Store and
   `sys.dm_exec_query_stats`, PostgreSQL `pg_stat_statements`, MySQL
   `performance_schema.events_statements_summary_by_digest`. Parse join predicates with a SQL
   parser, resolve aliases, count occurrences, feed as a new evidence feature and as context in
   the table prompt. Auto-Ontology's `catalog/parsers/sqlglot_extractor.py`
   (`_extract_join_pairs`) is a good model; they persist the result as join edges. Opt-in,
   needs extra permissions, values never read (query text only — but query text can contain
   literals, so strip literals before anything is stored or prompted). M.
10. **Join evidence from views, procedures and functions** (`sys.sql_modules`, `pg_proc`,
    `information_schema.ROUTINES`): same parser, no extra permissions. M.
11. **Calibrated confidence before locking.** The LLM's self-reported confidence becomes locked
    ground truth at ≥ 90 (`AnalysisEngine.ts:~1690`); reports show 99.8–100% averages. Combine
    containment, target uniqueness, name agreement and LLM confidence; lock only on the
    combination. M.
12. **Learned scorer over existing evidence**: replace fixed gate constants with a small logistic
    model trained on dev databases, validated on held-out ones. M/L.
13. **Inclusion-dependency discovery** (SPIDER/BINDER style) for keys with no naming signal, and
    multi-column FK discovery from data. L.

---

## 5. Phase 3 — scale, speed and cost

1. **Stop recomputing statistics**: `GetColumnStatisticsForDiscovery` re-runs full statistics twice
   per FK candidate pair, bypassing `ColumnStatsCache` (`BaseAutoDocDriver.ts:181-208`,
   `FKDetector.ts:430-442`). S, large win.
2. **Sample instead of scanning**: `TABLESAMPLE`, catalog statistics, approximate distinct
   counts, one multi-column aggregate per table instead of one query per column; no
   `ORDER BY NEWID()`/`RANDOM()` full sorts. M.
3. **Bounded concurrency** within dependency levels for LLM and database work (paper future work
   2). Commit results in a fixed table order so parallel runs produce identical state
   **[from NVIDIA Auto-Ontology]** (their `_OrderedCommitQueue` in `semantic/pipeline.py`). M.
4. **Token estimate before every call**: trim samples, then columns, then split wide tables
   rather than failing. S/M.
5. **State file**: atomic write (temp file plus rename, keep `.bak`), versioned schema with
   migrators, processing log as append-only JSONL, prompt capture opt-in. Today the whole state
   is pretty-printed after every table, including every prompt. S.
6. **Embedding similarity for the convergence check** instead of one extra LLM call per table per
   iteration (`AnalysisEngine.ts:973`). S.
7. **Prompt caching and model routing**: stable schema-wide prefix first; cheap model unless
   confidence is low (paper future work 5). M.
8. **Batch the holistic prompts** (PK/FK pruning, sanity checks) by FK-graph community using the
   existing `ErdClusterer`, so 1,000-table schemas fit. M.

---

## 6. Phase 4 — privacy and safety

1. **One privacy switch**: `privacy.mode: metadata-only | stats-only | full`, gating every path
   that sends values: table-analysis samples and "possible values", discovery validator,
   column normaliser, embeddings, sample-query result refinement, persisted prompts. The paper
   says `sampleSize: 0` keeps values out; today distributions and min/max are still sent
   (`SQLServerDriver.ts:385-401`, `Database.ts:282-284`). S/M.
2. **Column-level exclusion and PII detection**: column globs, name/regex detectors (email, SSN,
   date of birth, phone, card), format-masking (`<email len=19>`) instead of raw values. M.
3. **Block verbatim sample values in generated descriptions** (they are echoed today, for example
   in `research/v1/results/lousydb/summary.md`), and so into extended properties written back to
   the database. S/M.
4. **Read-only execution of model-written SQL**: statement allow-list via a parser, read-only
   transaction or `ApplicationIntent=ReadOnly`, least-privilege guidance in the docs
   (`SampleQueryGenerator.ts:925-930`). M.
5. **Local models actually configurable**: add Ollama / LM Studio / vLLM / OpenAI-compatible
   `baseURL` to `llm-factory.ts` (the paper claims local support; embeddings already list
   `ollama`). S.
6. Per-query timeouts and a bytes-scanned budget for cloud warehouses. S.

The NVIDIA comparison is relevant here as a contrast: Auto-Ontology stores top-5 values and puts
them in prompts. DBAutoDoc's `JoinProbe` returning counts only is a differentiator worth
extending to every path.

---

## 7. Phase 5 — standalone footprint

DBAutoDoc should install cleanly for someone who will never run MJ.

1. **Drop `@memberjunction/server-bootstrap-lite`.** It is imported only to register LLM drivers
   (`utils/llm-factory.ts:12`) and pulls in about 89 dependencies (agents, actions, BizApps,
   vector stores, media services). Register only the AI provider packages actually used. M.
2. **Drop `@memberjunction/core`** (only `LogError`/`LogStatus`, `SampleQueryGenerator.ts:7`). S.
3. **A real logger** with levels and an `onProgress` contract; 96 `console.log` calls in library
   code write to the host's stdout. Add `AbortSignal` support to `Analyze`/`Resume`. S/M.
4. **Reconsider paper future work 6** (adopting MJ's `SQLDialect`): it would deepen MJ coupling.
   Prefer an internal dialect layer inside the generic driver (§8.1).

`@memberjunction/ai` (provider abstraction) and `@memberjunction/global` (class factory) are
library dependencies that do not require MJ to be running; keeping them is consistent with the
standalone goal.

---

## 8. Phase 6 — databases

1. **Generic driver refactor** ([`driver-abstraction.md`](driver-abstraction.md)) first: the three
   drivers are about 1,000 lines each with most logic duplicated. Multiplies every item below. M.
2. **SQLite and DuckDB**: S each; also the CI fixtures for Phase 1.9.
3. **Warehouses without enforced keys**, where discovery matters most: Snowflake, BigQuery,
   Databricks, Redshift, Fabric/Synapse. M each; must sample with `TABLESAMPLE` and respect cost.
   Auto-Ontology's connectors (Snowflake, Databricks, ClickHouse, Trino) are a useful reference
   for catalog queries and quirks **[from NVIDIA Auto-Ontology]**.
4. **Oracle** (already referenced but unregistered in `Database.ts`), then DB2 / Sybase. M each.
5. **Exact row counts** up to a bound on PostgreSQL/MySQL (estimates are 0 on never-analysed
   PostgreSQL tables). S.
6. **MySQL SQL output** (`COMMENT`); MySQL users currently get T-SQL (`commands/export.ts:163,184`).
   M.
7. **PostgreSQL and MySQL benchmark runs** (paper future work 1; Chinook/Northwind ports exist). M.

---

## 9. Phase 7 — human review that survives re-runs

**[from NVIDIA Auto-Ontology]**: per-field certification. They store `name_certified` and
`description_certified` on catalog and ontology rows, set from a review UI, and prefer certified
definitions downstream.

DBAutoDoc today accepts human knowledge only up front (`groundTruth`, seed context). Add:

1. **Certification state** per table description, column description, PK and FK: `certified`,
   `rejected`, `edited`, with who and when. Certified items are never changed by later runs;
   rejected keys are never re-proposed without new evidence. M.
2. **Import/export of review decisions** as a small JSON file, so review can happen in a
   spreadsheet (CSV round-trip) or any tool, with no UI required. S/M.
3. **Review queue ordering**: lowest calibrated confidence and highest fan-out first. S.
4. **Incremental re-analysis**: snapshot the schema, re-analyse only changed tables, keep
   certified work (paper long-term). M/L.

---

## 10. Phase 8 — outputs and interoperability

Ranked by user value.

1. **Constraint DDL script** (opt-in, reviewable): `FOREIGN KEY … WITH NOCHECK` (SQL Server) /
   `NOT VALID` (PostgreSQL), `PRIMARY KEY`, `UNIQUE`. S/M.
2. **dbt `sources.yml`** with descriptions and `unique` / `not_null` / `relationships` /
   `accepted_values` tests from keys and value lists. S/M.
3. **Apache Ossie semantic model YAML** **[from NVIDIA Auto-Ontology]**: Auto-Ontology imports and
   exports it through the converter in
   [apache/ossie-converters](https://github.com/apache/ossie-converters/tree/main/nvidia). One
   exporter reaches every Ossie consumer. Verify the spec before building. M.
4. **Auto-Ontology model exporter** **[from NVIDIA Auto-Ontology]**: fill their
   `AutoOntologyModelDocument` data layer (table and column descriptions, PKs, `is_unique`,
   `foreign_keys`, `joins`) keyed by their exported IDs, for `POST /api/model/import` with
   `replace: false`. Their FK resolver then treats DBAutoDoc's keys as declared. Sample values
   left empty. Details in the comparison doc, §5. S/M.
5. **DBML** and per-table **JSON Schema**. S each.
6. **Catalog push**: OpenMetadata, DataHub, Unity Catalog; **OpenLineage** schema and
   documentation facets. M each.
7. **Machine-readable evidence report**: per key, the evidence, probe result and provenance, for
   CI review. S.
8. **Clustered ERD by default** for large schemas (`ErdClusterer` exists). S.

---

## 11. Phase 9 — coverage and answerability

**[from NVIDIA Auto-Ontology]**: their MCP tool `check_answerable` reports whether the ontology
covers a question before trying to answer it.

For DBAutoDoc, the documentation-side version: given a list of business questions (or the
generated sample queries), report which ones the documented schema supports, which tables and
columns they rely on, and where descriptions are missing or low-confidence. It tells a reviewer
where to spend review time and gives a downstream score that does not need a full text-to-SQL
system. M.

DBAutoDoc should **not** become a question-answering application; that belongs to consumers
(Skip in MJ, Auto-Ontology, others).

---

## 12. Coordination with work already in flight

*To be filled from the survey of open MJ issues, pull requests and branches.*

---

## 13. Suggested order

1. Phase 0 (all), then Phase 1 items 1–3 and 6–7, so the next benchmark numbers are trustworthy.
2. Phase 2 items 1–8 (cheap, measurable), with before/after on held-out databases.
3. Phase 4.1–4.3 and Phase 5.1–5.2 (privacy switch and footprint), which matter to adopters
   immediately.
4. Phase 3.1–3.5, Phase 6.1–6.2.
5. Phase 2.9–2.11 (query history, module mining, calibration), Phase 7.1–7.2, Phase 8.1–8.4.
6. The rest as demand appears.

A second paper version (v2) naturally follows step 2: held-out results, real ablations,
contamination control, PostgreSQL/MySQL runs, and the downstream text-to-SQL comparison.

---

## 14. Open questions

- Is query-history access (Query Store, `pg_stat_statements`) acceptable to our typical
  customers' DBAs, or should it stay a documented opt-in only?
- Should certification state live in `state.json` or a separate review file that survives
  `reset`?
- Is a collaboration with the Auto-Ontology team on a joint BIRD evaluation (DBAutoDoc keys feeding
  their ontology on key-stripped schemas) worth proposing?
