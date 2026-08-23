# @memberjunction/postgresql-dataprovider

## 6.1.0-edge.3

### Patch Changes

- 07cb22e: Fix `$`-sequence corruption in `String.prototype.replace` calls carrying runtime data (#3171).

  `replace(search, replacement)` treats `$$`, `$&`, `` $` ``, `$'` and `$1`–`$99` as metacharacters when `replacement` is a **string**. Every site below passed runtime data there, so a `$` in that data was silently executed rather than inserted. The `$&`/`` $` ``/`$'` forms are worse than value corruption: they splice surrounding text _into_ the value. All are fixed by passing a replacement **function**, whose return value is used literally.
  - **`@memberjunction/installer` — corrupted secrets (highest impact).** Re-running `mj install` syncs the root `.env` into MJAPI's. A DB password containing `$&` had the _stale_ MJAPI password spliced into it; ``$` `` spliced in the preceding `.env` line. The result was a wrong secret written to disk with no error, surfacing later as "MJAPI can't connect". Only the replace branch was affected — fresh installs (append branch, string concatenation) were always correct, which is why this survived. Also fixes the `newUserSetup` block (embeds user name/email) and the `mjRepoVersion` and Explorer `environment.ts` patchers.
  - **`@memberjunction/core` — rewritten RLS predicates.** `RowLevelSecurityFilterInfo.MarkupFilterText` substitutes user properties, magic-link scope and `{{Acting*}}` tokens into row-level-security filters. A `$` in any of them rewrote the predicate — the exact outcome the neighbouring `'`-escaping exists to prevent. This feeds `GetEffectiveRowFilterWhereClause`, used across RunView reads, Create and Update. Also fixes organic-key `Custom` normalization, which builds a SQL `WHERE` from a data value.
  - **`@memberjunction/generic-database-provider`, `@memberjunction/postgresql-dataprovider`** — end-user search terms substituted into `UserSearchParamFormatAPI` predicates, plus view-template inner SQL and PG identifier quoting. Also `QueryCompositionEngine.renameSQLIdentifier`, which rewrites CTE identifiers in composed queries: the search side was regex-escaped but the replacement side was not, so a `$` in a deconflicted CTE name (SQL Server bracketed and PG quoted identifiers both permit one) was expanded into the executed SQL.
  - **`@memberjunction/ai-prompts`, `@memberjunction/computer-use`, `@memberjunction/ai-vector-sync`, `@memberjunction/aiengine`, `@memberjunction/ai-agents`** — assistant prefill text (routinely contains `$$` for LaTeX or currency), computer-use goals/URLs/step summaries, embedding-document field values, and entity field values, all interpolated into prompts and templates.
  - **`@memberjunction/metadata-sync`** — parameter values in the debug SQL log.
  - **`@memberjunction/testing-engine`** — test input/expected/actual values into the LLM-judge prompt, and parameter values into `SQLValidatorOracle`'s generated SQL.
  - **`@memberjunction/sql-converter`** — the configured schema name substituted into emitted PostgreSQL view SQL, in both `ViewRule` and its previously-missed twin in `InsertRule`. The schema is now escaped on the _search_ side too: a `$` in it acted as an end-anchor, so the pattern matched nothing and the conversion silently emitted no rewrite.
  - **`@memberjunction/sql-parser`** — `restoreAliases` swaps generated aliases back to the caller's original bracketed identifiers. Two of its three branches used `split`/`join` and were already safe; the third expanded `$`-sequences, so `[a$'b]` spliced surrounding SQL into an identifier. The aliasing path fires precisely _because_ an identifier contains a non-word character, so the input that triggers aliasing is the input that corrupted the restore. Reached from the public `ToSQL()`.
  - **`@memberjunction/sqlserver-dataprovider`** — batch execution rewrites `@name` placeholders to `@q<N>_name`; the parameter name went into the `RegExp` unescaped, so a `$` in it prevented the rewrite entirely and mssql failed with "Must declare the scalar variable". Sibling of the PostgreSQL `escapeRegExp` fix below.
  - **`@memberjunction/react-linter`** — component data substituted into diagnostic messages.
  - **`@memberjunction/actions-bizapps-social`, `@memberjunction/ai-cli`** — hardened a numeric-only site; documented the AICLI JSON highlighter's `$1` back-references as intentional.

  Also fixes a **test-tooling safety defect** found while verifying the above on a clean database: `@memberjunction/testing-cli` loaded `.env` with `dotenv.config({ override: true })`, so a variable already set in the environment was overwritten. `DB_DATABASE=MJ_scratch mj test …` was silently discarded and the suite ran — **including mutation tests** — against whatever `.env` pointed at. That made the "one database per agent" rule unenforceable by environment variable and diverged from every other `mj` command (`migrate`, `codegen`, `sync push` all honour the environment). `override` is now dotenv's default `false`, so `.env` still fills in anything unset but an explicit value wins. Guarded by a unit test. **Note the inverse hazard when upgrading:** any environment that exports `DB_*` globally — a Docker image, a CI container, a stale `export` in a shell profile — now wins over `.env`, where `.env` used to be authoritative. If a `mj test` run suddenly targets an unexpected database, check the exported environment first; the CLI prints `config.dbDatabase: <name>` at startup.

  And an adjacent defect found while testing the above: `PostgreSQLDataProvider.quoteFieldNamesInToken` interpolated a field name into a `RegExp` **without escaping regex metacharacters**, so a column named `a.b` matched (and wrongly quoted) unrelated text like `axb`, and a column containing `$` was never matched at all — which had also made the replacement-side fix on that line unreachable. Field names are now escaped before interpolation.

  Also adds `.github/scripts/check-dynamic-replace.mjs`, a CI gate that flags `.replace()`/`.replaceAll()` whose replacement is neither a string literal nor a function. No existing lint rule covered this — the React `string-replace-all-occurrences` rule only ever inspects the _search_ argument. The gate is line-aware (only lines a change touches), since ~100 pre-existing sites remain and a bare identifier holding a function reference is indistinguishable from one holding a string; `--all` is available for auditing. Regression tests now push `$$`, `$&`, `` $` ``, `$'` and `$1` through each fixed path.

  Also fixes a **silently inert security check** found while verifying the above. `BaseTestDriver.Provider` fell back to `new Metadata() as unknown as IMetadataProvider`. `Metadata` is a facade that proxies a hand-maintained subset of members to the global provider, not a provider itself, and the cast is the only reason the compiler accepted it. Members it does not proxy read `undefined` — `RowLevelSecurityFilters` among them. The integration suite's `discoverTokenFilter` reads exactly that property to find a `{{UserID}}`-scoped filter, so it always found none: the `rls-isolation` RLS1/RLS2 token-substitution checks skipped-as-pass **on every database**, while the bundle reported green. There were 13 filters present, 5 of them `{{UserID}}`-scoped. The fallback now returns the global provider, which is what the getter's own doc comment always promised, and both checks now execute. A new `rls-isolation` check (RLS11) additionally pushes `$$`, `$&`, `` $` ``, `$'` and `$1` through a substituted user property and executes the resulting predicate, so the RLS half of this fix has live coverage rather than unit coverage alone.

