# Change Log - @memberjunction/global

## 6.1.0-edge.5

### Patch Changes

- 1940a4d: Recover LLM responses broken by a single unescaped character, and stop misreporting why they broke.

  Models embed rich markdown in JSON string fields — mermaid diagrams, HTML mockups, code samples — and reliably escape most of it. One missed quote inside a 25KB response invalidates the whole document. Three defects meant that was unrecoverable and misdiagnosed.

  **`CleanJSON` discarded the response over an interior fence.** Once the top-level parse failed for any reason, fence extraction ran unconditionally. That regex has no idea it is looking inside a string value, so a ` ```mermaid ` fence embedded in a markdown field matched, its contents were extracted, the JSON envelope was thrown away, and `CleanJSON` recursed into the fragment. A 28KB agent response with one unescaped quote at offset 23011 was reported as `Unexpected token 'm', "mermaid\ns"...`. Fence extraction now skips input already shaped like a JSON envelope — a genuinely fence-wrapped response starts with the fence and a prose-buried one starts with prose, so neither is affected. The throw also carries the untouched parse error as `cause`.

  **The repair chain reasoned from the wrong error.** `attemptJSONRepair` received whatever escaped `JSON.parse(CleanJSON(rawOutput))`, which may describe one of `CleanJSON`'s intermediate transforms rather than the model's actual output. That message was handed to the AI repair prompt as `ERROR_MESSAGE`, recorded on the prompt run, and re-thrown — so a model was asked to fix an unexpected `'m'` in a mermaid fragment when the real defect was one quote at a known offset, in text it was never shown. `resolveTrueParseError` now derives the error from the raw output directly.

  **Nothing could repair an unescaped quote.** JSON5's leniency covers trailing commas, comments and unquoted keys, but an unescaped `"` terminates a string in JSON5 exactly as in JSON, leaving only an LLM round-trip on the full payload. New `RepairJSONEscaping()` in `@memberjunction/global` is error-driven and deterministic: read the failure offset, walk back to the character that ended the string early, escape it, re-parse, repeat. Every pass is validated by a real parse, so it cannot pattern-match its way to a wrong answer the way a global regex rewrite would, and it gives up rather than guessing when it cannot make progress. It runs in `attemptJSONRepair` between the JSON5 and AI stages — microseconds against an LLM round-trip, and it cannot invent content. `_jsonRepairInfo` gains a `LexicalEscaping` method and records the offsets escaped, because that repair infers intent and should never be invisible.

  Replayed against 16 real failing production payloads: 16/16 recovered, 180 characters escaped, 12ms total. Each repair verified escapes-only — removing the inserted backslashes reconstructs the original byte-for-byte — with a valid response shape. Against 34 already-valid payloads, 20 containing markdown fences: zero false positives. The production failure that motivated this had burned all ten agent retries, roughly four minutes and 79K completion tokens, before terminating; it now recovers in 0.61ms with the AI stage never reached.

- 23c2521: Close silent-failure gaps in Open App config writes, class registration, and update checks — and
  fix the first real collision the new class-registration diagnostic found.

  `dynamicPackages` idempotency matched the whole config file rather than the target array, so a
  `shared` package — which must be written to both `server` and `client` — had its client insert
  skipped by the server entry written moments earlier. The package never reached
  `dynamicPackages.client`, so its `@RegisterClass` components were tree-shaken out of the browser
  bundle with no error raised anywhere. The check is now scoped to the target array's body.

  Upgrades were add-only, so `mj.config.cjs` converged on the union of every version ever installed
  and a package dropped in v2 kept being bootstrapped. `PruneDynamicPackagesNotInManifest` now runs
  on the upgrade path, after the adds; surviving entries are left byte-identical so an operator's
  `Enabled: false` is not silently reset, keep-sets are per-array, and an entry shape that cannot be
  parsed is a no-op rather than a guess. A renamed `startupExport` is retargeted in place — keying
  only on package name left the old export name in the config forever, and ServerBootstrap then reads
  `mod[StartupExport]`, gets `undefined`, skips it because it is not a function, and still logs
  `(ran <old name>)`. The add-then-prune order is chosen for the failure case: these are two writes
  to the same files with no rollback between them, and adding first leaves that window holding
  (old ∪ new), so a server that restarts mid-upgrade still finds every entry it needs. Pruning first
  would leave a subset of both versions and the app's registrations would vanish.

  `@RegisterClass` passes `priority = 0`, which routes to the auto-increment branch, so a later
  registration always wins — correct for an inheritance chain, silently wrong for two unrelated
  classes colliding on a key. Only `priority > 0` ever warned, so in practice nothing warned.
  `ClassFactory.Register` now warns naming every prior unrelated registration for that
  `(base class, key)` pair, using a new `AreClassesRelated` that compares by name as well as identity
  so a module loaded through two paths does not read as a collision. Registration behavior is
  unchanged; the warning is diagnostic only. Measured over a realistic MJAPI load — 1,318 real
  registrations across 697 `(base, key)` groups — it fires on exactly one pair, with no false
  positives.

  That one pair was a real bug, fixed here. `MJConversationDetailEntityServer` and
  `MJConversationDetailEntityExtended` both registered for `BaseEntity` under
  `'MJ: Conversation Details'` as siblings, each extending the generated entity directly. The server
  package loads last, so it won outright and the Extended class's `Save`/`Delete` permission gate —
  the check that only a conversation's owner may set `UserRating`/`UserFeedback`, and that a
  non-owner without a resource grant cannot write at all — never ran. The gate is explicitly written
  to run server-side (`ProviderType === 'Database'`), which is exactly where it was being shadowed
  out. `MJConversationDetailEntityServer` now extends `MJConversationDetailEntityExtended`, so the
  edit-flag logic and the permission gate compose instead of one replacing the other. The resolved
  class is unchanged; only its base is.

  `mj app check-updates` dropped the per-repo `TokenMap` that `install` and `upgrade` both use, so
  private repos reported "up to date" forever; dropped each app's `Subpath`, so a multi-app repo
  reported a **sibling app's** version as this app's latest; and let one throwing app kill the sweep
  or vanish from a report that still concluded "All apps are up to date". The loop moved into a
  testable `CheckAppsForUpdates` helper with the version lookup injected, and failures are collected
  per app and reported.

  A lookup that returns no version at all is now reported as `Unresolved` — a third outcome, distinct
  from both an update and a failure — and the green "All apps are up to date" line is printed only
  when every app actually produced an answer. Every app in the list is installed, so it resolved from
  a real ref once; finding no version now means the resolver and the repository disagree. This matters
  because `ListGitHubTags` reads a single page of the GitHub tags API: against
  `MemberJunction/Integrations` (374 tags), the scoped `<subpath>@<semver>` tag line for every
  installed connector sits past page 1, so all nine apps resolve to nothing. Without this, scoping the
  lookup by `Subpath` would have traded a wrong-but-obvious answer for a confident false green.
  Pagination itself is fixed separately in #3353, which should land with or before this.

## 6.1.0-edge.4

### Patch Changes

