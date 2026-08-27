# @memberjunction/task-graph

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/aiengine@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/sql-dialect@6.1.0-edge.4
  - @memberjunction/ai-agents@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ai-prompts@6.1.0-edge.4
  - @memberjunction/actions-base@6.1.0-edge.4
  - @memberjunction/notifications@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- 6d7d3da: Task-graph engine hardening, Round 3 — the residual gaps in Round 2's own fixes, found by a three-track adversarial review of the merged engine. The pattern this round is not new seams but **incomplete closures**: six Round 2 fixes worked at their own anchor and left the layer just outside it open.

  **R3-1 — an early finish could discard a step that was already running.** R2-10 moved the sibling skips after `CompleteClaimed` on the premise that "siblings are Pending and unclaimed until the skip lands". They are not: task execution is not awaited, so the deciding instance's own poll tick runs concurrently with its skip loop, and the decision existed only in that instance's memory — no claim filter anywhere could know about it. A sibling claimed mid-loop had `In Progress` reverted to `Skipped` and its claim cleared _while its agent body ran_: side effects fired, completion refused, output discarded, graph settled `Complete` with nothing recording it. The early finish now declares itself durably before mutating anything (so every instance's claim filter sees it) and every skip is a guarded single statement that refuses a task something else has taken.

  **R3-2 — R2-4 gated one dialect and left the other blind.** Under `failureSemantics: 'block'` — the spec default, so every agent-emitted graph — a `Failed` origin's ordinary conditional edge that read false was dropped, its target skipped rather than blocked, and the dropped edge severed the block cascade's forward walk. `Skipped` satisfies prerequisites, so a join fed by an independent healthy route executed downstream of an unhandled failure while the parent still rolled up `Failed`. R2-3 made this _more_ reachable, not less: a failed step rarely has output, so the null-safe envelope answers positive conditions with a confident false→drop where they previously threw→held visibly. `Cancelled` is now decided once and written into the spec: it never decides an ordinary edge under either dialect.

  **R3-3 — the documented `data`/`context` conditions never worked on the dispatcher.** They resolved against the origin _step's_ output rather than the invocation's parameters, so every `data.x` comparison read `undefined`, came out false, and silently took a branch the legacy walker never took — on every invocation, with the validator blessing the condition at the door. An invocation envelope is now threaded from the agent through submit, the parent's metadata, and condition evaluation. Round 1's carried-forward D2 lands as code. `stepResult.step` also now carries a status word rather than the step's name, matching what the flow engine actually exposes — the documented `stepResult.step === 'Success'` was false for every step before this.

  **Also fixed:** a `Stop()` during boot no longer has its timers reinstalled by `Start()`'s own continuation (R3-4); concurrent human-step notifications no longer leave a duplicate, un-answerable inbox item — collapsing them belongs to the sweep over _waiting_ steps rather than to the raise, because a task is notified exactly once and the raise never runs again afterwards, so a duplicate that outlived its own raise was previously unreachable by the only code that could have closed it (R3-5); the data-absence classifier is inverted so it cannot rot per operator — a `ReferenceError` is a broken guard, everything else is absent data (R3-6); the determinism tiebreak is ordinal rather than locale-collated, so two hosts with different `LANG` cannot resolve the same tie differently (R3-7); a transient cost-rollup failure defers delivery instead of claiming the marker and locking a wrong total in forever (R3-8); `Cancel`'s child writes are guarded statements that cannot overwrite an outcome that landed first (R3-9); nested cancel is type-scoped and its depth cap actually engages (R3-10); and a host with the dispatcher disabled now refuses graph submissions instead of accepting work nobody will run (R3-11).

  **Smaller:** `deliverContinuation` returned `undefined` after every successful delivery, costing a spurious settle pass per graph (C1, with `noImplicitReturns` now on for the package); the default dispatcher instance id gains real entropy, because host+pid collides under systemd, pm2 and containers — and a shared id defeats every ownership guard at once (C2); the run's rollup and lifecycle writes are column-scoped (C4); and the drain's heartbeat purge no longer races the registration it is purging (C5).

  **Wrap-up fixes (post-round):** the claim protocol's lease now lives entirely on the database clock — `ClaimExpiresAt` is written (`DATEADD` over `SYSUTCDATETIME`) and compared in SQL time, so NTP skew between dispatcher hosts can no longer reclaim a live lease or extend a dead one. And the `TaskGraph.Submit` remote operation stops dropping `reinvokeDepth` (the runaway-loop cap now counts remote continuation hops) and gains the R3-3 `invocation` envelope so `data.*`/`context.*` conditions work for MCP-submitted flows; the operation's metadata contract carries both fields (hence this release's `minor`).

- 6cd337d: Workflow Run Console — realtime runner and debugger for task graphs (`plans/task-graph-realtime-runner.md`).

  Engine: new frame kinds (`GateDecision`, `ClaimChanged`, `PassCompleted`, `GraphPaused`, `GraphResumed`, `BreakpointHit`, `NodeProgress`) emitting state the dispatcher already computes; durable debug state (`$.debug` in the parent metadata bag) gating the claim filter — pause, single-step, breakpoints, and edge-condition overrides are claim gating, never new execution machinery. New Remote Operations: `TaskGraph.Pause/.Resume/.Step/.SetBreakpoints/.OverrideEdge/.SkipTask/.ForceCompleteTask/.UpdateTaskInput`; `RetryTask` accepts an edited input. Metadata rows for the new operations ride the branch (bump is `minor` per the metadata-branch rule).

  Client: `GraphQLDataProvider.TaskGraphFrames(parentTaskId)` — the first consumer of the `taskGraphFrames` subscription (shared, refcounted per graph). The run view accepts a `LiveFrame` input (frames patch the canvas; cascade frames trigger a debounced row reconcile — frames advisory, rows truth) and a `ReplayAt` input (post-settle scrubbing from row timestamps). The Workflows app's Runs surface becomes the console: pause/resume/step toolbar, engine pass strip, stall banner, step inspector (claim, path verdicts, live progress, what-if via the engine's own algorithms), and replay scrub.

### Patch Changes

- 199eb2b: Debug a Flow agent from the Agent form Run dialog. Debug starts the graph paused at Submit (`$.debug.paused` on the parent row — Pause-after-submit races the dispatcher). The harness and Runs console share a VS Code-style icon toolbar and a red-circle breakpoint toggle. The invocation-envelope sanitizer from #3783 is preserved.
- f80bdb7: Drop-in `mj-task-graph-debugger` wrap, Continue-from-breakpoint actually claims the stopped step, dispatcher kick on Submit, and run-view paint for queued / running / traveled edges plus a left data pane.
- e7f1f88: Two defects a dispatched workflow hit end to end — one that killed the run, one that misreported it.

  **The invocation envelope could not be written down.** R3-3 carried `ExecuteAgentParams.context` into the parent task's `InputPayload` verbatim. That parameter is documented as possibly a class instance holding "external service credentials or connection information", so the first real agent run whose context held a socket died at submit time with `Converting circular structure to JSON --> starting at object with constructor 'Socket'` — before any step executed. Had it serialized instead, those credentials would have been written to a row that outlives the run. `SanitizeInvocationEnvelope` now reduces the envelope to what is safe to persist at the durable boundary, so every submission path is covered: JSON data survives (primitives, arrays, plain objects, `Date`, anything with `toJSON`), while class instances, functions, sockets and cycles are refused **and reported by path** — a value that silently vanished is a condition reading absent-data and taking a branch nobody can explain later.

  **Three agents referenced Font Awesome Pro glyphs** (`fa-chart-diagram`, `fa-shield-check`, `fa-chart-mixed`), which render as nothing in the free 6.5.2 build Explorer loads — an empty icon square rather than a missing-icon indicator, since an absent glyph is silently invisible. Swapped for free equivalents in `metadata/agents`. Betty and Skip keep their `mj-icon-*` classes, which are intentional custom styling.

  **A dispatched workflow reported itself finished while it was still running.** The run-tree query joins the submit step to the graph it produced, so one workflow arrives as two rows whose statuses disagree: the step's describes the _submission_ (`Completed` in ~300ms, correctly), while its title names the _graph_, which is still going. The result was "Task Graph: X — Completed" sitting above steps that had not run, contradicting the page header's own "PAUSED / Workflow still running". The timeline now renders the pair as one row that keeps the step's identity — so selection and deep links still resolve — and takes its status and timing from the graph, with submit latency preserved in the subtitle. A failed or in-flight submission keeps its own row, since there is then no graph to inherit from and the submission is the whole story; an unrecognized shape declines to collapse rather than guessing.

  **Action and agent icons, resolved without a hop.** `get-agent-run-tree.sql` now returns `ActionID` and `AgentID` for the nodes that have them — read by joining back to the task (and, for a loop's passes, to the execution log they expanded from), the same way `LoopMode` already is, so none of the CTE's six members change. That removes the join a consumer would otherwise make and fixes the real defect: the same action rendered as two different generic glyphs depending on which arm of the query produced its row, because a graph step and a loop pass arrive by different paths. A task carries its `ActionID` whether or not it ran, so a **skipped** branch can now show which action it would have run — something the execution log can never say, since no log exists for work that did not happen. A `ForEach` keeps its loop icon rather than the icon of the action it repeats.

- 2741d46: Make the deterministic integration tier runnable against PostgreSQL, and fix the runtime and conversion defects that running it exposed.

  **Why.** MJ #3257 records that the integration suite is meant to run twice per build — once per backend — and that this was never implemented. PostgreSQL therefore shipped with migration parity verified and _runtime_ parity unverified. This change makes the tier run on PostgreSQL for the first time and fixes what that surfaced: **49 of 61 deterministic bundles now pass on PostgreSQL** (measured, MJAPI live; 61/61 executed, none skipped).

  **Harness (closes the #3257 blocker list).** `testing-cli` now branches on platform instead of unconditionally building an `mssql` pool: `mj-provider.ts` gains a PostgreSQL path (dynamic import, declared as an optionalDependency so SQL-Server-only consumers never resolve `pg`) with a PG-native user-cache load, `MJConfig` gains `dbPlatform`, and `getContextUser()` resolves the same user on both backends — System by name, then the well-known System ID, then the first active Owner, with `.trim()` because `Type` is space-padded in both ledgers. `mj.config.cjs` gains `dbPlatform` and a platform-aware `dbPort` default; with `DB_PLATFORM` unset both are exactly the previous SQL Server behaviour.

  **Runtime dialect leaks.**
  - `SQLDialect` gains `AffectedRowCountSQL()`. `TaskClaimStore` was emitting `SELECT @@ROWCOUNT`, which is T-SQL only — on PostgreSQL the `@@` is consumed as a parameter marker and the bare `ROWCOUNT` folds to lowercase, so _every_ guarded write failed with `column "rowcount" does not exist` (7,168 occurrences in one tier run, now zero). SQL Server keeps `@@ROWCOUNT`; PostgreSQL uses a data-modifying CTE.
  - `MJDashboardEntityExtended` no longer denies the owner. `Validate()` is synchronous and reads `DashboardEngine`'s cache directly, so in any process using the default `task` startup mode — where engine pre-warm is deferred — an unloaded cache was indistinguishable from "you have no permission", and `mj sync push` failed on a dashboard whose `UserID` _was_ the pushing user. Ownership is now answered from the row itself, which needs no cache; a non-owner still falls through to the engine and is refused when it is cold. `Delete()`, being async, loads the engine for the non-owner case and short-circuits for the owner, so a merely _stale_ cache — a dashboard created since the last `Config()` is absent from the backing array — cannot refuse its own owner either.

    Ownership is read from the **persisted** `UserID` (`GetFieldByName('UserID').OldValue`), never the in-memory one. `UserID` is a settable field on `UpdateMJDashboardInput`, and `ResolverBase.UpdateRecord` loads the row and then applies the client's values _before_ `Save()` runs `Validate()` — so an owner check written against `this.UserID` would be satisfied by a value the caller supplied in the same request. Since this class **is** the permission gate for dashboards, that would let any user who can load one send `UpdateMJDashboard(ID: <someone else's>, UserID: <self>)` and take the record. Transferring ownership is separately gated to the owner, so a user holding `CanEdit` through a share can edit but not appropriate. `MJDashboardEntityExtended.ownership.test.ts` covers both directions, including that the engine is still consulted for the attacker case.

  **Conversion (T-SQL → PostgreSQL).** Five defects, each caught only by applying the output to a fresh database — the converter reported `0 errors` every time:
  - CASE-expression keywords were quoted as identifiers inside `CHECK` bodies (`"CASE" "WHEN" …`), so the migration would not parse. The missing keyword set was derived by intersecting 2,084 `CHECK` bodies across 67 shipped migrations against the dialect keyword list: exactly `CASE`, `WHEN`, `THEN`, `ELSE`, `END`.
  - Every `IF EXISTS (…)` batch was classified `SKIP_SQLSERVER` and silently discarded. A guarded `DROP CONSTRAINT` therefore vanished — with exit code 0 — and the paired `ADD CONSTRAINT` later in the same migration failed with "already exists". The rewrite discards the guard, so it fires **only when the guard is a catalog probe** (`sys.check_constraints` / `key_constraints` / `foreign_keys` / `default_constraints` / `objects`) — the form that exists purely because SQL Server has no `DROP CONSTRAINT IF EXISTS`. A guard on data (`IF EXISTS (SELECT 1 FROM Payment WHERE Status = 'Legacy')`) is a real condition; dropping it would make PostgreSQL drop unconditionally while SQL Server does not. Those keep falling through to the generic path, which comments out what it cannot express. This mirrors the `sys.indexes` gate the conditional-index rule already had.
  - `CREATE SCHEMA` is folded to lowercase to match its unquoted references — `convertIdentifiers` emits the schema half of `[X].[Y]` bare, so a quoted `CREATE` and a bare reference name two different schemas. **`__mj_UDT` is exempt**, because it is the one schema with a producer outside the migration set: the Database Designer creates it, and every table in it, through `UDT_SCHEMA_NAME` — quoted and case-preserved, as do `CreateSchemaDDL`, `QuoteSchema` and the schema-builder's `QuotePostgres`. Folding it would leave the runtime writing into a schema no migration made, and would orphan every UDT entity from its table in `vwSQLTablesAndEntities`, which joins `nspname = e."SchemaName"` case-sensitively. Nothing wants the folded spelling: across `migrations-pg/` there is not one unquoted `__mj_udt` reference, and all 272 other occurrences of the name are prose or JSON string content. No reconciliation DDL is emitted for any schema — a guard at that point would land in the converted output of the migration that CREATES the schema, the one file every affected database has already applied and Flyway will never re-run, so it could only ever fire on a database that does not need it.
  - T-SQL table variables became the invalid declaration `v_X TABLE;`; they now become `CREATE TEMP TABLE … ON COMMIT DROP`.
  - `DELETE alias FROM … JOIN …` passed through as T-SQL; it now becomes PostgreSQL's `DELETE … USING` (the UPDATE analogue already existed).
  - `WITH CHECK ADD CONSTRAINT` survived on non-FK constraints, and `END ELSE BEGIN` left stray tokens. A subtler one: the `DECLARE` indent capture also matched a preceding blank line, which pushed the declaration out of the `DECLARE` section and into the block body.

  **Also fixed.** `spDeleteEntityWithCoreDependencies` could not be invoked on PostgreSQL — `callRoutineSQL` always emitted `SELECT * FROM fn(...)`, which PostgreSQL rejects for a `RETURNS SETOF record` routine with no OUT parameters, so entity pruning silently died and cascaded into 22 missing CRUD routines. `callRoutineSQL` gains an optional `expectsResultSet`; SQL Server ignores it. CodeGen's PostgreSQL audit-SQL folder swap was pinned to `v5` by exact match, so on v6 it wrote into the SQL Server tree. `applyLLMPrimaryKeys` validated primary-key names case-insensitively but then used the model's spelling in the `UPDATE`, matching zero rows on PostgreSQL while reporting success — it now uses the matched column's actual name.

  **Repeatable metadata refresh.** `R__RefreshMetadata` on PostgreSQL now also clears orphaned `EntityField` rows, as the SQL Server file has always done. Without it a from-scratch PostgreSQL database ends up with metadata describing columns its own base views do not have, and every read of those views fails.

  **Two test-authoring fixes, not product changes.** The aggregates bundle passed `MAX(__mj_UpdatedAt)` unquoted and the open-app-teardown fixture called `SYSDATETIMEOFFSET()`; both are SQL-Server-only spellings and are now dialect-quoted.

  **On the `migrations-pg/v6/**`files in this PR.**`CLAUDE.md`says a feature PR ships the T-SQL migration only and that PG counterparts are regenerated by the build engineer at release time. The five files here are`mj migrate convert`output, not hand-authored, and they exist because the tier cannot run on PostgreSQL without them — that is the whole subject of the change. They need the build engineer's sign-off before merge, and should be regenerated rather than merged if the release conversion runs first. Existing`migrations-pg`output is deliberately **not** regenerated against the converter changes above: the v5 files are frozen baselines, and the`\_\_mj_UDT` exemption above means the converter's new output agrees with what they already installed.

  SQL Server is unaffected: every changed path is either PostgreSQL-only or a same-output refactor. Unit tests across the touched packages pass — SQLDialect 404, SQLConverter 1139, MJCoreEntities 597, CodeGenLib 808, TaskGraph 60, testing-cli 23 — zero failures in any of them.

- f5ec13b: Harden `SafeExpressionEvaluator` against a sandbox escape, and correct Skipped-status reporting.

  **`SafeExpressionEvaluator` sandbox escape closed.** The previous defense was a textual denylist,
  which a split-token expression walked straight through:
  `[]["cons"+"tructor"]["cons"+"tructor"]("return process.pid")()` spells none of the banned words yet
  climbs `[].constructor.constructor` to the `Function` constructor and reaches `process` — a
  confirmed arbitrary-code route from any metadata-authored expression (field rules, flow/loop agent
  conditions, task-graph conditions). Validation is now a **structural AST allowlist**: the expression
  is parsed and every node checked before compilation, rejecting computed member access whose key is
  not a literal (the concatenation route), `.constructor`/`__proto__`/`prototype` access, any call
  outside the safe-method and safe-global lists, and host-global identifiers. Because the check is structural it cannot
  be defeated by string assembly, and it also stops the denylist's over-rejection of legitimate data —
  `name == 'constructor'` and a field named `window` are now valid again. `validateSyntax` continues to
  parse-without-executing on top of it.

  **The expression grammar NARROWED, and callers should read this list.** The old denylist enforced
  almost nothing, so the accepted surface was in practice "whatever `new Function` compiles". The
  structural allowlist accepts what the evaluator's contract always documented — comparisons, logical
  ops, dotted/indexed access, the `SAFE_METHODS` list, arrow-function array callbacks, `typeof` — plus
  optional chaining (`payload?.customer?.tier`) and the safe globals below. **Now refused**, where the
  denylist let them through: `in` / `instanceof`, regex literals (`/x/.test(y)`), and string/array
  methods outside `SAFE_METHODS` (`.split()`, `.replace()`, `.slice()`, `.substring()`, `.match()`,
  `.join()`). No metadata shipped in this repo uses any of them; installations authoring their own
  expressions (field rules, flow/loop agent conditions, task-graph conditions) should audit the columns
  that store them before upgrading.

  **Ambient globals stay callable, and the list now has ONE owner.** `SAFE_EXPRESSION_GLOBALS` in
  `@memberjunction/global` — `Math`, `Number`, `String`, `Boolean`, `Array`, `Object`, `JSON`, `Date`,
  `parseInt`, `parseFloat`, `isNaN`, `isFinite` — may be called as namespace methods (`Math.abs(...)`,
  `Object.keys(...)`, `JSON.stringify(...)`, `Array.isArray(...)`, `Date.now()`) or as bare functions
  (`Number(...)`, `parseInt(...)`, `isNaN(...)`). Receiver and method are both fixed identifiers, so
  none of the four invariants that close the escape is weakened. `ai-core-plus`'s task-graph door now
  imports that set instead of keeping its own copy: `1efc248ac5` shipped the decision that the door
  must not refuse `Number(payload.count) > 3` or `Math.abs(output.delta) < 5`, and a second curated
  list is how the two halves came apart. `RESOLVABLE_GLOBALS` is removed from
  `@memberjunction/ai-core-plus`; import `SAFE_EXPRESSION_GLOBALS` from `@memberjunction/global`. The
  pinning test now CALLS every entry — it previously only read each name (`Math !== undefined`), which
  is why a screen that refused `Math.abs(x)` passed it.

  **A policy refusal now HOLDS a task-graph edge instead of rerouting it.** `IsBrokenGuard` recognises
  the evaluator's refusal message, so a stored graph carrying a construct this build no longer accepts
  stalls visibly rather than taking a different path with no recorded cause — the dispatcher logs a
  reason only on `hold`.

  **Skipped test status wired through reporting.** `MJ: Test Suite Runs` now records `SkippedTests`
  and `ErrorTests` (previously left NULL); the CLI single-test and suite-markdown formatters render
  Skipped as SKIP rather than FAIL and keep skips out of the Failures section; and the exported
  summary aggregator counts skips separately and averages over the executed set.

- 1bd9674: Task-graph engine hardening, Phase 1 — four correctness fixes at the seams between the well-built layers. Every one of them failed silently as success: the run reported Complete while the wrong work happened, or the settlement was lost with no error and no stall.

  **P1 — an exclusive loser could skip a task another route still reaches.** A losing edge decided its target's fate rather than its own, so a fork whose loser pointed at a step the winner also reached (directly, or through a join) skipped that step while it was still due to run — and the graph settled Complete with the work never executed. `ResolveExclusiveGroups` no longer seeds a target a kept edge also points at, and `ConfirmSkipSeeds` answers the surviving-route question the dispatcher already asks for ordinary dropped edges.

  **P2 — an unevaluable guard executed the work it was guarding.** A condition that failed to evaluate returned "keep the edge", and since conditions are only evaluated once the origin is terminal, a kept edge from a `Complete` origin is a satisfied prerequisite. The spec layer, the legacy walker and the exclusive path all said the opposite. Unevaluable is now an undecided HOLD, and `IsGraphStalled` counts held tasks so a graph waiting forever stops reporting healthy.

  **P3 — settlement is recoverable.** The post-settlement sequence ran after the parent's terminal write, and a terminal parent matched no sweep query — so a crash in that window left the submitting agent run `Paused` forever, with no cost rollup and no notification. A third sweep arm finds terminal-but-unsettled graphs (wide once at startup, 24h in steady state), the settle sequence is re-entrant, and `Cancel` now defers to the dispatcher instead of writing the parent terminal itself, which makes cancellation deterministic.

  **P4 — the continuation marker is a real compare-and-swap.** It was read-check-write, so two dispatchers could both deliver one settlement — for `reinvoke`, two billed agent turns. It is now a single guarded UPDATE in `TaskClaimStore`, and the parent's status and start-time writes are column-scoped so a full-row save can no longer erase the marker another instance just claimed.

  **A stopped dispatcher now stops writing.** `Stop()` waited on in-flight tasks but not on the timer passes, which are `void`-ed promises nothing held — so it returned mid-pass and that pass went on to settle graphs, emit lifecycle frames and claim new tasks afterwards. Three quiet consequences: a `GraphSettled` frame arriving after every subscriber had gone, a shutting-down process manufacturing the orphaned claims reconciliation exists to clean up, and statements colliding with the host's reuse of the connection. Passes are now drained (they are bookkeeping for work that already happened, so cancelling one would open the very crash window P3 rescues), and no new work is claimed after the decision to stop.

  **Every dispatcher query is scoped to workflow graphs.** `MJ: Tasks` is general-purpose — conversation tasks and users' own to-dos live there too — and the sweep did not filter by task type, so it rolled up and overwrote the status of anything with children. `Submit` has always stamped the `AI Workflow` type, so the discriminator already existed on every dispatcher-owned row; it is now in all three sweep arms and inside the guarded statements that write a payload column.

  **New: an edge condition that cannot be parsed is refused at authoring time.** `SafeExpressionEvaluator.validateSyntax()` compiles an expression without evaluating it, which is what lets the check be syntax-only: unknown identifiers, absent properties and undefined chains all pass, because whether `payload.x.y` resolves is a question about a run that has not happened yet. `ValidateTaskGraphSpec` applies it to dependency conditions and `While` loop conditions, reporting every failure at once and naming the step and the condition text.

  ⚠️ **Migration note.** A saved workflow or flow whose condition never parsed has been failing at run time all along — silently before P2, as a held branch after it. That failure now surfaces at SAVE time instead, so editing an unrelated step in an old flow can newly report an error on a step you did not touch. The message names the step and quotes the condition so the surprise explains itself. Nothing rejects on load, and unknown identifiers are explicitly NOT an error — only expressions that cannot parse at all.

- 9f6a53b: Task-graph engine hardening, Round 2 — the ring of seams one layer out from Round 1's, found by a four-track adversarial review of the merged engine. Same signature as before: the graph looks fine while a run strands forever, or wrong work executes under a clean verdict.

  **R2-1 — a crashed prompt task was unrecoverable and undiagnosable.** Claim reclamation scoped to `AgentID OR ActionID`, a predicate written before the `PromptID` column existed. A Prompt step (and a ForEach/While with a prompt body) carries neither, so once its owner died it was invisible to both reclamation statements and not even reported by the orphan sweep — graph `In Progress` forever, submitting run `Paused` forever, and the stall detector calling it healthy. Every site now asks one shared predicate that says what the engine means, so the next runner column cannot re-open the hole. This also closes Round 1's B4: the human settle and expiry sweeps used a narrower dialect than reopen, so a human task written before `StepType` existed could be asked and then never settled or expired.

  **R2-2 — the delivery marker was claimed by passes that had not actually settled anything.** The settle sequence's steps each swallow their own failures by design, but the rescue sweep's only re-entry key is the marker, and the marker was claimed unconditionally at the end of the same pass. So a crash between steps was recoverable and a _soft failure_ was permanent. The sharpest case needs no failure at all: a fast graph settles before `finalizeAgentRun` has parked its submitting run, so the lifecycle write silently no-ops and the cost write is overwritten by finalize's own full-row save. The run half is now gated on a read-only readiness check and a settle verdict; nothing claims the marker unless the pass genuinely completed, so the sweep re-enters. Bounded at five minutes, because a submitter that died before parking must not hold a completed workflow's outcome hostage.

  **R2-3 — routine data absence was classified as a broken guard.** A condition dereferencing the null output of a step that produced nothing threw, and every throw became a hold — permanent, since a terminal origin's output can never change. The flow engine's `payload` is the agent's accumulated payload, an object, so `payload.approved` there is simply falsy; the dispatcher's null was the divergence. Object-shaped roots are now null-safe, deeper absent chains read as a false verdict, and an unknown _root_ still holds because that genuinely is a broken guard. Conditions on edges out of a **Skipped** origin are no longer evaluated at all — the edge drops, matching the walker, because against an empty envelope a negated condition comes out true and hands a not-taken branch's target a satisfied prerequisite.

  The validator now refuses unknown roots at submit time, reversing a deliberate Round 1 decision: with data absence reading as false, an unknown root is the only remaining way to earn a permanent hold. It stays silent when an expression binds a name of its own (an arrow parameter), so it may miss a typo but never invents one.

  **R2-4 — `failureSemantics: 'block'` did not gate exclusive-group resolution.** The dispatcher passed the same `['Complete','Failed']` set to every graph. Under `'block'` — the spec's default — a Failed origin resolved its fork, the losers were seeded and cascaded to `Skipped`, `Skipped` satisfied dependents, and the removed loser edges severed the block cascade's forward walk, so a join fed by an independent healthy route executed downstream of an unhandled failure while the parent still rolled up `Failed`. The graph's own dialect is now threaded in.

  ⚠️ **Behaviour change at the authoring door.** A spec whose edge condition references a root the runtime does not provide is now refused at save time rather than holding a branch at run time. The message names the step, the dependency and the condition, and lists the roots that are available.

- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
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
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/sql-dialect@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/notifications@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 59def38: The entity-action substrate finishes what its schema has been promising. Seven pieces, all of which
  share a failure shape: a column, a flag or a field that read as configured and did nothing.

  **Action Filters now actually prevent execution.** `RunAction`'s filter-refusal branch built its
  result, logged it, and then fell through to run the action anyway — there was no `return`. Every
  Action Filter has therefore recorded that it prevented something while preventing nothing, since the
  mechanism shipped. The refusal row is why it went unnoticed: the observable said "prevented" and the
  side effect happened regardless, so #3606's claim that filters fail closed described evaluation,
  which landed, rather than enforcement, which did not. **Anyone relying on an Action Filter to gate an
  action has been getting the action anyway; after this it stops, which is the configured behaviour but
  a visible change.** A prevented run still writes a log row, deliberately — an operator should be able
  to see that a filter refused rather than wonder why nothing happened — so its `Message` is now an
  exported constant, since that is the only thing distinguishing a prevented run from an executed one.

  **Transition filters.** An entity action could see a record's current state and nothing else, so
  "when Status _becomes_ Approved" was indistinguishable from "when Status _is_ Approved" — which is
  true on every subsequent save too. `EntityChangeContext` now carries both sides of the save to where
  filters run, built from `EntityField.OldValue`, which `BaseEntity` has tracked all along and simply
  never carried anywhere. Filter code gets `DidFieldChange`, `DidFieldChangeToValue`, `OldValues` and
  `NewValues` on `ActionFilterContext`. A create reports no changes, because a record whose Status
  started at Approved did not _become_ anything. Comparison is loose across the string boundary
  metadata forces, so a configured `'1'` matches a numeric `1` rather than silently never matching.

  The capture happens as the first statement of `HandleEntityActions`, deliberately before its first
  `await`: After-hooks are fire-and-forget, and the moment that method yields, the save completes and
  reloads the entity, resetting every `OldValue`. Reading `IsCreate` from that same synchronous
  snapshot also closes a latent bug — `entity.IsSaved` was previously read _after_ an await, so a
  create whose save finalized in that window dispatched as `AfterUpdate`.

  **Two filter-substrate fixes fall out of using it for real.** `EntityActionFilter.Status` was never
  consulted, so a `Disabled` binding still gated — and filters fail closed, so that was not an inert
  row but a permanent block whose only symptom is a trigger that quietly stopped firing. And a binding
  pointing at an unresolvable filter used to reach the evaluator as `undefined` and throw there:
  fail-closed by accident, with no usable reason logged. It now returns a failed result naming the
  filter.

  **Workflow triggers accept a filter.** `ValidateWorkflowSpec` refused `WorkflowEntityEventTrigger.filter`
  outright because the contract to honor it did not exist. It now reconciles onto an owned
  `ActionFilter` bound through `EntityActionFilter` — the additive path — and validates that the
  expression parses, because filters fail closed and a syntax error is not a loud failure, it is a
  trigger that silently never fires.

  **Record Process on-change triggers.** `OnChangeEnabled` has described itself as running "per-record
  on save via an owned Entity Action" since the column shipped, and `OnChangeFilter` promised to
  "compile into the owned Entity Action Filter". Neither owned anything. Saving a Record Process now
  reconciles that binding, matching ownership on the `RecordProcessID` param — `Run Record Process` is
  one shared action, so matching on entity + action alone would let a second process silently repoint
  the first one's trigger. `OnChangeFilter` compiles through the same builder workflow triggers use, so
  one expression vocabulary covers both surfaces.

  **Durable `After*` dispatch (D14).** After-hooks are fire-and-forget, so a process dying mid-flight
  loses the action with nothing to retry it. `EntityAction.RunMode = 'Durable'` routes the dispatch to
  the task-graph substrate as a single-node durable graph — the claim protocol, restart recovery and
  orphan reclaim that already exist there — rather than adding a third async substrate. Opt-in per
  binding, because it costs a Task row, a dispatcher hop, and params persisted at rest. When no
  submitter is registered or submission fails, the work runs **inline**: `Durable` asks for the work to
  be harder to lose, so dropping it would make opting in less reliable than leaving it off. New
  `Task.ActionID` widens the assignment exclusivity to three ways, and `TaskGraphSpecNode.actionName`
  joins `agentName`/`assignToUser`.

  Durability replaces _execution_, not _dispatch_: `RunActionParams.DeferExecution` is called by
  `RunAction` in place of running the action, after validation and filters have passed, so a durable
  binding is gated by exactly what an inline one is gated by. Submitting at dispatch time instead —
  which is where this first landed — would have fired a scoped durable trigger for every record of the
  entity and a filtered one on every save.

  **Execution-log retention.** `Action.RetentionPeriod` and `ActionExecutionLog.RetentionPeriod` shipped
  with descriptions and no reader anywhere in the codebase; the log grew forever while the schema
  claimed otherwise. Retention is now stamped onto each row when the run starts — decided at write
  time, so editing an action's retention is a going-forward change rather than a retroactive deletion —
  and a new opt-in `Action Log Retention` scheduled job purges expired rows oldest-first, bounded per
  run, reporting when it stopped at its ceiling rather than because it was finished.

  **The `Validate` invocation hole.** `EntityActionInvocationValidate` overrode single-record invocation
  with a near-copy that had drifted into a strict subset: no scope resolution (so a binding narrowed to
  one record ran `Validate` against every record of the entity) and no provenance (so a whole-record
  parameter was logged raw, ignoring the binding's `LogValue` rows). The override is deleted; the class
  inherits, which is what keeps both facts true for `Validate` permanently rather than until the copies
  drift again.

  **The `RunEntityAction` null contract.** `null` means the action did not run — the binding is scoped
  and this record falls outside it. `HandleEntityActions` guarded for it; the GraphQL resolver did not,
  so an out-of-scope binding surfaced to clients as a server error. The signature now says so and the
  resolver reports it as the ordinary outcome it is.

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

- 1c0d586: Flow agents now execute on the durable task-graph dispatcher instead of walking their own graph
  inside an agent run.

  `FlowAgentType.DetermineInitialStep` compiles the agent's steps and paths into a `TaskGraphSpec` and
  returns a `Tasks` step; `BaseAgent.executeTasksStep` submits it and detaches. From there a workflow
  is `Task` rows owned by a server-side dispatcher, with the same claiming, conditions, skip cascade,
  retry and failure semantics as any other graph — one traversal engine rather than two that drift.
  The in-run walker is retained as the reference implementation the compiler is checked against, but
  refuses at its single choke point, so a workflow that runs at all provably ran on the new engine.

  Also in this change:
  - `Task` gains `StepType`, `PromptID` and a typed `Configuration` bag (`ITaskStepConfiguration`)
    carrying kind-specific settings, the payload mappings, the execution policy and the author's
    canvas layout. `CK_Task_Assignment` now counts `PromptID`.
  - Payload mapping semantics are lifted into `@memberjunction/ai-core-plus` so both engines share one
    dialect — the `*` wildcard, case-insensitive result lookup, `[]` append, `$message` fields, and the
    `static:` / `payload.` / `data.` / `context.` prefixes.
  - `ForEach` and `While` steps run through a new `TaskLoopExecutor`: bounds (`maxIterations: 0` means
    unlimited), `continueOnError`, delay, and parallel batches that keep results in **iteration** order.
  - New deterministic DAG layout (`LayoutTaskGraph` / `LayoutGraphNodes` / `GraphLayoutBounds`) — a
    `Task` row has no position columns, so a run view previously drew every node on the origin.
  - A settled graph credits its spending back to the submitting run through the `…Rollup` columns on
    `AIAgentRun`, which existed since v3 and were never written. `TotalCost` keeps its current meaning.
  - `TaskGraphActionRunner` returns a flat, name-addressable result instead of an `ActionParam[]`, so
    output mappings resolve and branch conditions can be evaluated.
  - `GetTaskGraphSubmitter()` now honours its documented contract and returns `null` when no
    durable-execution package is loaded, instead of an instantiated abstract base.

  New guide: `guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md`.

### Patch Changes

- 82a8585: A stopped task-graph dispatcher stops

  `pollOnce` checked `running` only when the tick fired, then awaited a provider, a rollup pass and a
  claim query before taking work. `Stop` could land in any of those gaps, so a dispatcher that had
  already been stopped went on to roll up graphs — emitting `GraphSettled` to observers that had been
  torn down — and to claim tasks it would never execute, leaving them claimed until their lease
  expired. On a graceful shutdown or a rolling restart that strands freshly claimed work for the whole
  TTL.

  `running` is now re-read after every await in the pass, including per iteration of the claim loop,
  and `Stop` waits for an in-flight pass before draining in-flight tasks. Without that ordering the
  drain loop could observe an empty `inFlight` set while a pass was moments from populating it, which
  is the exact state the drain exists to prevent — and is why `Stop`'s documented promise to wait for
  in-flight tasks did not hold.

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/notifications@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 2 of the unified workflow DAG engine program (plan: PR #3456) — task-graph execution moves server-side and becomes invocation-agnostic.

  **New package `@memberjunction/task-graph`.** Deliberately not AI-prefixed (D11): an LLM, deterministic code, or a human UI can all construct and submit a DAG. It contains `TaskGraphSpec` (the one fully-qualified contract every producer authors against, D16), a pure validator, `TaskGraphService` (submission), `TaskClaimStore` (the CAS claim protocol), and `TaskGraphDispatcher` (durable execution). Graph _semantics_ stay in the Phase 1 pure algorithms in `ai-core-plus` — eligibility, failure propagation, parent rollup and stall detection are consumed unchanged, so the in-run and durable executors cannot drift apart.

  **Submission is split from execution (D2).** `TaskGraphService.Submit` validates, resolves agents, persists parent + children + edges, and returns. Nothing waits for the work. That is what makes every channel equal (D1).

  **BREAKING: `ExecuteTaskGraph` is removed (D12).** It awaited an entire multi-step workflow inside one long-lived GraphQL request, so a page reload lost the awaited promise, a server restart orphaned every in-flight task, and no channel but Explorer could reach the substrate. Replaced by `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask`. Accepted deliberately in the open v6 window; its sole known caller — the Explorer conversation client — becomes an observer in this same change.

  **The durable dispatcher.** A compare-and-swap claim protocol over `ClaimedBy`/`ClaimExpiresAt` (the columns Phase 1 landed): claiming is a single guarded `UPDATE ... WHERE Status='Pending'` whose rowcount decides the winner, so two instances never run the same task without a distributed lock manager. Long tasks heartbeat to extend their claim; startup and periodic reconciliation return expired claims to `Pending`, which is what turns a crash from "work stranded forever" into "work resumes". Per D20 _every_ state transition is guarded on `ClaimedBy=@me`, not just the initial claim, because `MJ: Tasks` stays user-writable — a stale executor's completion write fails cleanly instead of double-completing. Human tasks are exempt from reclamation: a task parked on a person legitimately has no claim, and reclaiming it would reset an approval out from under the user.

  **Server-side detection at three seams.** Task graphs emitted in an agent's payload are now detected and submitted from the MJServer run path, `BaseMessagingAdapter` (ahead of the existing text-regex delegation, since a structured graph is unambiguous), and the Scheduling drivers. Previously only the Explorer client looked, so **Slack/Teams and scheduled routines silently dropped every graph an agent emitted** — the plan's core verified gap. The detection shim is explicitly temporary and dies in Phase 3 when `Tasks` becomes a typed `nextStep`.

  **Provider isolation.** The dispatcher mints a fresh provider per task via an injected `ProviderFactory`, so parallel tasks never share a transaction scope. MJServer supplies the implementation, keeping the dependency MJServer → task-graph and never the reverse.

  **Also:** 18 new unit tests for the validator; integration bundle grows with the three seam checks deferred from Phase 1 (cycle rejection, unknown-agent rejection, payload columns), now targeting `TaskGraphService`'s public API.

- 394d276: Phase 3 of the unified workflow DAG engine program (plan: PR #3456) — durable task graphs become a first-class agent primitive.

  **`'Tasks'` joins the Loop response union.** An opted-in agent emits `nextStep.type = 'Tasks'` with a `TaskGraphSpec` and the framework does the rest. The distinction from `subAgents[]` is durability, not parallelism: `subAgents[]` is ephemeral fan-out that blocks the run and dies with it, while a task graph becomes real Task rows a server-side dispatcher owns — visible in the Tasks UI, resumable after a restart, able to wait on a human.

  **The capability is gated, and the gate is enforced rather than advisory.** `enableTaskGraphs` defaults to **false**, unlike every other Loop prompt parameter. The others only shape the prompt — turning one off saves tokens and an agent that emits the feature anyway still works. This one governs whether an agent may create durable rows that outlive its run, execute on a dispatcher under the submitting user, and spawn further agent runs. So beyond omitting the type from the prompt, `LoopAgentType` _rejects_ a `'Tasks'` step from a disabled agent with a corrective that steers it back to Sub-Agent/Actions. The gate fails closed: an absent flag, an absent params bag, and the string `"true"` are all refusals.

  This matters more than it looks, because `HarnessAgentType extends LoopAgentType` and intentionally inherits `DetermineNextStep` — so the primitive reaches external agent harnesses (Claude Code / Codex / Pi running inside MJ) the moment it reaches Loop agents. That inheritance is the design working, but it moves the gate from a nice property of one class to the thing standing between a sandboxed external CLI and durable server-side work. It is therefore tested through the harness path, with the inheritance itself pinned so a later override cannot silently move those assertions onto a different code path.

  **`TaskGraphSpec` and its validator move to `@memberjunction/ai-core-plus`,** next to the pure graph algorithms they belong with. That is what lets the agent framework validate a graph without depending on the durable-execution package — which would otherwise drag the entity layer and the dispatcher into every context that merely runs an agent, including unit tests with no database. The Loop type validates against the identical contract the server re-validates at submission (D16), so a graph cannot pass one check and fail a different one later.

  **Single-node constant folding (D9), recorded rather than silent.** A one-node graph with no edges, an agent assignee and default continuation is rewritten into an ordinary in-run sub-agent call — don't spin up loop machinery for a loop of one. The `TaskGraph` run step is written either way, carrying the spec, a `folded` flag and the reason. Three consequences: run forensics show why a graph did or didn't reach the dispatcher; a user who edits a two-node graph down to one can read the durability change off the run record instead of inferring it; and Save as Workflow (D17) attaches to the recorded spec, so the single-node case — the shape most likely worth promoting — stays promotable. `durable: true` opts back into a Task row.

  **Submission crosses a registered seam.** `TaskGraphSubmitter` is declared in `ai-core-plus` and implemented in `@memberjunction/task-graph`, resolved through the ClassFactory. A host with no durable-execution package gets `null` and the agent reports an honest failure — what must never happen is a graph vanishing quietly while the model believes it scheduled work.

  **Continuation contract.** The parent Task row durably carries `continuation`, `reinvokeDepth` and the delivery marker, because the dispatcher instance that finishes a graph is routinely not the one that accepted it. Delivery marks _before_ it acts: the worst case becomes a missed notification visible in the task record rather than a notification repeated on every reconciliation sweep forever — which, for `reinvoke`, would be an unbounded agent-run loop. Chains are capped at 5 hops, bounded separately from task-nesting depth because they are different loops; at the cap the mode degrades to `message` so results still reach the user. `'reinvoke'` itself is not wired here — it would invert the dependency to task-graph → ai-agents — and lands in Phase 4 where the dispatcher already holds an execution engine.

  **Sage and the Workflow Planner stop payload-smuggling.** Both prompts move from `payloadChangeRequest.newElements.taskGraph` to the real `nextStep`, and the temporary server-side payload sniff introduced in Phase 2 is deleted along with its messaging and scheduling call sites — the primitive submits inside the run, so channel seams no longer need to look.

  **Launch opt-ins (D3):** Sage, Workflow Planner, Query Builder, and the Research Agent with its four sub-agents. Workflow Planner is not on the plan's opt-in list, but emitting task graphs is that agent's entire job, so leaving it gated would have broken it outright.

  **Coverage:** 43 new unit tests (18 Loop, 5 harness, 20 continuation-metadata) and a new integration check, TG8, asserting both directions the metadata gate can be wrong — an opt-in that was never pushed leaves an agent unable to delegate at all, and a Loop _type_ default left on would hand durable reach to every Loop agent in the install at once. IT71 runs 8/8.

- 394d276: Phase 4 of the unified workflow DAG engine program (plan: PR #3456) — convergence. Design-time flows and runtime task graphs stop being two graph models and become one.

  **One traversal engine, `GraphTraversalEngine`.** Flow agents and task graphs were always the same shape — nodes, conditional edges, joins — reached from opposite directions. `FlowAgentType` did not merely have its own copy of the traversal rules; it had **four**, written out separately for the post-prompt, post-action, initial-step and skip-recursion paths. They had already drifted: the skip recursion omits the inactive-destination fallback the other three have, so a skipped node routed differently from a normal one for reasons nobody chose. Both executors now consume one dependency-free engine — graph storage arrives through a synchronous repository seam, condition evaluation through an injected evaluator — so the in-run and durable executors keep completely different state backends while sharing one definition of the rules.

  **Four behaviors deliberately changed, each pinned by a named test** so a future "restore parity" pass has to argue with a test rather than quietly undo a fix:
  1. **Fan-out follows every satisfied edge.** The old code fetched the full edge list and then indexed `[0]`, silently discarding the rest — a genuine fan-out ran one branch and dropped the others with no diagnostic.
  2. **A missing destination is a rejection, not a fatal error.** Previously an _inactive_ destination fell through to the next alternate while a _dangling_ one failed the graph outright. A data problem should not be more fatal than a deliberately disabled step.
  3. **A condition that throws is distinguishable from one that evaluated false.** Both still refuse the edge — a malformed expression must never become an accidental `true` — but a graph stalled by a typo no longer looks identical to one that finished normally.
  4. **Results are addressed by node id.** The old lookup read the tail of the execution path, which was deduped on revisit, so a condition on a loop-back edge silently read a _different_ node's output.

  Also not ported: the `Priority <= 0` fallback branch, which was unreachable. Unconditional edges are collected in the main pass, so it could only run when every edge had a condition — in which case it matched nothing. Fallbacks work, and always did, via an unconditional low-priority edge.

  **Frontier, joins and concurrency.** `TraversalState` tracks a set of active nodes rather than a single program counter. AND-joins (matching `Prerequisite`) are the default and OR-joins map to `Optional` — which is _why_ the two models converge: "wait for every predecessor" is the same rule in both. A predecessor that failed, or that can no longer be reached, counts as settled rather than pending, so an AND-join behind an untaken branch cannot deadlock.

  **Flow gets a params bag.** `traversalMode` defaults to `'sequential'`, and that default is load-bearing: existing flows have fan-out shapes drawn in the editor that have never actually run in parallel, and flipping the default would start executing branches their authors have never seen run. Graphs built from a `TaskGraphSpec` always run parallel regardless.

  **Conditional edges for durable graphs** (migration: `TaskDependency.Condition`, NULL = unconditional, so no existing graph changes meaning). Same column shape and same grammar as `AIAgentStepPath.Condition` — deliberately, because if the two needed different storage then Save as Workflow would need a translation layer and the models had not really converged. The dispatcher resolves conditions by _dropping_ edges rather than adding a second rule to eligibility, which keeps one definition of "ready". One asymmetry is intentional: where the flow executor skips an edge whose condition cannot be evaluated, the dispatcher **keeps** it — there, dropping a prerequisite would run a dependent task early, turning a typo into out-of-order execution, whereas keeping it stalls the graph visibly.

  **Human tasks are announced.** A human task becoming eligible is the moment its assignee can finally act, and nothing else in the system knew that moment had arrived — the task sat `Pending` behind prerequisites and no save touched it when they cleared. Without a notification the workflow simply stopped, waiting on someone who was never told. The dispatcher now sends one through `NotificationEngine` (new metadata-seeded `Task Assignment` type) exactly once, marked durably so a restart cannot resend. Assignment stays self-only until the authorization model in #3524 lands.

  **`continuation: 'reinvoke'` is now delivered**, via a `TaskContinuationDeliverer` seam. Deferred out of Phase 3 because implementing it inside the dispatcher would have inverted the dependency to task-graph → ai-agents; the seam keeps the direction correct, and a host that cannot start agent turns degrades to a message rather than dropping the outcome of work that genuinely ran.

  **Save as Workflow (D17)** — `ConvertTaskGraphToAgentSpec` projects a runtime graph onto a Flow `AgentSpec`. That it is a projection and not a translation is the empirical test of whether the convergence was real. The one inversion: `dependsOn` points backwards, a flow path points forwards. Losses are **returned, never swallowed** — a conversion that quietly dropped a human approval step would hand someone a workflow that skips an approval they believed they had saved.

  **`TaskOrchestrator` retired.** Phase 2 orphaned it; it had zero callers and was not even exported.

  **Coverage:** 47 new unit tests (29 traversal engine, 18 converter) plus integration checks TG9 (conditional edges round-trip) and TG10 (the notification type is seeded). IT71 runs 10/10.

  Two latent test failures fixed along the way, both of which were hiding: `flow-agent-type.test.ts` (18 parity tests) stopped collecting once the adapters pulled `core-entities` into its module graph, and IT71 had a metadata record but was **never joined to the integration suite**, so it would not have run in the deterministic tier at all.

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

- 394d276: Follow-up to Phase 2 of the unified workflow DAG program (plan: PR #3456) — the task-graph control plane becomes **Remote Operations**, and the durable dispatcher actually starts.

  **BREAKING: the `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask` GraphQL mutations are removed**, one release after they were added. They shipped in Phase 2 as bespoke resolvers, which fixed the _durability_ problem — nothing awaits a whole workflow inside one request anymore — but left the _reachability_ problem exactly where it was: callable from the Explorer client and nothing else. That undercuts the program's own goal of letting agents **set up** workflows rather than only navigate to them.

  Remote Operations are MJ's typed control plane, and the closest analogous substrate already uses them for precisely this shape of verb: Record Set Processing exposes `Run` / `Pause` / `Resume` / `Cancel` / `Get Run Status` entirely as Remote Operations. One registration is reachable from MCP (external agents), from an Action wrapper (internal agents), and from the UI, with the framework's authorization scopes applied uniformly rather than re-implemented per resolver.

  The replacements are `TaskGraph.Submit`, `TaskGraph.Cancel`, `TaskGraph.RetryTask`, and `TaskGraph.GetStatus`. `GetStatus` is new — it has no mutation predecessor. It is the observation half of making execution durable: once nobody holds a request open, a caller re-attaching after a reload, an agent checking work it submitted, or an external MCP caller all need a way to ask "where is it?". Its rollup runs the same pure algorithm the dispatcher runs, so the reported status cannot disagree with the engine's own view.

  There is deliberately no `TaskGraph.Pause`. The dispatcher has no pause concept — pausing a claimed task means deciding what happens to its claim, and inventing that here to round out a verb set would be guessing ahead of Phase 4.

  **The durable dispatcher now starts.** Phase 2 landed `TaskGraphDispatcher` but nothing ever instantiated it, so a submitted graph persisted correctly and then sat in `Pending` forever — durable and inert, which is strictly worse than the client-driven path it replaced. MJServer now starts one instance per process after `listen()`, alongside the other boot-time reconcilers, keyed by hostname + pid so reconciliation can tell its own orphaned work from a peer's live work. It is gated on SQL Server because the provider factory mints a `SQLServerDataProvider`; the PostgreSQL branch lands with PG parity.

  **The dispatcher self-registers with `ShutdownRegistry`** rather than making each host remember to stop it. A dispatcher still polling through a graceful shutdown would claim work the process is about to abandon — creating exactly the orphaned-claim state reconciliation exists to clean up.

  The Angular conversation client now calls `TaskGraph.Submit` through the generic `ExecuteRemoteOperation` transport, so the hand-written GraphQL document is gone from the client as well.

- 394d276: Phase 6 (Track E) — **`WorkflowSpec`: one object binding WHAT runs to WHEN it runs.**

  `TaskGraphSpec` answered _what_ a workflow does; the scheduling and entity-action substrates answered _when_ something fires. Nothing expressed both at once, so "a workflow" was not a thing anyone could hand over — it was a graph plus a separately-configured trigger that only a human knew were related.

  **`graph` is `TaskGraphSpec` verbatim, not a copy.** That is why this composes rather than translates: a graph authored on the canvas, emitted by an agent, or promoted from a past run is _already_ this shape. A parallel graph type would have re-created the drift Phase 4 spent itself removing.

  **No new storage, and that is the design.** There is no `Workflow` table. A workflow's WHAT is a Flow agent; its WHEN is a Scheduled Job. `WorkflowSpecSync` **reconciles** those, following the pattern `MJRecordProcessEntityServer.Save()` already proved — resolve the type, find the rows this definition owns, upsert or disable. Inventing a `Workflow` row would create a second definition of "a scheduled thing" and give the scheduler two masters that can disagree.

  Rows are owned by a marker inside their own `Configuration`, not by name, so **renaming a workflow cannot orphan its schedule** and leave a second one firing beside the new row. A trigger the spec no longer names is **disabled, not deleted** — the row carries run counts, last-run and next-run, which are the only record it ever fired.

  **Order is load-bearing.** The agent persists _before_ triggers reconcile, because a Scheduled Job needs its ID to point at. Reversed, you get a job referencing an agent that does not exist — a schedule that fires forever and does nothing, with no error anyone sees. Validation runs before either, so a rejected save leaves no orphan agent behind.

  **Two operations, because drafting and committing are different acts.** `Workflow.Validate` writes nothing, so an agent can iterate a draft before anything reaches the scheduler — the draft-then-confirm shape dry-run and Plan Mode established. `Workflow.Save` commits. Both run the identical validator, so a workflow that validates cannot be rejected on save for a different reason. Together they close the "agents cannot schedule anything" hole: today `Create Scheduled Job` cannot even set `Configuration`.

  **Agent persistence crosses a seam.** `AgentSpecSync` is the one place that writes an agent; importing it into the execution substrate would invert the dependency, so the host registers a writer instead. A host without one gets an honest failure rather than a half-saved workflow. The writer reuses Phase 4's `ConvertTaskGraphToAgentSpec` unchanged — "save a runtime graph as a workflow" and "persist a workflow's graph" turn out to be the same operation, which is the practical payoff of the convergence.

  **A discovery worth recording:** `AgentScheduledJobDriver` has existed since the scheduling engine shipped, and `ScheduledJobType.DriverClass` is UNIQUE — so the `Agent` job type was already seeded. The substrate for scheduling an agent was there all along; only the authoring surface was missing. TG12 now pins that seed, because without it a scheduled workflow throws at the moment a user is least able to interpret it.

  **Draft is the default status**, not Active. Every authoring surface — the canvas, a chat card, an agent's MCP call — produces something the author has not yet watched run against real data.

  **Entity-change triggers reconcile too.** My first pass deferred these to Track D on the belief that entity-action invocation was not wired. AN-BC challenged that and was right: `HandleEntityActions` has fired entity actions from the save pipeline all along — validate, before/after save, before/after delete — and `Execute Agent` exists as the dispatch target, written for exactly this. Nothing was missing but the **binding row**. `WorkflowSpecSync` now creates the three rows that express "when an Invoice is updated, run Execute Agent with this agent": the `EntityAction`, the `EntityActionInvocation`, and an `EntityActionParam` carrying the agent. Idempotent by lookup rather than delete-and-recreate, because re-saving a workflow must not detach and re-attach a live trigger — a change landing in that window would be missed.

  40 new unit tests (29 validator, 11 sync) plus integration checks TG11 and TG12. IT71 runs 12/12.

### Patch Changes

- 394d276: **IT74 executes task graphs for real, and fixes the three production bugs that found.**

  IT71 has eighteen checks and not one of them runs a graph — nine assert metadata, nine verify the rows a save produces. Everything past "the rows are correct" was unit-tested against fixtures and never against SQL Server. IT74 stands up a real `TaskGraphDispatcher` with a stub `TaskAgentRunner` injected through its existing seam, so the claim protocol, condition evaluator and rollup all run with no model calls, no tokens and no network.

  **The dispatcher read its own work queue through a stale cache.** `TaskClaimStore` mutates task rows via direct SQL — correct, since the CAS guarantee _is_ the database's atomicity — but direct DML fires no invalidation, and the discovery queries used `RunView` without `BypassCache`. Completions written on the claim path stayed invisible, so `loadGraphState` kept seeing `In Progress` and graphs never rolled up.

  **A graph that succeeded could never settle.** `findActiveGraphIDs` selected graphs by non-terminal _children_, so the moment the last child completed the graph left that set — and the pass that would have rolled the parent up never saw it. Every fully-successful graph stayed `In Progress` forever and its continuation never fired. A _failing_ graph happened to survive, because blocking its dependents left them non-terminal for one more pass, which is why the bug hid behind a passing failure-path test.

  **A not-taken branch ran instead of being skipped.** A definitely-false edge condition was resolved by _dropping_ the edge — which removes the dependent's only prerequisite and makes it eligible in the very next wave, potentially before the node that gated it. The code's own argument against dropping unevaluable edges ("a prerequisite silently disappears and the dependent task runs early") applies verbatim to the false case. Such a dependent is now recorded unreachable and blocked, and only when _every_ route in was cut.

  Also hardened: `ComputeParentRollup` treats an empty child set as Complete-and-terminal, which is right for a childless graph and catastrophic for one whose reload came back empty transiently — it would mark live work finished and fire its continuation. The outer guard covered the first load only.

  `TaskGraphDispatcherConfig.PollIntervalSeconds` is new (default 5, unchanged behavior). The interval was hardcoded; five seconds is right for production, where steps are agent runs, but it made a four-node graph take twenty seconds to observe.

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/notifications@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