- 1fdd5d0: Fix PostgreSQL identifier quoting for column names that collide with SQL keywords, and consolidate the two divergent tokenizers into one shared implementation.

  **The defect.** PostgreSQL identifier auto-quoting used a keyword denylist matched case-INsensitively: a PascalCase word was quoted unless it appeared in a hardcoded keyword set. The set of SQL keywords and the set of MJ column names overlap, so every name in the intersection was emitted unquoted, folded to lowercase on PostgreSQL, and failed with `column "..." does not exist`. Eleven such columns ship in the baseline schema — `Name` (on 175 tables), `Values` (the field-level-encrypted column on `__mj."Credential"`), `Length`, `Precision`, `Log`, `Rank`, `Action`, `Columns`, `Language`, `Month`, and `Text`. SQL Server resolves identifiers case-insensitively, so T-SQL-first authoring never surfaced any of it; the failures only appeared on live PostgreSQL deployments. Addresses MJ #3604, #3590, #3691.

  **The fix.** Keywords are now matched **case-sensitively, in their ALL-CAPS form only**. This generalizes a mechanism that already existed for exactly two words (`TYPE` and `DATA`, which were special-cased by hand for the same reason) to the whole keyword set. Dialects always emit keywords upper-case, so the keyword spelling and the column spelling are textually distinct: `TEXT` is the type, `Text` is the column. Critically, an ALL-CAPS word that is _not_ a keyword is still an identifier — `ID` and `URL` are all-caps by nature, so the rule is `!(isAllUpper && isKeyword)`, not a pure case rule. `SELECT Length, LENGTH(Name)` now correctly yields `SELECT "Length", LENGTH("Name")`.

  **Structural change.** There were two copies of the tokenizer — one in `PostgreSQLCodeGenProvider.quoteSQLForExecution` (all codegen-time SQL, via `ManageMetadataBase.qsql()`) and one in `PostgreSQLDataProvider.autoQuoteIdentifiers` (every runtime raw-SQL statement, via `ExecuteSQL`) — with a comment instructing that they be kept in sync by hand. They had already diverged: 289 keywords versus 312, plus a case-sensitive tier and a dot-qualified-identifier rule present only at runtime. Both now delegate to `AutoQuotePostgreSQLIdentifiers` in `@memberjunction/sql-dialect`, which carries the union of both keyword sets. Two consequences worth noting: codegen-time SQL gains the dot-qualification rule, so `__mj.vwFoo` no longer folds to lowercase during codegen; and runtime gains the transaction-control keywords (`CONSTRAINTS`, `IMMEDIATE`, `DEFERRED`, `SAVEPOINT`, `RELEASE`) that previously existed only in the codegen copy.

  **Compatibility.** A word immediately followed by `(` is treated as a function call and left unquoted, unless it is dot-qualified. Without this, mixed-case function spellings that used to work (`Coalesce(`, `IsNull(`) would have broken under case-sensitive matching; it additionally fixes ALL-CAPS functions that were simply missing from the keyword set (`JSONB_BUILD_OBJECT(` was previously quoted, and failed). The dot exception preserves quoting for MJ's own stored procedures, which are created with quoted mixed-case names.

  Separately, a small tier of structural words stays case-insensitive so SQL authored **outside** this repository keeps parsing — a stored `MJ: Queries` body, a saved `UserView.WhereClause`, a GraphQL `ExtraFilter`, none of which this change can reach and fix. It is the predicate vocabulary only: `AND OR NOT IS NULL LIKE ILIKE IN BETWEEN EXISTS ASC DESC NULLS FIRST LAST`.

  The reverse lookup that recognizes the _follower_ of a contextual pair declines to pair with a key that is dot-qualified or already quoted, and refuses to read backwards across a `--` comment. Both make it the true mirror of the forward lookup: without the first, `t.Order By Name` produced a different result on a second pass, violating the module's stated `f(f(x)) === f(x)`; without the second, a comment line ending in the word `order` left a real column named `By` on the next line unquoted.

  A second, **contextual** tier covers the two-word clause forms without giving up column names: `Order`/`Group` are structural only before `By`, and `Left`/`Right`/`Full`/`Inner`/`Cross`/`Outer` only before `Join`/`Outer`. Both halves of a matched pair are recognized, and it chains through `Full Outer Join`. Everywhere else they are ordinary identifiers, so `SELECT Order FROM …` and `Left(Name, 3)` both still work.

  **A dot-qualified word is an identifier**, checked before the structural and contextual tiers. No SQL dialect has a _structural_ keyword after a `.`, so this makes it impossible for a word added to those sets to fold a legitimate `alias.Column`.

  The ALL-CAPS keyword tier is the one exception, and it is deliberately evaluated first. Several entries exist _specifically_ for their dot-qualified form — `INFORMATION_SCHEMA.COLUMNS`, `.TABLES`, `.ROUTINES` — and the catalog's real relation names are lower case, so quoting the right-hand half yields `INFORMATION_SCHEMA."COLUMNS"`, which does not resolve. CodeGen executes that exact SQL through `qsql()` on every PostgreSQL run (`manage-metadata.ts`, three call sites, two of them unconditional), so an unconditional dot rule turns a working CodeGen run into a hard failure. Because tier 1 is case-SENSITIVE it cannot swallow a real column: `Case` is not `CASE`, so `e.Case` still falls through to the dot rule and quotes. Verified against the newest PostgreSQL baseline — the only ALL-CAPS columns in the shipped schema are `ID, URL, URI, ISO2, ISO3, SQL, BCMID, ISO3166_2`, none of them keywords.

  **Known limitation, deliberately not fixed.** Mixed-case clause keywords beyond the predicate vocabulary do not survive: a stored query body written `Select … From … Where …` fails on PostgreSQL. Widening the case-insensitive tier to the full clause skeleton was tried and reverted. That tier is evaluated case-insensitively, so adding `CASE`/`END`/`LIMIT`/`OFFSET` made those unquotable as column names — reintroducing, for 20 words, exactly the defect class this change eliminates. And it did not even work: `Cast(Amount As Decimal)`, `Insert Into Target (Name)` and `Select Top 10` all still failed, because mixed-case SQL needs a parser rather than a bigger denylist. The failure is a loud syntax error, not silently wrong rows, and rewriting the keywords in upper case fixes it.

  A CI test derives every column name from the newest shipped PostgreSQL baseline's `CREATE TABLE __mj."…"` blocks and fails the build if one collides with the case-insensitive tier. Its scope is exactly that — core-schema columns as of the last baseline; columns added by later migrations, and non-`__mj` schemas, are not covered by it. That scope is adequate for a tier this small (no predicate-vocabulary word can be a column name in any schema) and would not have been for the reverted widening.

  **Comments, template tags and literal prefixes.** The tokenizer is a parity machine, and three regions it did not recognize could invert that parity for the rest of a statement. `--` and (nesting) `/* */` comments are now skipped — an apostrophe inside a comment used to open a string-literal scan that ran to the _opening_ quote of the next real literal, after which literals and code swapped roles. Against this repository's own shipped query SQL that rewrote literal **values**: `WHERE ars."StepType" = 'Prompt'` became `= '"Prompt"'` (no rows), and the `jsonb_build_object` keys in `get-conversation-complete.pg.sql` became `'"ID"'` (JSON whose keys are `"\"ID\""`, so every consumer reading `.ID` got undefined) — all because line 10 of `calculate-ai-agent-run-cost.pg.sql` contains the word `doesn't` in a comment. Nunjucks tags (`{{ … }}`, `{% … %}`, `{# … #}`) are now skipped too, since the names inside them are query PARAMETER names matched exactly at render time and `{{ "ConversationID" | sqlString }}` never substitutes. `E'…'` / `N'…'` / `U&'…'` literal prefixes are recognized as part of the literal rather than tokenized as a word (previously `"E"'…'`), with backslash escapes honoured for the `E` form only. An unterminated `{{`/`{%` now emits its delimiters and resumes scanning rather than consuming the rest of the statement, matching what the dollar-quote branch already did for a missing close tag.

  `""` inside an already-quoted identifier is now consumed explicitly as an escape. This one is **defensive, not a bug fix**: the previous code stopped at the first `"` and then immediately re-entered the same branch at the second, pushing each span verbatim, so the two partitions concatenated identically. Brute-forcing 600,000 inputs over an alphabet built from that construct produced zero differences in output. The explicit form is easier to reason about; nothing observable changed, and the "known limitation" note it replaces was describing a failure that never occurred.

  A test runs the tokenizer over every shipped `metadata/queries/SQL/*.pg.sql` and asserts that string literals and template tags come back byte-identical and that the pass is idempotent, using a literal scanner written independently of the implementation. A second suite covers the quoting-policy tiers directly — dot-qualified words, both halves of each contextual pair, the words that must still quote when their partner is absent, literal prefixes, and the unterminated-delimiter cases — because those decide keyword-vs-identifier and are the only ones whose mistakes can make a real column unreachable.

  **Behavior changes to be aware of.** Both `autoQuoteIdentifiers` and `quoteSQLForExecution` are public methods whose output changes: identifiers that were previously emitted bare are now quoted. Two specific cases are worth calling out. A mixed-case cast type now quotes — write `x::text` or `x::TEXT` rather than `x::Text`, since `Text` is a real column name and must quote. And `INSERT INTO Target(Cols)` with no space before the paren leaves the table name unquoted, because a bare word before `(` is indistinguishable from a call; the spaced form `INSERT INTO Target (Cols)` quotes correctly. A third case, added after review: a **column alias** that collides with a keyword now quotes, which changes the KEY a driver returns. `SELECT COUNT(*) AS Count` previously emitted `Count` bare and PostgreSQL folded the result key to `count`; it now emits `AS "Count"` and the key is `Count`. The same applies to `AS Name`, `AS Type`, `AS Rank` and `AS Value`. The new behaviour is the correct one — it matches the declared `QueryField` name — but a consumer reading the folded lowercase key will break. The only in-repo occurrence is `SQLServerCodeGenProvider.ts:1235`, which is not on this path; stored `Query.SQL` rows in consumer databases can carry such aliases.

  Note also that the compatibility claim below is about **fragments**, not full statements: a stored `UserView.OrderBy` / `ExtraFilter` fragment keeps working, but a complete statement written in Title Case (`Select Name From … Where …`) does not — its keywords quote and it fails. That form previously worked. It does not occur in this repository, and the fix would be worse than the problem, so it is documented rather than changed.

  Neither of the first two patterns occurs in this repository. Note the scope of that check: `autoQuoteIdentifiers` runs inside `ExecuteSQL`, so it also processes hand-written SQL originating in CONSUMER repositories (bizapps and client apps), which were not surveyed. Consumers carrying either spelling will see their output change. SQL Server output is unchanged — `SQLServerCodeGenProvider.quoteSQLForExecution` remains the identity function and shares no code with this path.

  **Coverage.** 404 tests across the package (87 on the shared tokenizer directly), plus delegation suites through both providers' real entry points (the codegen tokenizer had no test coverage at all before this). A CI test extracts all 4,616 column definitions from the shipped PostgreSQL baseline and asserts each one survives quoting, so a newly added colliding column fails the build instead of shipping. Both entry points are additionally proven end-to-end against a live PostgreSQL server, including a control assertion that the same SQL unquoted still fails.

- Updated dependencies [834f8d7]
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
- Updated dependencies [1fdd5d0]
- Updated dependencies [2741d46]
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
  - @memberjunction/generic-database-provider@6.1.0-edge.3
  - @memberjunction/sql-dialect@6.1.0-edge.3
  - @memberjunction/ai-vectordb@6.1.0-edge.3
  - @memberjunction/query-processor@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [e26c866]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
  - @memberjunction/generic-database-provider@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/query-processor@6.1.0-edge.2
  - @memberjunction/ai-vectordb@6.1.0-edge.2
  - @memberjunction/sql-dialect@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 0 of the unified workflow DAG engine program (plan: PR #3456) — retires three dead or superseded subsystems so the **Workflow** name is freed for the program's user-facing vocabulary, and so the task-graph engine isn't built alongside a parallel, non-functioning orchestration model.

  **Eleven tables dropped** — the Skip v1-era workflow schema (`Workflow`, `WorkflowRun`, `WorkflowEngine`), the Skip v1-era report artifact (`Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion`), the legacy `ScheduledAction` / `ScheduledActionParam` pair, and the report-era `OutputTriggerType`. All were verified dead or superseded: nothing outside generated code read the workflow tables, the `Reports` resource type named a `DriverClass` (`ReportResource`) that exists nowhere in the repo, and the legacy scheduled-action cron due-check is mathematically always-false so authored schedules could never fire.

  **Breaking — the report execution surface is gone.** `RunReport` was already marked `@deprecated` ("Reports are no longer supported... Interactive Components and Artifacts are replacements") and read `vwReports`, which this migration drops. Removed: `IRunReportProvider`, the `RunReport` class, `RunReportParams` / `RunReportResult`, `BaseEntity.RunReportProviderToUse`, `BaseAngularComponent.RunReportToUse`, `GraphQLDataProvider.GetReportData`, the `GetReportData` GraphQL query and `CreateReportFromConversationDetailID` mutation, and the `GET /reports/:reportId` REST endpoint. Accepted deliberately in the open v6 breaking-change window. Consumers should use Interactive Components and Artifacts.

  **Scheduled Actions are superseded by Scheduled Jobs, and the UI moved with them.** Contrary to the original plan's read, the entities were live authoring surface: four Knowledge Hub / AI dashboards created and read them. Those surfaces now author a `MJ: Scheduled Jobs` row of type **Action** — the same work, executed by `ActionScheduledJobDriver`, with the action and its parameters carried in the job's `Configuration` JSON rather than in child parameter rows. `ContentSource.ScheduledActionID` becomes `ContentSource.ScheduledJobID`. A shared `action-scheduled-job` helper in `ng-dashboards` owns the mapping so it isn't triplicated across surfaces.

  **Also removed:** the `@memberjunction/scheduled-actions` and `@memberjunction/scheduled-actions-server` packages (nothing depended on either), the `MJScheduledActionEntityExtended` subclass, the "coming soon" Scheduled Actions placeholder dashboard, and the Explorer report wiring (route, `TabService.OpenReport`, `NavigationService.OpenReport`, resource-type map entry, home-pin matcher, and the dashboard add-item Reports branch).

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/generic-database-provider@6.1.0-edge.1
  - @memberjunction/ai-vectordb@6.1.0-edge.1
  - @memberjunction/query-processor@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/sql-dialect@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/generic-database-provider@6.1.0-edge.0
  - @memberjunction/query-processor@6.1.0-edge.0
  - @memberjunction/ai-vectordb@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/sql-dialect@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-vectordb@6.0.0
  - @memberjunction/generic-database-provider@6.0.0
  - @memberjunction/query-processor@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/sql-dialect@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-vectordb@5.51.0
  - @memberjunction/generic-database-provider@5.51.0
  - @memberjunction/query-processor@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/sql-dialect@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/generic-database-provider@5.50.0
  - @memberjunction/query-processor@5.50.0
  - @memberjunction/ai-vectordb@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/sql-dialect@5.50.0

## 5.49.0

### Patch Changes

- 70113b1: Align the integrations framework — resolution overlay, EM/EFM lifecycle, sync locking, watermark backfill, and the U1–U5/U7/U10/U11 upstream defects.

  **Engine (`integration-engine`)**
  - U1: `IntrospectSchema`/creation-pipeline mappings propagate `undefined` PK/FK flags instead of coercing to `false` — a sample's silence can no longer wipe a declared primary key (`SourceFieldInfo.IsPrimaryKey/IsForeignKey` widened to optional).
  - Semantic overlay (`decideSemanticOverlay`): Description / DisplayName / IncrementalWatermarkField are external-wins-when-present, curated-fallback-when-silent (per-attribute overlay precedence).
  - Content-hash basis: the content-hash match/write covers MAPPED fields only — a newly-appearing custom key no longer forces a row rewrite. Custom-key candidates + sizing statistics are aggregated in-memory per sync (`SyncResult.CustomKeyStats`, `foldCustomKeyStats`, `inferColumnTypeFromStats`) and flow to the promotion callback regardless of row skips. **Operational note (one-time):** because the content-hash basis becomes mapped-only, the first sync after this deploys re-hashes and re-writes every overflow-carrying row exactly once — a bounded one-time load spike plus Record-Changes churn — after which stored hashes converge and steady-state (skip-unchanged) writes resume.
  - Maintenance lock (`AcquireMaintenanceLock`/`ReleaseMaintenanceLock`/`GetMaintenanceLock`): syncs refuse while a metadata refresh / schema evolution / RSU pipeline runs for the connection.
  - U3: live sync progress is monotonic under concurrency (`RatchetProgressSnapshot`).
  - U11: `IntrospectSchemaOptions.OnProgress` — determinate discovery progress (scanned/total).

  **Server (`server`)**
  - `IntegrationSchemaEvolution` is now the full re-resolution refresh: re-resolution → diff → removed objects' entity/field maps disabled (data kept) → changed objects' field maps reconciled + Pull watermarks reset (U10, backfills new columns) → new objects' tables created with entity maps born DISABLED (`autoEnableNewObjects` opts in) → RSU. Extended output: NewObjects/RemovedObjects/ChangedObjects/WatermarksReset.
  - `IntegrationApplyAll`/`ApplyAllBatch`: `UnselectedAction` ('disable' default) — objects absent from the selection get their entity + field maps disabled; re-selection re-enables both. First-ever apply defaults to a FULL sync.
  - U7: schedule creation is unique per (connection, job kind) — update-in-place instead of duplicates.
  - U5: boot-time assert when RSU's additionalSchemaInfo write path diverges from CodeGen's read path.
  - DAG exposure: `IntegrationListSourceObjects` items carry `DependsOn` parent names.
  - U11: RSU status/progress expose CurrentStepName/StepIndex/StepTotal; pipeline steps carry StepIndex/StepTotal.

  **SchemaEngine / schema-builder**
  - additionalSchemaInfo per-table REPLACE semantics for soft FKs (`ClearForeignKeysForTables`) — a refresh's resolution replaces the prior run's FK entries for its tables.
  - `RSUPendingWork`: `UnselectedAction` + `CreateDisabled` for the post-restart consumer; U11 step-index fields.

  **CodeGenLib / PostgreSQLDataProvider**
  - U2: `spUpdateExistingEntityFieldsFromSchema` honors `IsSoftPrimaryKey` on BOTH dialects (PG emitter + SQL Server migration) — schema sync no longer wipes resolved soft PKs.
  - U4: a keyless entity now throws a named "has no primary key" error instead of emitting malformed record-change SQL.

- 38c220c: Parse PostgreSQL NUMERIC/DECIMAL and BIGINT values to JS numbers. node-postgres returns both types as strings by default, so on Postgres-backed installs every decimal/bigint column surfaced as a string through RunView/GraphQL — Explorer UI code that assumes numbers threw `TypeError: cost.toFixed is not a function` on every change-detection cycle (AI Agent Run → Analytics tab console flood) and token totals string-concatenated instead of summing (e.g. 16,972 + 437 rendered as 16,972,437). New pool-scoped `MJPostgresTypes` parser config (exported for external pool creators): NUMERIC → parseFloat (matching the SQL Server provider's tedious semantics), BIGINT → Number with string passthrough beyond the safe-integer range. Applied to the provider's own pool and MetadataSync's shared pool; binary-format values and all other OIDs keep pg defaults.
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/generic-database-provider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai-vectordb@5.49.0
  - @memberjunction/query-processor@5.49.0
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- 09e1b4b: Fix Apply to my Form (resolve spec code, handle Pending overrides, improve # typeahead), auto-add app schemas to excludeSchemas on OpenApp install/upgrade, surface RenderedSQL through RunQueryResult and TestQuerySQL, strip ORDER BY before outer-wrapping unparseable SQL in MaxRows, fix lazy-config loader variable name collisions in codegen manifest, and add read-only provider support and missing SQL function keywords in PostgreSQL provider
- Updated dependencies [09e1b4b]
  - @memberjunction/generic-database-provider@5.48.0
  - @memberjunction/core@5.48.0
  - @memberjunction/ai-vectordb@5.48.0
  - @memberjunction/query-processor@5.48.0
  - @memberjunction/global@5.48.0
  - @memberjunction/sql-dialect@5.48.0

## 5.47.0

### Patch Changes

- f4dce92: Fix PostgreSQL CRUD save/update/delete/cascade failing on entities whose primary key has a multi-word (camelCase/PascalCase) name.

  The PG CodeGen provider declared CRUD function parameters with the canonical flat builder (`ParameterRef` → `p_<lower>`, e.g. `p_recordkey`) but _referenced_ the primary key in several body clauses via `toSnakeCase` (`p_record_key`). Because `toLowerCase()` and `toSnakeCase()` produce the _same_ string for single-word/`ID` keys, this was invisible on every `ID`-keyed entity — but a table keyed on a multi-word soft-PK (e.g. a connector's `recordKey`) generated a function that declared `p_recordkey` and referenced `p_record_key`, so every save/update/delete failed on PostgreSQL with `column "p_record_key" does not exist`.

  All parameter names now route through the single `ParameterRef` builder in both `PostgreSQLCodeGenProvider` (create/update/delete/cascade bodies) and `PostgreSQLDataProvider` (the save-call binding). This is a no-op for `ID`/single-word keys and fixes multi-word keys. Regenerate CRUD functions (`mj codegen`) after upgrading to apply the fix — no data migration required.

- Updated dependencies [b216f2b]
- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
  - @memberjunction/core@5.47.0
  - @memberjunction/sql-dialect@5.47.0
  - @memberjunction/ai-vectordb@5.47.0
  - @memberjunction/generic-database-provider@5.47.0
  - @memberjunction/query-processor@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/ai-vectordb@5.46.0
  - @memberjunction/generic-database-provider@5.46.0
  - @memberjunction/query-processor@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/sql-dialect@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/generic-database-provider@5.45.1
- @memberjunction/ai-vectordb@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/query-processor@5.45.1
- @memberjunction/sql-dialect@5.45.1

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
  - @memberjunction/generic-database-provider@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-vectordb@5.45.0
  - @memberjunction/query-processor@5.45.0
  - @memberjunction/sql-dialect@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [2f9b863]
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai-vectordb@5.44.0
  - @memberjunction/generic-database-provider@5.44.0
  - @memberjunction/query-processor@5.44.0
  - @memberjunction/sql-dialect@5.44.0

## 5.43.0

### Patch Changes

- fe89e68: Post-merge follow-up to PR #2854 (`refactor(codegen-lib): multi-provider SetupDataSource + PostgreSQL pool symmetry`), addressing review feedback. Bug-fix scope only — no migration, no schema changes — so this is patch under the same convention PR #2854 followed.

  **Behavior fixes (silent regressions introduced by PR #2854):**
  - **PG\_\* env-var precedence regressed when `dbPlatform` was set only in `mj.config.cjs`.** `_resolveConnEnv()` keyed its PG\** check on `_IS_PG_DEFAULT`, which derives from `process.env.DB_PLATFORM` alone. A user who set `dbPlatform: 'postgresql'` in their `mj.config.cjs` (no `DB_PLATFORM` env var) and supplied the host via `PG_HOST` would silently connect to `localhost`. New helper `applyPlatformDependentEnvVars()` runs *after\* `mergeConfigs(DEFAULT_CODEGEN_CONFIG, userConfig)` to re-apply PG\*\* precedence to any field the user didn't explicitly set in `mj.config.cjs`, restoring the pre-refactor behavior (`process.env.PG_HOST ?? configInfo.dbHost`). Wired into both the module-load merge and `initializeConfig()`.
  - **SSL silently flipped on in `NODE_ENV=production`.** PR #2854's `buildPgConfig()` didn't set `SSL`, so `PGConnectionManager.Initialize()`'s `ssl: config.SSL ?? (process.env.NODE_ENV === 'production')` default kicked in — flipping codegen against non-SSL/locally-bridged PostgreSQL from off (the pre-refactor inline `pg.Pool` behavior) to on under any production shell. `buildPgConfig()` now passes `SSL: false` by default and exposes a new optional `codegenPool.ssl` knob (boolean or pg-ssl object) for callers that genuinely need SSL.
  - **`statement_timeout` GUC missed the verify-SELECT-1 connection.** The runtime `connect` listener was attached _after_ `PGConnectionManager.Initialize()` had already opened, used, and released the first physical connection for its `SELECT 1` health check. That first warm client gets reused later without the GUC. The fix carries the timeout via the libpq `-c statement_timeout=<ms>` startup option (new optional `PGConnectionConfig.Options` field, threaded into the `pg.Pool` config), so every backend honors it from query #1 — including the verify connection. The runtime listener is removed entirely; the connect-string path is both correct and simpler.

  **Warning hygiene:**
  - The PG*\*/DB*\* precedence `console.warn` is now de-duplicated across the
    module-load merge, the post-merge `applyPlatformDependentEnvVars` pass,
    and any subsequent `initializeConfig()` calls. Without de-dup, a single
    env-var divergence would emit 2–3 identical warnings; now it emits once
    per `<pgEnv>:<ssEnv>` pair per process. A module-level set tracks which
    pairs have already warned.

  **Doc / API clarity:**
  - `codegenPool` JSDoc + CLAUDE.md now spell out per-provider applicability: `statementTimeoutMs` is cross-platform; `max` / `min` / `idleTimeoutMillis` / `connectionTimeoutMillis` / `ssl` are PG-only today. Previously the docs claimed cross-platform application of pool-sizing knobs, but only `statementTimeoutMs` is wired into `buildSqlConfig()` — so a user setting `codegenPool.max: 50` for SQL Server was silently ignored.
  - Added a `KEEP IN SYNC` comment near `DEFAULT_CODEGEN_CONFIG` pointing to `applyPlatformDependentEnvVars`'s `overrides` table — the two share the same set of PG*\*/DB*\* env-var pairs and must be updated together.
  - Fixed JSDoc typo `@memberjunction/postgresql-data-provider` → `@memberjunction/postgresql-dataprovider`.

  **Test quality:**
  - `setupDataSource.test.ts` now exercises the actual `resolveCodeGenDatabaseProvider()` function the orchestrator delegates to, instead of re-implementing the factory call inline. The orchestrator's "not registered → throw with descriptive message" branch is now genuinely covered — previously the assertions would have kept passing even if the real method had drifted. The dispatch logic was extracted from `RunCodeGenBase.setupDataSource()` into a free function on `codeGenDatabaseProvider.ts` to make this possible without forcing the test to import the heavy `runCodeGen.ts` module.
  - New `db-connection.test.ts` covers the SQL Server `codegenPool.statementTimeoutMs` → `dbRequestTimeout` → 120000 precedence chain — previously only validated E2E. `buildSqlConfig` is exported for the test (sole production caller remains `MSSQLConnection()`).
  - New `applyPlatformDependentEnvVars.test.ts` covers the helper added by this PR: short-circuit on non-PG `dbPlatform`, PG\_\* override semantics, user-explicit precedence, non-numeric PG_PORT handling, and warning de-dup (single warning across multiple `initializeConfig()` calls). The function is exported solely for testing — production code only calls it internally.

  **`@memberjunction/postgresql-dataprovider`:** additive — `PGConnectionConfig` gains an optional `Options` field threaded into `pg.PoolConfig.options`. Existing consumers that don't set it see identical behavior.

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/ai-vectordb@5.43.0
  - @memberjunction/generic-database-provider@5.43.0
  - @memberjunction/query-processor@5.43.0

## 5.42.0

### Patch Changes

- b7092ca: PostgreSQL runtime correctness, found during fresh-DB PG end-to-end testing:
  - **codegen-lib**: clean MJAPI engine load on PostgreSQL — `AutoUpdatePath` written as a
    dialect-correct boolean literal, plus a PG-only migration removing orphan related-entity-name
    virtual EntityField rows whose column the generated PG base view never emits (these crashed
    EntityActionEngine / AI Credential Bindings / Scheduling with `column "..." does not exist`).
  - **open-app-engine**: app uninstall now deletes all FK-dependent metadata (Entity Field Values,
    Entity Settings) in dependency order and reports a real failure instead of swallowing errors
    into a false "success".
  - **postgresql-dataprovider**: dialect-correct per-field entity-search predicate (no `N'...'`
    literal prefix, no `ESCAPE` clause) — fixes `syntax error at or near "ESCAPE"` on live search.

- 6d970cd: Runtime SQL dialect correctness on PostgreSQL:
  - **scheduling-engine**: PostgreSQL-correct heartbeat lease extension — affected-rowcount handling +
    mixed-case column quoting in `spExtendScheduledJobLease`, with a PG-only migration. _(migration → minor)_
  - **postgresql-dataprovider** + call-sites (archiving-engine, core-entities, ng-dashboards,
    ng-entity-communications): translate T-SQL date functions (`GETDATE()`, `DATEADD`, etc.) in
    runtime SQL clauses to PostgreSQL equivalents. _(code → patch)_

- Updated dependencies [9b9b484]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/generic-database-provider@5.42.0
  - @memberjunction/ai-vectordb@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/query-processor@5.42.0
  - @memberjunction/sql-dialect@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/generic-database-provider@5.41.0
  - @memberjunction/ai-vectordb@5.41.0
  - @memberjunction/query-processor@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-vectordb@5.40.2
- @memberjunction/generic-database-provider@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/query-processor@5.40.2
- @memberjunction/sql-dialect@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-vectordb@5.40.1
  - @memberjunction/generic-database-provider@5.40.1
  - @memberjunction/query-processor@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/generic-database-provider@5.40.0
  - @memberjunction/ai-vectordb@5.40.0
  - @memberjunction/query-processor@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0

## 5.39.0

### Patch Changes

- 7dfacc7: Add support for storing and querying embeddings inside the application's own database instead of a separate vector service. `VectorDBBase` gains an `IColocatedVectorHost` adapter (implemented by the PostgreSQL and SQL Server data providers) and a `ColocatedQuery` API; the new `PgVectorColocated` provider does vector + keyword (RRF) search in one statement, and the new `@memberjunction/ai-vectors-sqlserver` package adds a SQL Server 2025 native `VECTOR` provider with sibling-table and entity-column storage modes. `VectorSearchProvider` and `EntityVectorSyncer` route these indexes through the borrowed connection.
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [eaee99f]
- Updated dependencies [2d1b4e1]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vectordb@5.39.0
  - @memberjunction/generic-database-provider@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/query-processor@5.39.0
  - @memberjunction/sql-dialect@5.39.0

## 5.38.0

### Patch Changes

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
  - @memberjunction/generic-database-provider@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/query-processor@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/core@5.37.0
  - @memberjunction/generic-database-provider@5.37.0
  - @memberjunction/query-processor@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/generic-database-provider@5.36.0
  - @memberjunction/query-processor@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0

## 5.35.0

### Patch Changes

- aedd4dc: Bubble save SQL composition up to GenericDatabaseProvider as a single orchestrator; SQL Server and Postgres providers now contribute four dialect hooks instead of duplicating the generator. Fixes a PG UPDATE bug where PK wasn't tail appended
- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [6f083dd]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/generic-database-provider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/query-processor@5.35.0
  - @memberjunction/sql-dialect@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/generic-database-provider@5.34.1
  - @memberjunction/query-processor@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- cfffb6d: Add keyset (seek) pagination to `RunView` via the new `RunViewParams.AfterKey: CompositeKey` field. Iterating large entities (background jobs, scheduled actions, bulk processing) now stays O(log N) per page regardless of depth — `StartRow`-based OFFSET pagination is unchanged and remains the right choice for UI grids.

  **Framework changes**
  - New `RunViewParams.AfterKey: CompositeKey` accepted by all RunView entry points (TS, GraphQL, REST flows that go through RunView).
  - New exported error class `AfterKeyNotSupportedError` (with `Reason` codes `CompositePK | UnsupportedPKType | IncompatibleOrderBy | StartRowConflict | AfterKeyShape`).
  - New exported helper `IsKeysetPaginationOrderableType(sqlType)` and constant `KEYSET_PAGINATION_ORDERABLE_PK_TYPES`.
  - Keyset queries bypass server cache (read + write) automatically — they're inherently single-use so caching is pure overhead.
  - v1 constraint: single-column PK only. Composite-PK entities throw `AfterKeyNotSupportedError` with `Reason: 'CompositePK'`.

  **Migrated callers (now use keyset by default when entity has a single-column PK)**
  - `ScheduledGeocodingAction` (`processMissingForEntity`) — falls back to OFFSET on composite-PK entities.
  - `VectorBase.PageRecordsByEntityID` + `EntityVectorSyncer.startDataPaging` — auto-promotes to keyset when possible. New helper `VectorBase.CanUseKeysetPagination()`. New optional `PageRecordsParams.AfterKey`.

  **Metadata**
  - `Geocoding Maintenance` scheduled job cron updated to weekly (Saturdays 2 AM UTC); description reworded to not hard-code a cadence. Administrators can adjust the `CronExpression` as needed.

  **Documentation**
  - New guide: `guides/KEYSET_PAGINATION_GUIDE.md`.
  - `CLAUDE.md` performance section updated.

  **Out of scope for v1**
  - `ExternalChangeDetection.ChangeDetector` uses `RunQuery` (saved queries with arbitrary SQL), which the framework can't safely rewrite. Stays on OFFSET; tracked as a follow-up.

  **Backwards compatibility**
  - Fully additive. Existing callers that don't pass `AfterKey` are unaffected.

- 6d8ee1a: no migration
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/generic-database-provider@5.34.0
  - @memberjunction/query-processor@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Minor Changes

- 5cc5326: PostgreSQL end-to-end support — first MJ release where a fresh PG database can be migrated, codegen'd against, signed into, and synced from `mj sync push` without manual intervention. Plus a structural cleanup pass over how the stack handles the database-platform vocabulary and dialect-aware SQL.

  ### PG fresh-install path
  - **`@memberjunction/postgresql-dataprovider`** — replaces the `Nested transactions are not yet supported` throw with full SAVEPOINT-based nesting (mirrors SQL Server's depth/savepoint model). Adds the missing `ValidateDeleteResult` override that the Phase-2 Save/Delete refactor introduced for SS but skipped for PG, so `BaseEntity.Delete()` correctly recognizes successful deletes on PG. RDS-compatible startup wrapper (no `pg_catalog` writes, rejected by managed PG). Per-connection transaction mutex prevents interleaved BEGIN on shared connections during `mj sync` fan-out.
  - **`@memberjunction/sql-converter`** — new `ConditionalDDLRule` handlers for SS-only patterns that previously survived into PG output untranslated: `IF NOT EXISTS (sys.schemas …) EXEC('CREATE SCHEMA [X]')` → `CREATE SCHEMA IF NOT EXISTS "X"`, and `sp_addextendedproperty` schema descriptions → `COMMENT ON SCHEMA "X" IS '...'`. Function-output now emits a `DROP FUNCTION IF EXISTS` guard before recreate so re-runs don't trip "function … is not unique." `ADD COLUMN IF NOT EXISTS` for idempotent column-add migrations. `bit`-parameter body coercion + tagged dollar-quoting on `DO` blocks containing nested `$$`.
  - **`@memberjunction/codegen-lib`** — PG `CodeGenProvider` emits `spCreate*` / `spUpdate*` / `spDelete*` matching the SS-ported baseline (was `fn_create_<snake>`). `pgDialect.ParameterRef` produces `p_<flat lowercase>` matching baseline + runtime `buildCRUDParams`. Without these, every `Save()` against PG failed with `function does not exist`. Pre-pass in `spUpdateExistingEntityFieldsFromSchema` reseats stale negative `Sequence` values from prior interrupted runs at the tail of each entity's positive range, eliminating `UQ_EntityField_EntityID_Sequence` collisions on re-runs. PG-output statement termination — `;` after `INSERT`, `ALTER`, etc. so generated `CodeGen_Run_*.pg.sql` replays cleanly.
  - **`@memberjunction/cli`** (`mj migrate`) — fresh-PG-install blockers: now reads `DB_PLATFORM` from env to select dialect (was config-only); auto-defaults `dbPort` to 5432/1433 based on inferred platform; defaults `BaselineVersion` to `'1'` (Skyway sentinel meaning "auto-select highest-versioned `B__` baseline file"). Without these, `mj migrate` against a PG `.env` silently constructed a `SqlServerProvider`.

  ### Single source of truth for database-platform vocabulary

  Addresses code-review feedback that the stack had three parallel definitions of the same concept and a normalizer in the middle "translating" between them.
  - **`@memberjunction/global`** — new canonical `DatabasePlatform` type (`'sqlserver' | 'postgresql'`) and `resolveDbPlatformFromEnv()` helper that reads from `DB_PLATFORM`. STRICT — only the canonical pair is recognized; legacy aliases (`mssql`, `postgres`, `pg`) are no longer honored, and unrecognized non-empty values **throw** rather than silently falling back to `'sqlserver'`. The earlier dev-only `DB_TYPE` env var is no longer consulted.
  - **`@memberjunction/core`** and **`@memberjunction/sql-dialect`** — both packages re-export `DatabasePlatform` from global instead of defining their own copies.
  - **`@memberjunction/codegen-lib`** — config schema drops `dbType` entirely. `dbPlatform` is the only field. The `dbType()` exported helper is renamed to `dbPlatform()`. `normalizeDbPlatformAndType()` and its tests are deleted.
  - **`@memberjunction/cli`** and **`@memberjunction/server`** — drop their local `resolveDbPlatformFromEnv` copies in favor of the global helper. MJServer's `getDbType()` is now a 1-line wrapper.

  ### SQLDialect as the single source of truth for SQL type ↔ category mapping

  Replaces 5+ hand-coded SQL type-name lists scattered across the codebase ("when you see this pattern repeat, alarm bells").
  - **`@memberjunction/sql-dialect`** — each dialect now exposes 11 typed getters listing the SQL type names IT uses for each conceptual category: `BooleanTypeNames`, `StringTypeNames`, `DateTypeNames`, `IntegerTypeNames`, `FloatTypeNames`, `UuidTypeNames`, `BinaryTypeNames`, `JsonTypeNames`, `CurrencyTypeNames`, `IntervalTypeNames`, `NetworkTypeNames`. New `typeClassification.ts` module unions both dialects into cross-platform predicates (`IsBooleanSQLType`, `IsStringSQLType`, …, plus `IsNumericSQLType` aggregate). New `LowerCase(expr)` method on the base dialect (default `LOWER(${expr})`, ANSI-portable) replaces hardcoded `LOWER(...)` strings in callers. New `BooleanParameterType()` returns `'bit'` on SS, `'boolean'` on PG — used by codegen to emit dialect-correct tolerant-SP `_Clear` parameter declarations. Adding a future dialect = implementing the getters; no other site changes.
  - **`@memberjunction/core`** — `DatabaseProviderBase` gains a `Dialect: SQLDialect` getter, lazily resolved from `PlatformKey`. Server-side code can now write `provider.Dialect.BooleanLiteral(true)` etc. without independently importing `GetDialect`. `util.ts` `TypeScriptTypeFromSQLType` and `FormatValueInternal` rewritten over the predicates — ~70 lines of hardcoded switches collapse to ~25 lines of dispatches. New dep on `@memberjunction/sql-dialect`.
  - **`@memberjunction/codegen-lib`** — `getTypeGraphQLFieldString` 50-line switch replaced with predicate dispatch. `createNewUser.ts` boolean filter that previously avoided dialect-specific SQL via client-side `.filter()` post-pass now uses `dialect.BooleanLiteral(true)` and filters server-side.
  - **`@memberjunction/metadata-sync`** — `sync-engine.ts` lookup-filter type detection uses `IsUuidSQLType` / `IsDateSQLType` instead of a hand-maintained `!== 'uuid' && !== 'datetime' && …` chain. `LOWER()` wrapping goes through `dialect.LowerCase()`. `PushService.ts:isTextLikeColumn` is now a one-liner over `IsStringSQLType`. New dep on `@memberjunction/sql-dialect`.
  - **`@memberjunction/server`** — `auth/newUsers.ts` and `resolvers/IntegrationDiscoveryResolver.ts` boolean filters that previously loaded all rows + filtered client-side now run server-side via `provider.Dialect.BooleanLiteral(true)`.
  - **`@memberjunction/core-entities-server`** — `MJApplicationEntityServer.server.ts` IsActive filter on Users moved server-side via `provider.Dialect.BooleanLiteral(true)`. `MJTemplateContentEntityServer.server.ts` AI enrichment now wrapped in a SAVEPOINT so failures don't poison the outer Save tx (PG's whole-tx-aborts-on-stmt-error policy made this fatal where SS treated it as a per-stmt skip).

  ### Cross-dialect runtime fixes
  - **`@memberjunction/sql-dialect`** — `pgDialect.ParameterRef` flat-lowercase contract; PG type → GraphQL `String` mapping for `character`, `varchar`, `citext`. `sqlDialect.ts` runtime SQL emission: `INTEGER`, `DOUBLE`, `PRECISION`, `BYTEA`, `OID`, `REGCLASS`, `REGPROC`, `NAME` added to `autoQuoteIdentifiers` keyword set so casts in hand-written SQL (`CAST(x AS INTEGER)`) stop being quoted as user-defined types. New `coerceBooleanLiteralsInSQL` pass rewrites SS bit literals (`Bool = 1` / `= 0` / `!= 1` / `<> 0`) to `TRUE`/`FALSE` for fields whose `TSType` is Boolean — fixes `operator does not exist: boolean = integer` for `ExtraFilter` clauses across engines, agents, and dashboards.
  - **`@memberjunction/codegen-lib`** — `applyPermissions` inner catch was binding `e` and shadowing the outer `EntityInfo` loop variable, producing `Error executing permissions file ... for entity undefined` log lines. Renamed to `sqlError` with `instanceof Error` typed message extraction.
  - **`@memberjunction/metadata-sync`** — `mj sync push` tolerates UUID case mismatches (PG returns lowercase, SS returns uppercase) on lookup resolution. `@file:` JSON references serialize to `jsonb` correctly on PG (was double-stringifying via the SS path).
  - **`@memberjunction/core`** (`baseEntity.ts`) — string default values now strip PG's typed-literal wrapper (`'Single'::character varying` → `Single`) before assignment so `MaxLength` validation doesn't fail on the wrapper length.
  - **`@memberjunction/core`** (`entityInfo.ts`) — multi-`IsNameField` resolution rule: when more than one field is marked, prefer the one literally named `Name`. Without this rule the pick depended on insertion order (PG returns DisplayName first, SS returns Name first), producing wrong codegen view aliases on PG.

  ### Breaking changes (for direct config consumers)
  - Any user `mj.config.cjs` with `dbType: 'mssql'` or `dbType: 'postgresql'` must rename to `dbPlatform: 'sqlserver'` or `dbPlatform: 'postgresql'`. The `dbType` field is removed.
  - Any user `.env` with `DB_TYPE=...` must rename it to `DB_PLATFORM=...`. The legacy `DB_TYPE` env var is no longer consulted at all (no fallback). `DB_PLATFORM` accepts only `sqlserver` or `postgresql` (case-insensitive); legacy aliases (`mssql`, `postgres`, `pg`) and any other non-empty value throw a clear "Invalid DB_PLATFORM value" error at startup rather than silently routing the wrong provider.
  - Both `dbType`/`DB_TYPE` were dev-only additions during PG support development (Feb 2026, first appeared in v5.30.0). They were never documented as customer-facing and never exposed a stable contract.

  ### Validation
  - 2,536 unit tests passing across the 8 affected packages (`@memberjunction/global` 381, `@memberjunction/core` 1099, `@memberjunction/sql-dialect` 213, `@memberjunction/codegen-lib` 435, `@memberjunction/metadata-sync` 220, `@memberjunction/server` 188), 0 failed.
  - Fresh-DB PostgreSQL replay clean: `DROP SCHEMA __mj CASCADE` → `mj migrate` applies 127/127 migrations, produces 316 `spCreate*` + 319 `spUpdate*` functions, with 0 `EntityField` rows in the staging-band Sequence range.

- b0329f6: PG: JSON-arg CRUD sprocs for wide entities + Bug 5 four-pass fix + codegen lookup fixes (#2552)

### Patch Changes

- 312fcee: Fix two runtime SQL paths that referenced an entity's `BaseTable` directly, which fails under tightened DB grants (the runtime app user has SELECT only on BaseViews and EXECUTE on CRUD sprocs). Both paths now read from `BaseView` and route their identifier, string-literal, and bounded-string-cast generation through `SQLDialect` so the same code produces correct SQL on SQL Server, PostgreSQL, and any future supported platform.

  Adds three new helpers to `SQLDialect`: `QuoteStringLiteral` (concrete, both dialects share `''`-doubling escape), `QuoteColumnAlias` (abstract — bare on SQL Server, double-quoted on PG to preserve case), and `CastToBoundedString` (concrete, composed from existing `ResolveAbstractType` so it emits `NVARCHAR(450)` on SQL Server and `VARCHAR(450)` on PG).

  Refactored sites: `ScheduledGeocodingAction` orphan-cleanup `NOT EXISTS` filter, and `BuildChildDiscoverySQL` (IS-A subtype probe) on both `SQLServerDataProvider` and `PostgreSQLDataProvider` — the latter two also fix the runtime-failing `FROM [schema].[BaseTable]` shape that fired on every IS-A entity load and on the `FindISAChildEntity` GraphQL resolver.

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
- Updated dependencies [f94ebd6]
- Updated dependencies [7add405]
- Updated dependencies [b0329f6]
- Updated dependencies [fad046c]
  - @memberjunction/core@5.33.0
  - @memberjunction/generic-database-provider@5.33.0
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/query-processor@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/generic-database-provider@5.32.0
  - @memberjunction/query-processor@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/sql-dialect@5.32.0

## 5.31.0

### Minor Changes

- 3c5176f: Bring MJ to a state where it runs end-to-end on PostgreSQL — including managed PG services (RDS, Aurora, Cloud SQL, Azure) — on a developer machine and in self-hosted environments.

  **Runtime (`@memberjunction/postgresql-dataprovider`):** new `autoQuoteIdentifiers` tokenizer in `ExecuteSQL` auto-quotes mixed-case identifiers in raw SQL (PascalCase columns, `vw*` views) so hand-written queries from MJ resolvers, engines, and dashboards work on PG without per-call quoting. Conservative — only quotes PascalCase or lowercase-first identifiers preceded by `.` (object refs). 30 new tokenizer tests covering keywords, dollar-quoted blocks, positional `$N` params, string literals, `[bracketed]` SQL Server identifiers, and the regression cases from Memory Manager and ConversationEngine flows.

  **Converter (`@memberjunction/sql-converter`):** `quoteAsAliases` regex made case-insensitive on the `AS` keyword (caught the `vwEntityPermissions.RoleName` alias case-fold bug). `SequenceDeduplicator` now auto-detects and fixes EntityField sequence collisions as a post-conversion step. Heavy regression tests gated behind `process.env.CI === 'true'` (with `CI_HEAVY_REGRESSION=true` opt-out for nightly) — pg-migrations.yml workflow already does the equivalent gate at the workflow level.

  **CodeGen (`@memberjunction/codegen-lib`):** CodeGen audit SQL output now routes to `migrations-pg/v5/` when `dbPlatform=postgresql` (was always going to `migrations/v5/`).

  **CLI (`@memberjunction/cli`):** consumes published Skyway 0.6.0 multi-dialect packages (`skyway-core`, `skyway-sqlserver`, `skyway-postgres`).

  **Managed-PG support:** historical PG migrations rewritten to drop the `pg_cast` UPDATE that required superuser, with INSERT VALUES tuples / WHERE-comparisons / CHECK constraints rewritten to use BOOLEAN literals (`TRUE`/`FALSE`) directly. 50 files touched in the companion `pg-migration-files` PR; 10,967 INSERT tuples + 3,510 comparisons + 9 CHECK constraints fixed.

  The actual PG migration content — v5.0 baseline + every V\*.pg.sql for v5.0–v5.30 — ships in the companion `pg-migration-files` PR. The two PRs merge together.

  See `migrations-pg/TESTING_GUIDE.md` for the verification strategy used during this PR's development (per-migration audit, schema dump diff, snapshot scripts, autoQuoter coverage).

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [9457655]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/generic-database-provider@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/query-processor@5.31.0
  - @memberjunction/sql-dialect@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/generic-database-provider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/query-processor@5.30.1
- @memberjunction/sql-dialect@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/generic-database-provider@5.30.0
  - @memberjunction/query-processor@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-dialect@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/generic-database-provider@5.29.0
  - @memberjunction/query-processor@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/generic-database-provider@5.28.0
  - @memberjunction/query-processor@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-dialect@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/generic-database-provider@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/query-processor@5.27.1
  - @memberjunction/sql-dialect@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [4357090]
  - @memberjunction/generic-database-provider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/query-processor@5.27.0
  - @memberjunction/sql-dialect@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/generic-database-provider@5.26.0
  - @memberjunction/query-processor@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-dialect@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/generic-database-provider@5.25.0
  - @memberjunction/query-processor@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/sql-dialect@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/generic-database-provider@5.24.0
  - @memberjunction/query-processor@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-dialect@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/generic-database-provider@5.23.0
  - @memberjunction/query-processor@5.23.0
  - @memberjunction/sql-dialect@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/generic-database-provider@5.22.0
  - @memberjunction/query-processor@5.22.0
  - @memberjunction/sql-dialect@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [72fc93b]
  - @memberjunction/core@5.21.0
  - @memberjunction/query-processor@5.21.0
  - @memberjunction/generic-database-provider@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-dialect@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [cc954e1]
- Updated dependencies [2298f8a]
  - @memberjunction/generic-database-provider@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/query-processor@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-dialect@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/generic-database-provider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/query-processor@5.19.0
- @memberjunction/sql-dialect@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/generic-database-provider@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0
- @memberjunction/query-processor@5.18.0
- @memberjunction/sql-dialect@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/generic-database-provider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/query-processor@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/sql-dialect@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/generic-database-provider@5.16.0
  - @memberjunction/query-processor@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-dialect@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/generic-database-provider@5.15.0
  - @memberjunction/query-processor@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/sql-dialect@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/generic-database-provider@5.14.0
  - @memberjunction/query-processor@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/sql-dialect@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/generic-database-provider@5.13.0
  - @memberjunction/query-processor@5.13.0
  - @memberjunction/sql-dialect@5.13.0

## 5.12.0

### Minor Changes

- 8ca8698: pg migrations

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
  - @memberjunction/core@5.12.0
  - @memberjunction/generic-database-provider@5.12.0
  - @memberjunction/query-processor@5.12.0
  - @memberjunction/global@5.12.0
  - @memberjunction/sql-dialect@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/generic-database-provider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/query-processor@5.11.0
  - @memberjunction/global@5.11.0
  - @memberjunction/sql-dialect@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/generic-database-provider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/query-processor@5.10.1
- @memberjunction/sql-dialect@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/generic-database-provider@5.10.0
  - @memberjunction/query-processor@5.10.0
  - @memberjunction/global@5.10.0
  - @memberjunction/sql-dialect@5.10.0

## 5.9.0

### Patch Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub
- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/generic-database-provider@5.9.0
  - @memberjunction/query-processor@5.9.0
  - @memberjunction/sql-dialect@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [064cf3a]
- Updated dependencies [0753249]
  - @memberjunction/generic-database-provider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/query-processor@5.8.0
  - @memberjunction/global@5.8.0
  - @memberjunction/sql-dialect@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/generic-database-provider@5.7.0
  - @memberjunction/query-processor@5.7.0
  - @memberjunction/global@5.7.0
  - @memberjunction/sql-dialect@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/generic-database-provider@5.6.0
  - @memberjunction/query-processor@5.6.0
  - @memberjunction/global@5.6.0
  - @memberjunction/sql-dialect@5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/sql-dialect@5.5.0
  - @memberjunction/generic-database-provider@5.5.0
  - @memberjunction/query-processor@5.5.0
