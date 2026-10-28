# @memberjunction/db-auto-doc

## 6.2.0-edge.6

### Patch Changes

- 10a460b: Every LLM call in this package was unbounded — no timeout, no deadline, no AbortSignal at any of the six provider call sites. The retry loops cannot substitute for one: they only run once a promise settles, and a provider that accepts the socket then stops sending never settles one, so a stall bypassed retry, backoff and error reporting alike and simply parked the run. A shared `withCallDeadline` applies the bound two ways at once — the request is ABORTED through `ChatParams.cancellationToken`, which the drivers forward to their SDKs, and the awaited promise is REJECTED so a driver that ignores the signal still cannot park a caller. Configurable as `ai.callTimeoutMs`, default 120000; `0` restores the previous behaviour exactly. Applied to `PromptEngine.executeWithRetry`, `LLMSanityChecker`, `LLMDiscoveryValidator`, `TableNormalizer` and each embedding batch in the organic-key pass.

  **The shipped default configuration handed a Gemini key to `OpenAIEmbedding`.** Two independent causes: `EmbeddingProvider`'s driver map had no `gemini` entry, so even an explicit `embedding.provider: 'gemini'` threw "not supported"; and `SemanticPhase` defaulted to the literal `'openai'` while `AIConfig.provider` defaults to `gemini` and the same key is passed to both. `gemini` → `GeminiEmbedding` is now registered (the model is left to the driver, which already defaults it), and an absent `embedding.provider` resolves to the embedding driver of the SAME vendor as the LLM key — the one credential the operator has definitely supplied. A vendor with no embedding driver (anthropic, groq, openrouter, …) now raises a named error asking for an explicit choice; that is not a new failure, since sending its key to `OpenAIEmbedding` failed too, just opaquely and blamed on the wrong service. `local` is never inferred — it needs no key, so it would "work" for every vendor while silently swapping a hosted embedding model for a small on-disk one.

  **`TableNormalizer` — the largest fan-out in the organic-key pass — is now bounded on all three axes.** It had no call deadline (one stalled table parked a worker for the rest of the run; with concurrency 8, eight stalls parked the pass), no backoff at all (retries fired immediately, three times per table, from every worker at once — the shape that turns one 429 into a burst), and no token cap, because `organicKeyDetection.tokenBudget` was declared in the config type and read nowhere. Transport failures now back off exponentially with jitter, sharing the `ai.retry` knobs with `PromptEngine`; parse failures deliberately do not, since nothing upstream is recovering from a malformed body. The token budget stops scheduling further tables once the running total exceeds it, and the result reports `budgetExhausted` and `tablesSkippedForBudget` — surfaced through `SemanticPhaseResult.summary` — because normalizing 300 of 500 tables and reporting that as a finding about the schema is its own defect.

  **The embedding provider is resolved before the normalization calls are paid for.** The named error for a vendor with no embedding driver, and a missing driver package, used to surface only after every table had been normalized; they now stop the organic-key pass before its first LLM call.

- 1cbd9d0: DBAutoDoc's PK detection now uses existing unique indexes as evidence for tables with no declared primary key (`relationshipDiscovery.indexBackedCandidates`, default true):
  - A unique, unfiltered index on NOT NULL columns becomes a candidate even when the statistics can't show uniqueness, for example on an empty table. It's scored with an index boost, so naming, type, the name blacklist and column position still pick between several unique columns.
  - A unique index on a nullable column only adds a smaller boost to a column that already passes the statistical checks.
  - Multi-column unique indexes are considered as composite keys when no single column qualifies (junction tables, for example). Next to a qualifying single-column key they're treated as alternate keys and not added, because discovery flags every candidate's columns as primary key.

  PK candidates record the index that backs them (`evidence.backingIndex`).

- e859749: Follow-ups from the review of #5791. No behavior change.
  - Reworded the `indexBackedCandidates` doc: composite unique indexes are only considered when no single column qualifies.
  - The `useExistingIndexes` handling at the start of a run moved into a tested `PrepareIndexesForRun` helper. When it's off, indexes left in a resumed state are dropped.
  - New tests for that helper and for `PKDetector` replacing a lower-confidence composite with an index-backed one on the same columns.