- 4586215: Two hot-path costs removed from MJGlobal with byte-identical behavior:
  - **ClassFactory builds its resolution-failure diagnostic lazily.** The multi-KB string (a scan over every registration in the process) was built on every fallback resolution and then, on the designed probe path (`@OptionalKeyedSpecialization` — once per field of every entity), discarded unread. It is now computed only when something actually reads it — `CreateInstance`'s hard error still gets it eagerly, an emitted report formats it exactly as before, and the fallback result's `Reason` is an enumerable getter returning the identical, memoised string (spread/`JSON.stringify`/`Object.keys` unchanged). `GetAllRegistrations` also hoists its loop-invariant name/key normalization out of the per-registration filter.
  - **`GetGlobalObjectStore` stops throwing on every server call.** In Node, bare `if (window)` on the undeclared identifier threw a `ReferenceError` per call, with the catch falling through to `global` — correct answer, pathological path, measured at several percent of a busy server's CPU. `typeof` probes (legal on undeclared identifiers) replace the try/catch ladder, and the answer — fixed at process startup by definition — is memoised. Node still gets `global`, the browser still gets `window`, an exotic sandbox still gets `null`.

- a5f92d2: Add canonical `EscapeSQLString` utility to `@memberjunction/global` for safe escaping of string literals in SQL statements, clauses, and `ExtraFilter` predicates, and adopt it across core packages in place of duplicate ad-hoc implementations.

  Call sites now use `EscapeSQLString` directly rather than package-local aliases. `@memberjunction/schema-engine` no longer exports `EscapeSqlString` at all — it had no callers, so it is removed outright rather than deprecated. The remaining three exported aliases — `EscapeSqlString` (`@memberjunction/open-app-engine`), `escapeSqlLiteral` (`@memberjunction/database-designer-core`) and `escapeSqlString` (`@memberjunction/version-history`) — are kept as `@deprecated` re-exports so external callers do not break, and will be removed in the next major.

  `EscapeSQLString` escapes string literals only. Its documentation, and the `data-access` rule, now spell out the three cases it does not cover: `LIKE` patterns (where `%`, `_` and `[` remain live wildcards), identifier names (use SchemaEngine's `ValidateIdentifier()`), and values whose absence should be an error (`null`/`undefined` escape to `''` rather than throwing).

## 6.1.0-edge.3

### Patch Changes

- 834f8d7: Fix a `TypeError` that could kill an agent mid-run during context assembly, and take down scheduled-job dispatch entirely (`__mj_CreatedAt?.getTime is not a function`, `job.NextRunAt.getTime is not a function`).

  Two defects, one crash:
  - **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a date field declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. This affects **every** engine with `CacheLocal: true`.
  - **Unguarded `Date` method calls on those fields (the crash sites).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. A new `ToEpochMs(value)` helper is exported from `@memberjunction/global` (a pure date utility — it needs no entity or metadata concepts) and now backs every affected read across four engines: `AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`, `ConversationEngine.sortConversations`, and the scheduling engine's `isJobDue` plus its `NextRunAt`/`EndAt` diagnostics. It also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator.

  Two exposures worth calling out. `AIEngine.fallbackGetNotesFromCache` is reached whenever the note vector service is uninitialized or a query embedding fails, so semantic retrieval with real input text could crash too — not just the empty-input path. And `SchedulingEngine.isJobDue` throws on the _first_ job in the dispatch loop, so a poisoned cache stopped **all** scheduled jobs from running, on every poll, until the cache reloaded.

  `isJobDue` also had a silent variant of the same bug: `evalTime < job.StartAt` does not throw on a string — relational operators coerce toward numbers, an ISO string yields `NaN`, and every comparison is false — so `StartAt`/`EndAt` activation windows silently stopped being enforced and a job could fire outside its range with nothing in the logs. Those comparisons now go through `ToEpochMs` as well.

  Making the cache-event path work also exposed a filtering gap (caught in review): `SchedulingEngineBase` loads `MJ: Scheduled Jobs` unfiltered and applies its Active-only invariant in memory, but only re-applied it on entity events — not after a cross-server cache event, whose payload carries every row. In a multi-instance deployment, one server's engine load could therefore hand another server's dispatch loop Disabled/Paused/Pending jobs. The engine now re-applies the filter (and notifies `JobsChanged$`) after `OnExternalCacheChange`, and `isJobDue` independently refuses non-Active jobs so dispatch can never depend on the array staying pre-filtered.

- cefc302: security: harden SQL-filter validation, the OAuth callback handler, API-key lookup, and the new-user domain gate

  **SQL literal stripping (`@memberjunction/global`, `@memberjunction/core`).** Both of MJ's SQL screens — `DatabaseProviderBase.ValidateUserProvidedSQLClause` (which guards `ExtraFilter`, `OrderBy` and `UserSearchString`) and `SQLExpressionValidator` (which guards `Aggregates` and ad-hoc queries) — stripped string literals with a regex that honored **backslash escaping**. SQL Server and PostgreSQL do not treat `\` as an escape, so a payload such as `x = 'a\') ; DROP TABLE Users; --'` was swallowed whole as one "literal" and stripped away before the keyword denylist ran, while the database closed the literal at the real quote and executed the stacked statement. Both screens now share a single `StripSQLStringLiterals` helper that matches SQL-standard doubled-quote (`''`) semantics, and a regression suite in each package pins the behavior.

  **OAuth callback handler (`@memberjunction/server`).** Caller-supplied `connectionId` was interpolated into a raw `ExtraFilter` without escaping; it is now validated as a UUID at the request boundary and escaped at the SQL sink. `frontendReturnUrl` was redirected to after only a URL-parse check, making the callback an open redirect from the trusted MJAPI origin; its origin is now validated against `cors.allowedOrigins` (plus the built-in redirect origins) both when the flow is initiated and when the redirect is issued.

  If you run frontends other than MJExplorer against MJAPI, note that the return-URL allowlist is derived from `cors.allowedOrigins`. Deployments on the default `['*']` are unaffected — every return URL is still allowed. Deployments that have narrowed `cors.allowedOrigins` are mostly self-protecting, since a browser frontend must already be on that list to call `/oauth/initiate` at all, but three cases can now fall back to MJAPI's built-in page instead of returning to the app: a return URL on a _different_ origin than the caller, a server-to-server initiate whose return origin was never CORS-listed, and any proxy setup where the browser-visible origin differs from the configured one (matching is exact on scheme + host + port). Each rejection is logged with the offending URL.

  **API-key lookup (`@memberjunction/api-keys`).** `ValidateKeyByHash` now asserts its argument is a SHA-256 hex digest before building the SQL filter, enforcing the injection-safety invariant at the sink for all present and future callers.

  **⚠️ Behavior change — `userHandling.newUserAuthorizedDomains`.** The new-user domain gate previously authorized against the hostname parsed from the request's `Origin` header, which is trivially spoofable on non-browser requests: a holder of any valid IdP token could auto-provision an account under an authorized domain by forging `Origin`. It now authorizes against the **email domain of the verified identity token**.

  If `newUserLimitedToAuthorizedDomains` is enabled, review `newUserAuthorizedDomains` before upgrading:
  - Entries that are **frontend hostnames** (`app.example.com`, `localhost`) must be replaced with the **email domains** your users sign in with (`example.com`). Deployments where the two happened to coincide are unaffected.
  - Wildcards match in full, so `*.example.com` matches `mail.example.com` but **not** `example.com` — list both if you need both.
  - Identity providers that issue a bare username with no `email` claim can no longer auto-provision; the denial is logged explicitly. Configure the provider to emit an `email` claim, or set `newUserLimitedToAuthorizedDomains: false`.

  The gate is off by default (`newUserLimitedToAuthorizedDomains: false`, `newUserAuthorizedDomains: []`), so deployments that never enabled it are unaffected.

  **⚠️ Related expansion — MCP OAuth auto-provisioning.** Auto-provisioning previously also required a non-empty request `Origin` as a precondition for entering the check at all. `MCPServer`'s `resolveOAuthUser` passes no request domain, so with the domain gate enabled, MCP OAuth users could never be auto-created regardless of their email domain. Now that the spoofable precondition is gone, an MCP OAuth user whose **JWKS-verified** token carries an authorized email domain plus given/family name claims **will** be auto-provisioned, consistent with the browser path. If you run MCP with `newUserLimitedToAuthorizedDomains` enabled and were relying on that side effect to keep MJ user records from being created, add the restriction explicitly (narrow `newUserAuthorizedDomains`, or set `autoCreateNewUsers: false`).

- be0bdb2: Follow-up hardening for Query & Entity Materialization (#3735). Each item below fails toward doing the
  wrong thing rather than doing nothing, so none of them surface as an error in normal operation.

  **Row-restriction gates read both fence layers.** MJ enforces row restrictions in two AND-composed
  layers — role RLS and API-key row filters — and the mint, drift and runtime Leak-1 gates each re-derived
  a role-only predicate inline. An entity fenced _only_ by an API-key row filter therefore read as
  unrestricted; because the mint gives the materialized entity a NEW EntityID, the key's EntityID-keyed
  binding stops matching it, and the principal is served a full unscoped snapshot of rows it cannot read
  live. All gates now compose both layers, and an unproven layer counts as restricted.

  **Lost provenance is now drift.** Deleting a source query cascade-deletes the `MaterializedResultQuery`
  join row while the snapshot, the minted entity and its read grants all survive — which silently disarmed
  both the RLS re-check and the read-grant re-narrow, leaving the unscoped snapshot serving indefinitely.
  It now revokes read and holds.

  **A zero-row external query no longer destroys the snapshot.** Columns are derived from the returned
  rows, so an empty result built a surrogate-only shadow, dropped the canonical table and renamed that
  shell into its place — every subsequent read failing on a missing column while the refresh reported
  success. An empty result now refuses the rebuild and leaves the existing snapshot serving.

  **The refresher snapshots the statement the read path executes.** Reads resolve SQL through
  `GetPlatformSQL(PlatformKey)`; the refresher snapshotted the base `SQL`, so a query carrying a
  per-platform variant was materialized from a different statement than live serves.

  **`XACT_ABORT` no longer escapes onto the pooled connection.** The swap, recompute and dirty-group
  batches each set it ON and never restored it. SET options persist for the session, so unrelated requests
  handed the same physical connection inherited it — turning their recoverable statement-level errors into
  full transaction aborts, far from anything to do with materialization.

  **The DDL identifier guard no longer opens on its own failure.** `assertSafeObjectNames` throws on a
  tampered `SchemaName`, but the failure path then passed that same rejected name to the best-effort shadow
  cleanup, which interpolated it raw into `DROP TABLE`/`OBJECT_ID`. The cleanup now re-checks and declines.

  **Two analyzers that produced silently wrong rows.** A `UNION`/`EXCEPT`/`INTERSECT` parses to a single
  `select` root whose `groupby` and `columns` describe only the first branch, so a set operation yielded an
  aggregation key covering one branch and the incremental MERGE collided both branches on the same hash.
  And a row-filter predicate was bound to an output column by bare name, which cannot tell `o.Status` from
  `c.Status` across a join, nor an alias from the column it rebinds.

  **Missing manifest registrations.** Neither new `@RegisterClass` class was in the pre-built manifests, so
  a bundled MJAPI tree-shook both away: the refresh driver never resolved, nothing was ever refreshed, and
  `Status` stayed `Active` while the read paths served mint-time data forever.

  **Read-routing distinguishes a failed lookup from "not materialized".** Only three roles hold `CanRead`
  on `MJ: Materialized Results`, so a restricted user silently got live data for every materialized request
  while an admin got the snapshot. The live fallback is correct and unchanged; the silence was the defect.

  **Note on coverage.** The predicate-binding proof and the join-qualifier requirement are deliberately
  conservative and will refuse shapes that previously qualified: a row-filter query whose predicate or
  projection is unqualified across a join now stays live-only, and an aggregation over a join with an
  unqualified `GROUP BY` loses its incremental key and falls back to `FullRebuild`. Both refusals are
  logged with the specific reason. Falling back to live is always correct — but a query that silently gets
  slower is easier to diagnose knowing this changed.

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

## 6.1.0-edge.2

### Minor Changes

- 080f4cd: Add `IsMemberOverridden(instance, member, BaseClassRef)` to `ClassUtils`.

  Answers whether a subclass replaced a member somewhere between an instance and a given base class,
  which is what distinguishes "the author made no choice" from "the author chose the value that
  happens to be the default" — something a base-class member cannot express on its own. An API whose
  default sits in the _off_ position therefore silently disables exactly the subclasses that most
  wanted it on.

  Handles methods and accessors alike by comparing property descriptors, finds an override declared
  anywhere in a multi-level chain, returns false rather than throwing on bad input, and caches per
  (class, member, base class) so a hot path does not re-walk a prototype chain.

  Used by `BaseEntity` to decide whether to run an overridden `ValidateAsync`.

- 48ff99f: Add `ModelConfiguration` — a per-modality, strongly-typed JSON configuration bag on the AI model catalog — at three levels forming an inherit-with-override cascade: `AIModelType` < `AIModel` < `AIModelVendor`, resolved base-first with per-key deep merge. One interface (`IAIModelConfiguration`: `LLM` / `Realtime` / `Vision` / `Audio` sections) is shared by all three levels via MJ's JSONType mechanism, so CodeGen emits typed `ModelConfigurationObject` accessors on all three entities. This generalizes the scalar cascade those tables already carry (`SupportsPrefill` / `PrefillFallbackText`): new session/call-time capability knobs now land as typed properties in one bag instead of a column per knob. Existing capability columns are untouched. `AIEngine.GetEffectiveModelConfiguration(modelID, modelVendorID)` is the single canonical read path; the pure `ParseModelConfiguration` / `ResolveEffectiveModelConfiguration` live in `@memberjunction/ai`.

  First consumer: realtime turn detection. `Realtime.TurnDetection` (`Mode: 'default' | 'serverVad' | 'semanticVad' | 'native'`, plus eagerness / threshold / silence tuning) flows catalog → session config bag → provider wire block on both realtime topologies, with precedence `profile default < ModelConfiguration cascade < realtime.session.turnDetection < runtime configOverridesJson`. Profiles declare `supportedTurnModes` and translate through the shared `MapNormalizedTurnDetection`; an unsupported mode is diagnostic-logged and falls back to the profile default, so a shared model catalog never rejects a session on any provider. Non-protocol drivers scrub the key. Turn detection was previously hardcoded per provider profile, so smarter models had no way to opt into their smarter turn modes.

  Fixes a latent bug: a live `Reconfigure` (the meeting-mode auto-response flip) hardcoded `server_vad`, silently downgrading any session running a non-server-VAD turn mode. It now rebuilds the session's actual resolved mode, with meeting-mode floor control composed on top.

  GPT Realtime 2.1 and 2.1-mini are seeded to `semanticVad` (eagerness `auto`) at the model level — the one behavior-affecting change here. Everything else is behavior-neutral while `ModelConfiguration` is `NULL`.

### Patch Changes

- de343b5: Stop error diagnostics from carrying credentials into the log.

  **GraphQL transport.** `graphql-request`'s `ClientError` serialises the originating request — variables included — into its own `message` at construction, and V8 then embeds that message in `stack`. A mutation carrying a secret therefore holds it in three places on the error at once, and `ExecuteGQL` logged the object directly before calling `LogError(e)`, which stringifies it and re-emits the same payload. Redacting `request.variables` on a copy reaches none of that; spreading the error to redact it also drops `message` and `stack`, since both are non-enumerable on `Error`.

  New `SanitizeGraphQLError` builds a fresh diagnostic object from an allowlist of safe fields instead — re-deriving the message from `response.errors[0]` and stripping the header line off `stack` — so a change to the upstream error shape cannot silently widen what is logged. Response status, GraphQL errors, error code, query text and stack frames are all preserved; only values are withheld, and the log gains the variables' _shape_ (key names and value types, never values) so a redacted failure stays diagnosable. The caught error is never mutated, so JWT-expiry handling and every caller of the rethrown error are unaffected.

  `GraphQLProviderConfigData.LogVariableValues` (default `false`) opts in to logging values during development, mirroring the server's existing `loggingSettings.graphql.logVariables` tier.

  **OAuth2 token endpoints.** A token endpoint is the one call where a credential arrives in a response _body_. Five sites echoed that body into an `Error` message: the Integration and Actions OAuth2 managers, the MCP client's `TokenManager` and `ClientRegistration`, and the SharePoint storage driver's token refresh. RFC 6749 §5.2 says an error response carries no token, which makes this look safe — but token endpoints routinely echo the failing request back, and that request carries `client_secret` and the refresh token. The Integration site was reached on HTTP 200 as well, whenever the token sat somewhere its parser did not look, in which case the echoed body _was_ the access token.

  New `describeTokenEndpointFailure` in `@memberjunction/global`, shared by all five, surfaces only `error` and `error_description` and withholds everything else, including bodies that fail to parse.

  No API removals and no behaviour change for callers: the only observable differences are the contents of log lines and the text of token-endpoint error messages.

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

## 5.49.0

### Patch Changes

- a8cb2b6: Explicit ClassFactory resolution failure + permission provider fault isolation (B34/B35)

  `ClassFactory.CreateInstance` has never returned `null` for an unregistered key — it falls back to
  instantiating the anchor base class — so every call site written as `if (instance) { use } else { error }`
  had a dead failure branch and silently installed a hollow base-class object.
  - **`@memberjunction/global`**: adds `TryCreateInstance` / `TryCreateInstanceAsync`, which return an
    explicit `ClassResolutionResult<T>` (`Resolved` / `Instance` / `Reason`). Bases that cannot function
    standalone opt in with `static readonly RequiresSubclass = true`: on a fallback they now throw from
    `CreateInstance` and return `{Resolved: false, Instance: null}` from `TryCreateInstance`. Bases without
    the marker keep the historical base-class fallback (e.g. `BaseEntity`) and emit a structured, once-per-key
    warning listing the registered keys for that base plus the call-site stack. `CreateInstance`,
    `CreateInstanceAsync`, and the `Try*` variants all route through one shared resolution path.
  - **`@memberjunction/core`**: `PermissionProviderBase` declares `RequiresSubclass = true` — every member is
    abstract, so a base instance is a method-less stub.
  - **`@memberjunction/core-entities`**: `PermissionEngine.instantiateProviders` uses `TryCreateInstance`, so
    an unresolvable `ProviderClassName` is now genuinely skipped instead of installing a stub as a live
    provider. The `GetAllUserPermissions` / `GetPermissionsGrantedByUser` / `GetPermissionsSharedWithUser`
    fan-outs defer each provider call into a promise body so a SYNCHRONOUS throw (a missing method) is
    isolated by `Promise.allSettled` instead of rejecting the entire aggregate for every user.

- 13d9b8e: Stop the ClassFactory resolution-fallback instrumentation (added in #3197) from flooding builds.

  Two false-positive classes were being reported as fallback "failures":
  - **Null/empty key** — `CreateInstance(LoggerBase, null)` means "give me the default implementation for this base". Landing on the base is the _intended_ outcome, not a failed lookup.
  - **Unbounded volume on hot paths** — the dedup keyed on `(base, key)`, which does nothing for callers whose key varies per item. Every `EntityField` hydration calls `CreateInstance(EntityField, '<entity>.<field>')`, so a full repo build emitted thousands of distinct warnings and buried anything real.

  Null-key fallbacks are no longer reported, and remaining fallbacks are capped **per base class** (3, then one summary line). Marker-bearing (`@RequiresSubclass()`) bases are never capped — those are hard errors.

  Suppressing by "this base has no registrations" was tried and **reverted**: a tree-shaken registration leaves zero registrations, which is exactly the B34/B35 shape this instrumentation exists to catch. The unit tests caught that regression.

  Verified: full repo build (293 + 265 tasks) emits **zero** ClassFactory warnings; MJGlobal 581 tests pass.

- 9c07270: Convert the `RequiresSubclass` marker from a static class property to a `@RequiresSubclass()` decorator, and fix an inheritance bug in how it was read.

  `@RequiresSubclass()` applies an own, non-enumerable marker (`__mj_RequiresSubclass`) to the class prototype, and `ClassRequiresSubclass(classOrInstance)` reads it via an **own-property** check.

  That own-property semantics is the substantive change. The previous `(baseClass as X).RequiresSubclass === true` read walked the constructor prototype chain, so **every subclass of a marked base also reported `true`** — meaning a ClassFactory resolution against a concrete, perfectly instantiable subclass would have wrongly thrown. The marker now applies to exactly the class that declared it.

  The decorator also matches the existing `@RegisterClass` idiom, keeps the marker key defined in one place rather than retyped as a literal per base, and centralizes the own-property check so call sites can't get it wrong.

  Backward compatible: the legacy `static RequiresSubclass = true` form is still honored (with the same own-property semantics).

## 5.48.0

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0

### Minor Changes

- c1f2d3d: User Routines (P1.5): user-owned scheduled/monitoring routines that run an Agent, Action, or Prompt on a cron schedule. New UserRoutine/UserRoutineRecipient/UserRoutineRun schema; UserRoutineDispatcherDriver scheduled-job driver (1-minute sweep, claim-before-run, bounded concurrency, per-routine isolation, runs as the owner, Template-driven notifications with OnChange result-hash detection, RequestedSkillIDs pre-arming for Agent targets); pure UserRoutineProcessor schedule/notify primitives shared with MJUserRoutineEntityServer (NextRunAt on save, cron validation) and MJUserRoutineRecipientEntityServer (User-xor-Email); lazy non-startup UserRoutineEngine; new @memberjunction/ng-user-routines widget set (list/editor/history + command-center composite + slide-in, cancelable Before/After events, Agent-only creation with categorical ng-trees picker); conversations bottom-sidebar Routines section gated by ShowRoutines input AND entity-Read permission (hosted in both the generic workspace sidebar and Explorer's Chat wrapper); Routines Explorer app; pure cron preset/describe helpers now in @memberjunction/global (CronUtils); mj-tree gains a DefaultExpansion input ('first-level' | 'all' | 'none'); BaseScheduledJob gains IsHighFrequencyByDesign so by-design pollers (the routine dispatcher) opt out of the high-frequency cron warning; Agent-target routines run inside a dedicated per-routine Conversation (Application-scoped via the Routines app so it stays out of the default chat list; RunAgentInConversation writes proper user/assistant turns; standalone fallback when the app is absent); UserRoutine.ConversationID schema + open-conversation and open-execution-record event chains through the conversations hosts; server-side cascade delete (recipients + run bookkeeping) so routines that have run delete cleanly; agent picker is a compact mj-tree-dropdown (DefaultExpansion pass-through added); mj-slide-panel settles to transform:none when open so position:fixed descendants (dropdown panels) keep true viewport coordinates; time-relative sidebar/card/history text is snapshot-based (NG0100 fix); 16-test live integration suite + live Playwright E2E; Explorer notifications page rebuilt (day-grouped cards, sanitized HTML + Markdown message rendering with expand/collapse previews, snapshot relative times, removal of a test harness that created junk Conversations on Mark-All-Read) and the seeded routine notification template gains a compact Markdown Text body that the dispatcher now prefers for in-app delivery (the HTML document stays for email); new @memberjunction/ng-composer package extracts the conversations message composer (mention editor + dropdown + message input box) so the routine editor's InitialMessage field uses the mention editor without an ng-conversations dependency cycle — and the composer's mention/command triggers are PLUGGABLE: a generic ComposerTriggerProvider contract (TriggerChar/Key/Priority/GetSuggestions, generic MentionSuggestion with provider-supplied presets) with two supply modes (explicit [TriggerProviders] list, or ClassFactory discovery via @RegisterClass(ComposerTriggerProvider,'<key>') filtered by [ExcludedTriggerKeys]), leaving ng-composer with ZERO AI knowledge; the AI plugins moved to ng-conversations (composer-plugins: 'agent-mentions' '@' agents+users w/ configuration presets, 'record-mentions' '#' entities+queries, 'skill-commands' '/' skills — tree-shake-guarded by LoadComposerPlugins(); MentionAutocompleteService moved back to ng-conversations as a BaseSingleton engine shared by plugins and components) plus a new mj-ai-composer wrapped component that proxies the full mj-message-input-box surface with the AI triggers built in and familiar EnableAgentMentions/EnableEntityMentions/EnableSkillCommands convenience flags (the chat composer now uses it); the routine editor uses discovery mode with agent-mentions excluded.

## 5.44.0

### Patch Changes

- 5396d90: Add permission-constrained engine loading to BaseEngine — pre-checks entity read permissions during Config() and skips all entity configs (all-or-nothing) when the user lacks access, preventing endless retry loops and console error flooding for org-scoped SaaS users. Engine getters now use GetConfigData() which throws a typed PermissionConstrainedError instead of silently returning empty arrays. Also fixes unsafe GetHighestPowerModel/GetHighestPowerLLM return types and resolves FK_AIAgentRunStep_ParentID race in fire-and-forget step saves.

## 5.43.0

### Minor Changes

- 9f6aa87: Generic fire-and-forget save queue, realtime multi-agent floor control, and telemetry fixes.

  **Generic fire-and-forget save queue** (`@memberjunction/global`, `@memberjunction/core`, + adopters) — de-duplicates the hand-rolled "INSERT (fire-and-forget) → chained UPDATE" persistence pattern and makes the "stuck at Running" race structurally impossible:
  - `KeyedSerialTaskQueue` (`@memberjunction/global`) — entity-agnostic per-key serial task chain: same-key tasks serialize, different keys run concurrently, failures are tallied for `flush()` and never propagate. Self-bounding (in-flight set + failure counters), so a long-lived queue that never flushes doesn't grow.
  - `BaseEntitySaveQueue` (`@memberjunction/core`) — entity façade: `Insert` / `Update(entity, applyMutation?)` / `Flush`, with an optional `onError` hook for structured logging. `Update`'s mutation runs _inside_ the post-INSERT task, so it can never be reverted by the INSERT's reload.
  - Adopted in all three hand-rolled copies + the new consumer: `GenericProcessRunTracker` (`@memberjunction/record-set-processor`), `AgentRunStepSaveQueue` (`@memberjunction/ai-core-plus`), `ActionEngine`'s execution log (`@memberjunction/actions`), and `AIPromptRunner` / `AIModelRunner` (`@memberjunction/ai-prompts`). Also fixes a pre-existing `MJLruCache` mock gap in the Actions/Engine test suite.

  **Realtime** (`@memberjunction/ai`, `@memberjunction/ai-bridge-server`, `@memberjunction/ai-gemini`, `@memberjunction/ai-openai`, `@memberjunction/livekit-room-server`, `@memberjunction/ng-livekit-room`) — multi-agent floor control, Gemini meeting mode, the session capability surface with first-agent re-gating, and an idle reaper.

  **Telemetry / core** (`@memberjunction/core`, `@memberjunction/server`) — cacheability-aware duplicate-RunView suggestion for `AllowCaching=false` entities; fixes the telemetry pagination-fingerprint false-duplicate and batches the janitor channel reads.

## 5.42.0

### Minor Changes

- 0fa3cbc: Record Set Processing & Record Processes, plus the Remote Operations primitive.

  **Remote Operations** (`@memberjunction/core`, `@memberjunction/global`, `@memberjunction/graphql-dataprovider`, `@memberjunction/server`) — a typed, provider-routed capability the browser and server both invoke through one call site, the peer of `BaseEntity` (CRUD) and `RunView` (set reads):
  - `BaseRemotableOperation<TInput,TOutput>` with `OperationKey` / `RequiredScope` / `RequiresSystemUser` / `ExecutionMode`; `Execute()` routes per-provider, `ExecuteServer()` runs in-process and never throws on logical failure.
  - `IRemoteOperationProvider.RouteOperation` on `ProviderBase` (the documented power tool), in-process dispatch in `DatabaseProviderBase`, GraphQL marshalling in `GraphQLDataProvider`, and the single generic `ExecuteRemoteOperation` resolver that composes the existing API-key-scope + user-permission auth chain.
  - Genericized value-mapping resolver in `@memberjunction/global` (`getValueAtPath` / `resolveMappingRef` / `resolveValueMapping`) — one canonical mapping engine over pluggable named sources.

  **Record Set Processing substrate** (`@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`) — a hardened iterate-a-record-set-and-do-work engine with three pluggable seams (source / processor / run-tracker): batching, bounded concurrency, rate limiting, circuit breaker, checkpoint/resume, and pause/cancel. Ships Array/View/List/Filter/Keyset sources; Action / Agent / Infer record processors; a uniform `WriteBackProcessor` that applies an `OutputMapping` (fields / child record) to any work type; the `RecordProcessExecutor` facade (Scope→source, Work→processor); and the `RecordProcess.RunNow` / `GetRunStatus` / `Pause` / `Resume` / `Cancel` control operations.

  **Record Processes facade** (`@memberjunction/core-entities`, `@memberjunction/core-entities-server`, `@memberjunction/scheduling-engine`, `@memberjunction/actions`) — the `MJ: Record Processes` definition (Work × Scope × Trigger) plus generic `MJ: Process Runs` / `Process Run Details` tracking and the `MJ: Remote Operations` registry. `MJRecordProcessEntityServer` reconciles the owned recurrence Scheduled Job on save; `RecordProcessScheduledJobDriver` runs a process on its cron schedule and links each `ProcessRun` back to its `ScheduledJobRun`; the Entity Action `GetRecordList` View/List fan-out backs scoped iteration.

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

### Minor Changes

- ae74fd5: Auto-detect and render Markdown/HTML in long-text form fields. `MjFormFieldComponent`
  now honors an explicit `EntityField.ExtendedType` (`Markdown`/`HTML`/`Code`) and, when it
  is null, runs lightweight client-side content detection on eligible long-text fields
  (TS-type string with `MaxLength >= 255` or unlimited — generic across SQL Server/PostgreSQL).
  Read mode renders `<mj-markdown>` for Markdown, DOMPurify-sanitized `[innerHTML]` for HTML
  (via the new `mjSafeRichHtml` pipe — see below), and a read-only `<mj-code-editor>` for code;
  edit mode uses `<mj-code-editor>` with syntax highlighting for non-plain modes (mode frozen at
  edit entry), while plain fields keep the existing textbox/textarea.

  Widens the `EntityFieldExtendedType` union and the `CK_EntityField_ExtendedType` CHECK
  constraint to include `Markdown` and `HTML` (migration included — run CodeGen after applying
  to regenerate `EntityFieldEntity` types and metadata).

  Adds a reusable, dependency-free `detectRichTextFormat(value, maxScanLength?)` text classifier
  to `@memberjunction/global` (defaults to scanning the first 500 characters) so any consumer can
  sniff Markdown/HTML/plain content.

  Adds reusable safe-HTML rendering to `@memberjunction/ng-shared-generic`: a `PurifyRichTextHtml()`
  function and an `mjSafeRichHtml` pure pipe backed by DOMPurify (HTML + SVG profiles). Unlike
  Angular's built-in `[innerHTML]` sanitizer (which strips all SVG and inline styles), this keeps
  safe inline SVG and richer markup while still removing `<script>`, `on*` handlers, and
  `javascript:`/`data:` URLs — so it's safe for untrusted content yet renders richer HTML. Any
  Angular component can use `[innerHTML]="value | mjSafeRichHtml"`.

## 5.38.0

### Minor Changes

- 30f598d: Two intertwined deliverables in one PR: the autotag-website overhaul, plus a new dynamic forms-extension architecture (`BaseFormPanel` slot system) that lets consumers extend generated entity forms without the heavyweight custom-form override pattern.

  ## Autotag website crawler overhaul

  Fixes the long-standing "only crawls the seed page" symptom and adds first-class run budgets, a streaming pipeline, and per-source UI knobs.

  **Fixes**
  - `AutotagWebsite` now respects `MaxDepth` out of the box — the recursive crawler was previously gated on a flag that defaulted to falsy, so most sources only ever scraped the start URL. Class-level defaults are now `MaxDepth=2`, `CrawlSitesInLowerLevelDomain=true`, `CrawlOtherSitesInTopLevelDomain=false`.
  - Change-detection (the "is this page changed?" short-circuit) was rewritten to fetch each URL once instead of two or three times, hash the **extracted body text** (not raw HTML — eliminates spurious "changed" verdicts from CSRF tokens / build hashes / server timestamps), and scope the dedup query to the current `ContentSourceID` (a 404 boilerplate from one site no longer masks real pages on another).
  - `visitedURLs` state is now reset per content source — was leaking across sources and silently deduping legitimate URLs.
  - Conservative URL normalization (strip fragment, collapse trailing slash, sort query params; path case preserved per RFC 3986) so common variants dedupe correctly.
  - Several smaller bugs: `URLPattern` regex now applied in the shallow path too, `Number.isFinite` guard prevents NaN-cascade in the depth check.

  **Features**
  - **Streaming pipeline.** `ExtractTextAndProcessWithLLM` now accepts `AsyncIterable<MJContentItemEntity>` in addition to arrays. The website crawler streams items into the LLM batcher as they pass change-detection — total wall-clock is `~max(crawl, classify)` instead of `crawl + classify`. Backwards-compatible: existing array callers (AutotagEntity, tests) are unchanged.
  - **`MaxItemsPerRun` run budget.** Most intuitive "do at most N this run, do the rest next time" cap. Wired into `AutotagWebsite` (which had no budget integration before) and `AutotagEntity` (which already had the other RunBudget knobs). Pause is graceful via the existing CancellationRequested machinery; next run picks up where it left off (change-detection skips already-tagged items).
  - **Per-source Website crawler UI.** New "Website Crawler Settings" section on the Content Source form (conditional on Website source type) with structured inputs for MaxDepth, RootURL, URLPattern (live regex validation), and toggles for the recursion + sibling-fan-out flags. The Tag Pipeline section gets a promoted "Max items / run" primary row.

  **Storage**
  - `IContentSourceConfiguration` extended with a typed `MaxItemsPerRun?: number` and `Website?: IContentSourceWebsiteConfiguration` sub-object. The new `MJContentSourceEntity_IContentSourceWebsiteConfiguration` interface is now exported from `@memberjunction/core-entities`.
  - `AutotagWebsite` reads website knobs from the typed `Configuration.Website` first, then overlays `ContentSourceParam` rows as a sharper-per-instance override (legacy sources configured the old way keep working).
  - Per-key coercion at the param-overlay boundary fixes a latent bug where DB-stored strings were silently stuffed into number/boolean-typed instance fields.

  **Tests**

  162 tests pass (up from 119). New coverage spans URL normalization, fetch-once / extracted-text hashing, the streaming engine path (AsyncIterable batching, partial-batch flush, resume), `MaxItemsPerRun` budget enforcement, and the `Configuration.Website` overlay.

  **Docs**

  `packages/ContentAutotagging/README.md` documents the new streaming diagram, the Website Crawl Settings table, the Run Budgets table with priority order, and the resume semantics.

  **Known follow-ups** (not in this PR)
  - True crawl-side resume that persists discovered URLs so re-runs skip the HTTP re-discovery — today's resume is "functional via change-detection dedup."
  - `ETag` / `If-Modified-Since` conditional GETs on re-crawls (needs new columns on `MJContentItem`).

  ## `BaseFormPanel` slot system (`@memberjunction/ng-base-forms`)

  Generated entity forms can now be extended **without** replacing them via a `*Extended` custom-form override. Author a standalone Angular component extending `BaseFormPanel`, decorate with `@RegisterClassEx(BaseFormPanel, { metadata: { entity, slot, sortKey } })`, declare in any module. `<mj-form-panel-slot>` hosts in the generated form discover matching panels at runtime and dynamically mount them.

  **Slot positions** (top → bottom): `top-area`, `before-fields`, `after-fields`, `after-related`, `after-everything`.

  **Fallback chain** via `FormSlotCoordinator`: if the registered slot is missing because CodeGen hasn't been rerun against the new template emitter, the panel walks forward in the chain until it finds an existing slot. `MjRecordFormContainer` ALWAYS emits `after-everything` in its template, so panels never dead-end — pre-CodeGen-regen forms display every panel (at the bottom); post-regen forms display them in the preferred position.

  New public exports from `@memberjunction/ng-base-forms`:
  - `BaseFormPanel<TRecord>` abstract directive
  - `FormPanelSlot` type union
  - `FormPanelRegistrationMetadata` interface
  - `<mj-form-panel-slot>` component
  - `FormSlotCoordinator` service
  - `FORM_SLOT_CHAIN` constant

  Custom `*Extended` forms (e.g. `AIAgentFormComponentExtended`) remain a first-class pattern for truly bespoke layouts where the generated form is the wrong starting point entirely.

  Full authoring guide in `packages/Angular/Generic/base-forms/PANELS.md`.

  ## `@RegisterClassEx` + ClassFactory metadata (`@memberjunction/global`)

  Existing `@RegisterClass` keeps its exact positional signature (zero breaking changes) but also accepts an optional 6th `metadata` arg for parity. New `@RegisterClassEx(baseClass, options)` is the modern form when you have anything beyond `(baseClass, key, priority)` to specify — options-bag avoids positional-boolean noise and is the right place to attach `metadata`.

  New public exports from `@memberjunction/global`:
  - `RegisterClassEx` decorator
  - `RegisterClassOptions` interface
  - `ClassRegistration.Metadata` field (optional, additive)
  - `ClassFactory.GetAllRegistrationsByKeyPrefix(base, prefix)` — common structured-key case (case-insensitive, trimmed)
  - `ClassFactory.GetAllRegistrationsByKeyPattern(base, regex)` — nuanced key matching
  - `ClassFactory.GetAllRegistrationsByMetadata(base, predicate)` — recommended for structured discriminators

  The `Ex` suffix follows MJ's existing `Foo`/`FooAsync`/`FooEx` convention. Not a true TS overload — JS overloads are hacky compared to true OOP, and sibling decorators give cleaner IntelliSense + a clean deprecation path if we ever consolidate.

  MJGlobal README adds a "Structured registration" section documenting both decorators + all three lookup helpers.

  ## Knowledge Hub dashboard quick-edit (`@memberjunction/ng-dashboards`)

  The AI > Autotagging Pipeline dashboard's "Edit Content Source" slide-in is intentionally a **quick-edit surface**, not a full form. Added the most-useful subset of the new knobs:
  - `MaxItemsPerRun` (always shown — most-asked-for budget cap)
  - `MaxDepth` + 2 crawl toggles (Website-source-conditional)
  - **"Open advanced settings →"** link that calls `NavigationService.OpenEntityRecord('MJ: Content Sources', id)` to land in the full entity form, where every panel is available via the slot system.

  ## Documentation
  - `packages/Angular/Generic/base-forms/PANELS.md` (NEW) — comprehensive BaseFormPanel authoring guide.
  - `packages/Angular/CLAUDE.md` — restructured "Extending Entity Forms" section. Both patterns first-class.
  - `packages/Angular/Explorer/core-entity-forms/README.md` — new "Two Patterns" section above the existing custom-form guide.
  - `guides/CONTENT_AUTOTAGGING_GUIDE.md` — extended config table (all budget caps + `Website` sub-object) + UI section pointing at PANELS.md.
  - `packages/MJGlobal/README.md` — new "Structured registration: `@RegisterClassEx` + metadata" section.
  - Root `CLAUDE.md` — new "Nested CLAUDE.md Index" pointing at every sub-directory CLAUDE.md.

  ## Follow-ups (not in this PR)
  - Promote source-type-specific form sections to a registered class extension point when the count grows past 2-3 (e.g., RSS, Cloud Storage). Today's `IsWebsiteSourceType` template gate works fine for 1-2 source types.

### Patch Changes

- 3d739a3: refactor(sql-parser): instance-based parser with dialect adapters, parse-preprocessing, instance-based count SQL, and a render-pipeline write-statement guard
  - **`SQLParser` is now instance-based** (`new SQLParser(sql, dialect)`). AST inspection/mutation (`IsValid`, `StatementKind`, `HasWriteStatement`, `OuterCap`, `SetOuterCap`, `ClearOuterCap`, `ClearOrderBy`, `ToSQL`) and extraction (`ExtractCTEs`, `ExtractTableRefs`, `ExtractColumnRefs`, `ExtractSelectColumns`) are instance members; pure string/token utilities (`ParseSQL`, `SqlifyAST`, `StripComments`, `Tokenize`, `Analyze`, `HasUnwrappableTrailingClause`, `HasStackedStatements`, the MJ-template helpers, …) remain static.
  - **Dialect-neutral row caps via an internal `ASTDialectAdapter`** (keyed by `ParserDialect`). The exported `SQLOuterCap` (with its `kind: 'top' | 'limit'`) is replaced by `RowCapInfo` with an explicit `form: 'numeric' | 'percent' | 'opaque'` discriminant. The `isSQLServerDialect()` quote-probe and the `dialect.PlatformKey === 'sqlserver'` branch in the row-cap path are gone (`outerWrap` now uses `dialect.LimitClause()`).
  - **Parse-preprocessing fallback** in the constructor: on a direct-parse failure it aliases bracket-quoted identifiers with parser-defeating characters (`[Active People]`, `[my-cte]`) and splits a trailing `OPTION (...)` clause, then restores both on `ToSQL`. This lets Skip-style CTE queries and `OPTION` queries reach the precise AST row-cap path (`TOP N` / `LIMIT N`) instead of the OFFSET/FETCH or outer-wrap fallback.
  - **Instance-based count SQL**: `QueryPagingEngine`'s count builder is unified onto the instance API (`ExtractCTEs` + `ClearOuterCap` + `ClearOrderBy` + `ToSQL`), removing the last `as unknown as Record<string, unknown>` cast and raw AST field pokes from the engine. The count now strips the outer cap on **both** dialects, so a paged query's `COUNT(*)` reflects the full set — fixing a PostgreSQL inconsistency where an explicit `LIMIT` previously yielded a capped count (SQL Server already stripped `TOP`).
  - **Render-pipeline safety guard** (`RenderPipeline.Run`): a rendered query must be a single read statement, enforced by two complementary checks. (1) `SQLParser.HasWriteStatement` (AST) rejects a write _type_ anywhere — DML (INSERT/UPDATE/DELETE/MERGE/REPLACE), DDL (DROP/CREATE/ALTER/TRUNCATE/RENAME), or EXEC/CALL/GRANT/REVOKE/USE — catching single writes and parseable stacked writes (`SELECT 1; DROP TABLE x`). (2) `SQLParser.HasStackedStatements` (token scan) rejects any internal statement-separating `;`, catching stacked payloads that don't parse (`SELECT 1; EXEC xp_cmdshell '…'`, `SELECT 1; WAITFOR DELAY '…'`) — the class an AST scan misses because the whole string fails to parse. Both are precise: the `REPLACE()` string function and parenthesized SELECTs pass, and a single trailing `;` is fine; only genuine multi-statement inputs (including `SET` / `DECLARE` prefixes) are rejected. (The broad dangerous-keyword scan stays on the ad-hoc execution path, where input is untrusted free text.)
  - **`SQLExpressionValidator`**: `FOR` is now allowed in `full_query` context so `FOR JSON` / `FOR XML` queries aren't wrongly rejected (`FOR UPDATE` remains blocked via the independent `UPDATE` keyword).

  No behavior change for already-valid read queries; preprocessing only widens AST coverage, the count fix only affects paged queries that carried an explicit cap, and the guard only rejects writes/stacked statements. All consumers (`queryPagingEngine`, `queryCompositionEngine`, `query-extraction`, `manage-metadata`, `structuralParser`) migrated to the instance API.

## 5.37.0

## 5.36.0

## 5.35.0

### Minor Changes

- ac4b9a5: **Multi-tenant switching** (`@memberjunction/global`, `@memberjunction/ng-explorer-core`): Add `TenantChanged` event type to `MJEventType`. Add `clearCacheByPredicate()` on `ComponentCacheManager` for selective tenant-scoped cache clearing. Add `ClearComponentCache()` and `ReloadAllTabs()` on `TabContainerComponent` — destroys cached components and reloads the active tab immediately (inactive tabs reload lazily). Shell subscribes to `TenantChanged` with two-phase protocol: `TenantChanging` shows the loading screen, `TenantChanged` reloads tabs and hides it. Loading screen CSS made `position: fixed` with `z-index: 99999` to fully cover viewport during switches.

  **Open App fixes** (`@memberjunction/open-app-engine`): Make `mj app upgrade` idempotent when already at target version. Allow mixed-case schema names in Open App manifest validation.

  **CodeGen fix** (`@memberjunction/codegen-lib`): Emit `override` modifier on generated `Save()` method to satisfy strict TypeScript when entity subclasses override the base `Save()`.

  **AI Agents dashboard** (`@memberjunction/ng-dashboards`): Fix category filter not filtering results, make category filter extraction defensive, fix Reset Filters button. Rename Actions `ExecutionMonitoringComponent` to avoid name collision with dashboards package.

  **Scheduling** (`@memberjunction/server`): Warn loudly when a scheduled job is configured to run more often than every 5 minutes.

  **Palette** (`@memberjunction/ng-ui-components`): Add ARIA labels to icon-only buttons in dialogs and slides for accessibility compliance.

## 5.34.1

## 5.34.0

### Patch Changes

- 389d356: Fix XSS vulnerability in search-result highlighters across form-field labels, collapsible-panel section names, and conversation search snippets. Extracted shared `HighlightSearchMatches` helper in `@memberjunction/global` that escapes each text segment individually after a literal-string match, so HTML in the source can never leak into `[innerHTML]` as live markup. Also restored multi-match highlighting that had regressed to single-match.

## 5.33.0

### Patch Changes

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

## 5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

## 5.28.0

## 5.27.1

### Patch Changes

- d18aa6c: Fix XSS vulnerability in highlight match bindings by escaping HTML entities via centralized EscapeHTML utility.

## 5.27.0

## 5.26.0

## 5.25.0

## 5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).

## 5.22.0

### Patch Changes

- f2a6bec: Universal lazy loading via ClassFactory async API. Fixes HomeApplication being tree-shaken by moving lazy loading from consumer-specific retry patterns into ClassFactory itself with RegisterLazyLoader, CreateInstanceAsync, and GetRegistrationAsync. Lazy config now uses compound keys (BaseClassName::Key) to support any base class. Adds coverage audit to codegen to detect gaps.

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

## 5.17.0

## 5.16.0

## 5.15.0

## 5.14.0

## 5.13.0

### Patch Changes

- f72b538: Replace HookRegistry and DynamicPackageLoader with @RegisterClass + ClassFactory middleware pattern, and add GetResolverPaths() to BaseServerMiddleware for auto-discovery of middleware-contributed GraphQL resolvers

## 5.12.0

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

### Patch Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes

## 5.4.1

## 5.4.0

## 5.3.1

## 5.3.0

## 5.2.0

## 5.1.0

### Minor Changes

- 61079e9: Add Open App system for installing, managing, and removing third-party apps via `mj app` CLI commands. Includes manifest validation, dependency resolution, schema isolation, migration execution, npm package management, and config-manager integration.

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

## 4.4.0

## 4.3.1

## 4.3.0

## 4.2.0

## 4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- 718b0ee: migration
- e06f81c: changed SO much!

## 3.4.0

## 3.3.0

## 3.2.0

## 3.1.1

## 3.0.0

## 2.133.0

## 2.132.0

## 2.131.0

## 2.130.1

## 2.130.0

## 2.129.0

### Minor Changes

- fbae243: migration
- c7e38aa: migration

## 2.128.0

## 2.127.0

### Patch Changes

- c7c3378: Fix memory leaks and improve conversation naming performance

## 2.126.1

## 2.126.0

## 2.125.0

## 2.124.0

## 2.123.1

## 2.123.0

## 2.122.2

## 2.122.1

## 2.122.0

## 2.121.0

## 2.120.0

## 2.119.0

## 2.118.0

## 2.117.0

## 2.116.0

### Minor Changes

- a8d5592: migration

## 2.115.0

## 2.114.0

## 2.113.2

## 2.112.0

### Minor Changes

- c126b59: Merge MJCore into MJGlobal

## 2.110.1

## 2.110.0

## 2.109.0

## 2.108.0

## 2.107.0

## 2.106.0

## 2.105.0

## 2.104.0

### Minor Changes

- 2ff5428: MJ & Skip Logo Updates

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0

## 2.100.3

## 2.100.2

## 2.100.1

## 2.100.0

## 2.99.0

## 2.98.0

## 2.97.0

## 2.96.0

## 2.95.0

## 2.94.0

## 2.93.0

## 2.92.0

## 2.91.0

## 2.90.0

## 2.89.0

## 2.88.0

## 2.87.0

## 2.86.0

## 2.85.0

## 2.84.0

## 2.83.0

## 2.82.0

## 2.81.0

## 2.80.1

## 2.80.0

## 2.79.0

### Patch Changes

- 907e73f: correct handling in CleanJSON

## 2.78.0

## 2.77.0

## 2.76.0

## 2.75.0

## 2.74.0

## 2.73.0

## 2.72.0

## 2.71.0

### Patch Changes

- c5a409c: Add missing 'lodash' dependency to MJGlobal package.
- 5a127bb: Remove status badge dots

## 2.70.0

### Minor Changes

- c9d86cd: migration

### Patch Changes

- 6f74409: Minor bump

## 2.69.1

## 2.69.0

### Minor Changes

- 79e8509: Several changes to improve validation functionality

## 2.68.0

## 2.67.0

## 2.66.0

## 2.65.0

### Patch Changes

- 619488f: Pattern filtering for sql logging

## 2.64.0

## 2.63.1

### Patch Changes

- 59e2c4b: Improved RegisterClass/ClassFactory and added a bunch of utility functions for walking the inheritance hierarchy

## 2.63.0

## 2.62.0

## 2.61.0

## 2.60.0

## 2.59.0

## 2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

## 2.56.0

## 2.55.0

## 2.54.0

## 2.53.0

## 2.52.0

## 2.51.0

## 2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

## 2.48.0

## 2.47.0

## 2.46.0

## 2.45.0

## 2.44.0

## 2.43.0

## 2.42.1

## 2.42.0

## 2.41.0

## 2.40.0

## 2.39.0

## 2.38.0

## 2.37.1

## 2.37.0

## 2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

## 2.35.1

## 2.35.0

## 2.34.2

## 2.34.1

## 2.34.0

## 2.33.0

## 2.32.2

## 2.32.1

## 2.32.0

## 2.31.0

## 2.30.0

### Minor Changes

- a3ab749: Updated CodeGen for more generalized CHECK constraint validation function generation and built new metadata constructs to hold generated code for future needs as well.

## 2.29.2

## 2.28.0

## 2.27.1

## 2.27.0

## 2.26.1

## 2.26.0

## 2.25.0

## 2.24.1

## 2.24.0

### Patch Changes

- 9cb85cc: Minor tweak to casing logic

## 2.23.2

## 2.23.1

## 2.23.0

### Patch Changes

- 38b7507: Fixed logic bugs in pluralization functionality in MJ Global and used new flags in CodeGenLib

## 2.22.2

## 2.22.1

## 2.22.0

### Patch Changes

- 9660275: Improve pluralization in CodeGenLib

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)

## 1.0.11

Wed, 24 Apr 2024 20:57:41 GMT

### Patches

- - Added support for BaseFieldComponent to show or not show its label \* Added more JSDoc documentation to classes within MJCore and MJGlobal (97354817+AN-BC@users.noreply.github.com)

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