- 45136f6: Organic keys are emitted hub-and-spoke instead of as all-pairs cliques (#4538).

  Every member of an organic-key cluster used to get every other member as a related entity, so spokes grew with the square of cluster size. On one production deployment, most of those pairs were co-references: two tables that both hold a customer key, many-to-many, which multiply rows when joined.
  - **Hubs.** The members whose column is their table's primary key own the value. A hub links to every other member; any other member links only to the hubs. A 10-member cluster now emits 18 spokes instead of 90.
  - **Transitive spokes follow the same rule.** Only a hub gets bridge-view spokes, since a non-hub reaching another table through a bridge (orders to registration via the customer key) is a co-reference. A table already linked directly is not added again through a bridge.
  - **No owner, no key.** A concept no member owns as a primary key is not emitted, since every pair in it would be a co-reference. The compose step reports these as `SkippedUnanchored`, and the detector summary as `conceptsSkippedUnanchored`.
  - **New option:** `TranslateOptions.OnUnanchored`.

- 1b21a0e: The primary- and foreign-key passes now see the operator's seed context.

  `seedContext.customInstructions`, which also carries the text of `seedContext.file` / `files`, reached only the table-analysis prompt. The passes that decide keys never saw it: the discovery validator, PK pruning and FK pruning. A data-layout summary helps those passes most.
  - A per-table pass (discovery validator, `pk-pruning-table`, `fk-pruning-table`) gets the paragraphs that name its table. The whole-schema passes (`pk-pruning-holistic`, `fk-pruning-holistic`) get the full text. The notes are framed as evidence that does not override the data and constraints.
  - New setting `seedContext.keyPassMaxChars` caps the text sent to each of these prompts (default 6000; `0` sends none), so a long document doesn't multiply cost by the table count.
  - New export: `SeedContextExcerpt`.
  - `DBAutoDocAPI` now passes its `seedContext` on to the analysis. `buildFullConfig` never copied it, so programmatic callers got no seed context in any prompt, table analysis included. Its type also accepts `keyPassMaxChars`.

- 45136f6: Verify a key against the data before emitting it. Every key DBAutoDoc writes into `additionalSchemaInfo` is a claim that a join works, and until now only one of the three paths that emit keys ever checked that claim: `FKDetector` probed via `testValueOverlap` and its 75% containment gate, while the organic-key path (LLM concept naming plus embedding distance) and the LLM-proposed FK path emitted whatever they formed. The LLM path was the worse of the two — it wrote a literal `valueOverlap: 0` placeholder, set `status: 'confirmed'`, and stamped `column.isForeignKey`, which reaches `additionalSchemaInfo` through `collectIntrospectedFKs`, a branch with no confidence, status or containment filter at all. A key that matches nothing is worse than a missing key: the join it generates returns an empty result with no error, indistinguishable from a true negative.

  **PostgreSQL was worse still, and this is the headline.** `PostgreSQLDriver.testValueOverlap` sampled with `SELECT DISTINCT <col> … ORDER BY RANDOM() LIMIT n`, which is not valid PostgreSQL — an `ORDER BY` expression on a `SELECT DISTINCT` must appear in the select list. The statement raised for **every column pair**, same-type or not; `catch { return 0 }` turned that into 0% overlap; and the 75% gate read 0% as a refutation. The statistical FK detector was therefore completely inert on PostgreSQL, so the only foreign keys surviving a PostgreSQL run were the LLM-proposed ones that nothing probed. SQL Server used `DISTINCT TOP n` with no sort and always worked, which is why this was invisible to anyone testing there.
  - **New `JoinProbe`** — a bounded, count-only containment probe shared by both emitting paths. It returns three distinct outcomes, and keeping the last two apart is the point: `Verified` (containment at or above the floor), `Refuted` (the probe RAN and measured below it — not emitted), `Unprobed` (no permission, timeout, budget exhausted, incomparable types, missing object — emitted, stamped, never called verified). Emitting on `Unprobed` is deliberate: refusing whenever a probe cannot run converts a permissions problem into silent total key loss, which is its own defect. The engine refuses only on measured refutation; it never refuses out of ignorance and never claims a verification it did not perform.
  - **Bounded three ways**, all configurable under `analysis.keyVerification`: `sampleSize` distinct child values per probe (default 1000), `maxProbes` per run (default 500, after which candidates are `Unprobed`), and `probeTimeoutMs` per probe (default 5000). One verifier instance is shared by the analysis engine and the organic detector, so the cap bounds the run rather than each path separately.
  - **Counts only, never a value.** `ProbeJoinContainment` returns two integers; the result type carries no value-bearing field. Failure reasons are persisted next to the key they explain, so they are classified into a fixed set and sanitized — database errors routinely quote the offending value, and none of that may reach the output file.
  - **New driver method `ProbeJoinContainment`** on all three drivers, returning a discriminated union so a failed probe can never be read as zero containment. Both sides are cast to text/`NVARCHAR`/`CHAR`, which makes the commonest soft-key shape probeable at all — a connector storing another system's `uuid` in a `varchar` column raises `operator does not exist: text = uuid` on PostgreSQL, and that key was previously invisible.
  - **`ORDER BY RANDOM()` removed** from `PostgreSQLDriver.testValueOverlap`, which is what made the existing FK path work on PostgreSQL for the first time.
  - **Selectivity prefilter corrected.** The low-cardinality gate read `distinct < MIN && ratio < MIN` — a conjunction, so clearing _either_ floor was enough to be treated as identity-bearing, and the gate never removed anything it was written to remove: a boolean on a 100-row table (2 distinct, ratio 0.02) was kept, and so was a `payment_method_id` with 33 distinct over 24,000 rows. It now drops any column under 50 distinct values, which removes both. The distinct-to-rows ratio is no longer a gate: it reads low for spoke columns on busy tables (40,000 members over 2.5M attendance rows is 0.016), which repeat per member rather than being categories. Columns with no statistics still fail open — the gate is a cost filter, and the probe is what establishes correctness.
  - **The organic-key probe compares values the way the key will.** Each side is normalized with its member's strategy (`LowerCaseTrim`, `Trim`, `ExactMatch`) before comparing, so an email key matched case-insensitively is not refuted on PostgreSQL for differing in case, and PostgreSQL and SQL Server agree on the same data. A member whose key needs a `Custom` expression is not probed (the expression is model-written SQL) and is kept as `Unprobed`.
  - **A refuted LLM-proposed FK no longer demotes a primary key.** The probe now runs before an unconfirmed PK candidate on the same column is rejected, so only a proposal the data does not contradict counts as evidence against the PK.
  - **`AutoCreateRelatedViewOnForm` now defaults to FALSE** and is opt-in via `organicKeyDetection.autoCreateRelatedViewOnForm`. It was a hardcoded `true`, so every emitted key auto-created a related-record grid per spoke — roughly 22 per key on a real run — each one a value-join on a column nothing had verified.
  - **Provenance per key.** Emitted keys carry `{ Provenance, Verification, VerifiedAt, MatchedRows, SampledRows, VerificationNote }`, so a verified key is distinguishable from an inferred one and a wrong inference can be traced to whichever stage authored it. A genuinely introspected constraint carries no stamp — claiming a verification nobody performed would be the same defect in reverse.

  Behavior is preserved wherever no probe is available: with no driver or no verifier, keys are emitted exactly as before, marked `Unprobed` rather than presented as checked.

- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [cc41d33]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [663ff80]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [0a348e2]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- 8443fd2: CodeGen produces correct, lean and observable artefacts for a schema it did not author — and can express a join that is not a declared foreign key.

  **A relationship over a non-primary-key join column is now persisted.** A foreign key does not have to point at a primary key, and `EntityField.RelatedEntityFieldName` has always recorded which column it does point at — but nothing carried that across to `EntityRelationship.EntityKeyField`, which is the only place a consumer can learn it. All three consumers fall back to the parent's first primary key when it is blank, so every relationship over a non-PK join queried the wrong column and returned zero rows for every parent record. The INSERT now emits `EntityKeyField`, and — this is the half that repairs an existing database — a relationship whose join field is already correct, and which therefore takes the "exact match, skip" path, gets its key field healed rather than left blank forever. `AutoUpdateFromSchema = 0` rows are untouched. Nothing is emitted for an ordinary FK-to-primary-key relationship, so generated SQL is byte-identical wherever the fallback was already right.

  **Indexes no longer come only from foreign-key metadata.** `isIndexableForeignKey` looked at `RelatedEntityID` and nothing else, which made "remove the FK metadata that is wrong" and "get an index for the join you actually perform" mutually exclusive: on an imported schema the real joins are on external ids, the inferred FKs onto them are deleted _because_ they are wrong, and the entity is left with a join MJ runs per parent record and no index. It now also indexes columns MJ itself has declared as joins — `EntityRelationship.EntityKeyField`, and the match fields of ACTIVE `ExactMatch` organic keys. Organic keys with any other normalization strategy are deliberately NOT indexed: their predicate is `LOWER(LTRIM(RTRIM(col))) = ?`, which no plain index on `col` can serve, and the generated SQL now says so instead of emitting an index that costs a write per insert and is never used. A verified join column that is already unique gets no second index: a declared FK can only target a column with a unique constraint, so that constraint's index already serves every `EntityKeyField` set from one.

  **Organic-key detection survives a large schema.** `RunStructuralPhase` guarded only "no clusters", and the walk beneath it ran one BFS per hub × _every table in the database_ — including every table with no join edge at all — with each enqueued state allocating a fresh `Set` and a fresh path array, onto an unbounded queue drained with `Array.shift()`, into an uncapped result array. The phase is now gated on the **edge set** (not on declared FKs: `CollectFKEdgesFromState` also pulls inferred soft FKs, so a database that declares none can still build a dense graph), skips hubs and spokes with no edge, drains the queue with an index cursor, bounds the live BFS frontier and both result arrays, and **reports** when a bound fired rather than silently returning a partial answer. `RunStructuralPhase` also takes a `Skip` option, so a run can decline the phase and still emit its semantic-phase keys.

  **Virtual-field drift heals on a normal run.** Pass 2 of `ManageEntityFields` is scoped to entities something changed on during _this_ run, so an entity whose related-entity name field never got its `EntityField` row dropped out of scope permanently — `BaseEntity.InnerLoad` then threw on that column for every record form of that entity, and the only recovery was `forceRegeneration` across the whole database. A catalog probe now finds entities carrying a view-only column with no `EntityField` and adds them to the Pass 2 scope. New _physical_ columns are deliberately not included: Pass 1 already finds those, and pulling them in would widen the scoped pass back out to a full scan.

  **Base views can keep a column out.** New `baseViewExcludedFields` config. A base view is what every read goes through and both providers emitted `SELECT alias.*`, so a column no component reads was still fetched and held on every `RunView`, `Load` and grid — measured on one integration mirror at 52–70% of the table's bytes for a single JSON bookkeeping column. **Empty by default, and an empty list changes nothing**: the star is emitted unless an entity actually has an excluded column, so generated output is byte-identical for every entity nobody names.

  It ships with an interlock, because without one it would destroy metadata. CodeGen's field prune asks "is this column in the base VIEW?" — `vwSQLColumnsAndEntityFields` resolves columns view-first on both dialects — so an excluded column's `EntityField` row looks orphaned and is deleted on the next run, silently taking out every metadata-mediated read and write of it. Verified against live PostgreSQL 16: deleted without protection, retained with it. `spDeleteUnneededEntityFields` therefore takes a new optional `ProtectedFieldNames` list, and CodeGen **declines the exclusion entirely**, with a message naming the prerequisite, on any database whose prune routine does not accept it. The PostgreSQL routine ships with CodeGen so it always does; the SQL Server routine ships in migrations, and the capability is probed rather than dialect-branched so that half activates the moment the parameter lands.

  The measured column that motivated this — `__mj_integration_LastSyncedSnapshot` — is **not** excluded by default, and should not be until one reader is repointed: `IntegrationEngine.computePushCombine` reads it out of `change.Fields`, which is `entity.GetAll()` after an `InnerLoad` off the base view. Without it that method falls back to pushing the full attribute set, silently and by design, so bidirectional field-level merge would quietly stop working. The other `__mj_integration_*` columns are not default-excluded either: `SyncStatus` and `LastSyncedAt` are mapped onto the API surface by `GraphQLDataProvider`'s `FieldMapper`.

  **Enabling full-text search now says what it costs.** The generated objects are charged on every write to the table from then on — PostgreSQL: a row-level `BEFORE INSERT OR UPDATE` trigger recomputing `to_tsvector`, a GIN index maintained on those writes, and a whole-table backfill; SQL Server: continuous change tracking plus a full re-crawl on every apply — and turning the entity's flags back off removes none of it. A case-insensitive sweep of the generator for `warn|cost|overhead|expensive|caution` previously returned nothing.

  **A long run reports where it is.** There was a 100 ms elapsed ticker, but the message it re-rendered was set once before the entity loop, so a run stalled on entity 3 and a run on entity 1,180 looked identical. The loop now emits position, total, phase and elapsed per batch, through `UpdateSpinner` so verbose mode gets the same information as a line per batch.

  **PostgreSQL support objects.** `spUpdateExistingEntitiesFromSchema` was the last routine still joining the catalog-introspection view directly — a function-based scan over `pg_catalog` with no row statistics, estimated at `rows=1`, nested-looped per `Entity` row — and never ANALYZEd its own `_ues_filtered` working table. Both are fixed the way the two sibling routines in that file already were. And `spRecompileAllViews` now exists on PostgreSQL. It cannot do what the SQL Server proc does (PG freezes a view's targetlist at creation, `CREATE OR REPLACE VIEW` may only append columns, and `pg_get_viewdef` returns the already-expanded definition, so there is no in-place refresh and no original source to replay) — what it closes is the silence: a stale base view said nothing until something read it and failed with `column "X" does not exist`, taking `BaseEngine` loads and `mj sync push` with it. It reports every base view whose column list has drifted from its base table, raises a warning per view so a `mj migrate` log carries it, and names `mj codegen` as the repair. `R__RefreshMetadata.pg-only.sql` calls it.

  **In-process CodeGen generates SQL for the entities it just registered.** The pipeline reads entities through `new Metadata()`, the process's global provider, but after `manageMetadata` it refreshed only the provider it was handed. On the CLI they are the same object. In-process (`RunInProcess`, the runtime schema-update path) the host passes a separate CodeGen-credential provider, so SQL generation ran on the host's last timed snapshot, where newly registered entities had no soft primary key yet, and skipped every one of them as "no primary key field in metadata": no base view, no CRUD routines. The global provider is now refreshed too when it is a different object.

  **A value list on a boolean field no longer breaks the generated package.** Value lists become literal unions in the generated property type and Zod schema, quoted only when the field needs quotes. A boolean field never does, so a declared "False"/"True" list came out as the bare identifiers `False | True` and `z.literal(False)` (TS2304), and the build failed. A boolean field now keeps `boolean` / `z.boolean()`, with its values still listed in the doc comment; string and numeric value lists are unchanged.

- d1a5833: A composite foreign key is no longer split into soft FKs whose targets repeat (#4534).

  MJ models a foreign key as one column, so `additionalSchemaInfo.json` wrote a composite key as one soft FK per column pair. Usually only one of those targets is unique on its own. For the others, a join on that column alone multiplies the rows of the generated base view. Now:
  - The constraint name is kept on each introspected foreign key column (`ForeignKeyReference.constraintName`), so the columns of a composite key stay grouped.
  - A column pair of a composite key is written only when its target is the target table's only primary key column, or has a unique, unfiltered single-column index. The other pairs are left out rather than guessed.
  - The rule applies whichever source proposed a pair: introspection, a discovery pass, or the LLM confirming the constraint, which it does. A foreign key from one of those columns to a different, real target is kept.
  - A constraint whose pairs repeat a source column is the N × N cross product that the PostgreSQL driver read before #5872, and none of its pairs is written: the right pairing is unknown, and pairs to the unique target would otherwise pass. Re-introspect such a state file with a fresh `dbdoc analyze`; re-exporting it does not recover the key.
  - Single-column foreign keys, and state files written before constraint names were recorded, are unchanged.

- 6e93bd9: Fix: relationship discovery now uses each column's real row count. `GetColumnStatisticsForDiscovery` ignored the full-table count the drivers return and estimated it instead:
  - **No nulls:** the estimate was `nullCount + distinctCount`, which equals the distinct count. Every non-null column looked 100% unique, however many duplicates it had.
  - **With nulls:** the estimate was `nullCount / nullPercentage`, but `nullPercentage` is a 0–100 percentage, so the row count came out near 0.

  PK uniqueness checks and FK null-percentage and orphan estimates now see the true counts. This can change discovered keys.

  The row-count bug was hiding a second one: an LLM-proposed primary key was accepted only if **every column was 100% unique on its own**. That rule is wrong for composite keys like `(ProductID, StartDate)` and only passed because every non-null column looked unique. Composite proposals now require each column to have no nulls and the **combination** to be unique, checked in the database (`checkColumnCombinationUniqueness`). Single-column proposals are unchanged. The gate moved to `CheckPKProposal` (`core/PKProposalGate.ts`), and `AnalysisEngine` takes an optional driver for the check.

- 766eabc: DBAutoDoc for large databases:
  - `export --erd-mode clusters` draws the schema as hub-centred subject areas, one Mermaid diagram per area, for databases too large for a single ERD (Mermaid refuses sources above ~50,000 characters). Reference tables are listed beside each diagram instead of drawn, large areas are paginated, and `documentation.html` gains a Subject Areas section linking to them. Thresholds and manual overrides (`hubs`, `lookupTables`, `excludeTables`) live in `config.json` under `output.erd` and can be overridden per run by the new `--erd-*` flags, which `mj dbdoc export` passes through. The Mermaid generator also gains a `columns` option (`all`, `keys`, `none`).
  - `analyze --skip-sampling` (and `analysis.skipSampling`) skips the table data sampling pass. Sampling reports per-table progress, saves state every 25 tables, and a `--resume` samples only the tables that have no statistics yet, so an interrupted pass on a large database continues where it stopped. Organic-key detection is skipped with a warning when no table carries column statistics, since its cardinality gate needs them; a resume of a previously sampled run keeps its statistics and still runs it. A sampling pass with failed tables records `partial` rather than `completed` in `state.json`, and the subject-area planner warns about any area left below `minClusterSize`.
  - `seedContext.file` / `seedContext.files` read one or more context documents into `customInstructions`; a file that cannot be read is reported by setting name. `ai.model` is trimmed.

- 29013dc: DBAutoDoc now reads each table's existing indexes during introspection, stores them in the state file (`tables[].indexes`), and shows them to the LLM as evidence for keys. Databases often have indexes where no primary or foreign key is declared.
  - The discovery validation, table analysis, and PK and FK pruning prompts get an "Existing Indexes" section. FK pruning also says whether each candidate's target column has a unique index.
  - On by default; turn off with `analysis.useExistingIndexes: false`. Resumed runs read indexes for tables that don't have them yet. A schema whose catalog can't be read is skipped with a warning.
  - New `Introspector.LoadIndexes(schemas)` and index-hint helpers (`BuildIndexHints`, `FormatIndexHint`, `IsUniquelyIndexed`, `AttachIndexesToTables`).

- 426af00: Fix: the discovery-phase LLM validator now actually calls the model. It created its LLM using the raw provider name (`'gemini'`) as the class key, but drivers are registered under their class name (`'GeminiLLM'`). It got a bare `BaseLLM`, and every validation call failed with `this.nonStreamingChatCompletion is not a function`. It now uses `CreateLLMInstance` like the rest of DBAutoDoc. `CreateLLMInstance` also throws when the provider's driver isn't registered, instead of returning a bare `BaseLLM`. Turning validation on can change discovered keys.
- 7cb8e8f: The PostgreSQL driver reads foreign keys correctly and its value-overlap check runs.
  - **Composite foreign keys are paired by position (#4531).** Foreign keys were read by joining `information_schema.key_column_usage` to `constraint_column_usage` on the constraint name, and neither view says which source column pairs with which referenced column. A 3-column composite key came back as 9 pairs, and every pair reached `additionalSchemaInfo.json`. The driver now reads `pg_constraint` and pairs `conkey[i]` with `confkey[i]`, as MJ's own `vwForeignKeys` does.
  - **Cross-schema foreign keys are kept.** The same query joined `constraint_column_usage` on the source table's schema, but that view's `table_schema` is the referenced table's schema, so every foreign key into another schema was dropped.
  - **A foreign key into a partitioned table is read once.** PostgreSQL also stores an internal copy of such a constraint for each partition. Those copies are skipped, so the key is not read once more per partition. A partition of a partitioned referencing table still keeps the foreign key it inherits.
  - **The value-overlap check runs.** `testValueOverlap` put `ORDER BY RANDOM()` on a `SELECT DISTINCT`, which PostgreSQL rejects. The error came back as 0% overlap, and the FK detector's 75% overlap gate rejected every statistically found foreign key, so on PostgreSQL every foreign key came from the LLM unchecked. The sample is now a plain `DISTINCT … LIMIT`, as on SQL Server (randomising would sort every distinct value per FK candidate), both sides are compared as text so a key stored as text can be checked against a `uuid` column, and a failed check is logged instead of being silently reported as 0%.

- 217bba3: Value lists in `additionalSchemaInfo.json` are checked against the data before they are emitted (#4537).
  - **Verdicts only for candidates.** The table-analysis prompt asked for a value-list verdict only on enum candidates, but any verdict the model returned was kept. A verdict now counts only when its column passes the enum candidate gate, both when it is recorded and when it is exported, so re-exporting an older state file is cleaned too. User-approved columns are exported as approved.
  - **No invented values.** A verdict's values are cut down to the values observed in the column. A verdict with fewer than two observed values left is dropped. Table sampling now keeps each low-cardinality column's full value distribution on its statistics, so "observed" means every distinct value, not the 20-row random sample.
  - **More columns excluded from the gate.** MJ's own `__mj_*` columns, audit columns naming who wrote a row (`CreatedBy`, `cst_add_user`, …), and columns whose values are all years, GUIDs or dates.
  - **Open lists unless a user closes them.** A list inferred from data is emitted as `ListOrUserEntry`, since the data cannot show that no other value is allowed. `List` is kept only when a user approved the column. A CHECK constraint does not close it either: CodeGen builds the closed list from a value-list CHECK itself, and a CHECK that is not a value list (e.g. `Status <> ''`) allows values the data does not hold.
  - **String columns can be candidates again.** The drivers report bare type names (`varchar`, `nvarchar`) and keep the length separately, and `Database.ts` dropped that length. So the gate saw every varchar/nvarchar column as unbounded, and no string column was ever a candidate: every value list came from model verdicts on non-candidates. Columns now carry `maxLength` (declared characters; the SQL Server driver converts `nchar`/`nvarchar` bytes to characters), and the gate reads it when the type string has no length.

- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [2274f42]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [4e4c82d]
- Updated dependencies [ce758af]
- Updated dependencies [72dd65c]
- Updated dependencies [e38710c]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- df30e5c: DBAutoDoc gets a plugin system, and its first built-in plugin, the Index Advisor, which proposes missing indexes and exports them as a SQL migration.
  - **Plugins.** A plugin is a class registered with `@RegisterClass(BaseAutoDocPlugin, '<Name>')` and enabled in the new `plugins` config section. External plugins load at startup from an npm package or file path (`Module`). Hooks run at six points of an analysis (`OnPreRun`, `OnAfterIntrospection`, `OnAfterDiscovery`, `OnAfterDescriptions`, `OnAfterPruning`, `OnPostRun`, the last with the database connection still open), in `Priority` order. A hook that throws is logged and recorded, and the run continues. Each plugin keeps its run history and data in `state.plugins.<Name>`. Built-in plugins run by default and can be turned off with `Enabled: false`. An unregistered plugin name fails the run at startup. With no plugins enabled, runs write the same state files as before.
  - **Plugin export formats.** `db-auto-doc export --format <name>` (repeatable) runs a plugin's exporter; `--list-formats` lists them, `--provider` overrides the platform, and `--file-prefix` overrides a format's file-name prefix.
  - **Index Advisor (built-in, on by default).** At the end of a run it reads existing indexes on every analyzed schema (new `GetIndexes(schemaName)` on the SQL Server, PostgreSQL and MySQL drivers). It proposes indexes for foreign keys with no index starting with them (declared, or discovered and confirmed at `KeyMinConfidence`, default 90) and for confirmed discovered primary keys. It skips tables under `MinRowCount` (default 1000) and poor leading keys. It flags redundant indexes (report only, never dropped). An LLM review (`LLMReview`, default on; up to `MaxLLMTables` tables, default 40; model override key `indexAdvisor`) can keep, drop, modify or add proposals, using column statistics, descriptions, existing indexes and sample queries. The model returns structured decisions, never SQL, and every change is validated. The advisor never changes the database.
  - **Index migration export.** `export --format index-migration` writes `V<yyyyMMddHHmm>__dbautodoc_indexes.sql`:
    - SQL Server: `CREATE NONCLUSTERED INDEX`, guarded by `IF NOT EXISTS`.
    - PostgreSQL: `CREATE INDEX CONCURRENTLY IF NOT EXISTS` by default, plus a Flyway `.sql.conf` with `executeInTransaction=false`. Skyway 0.6.x runs every migration in a transaction, so apply a CONCURRENTLY migration with `psql` or Flyway, or set `Concurrently: false`.
    - MySQL: `CREATE INDEX`.
    - PostgreSQL index names always end in a hash of the exact table and columns, because PostgreSQL requires index names to be unique per schema and the readable part can collide (`Order.Line_ID` and `Order_Line.ID`).
    - Each index's reason is written on one comment line, so multi-line text from the LLM or a column name can't end the comment and run as SQL.
  - **State file.** `state.database.provider` now records the platform a run connected to (absent in older state files).
  - **Fix: MySQL login.** The MySQL driver overrode `mysql_native_password` and `caching_sha2_password` with handlers that sent an empty password, so every password-protected MySQL 8 connection failed ("using password: NO"). The override is removed; `mysql2` handles both methods itself.
  - **Default model.** New configs (`init`, and the built-in default) use `gemini-3.8-flash`, replacing `gemini-3-flash-preview`. Existing config files keep the model they name.

- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [8bac4d6]
- Updated dependencies [c0ebd97]
- Updated dependencies [7dc604e]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [22c9074]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
- Updated dependencies [513e608]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [2ceedb4]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [a50948e]
- Updated dependencies [15a4333]
- Updated dependencies [48f77ea]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- 3062639: DBAutoDoc now writes detected transitive bridge views in the analyzed database's SQL dialect.

  The bridge-view body DBAutoDoc emits into additionalSchemaInfo (`TransitiveView.SQL`) was always
  bracket-quoted SQL Server syntax, and CodeGen executes that body verbatim — so organic keys detected
  on a PostgreSQL database produced a bridge view PostgreSQL could not create. Identifiers are now
  quoted per `database.provider`: brackets on SQL Server (unchanged), double quotes on PostgreSQL and
  Oracle, backticks on MySQL. On PostgreSQL the quoting also preserves mixed-case names, which would
  otherwise fold to lower case and stop matching the catalog. Companion to the CodeGen fix for #4409.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [b87e4ac]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- 80fcb61: Memory/resource leak fixes surfaced by the Round 13 audit: drain previously-discarded `fetch()` response bodies at six call sites (BlackForestLabs, IntegrationDiscoveryResolver's webhook sender, WebPageContentAction's content-too-large guard, the React runtime's external component registry client, and RuntimeSchemaManager's restart poll) so undici no longer pins keep-alive connections; bound `RemoteBrowserActionResolver`'s process-lifetime screencast/audio-stream idempotency maps with a TTL sweep so a crashed or disconnected session no longer leaks a permanent entry; add missing SQL connection-pool `'error'` listeners (ComponentRegistry's server, DBAutoDoc's three drivers) and close DBAutoDoc's connection pool on its error path so a failed analysis run no longer leaves it open for the rest of the CLI process.
- Updated dependencies [834f8d7]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [c996a56]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [ada8784]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [97cbf5f]
- Updated dependencies [b46330e]
- Updated dependencies [8b78695]
- Updated dependencies [cdd25c0]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [512bb53]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [ac96bb6]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/server-bootstrap-lite@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [7fcdc2d]
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- 80fcb61: Memory/resource leak fixes surfaced by the Round 13 audit: drain previously-discarded `fetch()` response bodies at six call sites (BlackForestLabs, IntegrationDiscoveryResolver's webhook sender, WebPageContentAction's content-too-large guard, the React runtime's external component registry client, and RuntimeSchemaManager's restart poll) so undici no longer pins keep-alive connections; bound `RemoteBrowserActionResolver`'s process-lifetime screencast/audio-stream idempotency maps with a TTL sweep so a crashed or disconnected session no longer leaks a permanent entry; add missing SQL connection-pool `'error'` listeners (ComponentRegistry's server, DBAutoDoc's three drivers) and close DBAutoDoc's connection pool on its error path so a failed analysis run no longer leaves it open for the rest of the CLI process.
- Updated dependencies [2c826f7]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [cdd25c0]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [512bb53]
- Updated dependencies [1748491]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [ac96bb6]
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [8b78695]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [00a2483]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [a1a8989]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [07cb22e]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/server-bootstrap-lite@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/server-bootstrap-lite@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- dd04a24: Widen the zod pin from `~3.24.4` to `^3.25.0` so it satisfies `@modelcontextprotocol/sdk`'s peer requirement (`zod ^3.25 || ^4.0`). The old tilde pin has no overlap with the SDK's peer range, which breaks strict package managers (pnpm) and MJCLI's oclif manifest generation under strict installs. zod 3.25.x keeps the classic v3 API at the root import, so this is a version-range correction with no behavior change.
- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/server-bootstrap-lite@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [6c910ef]
- Updated dependencies [42a680a]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/server-bootstrap-lite@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/server-bootstrap-lite@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/server-bootstrap-lite@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/server-bootstrap-lite@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/server-bootstrap-lite@5.45.1
- @memberjunction/ai@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/server-bootstrap-lite@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [2f9b863]
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/server-bootstrap-lite@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/server-bootstrap-lite@5.43.0

## 5.42.0

### Patch Changes

- 63d7610: App-level PostgreSQL support (code-only — no schema/metadata changes):
  - **open-app-engine**: `mj app install/upgrade/remove` now work on PostgreSQL — the CLI orchestrator
    builds a `PostgreSQLDataProvider` when `dbPlatform=postgresql` (was hardcoded to SQL Server), and
    the installer selects the platform-specific migration directory (`<dir>-pg` / `migrations.directoryPostgres`)
    so PG apps run plpgsql migrations instead of T-SQL.
  - **db-auto-doc**: dialect-aware description write-back — emits PostgreSQL `COMMENT ON` statements
    (double-quoted identifiers, no `sp_addextendedproperty` / `GO`) when the configured provider is postgresql.

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/server-bootstrap-lite@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
  - @memberjunction/core@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/server-bootstrap-lite@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- 3da89ef: Add configurable CORS origins and opt-in rate limiting to MJ Server, add client-side permission evaluation for component artifacts, and fix CI publish failures in light-command and db-auto-doc bootstrap
  - @memberjunction/server-bootstrap-lite@5.40.2
  - @memberjunction/ai@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/server-bootstrap@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/server-bootstrap@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/server-bootstrap@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0

## 5.38.0

### Patch Changes

- 275afda: DBAutoDoc organic-key detection + PR #2193 per-column normalization:
  - **Organic-key detection phase** in DBAutoDoc's analyze pipeline (optional, off by default): prefilter → per-table LLM normalize (business-space descriptions + concept names + per-column normalization strategy + organic-key gate) → embed → agglomerative cluster → concept-name split → FK-graph transitive bridges → emit to `additionalSchemaInfo.json`. Runs on MemberJunction's AI infrastructure (`BaseLLM` / `BaseEmbeddings` via the ClassFactory), no standalone provider clients.
  - **Per-column normalization**: each emitted `EntityOrganicKey` carries its own normalization function for its column, so a cluster of differently-formatted columns (e.g. phone numbers across systems) each canonicalize to a shared form. Runtime (`EntityInfo.BuildOrganicKeyViewParams`) applies each side's own expression at match time, looking up the spoke entity's organic key by name.

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/server-bootstrap@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [464f30c]
- Updated dependencies [4f15f31]
  - @memberjunction/server-bootstrap@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [1c0fce9]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/server-bootstrap@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/server-bootstrap@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/server-bootstrap@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/server-bootstrap@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- 8836d2d: Add enum/value-list detection for databases without CHECK constraints — deterministic pre-filter gates identify candidate columns, LLM verdicts are emitted in additionalSchemaInfo Fields[], and CodeGen consumes them to populate EntityFieldValue rows (patch)
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/server-bootstrap@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/server-bootstrap@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/ai@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/server-bootstrap@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/server-bootstrap@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [366e646]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/server-bootstrap@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [5c7a57f]
- Updated dependencies [e02e24e]
  - @memberjunction/server-bootstrap@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/server-bootstrap@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/server-bootstrap@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/server-bootstrap@5.27.0
- @memberjunction/ai@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/server-bootstrap@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/server-bootstrap@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/server-bootstrap@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/server-bootstrap@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/server-bootstrap@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/server-bootstrap@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/server-bootstrap@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/server-bootstrap@5.19.0
- @memberjunction/ai@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/server-bootstrap@5.18.0
- @memberjunction/ai@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [ecf8b77]
- Updated dependencies [9881045]
  - @memberjunction/server-bootstrap@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/server-bootstrap@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/server-bootstrap@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/server-bootstrap@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [9474e4a]
- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/server-bootstrap@5.13.0
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/server-bootstrap@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ai-provider-bundle@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai@5.10.1
- @memberjunction/ai-provider-bundle@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/ai-provider-bundle@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/ai-provider-bundle@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ai-provider-bundle@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-provider-bundle@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ai-provider-bundle@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ai-provider-bundle@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai@5.4.1
- @memberjunction/ai-provider-bundle@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/ai-provider-bundle@5.4.0
- @memberjunction/ai@5.4.0
- @memberjunction/core@5.4.0
- @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai@5.3.1
- @memberjunction/ai-provider-bundle@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/ai-provider-bundle@5.3.0
- @memberjunction/ai@5.3.0
- @memberjunction/core@5.3.0
- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core@5.2.0
  - @memberjunction/ai-provider-bundle@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/ai-provider-bundle@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/ai-provider-bundle@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
- Updated dependencies [3bab2cd]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-provider-bundle@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai@4.3.1
- @memberjunction/ai-provider-bundle@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/ai-provider-bundle@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai@4.2.0
- @memberjunction/ai-provider-bundle@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- 77839a9: Enable cascade deletes for AI Agent and Prompt entities, add cross-file dependency detection and --delete-db-only flag to MetadataSync for proper deletion ordering, fix CodeGen duplicate variable names for self-referential FKs, add requireConnectivity config to QueryGen, and add Gemini JSON parser support to DBAutoDoc.
- 9fab8ca: ESM Compatibility
- Updated dependencies [77839a9]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/ai-provider-bundle@4.1.0
  - @memberjunction/ai@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-provider-bundle@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values
- Updated dependencies [d596467]
- Updated dependencies [a3961d5]
  - @memberjunction/ai-provider-bundle@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ai-provider-bundle@3.3.0
- @memberjunction/ai@3.3.0
- @memberjunction/core@3.3.0
- @memberjunction/global@3.3.0

## 3.2.0

### Minor Changes

- 454d2dd: Add new AI providers and set Gemini as default

### Patch Changes

- @memberjunction/ai-provider-bundle@3.2.0
- @memberjunction/ai@3.2.0
- @memberjunction/core@3.2.0
- @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai@3.1.1
- @memberjunction/ai-provider-bundle@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai@3.0.0
- @memberjunction/ai-provider-bundle@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-provider-bundle@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-provider-bundle@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-provider-bundle@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- 8884553: Complete v3.0 auth abstraction with MSAL token refresh, add Vertex AI support to DBAutoDoc, and fix Run Suite button in tab mode
  - @memberjunction/ai@2.130.1
  - @memberjunction/ai-provider-bundle@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-provider-bundle@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-provider-bundle@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
- Updated dependencies [5f70858]
  - @memberjunction/core@2.128.0
  - @memberjunction/ai-provider-bundle@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/ai@2.127.0
  - @memberjunction/ai-provider-bundle@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai@2.126.1
- @memberjunction/ai-provider-bundle@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- eae1a1f: Add Phase B component linter fixtures, reorganize test structure, refactor financial analytics components, and fix OpenEntityRecord event propagation in artifacts and collections
- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-provider-bundle@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/ai-provider-bundle@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/ai-provider-bundle@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai@2.123.1
- @memberjunction/ai-provider-bundle@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ai-provider-bundle@2.123.0
- @memberjunction/ai@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
  - @memberjunction/ai-provider-bundle@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/ai-provider-bundle@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
  - @memberjunction/ai-provider-bundle@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
- Updated dependencies [a2bef0a]
  - @memberjunction/ai@2.121.0
  - @memberjunction/ai-provider-bundle@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- @memberjunction/ai@2.120.0
- @memberjunction/ai-provider-bundle@2.120.0
- @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- ed2394c: Add sample query generation feature with configurable maxTokens and maxTables options, fix config validation errors for commands that don't need database connection, and update DBAutoDoc documentation
  - @memberjunction/ai@2.119.0
  - @memberjunction/ai-provider-bundle@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- a2901ff: migration
- a49a7a8: migration

### Patch Changes

- @memberjunction/ai@2.118.0
- @memberjunction/ai-provider-bundle@2.118.0
- @memberjunction/global@2.118.0
