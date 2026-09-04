# Writes / Transactions / Bulk-Processing Sub-Suites — Documentation

This document covers the **write-path family** of MemberJunction's integration-test catalog: the six shipped bundles that prove the core data write-side contract (`entity-writes`), the server-entity-subclass invariant long tail (`entity-server-invariants`), TransactionGroup atomicity and security (`transaction-groups`), ambient nested savepoints (`nested-transactions`, IT87), and the Record Set Processing substrate plus its two consumer layers (`record-process`, `record-process-facade`, `field-rules-bulk-update`). Together: **7 bundles** plus IT87's 9 checks (9 + 4 + 5 + 3 + 8 + 2), all members of the **"Integration Tests — Deterministic"** suite — no LLM calls anywhere in this family. Run the whole tier from the repo root with `npm run test:integration` (= `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`), or one bundle at a time with `MJ_INTEGRATION_TEST=1 npx mj test run --name "IT27 - Core Entity Write-Side"` (etc. — IT numbers per bundle below). The old per-bundle `tsx` dispatchers and `run-all.ts` aggregator are retired; `mj test` is the single entry path, loading this package's bundles at runtime via the `testing.checkModules` seam in `mj.config.cjs`.

Design ancestry: these bundles implement **Domain 2 (Core Data Write-Side & Transactions)** and **Domain 6 (Entity-Server Invariants)** of the expansion catalog — see [test-catalog.md](./test-catalog.md) — plus the three Record-Set-Processing bundles that predate the catalog (graduated verbatim from the original `integration-test-scripts/`). Defects found or pinned by this family are tracked in the [bug register](../../../../plans/integration-test-expansion/bug-register.md); every pin below carries its register ID.

---

## Family-wide conventions

**Tiers.** Every check here is `tier: deterministic` at the Test-record level; per-check `RequiresMutation: true` adds the mutation gate on top — `IntegrationTestDriver` (and the tier logic in `packages/TestingFramework/testing-integration/src/tiers.ts`) skips those checks unless `RUN_MUTATION_TESTS=1`. Two bundles (`field-rules-bulk-update`, `record-process`) mutate *by design* without per-check gating, in the same spirit as `runquery-cache`: their writes are either self-cleaned lifecycle fixtures or the substrate's own audit output.

**Transports.** The Test record's `Configuration.transport` decides which bootstrap the driver uses:

| Transport | Bundles | What it proves |
|---|---|---|
| **client** (GraphQL wire → live MJAPI via `GraphQLDataProvider`) | `entity-writes` (IT27), `entity-server-invariants` (IT40), `transaction-groups` (IT47) | The whole chain — client `BaseEntity` → mutation serialization → resolver → **server entity subclass dispatch** → SQL → the returned view row. Saving over the wire is the only honest way to prove the resolver instantiated the higher-priority `*EntityServer` subclass (EW8/ESI1/ESI2's attribution technique) and to observe what error text actually survives the wire (B31/B52/B53). |
| **server** (in-process provider) | `record-process` (IT04), `record-process-facade` (IT05), `field-rules-bulk-update` (IT10) | The `RecordSetProcessor` engine and `RecordProcessExecutor` facade are server-side machinery with no client surface of their own; these bundles drive them directly and verify the persisted `MJ: Process Runs` / `MJ: Process Run Details` audit trail through real `RunView` reads. |

**Fixtures.** Throwaway rows only — mostly `MJ: Action Categories` (harmless, self-referencing `ParentID` gives free parent/child and FK-violation material), plus `MJ: Lists`, `MJ: Tags`/`Tag Scopes`/`Tag Synonyms`, `MJ: Search Scopes`, `MJ: Conversations`/`Details`, API keys, and one `MJ: Record Processes` definition. Rows are name-prefixed per run (`mj-ew-<ts>`, `mj-esi-<ts>`, `mj-tg-<ts>`, `mj-frbu-test`, `mj-integration-test-record-process`) and tagged **"(mj-integration-test — safe to delete)"**. Teardown is FK-ordered (children before parents; `transaction-groups` sweeps *by prefix* in two passes so even a pre-fix TG5 bypass leak could not orphan a row). No pre-existing record is ever mutated. Note the `record-process` exception: the `ProcessRun`/`Detail` rows the substrate writes are its **own output under test** and are deliberately left in place (like the server-cache mutation checks) — the bundle has no lifecycle at all.

**Deterministic observables.** This family never asserts anything timing- or model-dependent. The asserted surface is: exact `Record Changes` row counts and per-field before/after `ChangesJSON`; view-only virtual-field values on the row a save returns; keyset-walk set-equality and page arithmetic; `Success`/`Status` flags and in-memory `IsSaved` state after commit vs. rollback; the persisted `DryRun` bit; success/error/skip counters; peak measured concurrency against a cap; and the presence/absence of specific rows after refusals. Two knowingly asynchronous seams get bounded polling/settling rather than weakened assertions: `Record Changes` persistence is a server-side **fire-and-forget queue** (EW1 polls up to 15 s, then still demands *exactly* 3 rows with exact content), and `Process Run Detail` writes are fire-and-forget (short `settle()` before demanding one terminal row per record).

---

## Bundle 1 — `entity-writes` (EW1–EW9, IT27) — the core write-side contract

Source: `src/checks/entity-writes.checks.ts` · Test record: `.IT27-entity-writes.json` ("IT27 - Core Entity Write-Side", deterministic suite, client transport) · Catalog ancestors: Domain 2 rows CD1–CD5, CD10–CD12.

### Machinery under test

The full `BaseEntity` save pipeline over the wire: client-side `Save()` → GraphQL mutation → `ResolverBase`-derived generated resolver → ClassFactory instantiation of the **server** entity subclass → `spCreate`/`spUpdate` → the post-save view row mapped back onto the client entity. Around that core, the bundle pins four adjacent contracts: the **Record Changes** versioning subsystem (fire-and-forget queue, `SQLServerDataProvider`), **keyset pagination** (`RunViewParams.AfterKey`, guardrails in `runView.ts`), the provider **dedup-linger** window (`ProviderBase.DedupLingerMs`), and platform-portability seams (UUID case, `datetimeoffset`). This is the write-side half of the reason the doctrine says "client-first": column-order skew in the returned row, resolver subclass mis-dispatch, and wire error-mapping loss are all invisible to in-process tests.

### Fixtures / lifecycle

Typed context slot `ctx.EntityWritesFixture`. `Setup` creates **no rows** — it only resolves entity IDs and mints the per-run prefix + a back-dated `StartedAtIso` window (1 s of clock-skew slack for the Record-Changes lower bound). Each mutating check creates exactly what it needs via `createCategory()`, which registers the ID for teardown **before** asserting the save (a failed save can't orphan a row). So a deterministic-only run (`RUN_MUTATION_TESTS` unset) writes nothing at all. Teardown: EW9's conversation/detail backstop first (details before conversations), then Lists, then Categories in reverse creation order (children after parents — FK-safe for the self-referencing `ParentID`).

### Tier

EW1, EW2, EW3, EW5, EW6, EW7, EW9 are `RequiresMutation: true` (7 of 9). EW4 and EW8 run ungated — EW4 is read-only; EW8's saves are **refused during validation before any INSERT** (the deliberately unresolvable `MISSING_TAG_ID` never reaches a FK check).

### Checks

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `entity-writes.EW1` | Create + 2 updates → exactly 3 Record Changes with correct before/after JSON | Exactly 1 `Create` + 2 *distinct* `Update` rows (identified by content, not array position); `FullRecordJSON.Name` on the Create; `ChangesJSON` per-field `{field, oldValue, newValue}` exact for both updates; **zero** rows whose `EntityID` is `MJ: Record Changes` itself. Polls ≤15 s for the fire-and-forget queue, then asserts strictly. | Versioning drops/duplicates changes, records wrong before/after values, or the versioning table starts versioning itself (infinite-regress class). |
| `entity-writes.EW2` | Save returns correct VIEW-only virtual fields | `Parent` (name) and `RootParentID` — columns that exist **only on the view** — carry correct values on the entity right after INSERT *and* refresh after an UPDATE (parent renamed between saves); base columns stay correct alongside. | `@ResultTable` column-order skew between the sproc's returned row and the client field mapping — virtuals blank or wrong after save. |
| `entity-writes.EW3` | AfterKey walk visits every row exactly once, ends on a short page | 12 fixture rows walked at page size 5 → union of pages == fixture set exactly (no dup, no miss), 3 pages, final page length 2; runaway-cursor guard. Deliberately **no string-order assertion** (SQL Server GUID order is not lexicographic). | Keyset cursor skipping or re-serving rows over the wire — silent data loss in every `AfterKey` bulk-processing loop. |
| `entity-writes.EW4` | AfterKey guardrails refuse StartRow / non-PK OrderBy / wrong-shape keys | Positive control first (valid AfterKey call succeeds — with `BypassCache`, because a warm client-cache slot is served without re-applying `MaxRows`); then three one-ingredient-different illegal calls each return `Success === false`. | Guardrail regression letting a contradictory pagination request through (silently wrong pages). **Pinned gap (B31/B52):** all three refusals arrive with a **NULL `ErrorMessage`** — `AfterKeyNotSupportedError`'s Reason/message does not survive the GraphQL wire, so the documented "branch on Reason" caller pattern is unavailable to clients. EW4 asserts only what the wire honestly guarantees today and documents the gap in-body (reported, not asserted). |
| `entity-writes.EW5` | Save inside the linger window invalidates the lingered RunView | Warm the exact-params view (deliberately **no** `BypassCache` — the linger entry is keyed on those params), save a second row, re-run the identical view: it must contain the new row. Precondition asserted: the re-run landed *inside* `ProviderBase.DedupLingerMs`, else inconclusive-fail (never a vacuous pass). | The dedup-linger cache serving stale data after a save — Domain 2 CD5's stale-read hole. |
| `entity-writes.EW6` | UPPERCASE FK saved over the wire round-trips case-insensitively | FK pushed across the wire in the **opposite** case to whatever the platform returned; persisted `ParentID` matches via `UUIDsEqual`; a lowercase filter *and* an uppercase filter each find exactly the child row. | The SQL Server (uppercase) / PostgreSQL (lowercase) UUID-casing skew breaking FK writes or filters — the UUID_COMPARISON_GUIDE bug class, proven at the wire. |
| `entity-writes.EW7` | Non-UTC `datetimeoffset` survives save → Load → RunView to the millisecond | `2023-03-14T09:26:53.123-05:00` as an instant (`getTime()` equality) across three surfaces: the row returned by the save, a fresh `Load()`, and a `RunView` read-back. The stored offset itself is a rendering concern and is deliberately not asserted. | Sub-second or offset-conversion loss anywhere in the datetime serialization chain. |
| `entity-writes.EW8` | Resolver instantiates the **server** entity subclass | A `MJ: Tag Scopes` save with an unresolvable `TagID`: local sync `Validate()` **passes** (asserted control — else inconclusive), local async validation is skipped via `EntitySaveOptions.SkipAsyncValidation`, yet the save is refused with `MJTagScopeEntityServer.ValidateAsync`'s exact message ("but no such Tag exists"). The refusal can therefore only have come from the entity object the **resolver** instantiated. No row is ever inserted. | ClassFactory server-subclass dispatch broken in the resolver (Domain 2 CD10) — server-side invariants silently not running for wire saves. Also the positive proof that **spCreate-path `ValidateAsync` messages DO propagate over the wire** (the control ESI2's B53 asymmetry is measured against). |
| `entity-writes.EW9` | `OriginalMessageChanged` flags a post-hoc Message edit — and ONLY that | Fresh detail born unflagged; a lone `Message` edit on a saved detail flips the flag; after a reset, `Message`+`Status` changed **together** does NOT re-flag (the streaming-completion exemption). Self-cleaning in-check `finally` + lifecycle backstop. | The PR #2732 predicate regressing. The pre-fix version had an inverted `IsSaved` check so the flag could literally never be set — and shipped that way for its whole life precisely because nothing asserted it. The predicate reads dirty state, which differs *mechanically* between an in-process entity and the resolver's load-then-apply path, so the wire is the only honest place to pin it. |

---

## Bundle — `nested-transactions` (NT1–NT9, IT87) — ambient savepoints

Source: `src/checks/nested-transactions.checks.ts` · Test record: `.IT87-nested-transactions.json` · server transport, `runMutationTests: true`.

Proves `GenericDatabaseProvider` nested savepoints on a live server: join via `BeginEntityTransaction`, inner commit is not physical, three-deep LIFO, savepoint counter restart, the torn-write invariant (a doomed ambient TX cannot commit B without A), public-API recovery after doom, the order-confirm shape, serialized concurrent units, and `transactionState$` false at depth 0. Teardown calls `ResetTransactionState()` and reads committed rows through a pool-scoped `connectionSource`.

## Bundle 2 — `entity-server-invariants` (ESI1–ESI4, IT40) — the Domain-6 long tail

Source: `src/checks/entity-server-invariants.checks.ts` · Test record: `.IT40-entity-server-invariants.json` ("IT40 - Entity-Server Invariants", deterministic suite, client transport) · Catalog ancestors: Domain 6 rows ES1 (a/b/c) and ES10.

### Machinery under test

The `MJCoreEntitiesServer` server-subclass invariants beyond what `entity-writes` already pins (EW8 = `MJTagScopeEntityServer` missing-Tag; EW9 = `MJConversationDetailEntityServer`) — specifically `MJTagScopeEntityServer` / `MJTagEntityServer` (`packages/MJCoreEntitiesServer/src/custom/MJTag*.server.ts`) enforcing the **IsGlobal ⊕ TagScope** exclusivity from both sides, `MJTagEntityServer.Delete`'s five-table FK-cleanup sweep (CoOccurrence / TaggedItem / ContentItemTag / TagScope / TagSynonym), and `MJSearchScopeEntityServer`'s creator auto-grant. Every check uses the EW8 attribution technique, packaged as `saveExpectingServerRefusal()`: local sync `Validate()` must pass (asserted, else inconclusive), local async validation is skipped, so any refusal provably came from the resolver-instantiated server object. A header note pins a useful cost fact: `MJTagEntityServer.Save` computes a **local** embedding server-side, and embedding failures are caught inside the subclass — so these fixtures are deterministic with or without a local embedding model.

### Transport / fixtures / tier

Client transport, same doctrine as `entity-writes`. Fixture is **module state** (not a typed context slot — this bundle deliberately does not modify the shared `IntegrationCheckContext` contract in `@memberjunction/testing-integration`; see the actions-pipeline header for the precedent). All four checks are `RequiresMutation: true`. Teardown sweeps five accumulators in FK-safe order (synonyms → tag scopes → tags → search-scope permissions → search scopes); rows ESI3 already deleted just fail their `Load` and are skipped — the accumulators deliberately over-approximate.

### Checks

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `entity-server-invariants.ESI1` | TagScope pointing at an `IsGlobal` tag refused (scope side) | Server refusal whose message includes `"it is marked IsGlobal=1"`; post-refusal probe proves **zero** TagScope rows exist for the tag (refusal fired before any insert). | The scope-side half of the IsGlobal ⊕ TagScope invariant silently not enforcing — scoped rows accreting under global tags. |
| `entity-server-invariants.ESI2` | Toggling `IsGlobal=1` on a tag WITH scope rows refused (tag side) | Anti-vacuity partner first: a scope row for a NON-global tag inserts cleanly (proves ESI1's refusal was the gate, not a blanket insert failure). The toggle save is refused server-side; **positive control**: the same toggle on a scope-free tag SAVES. Read-back proves the refused UPDATE did not partially land (`IsGlobal` still false). | The tag-side half of the invariant regressing (a global flip orphaning existing scopes). **Pinned wire-fidelity gap (B53):** the gate *fires* (refusal is asserted strictly), but its `ValidateAsync` message ("TagScope row(s) exist") is **lost on the UPDATE wire path** — arrives generic/"Unknown error" — while EW8 proves spCreate-path messages DO propagate. When the message is absent ESI2 **warns loudly instead of failing** ("gate message lost over the wire — see bug register"); refusal strict, fidelity warns. |
| `entity-server-invariants.ESI3` | Deleting a Tag with live children succeeds; children swept | Self-sufficient fixture (tag + 1 scope + 1 synonym; existence asserted pre-delete for anti-vacuity). The parent `Delete()` succeeds over the wire — only possible because `MJTagEntityServer.Delete` sweeps the five FK tables first — and post-delete probes show scope children = 0, synonym children = 0, the tag itself = 0. | The FK-cleanup sweep regressing (parent deletes start failing on child constraints, or children survive orphaned). **Known pinned gap (B15, register disposition DECIDE):** partial cleanup failures are currently *swallowed* (`LogError` + proceed) — an orphan-row risk. ESI3 pins only the **happy-path contract that B15's eventual fix must preserve**; the failure leg is intentionally not probed because triggering it deterministically over the wire would require corrupting real FK state. |
| `entity-server-invariants.ESI4` | New Search Scope auto-grants creator `Manage`; updates do not re-grant | Exactly **1** permission row immediately after the create returns (the grant is *awaited inside* `MJSearchScopeEntityServer.Save`, so no polling window is legitimate — asserted synchronously); it targets the creating `UserID` (not a role), level `Manage`. After an UPDATE: still exactly 1 row, and it is the **original** grant (same ID). | The creator locked out of their own scope (grant not written), grant mis-targeted to a role, or the `isNewRecord` gate regressing into a duplicate grant per update. |

---

## Bundle 3 — `transaction-groups` (TG1–TG5, IT47) — atomicity + the scope-bypass pin

Source: `src/checks/transaction-groups.checks.ts` · Test record: `.IT47-transaction-groups.json` ("IT47 - Transaction Group Atomicity", deterministic suite, client transport) · Catalog ancestors: Domain 2 rows CD8/CD9 + Domain 3 row SEC1.

### Machinery under test

The full TransactionGroup chain: `ctx.Provider.CreateTransactionGroup()` → `GraphQLTransactionGroup` (`packages/GraphQLDataProvider/src/graphQLTransactionGroup.ts`) queues client `Save()`/`Delete()` calls → ONE `ExecuteTransactionGroup` mutation → `TransactionResolver` (`packages/MJServer/src/resolvers/TransactionGroupResolver.ts`) reconstructs the group server-side → `SQLServerTransactionGroup` executes every item inside a real `sql.Transaction`. This is the codepath where two register-grade defects lived (B1, B49 — both found *while building this bundle* and fixed with proven red-then-green runs), which is exactly why every check goes over the wire rather than through an in-process shortcut.

### Fixtures / lifecycle / tier

Typed slot `ctx.TransactionGroupsFixture` (entity ID + per-run prefix only — `Setup` creates no rows). Fixtures are throwaway `MJ: Action Categories`; teardown **sweeps everything matching the prefix** in two FK-safe passes (rows with `ParentID` first, then roots) — deliberately not an ID accumulator, so even a pre-fix TG5 bypass leak or a mid-transaction crash cannot orphan a row. TG5's API-key fixtures (key + 2 scope rules + usage logs) self-clean in the check's own `try/finally`, mirroring the `api-keys` bundle's AK3 (logs → rules → key). TG2–TG5 are `RequiresMutation: true`; TG1 is read-only. **TG5 additionally requires the client transport**: on the server transport it *skip-as-passes loudly* — a genuine environment gap, not a soft skip, because the API-key scope ceiling (`userPayload.apiKeyHash`) only exists on the wire, so an in-process run has nothing to attack.

### Checks

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `transaction-groups.TG1` | Provider hands back its transport TransactionGroup; empty Submit contract | `CreateTransactionGroup()` returns a `TransactionGroupBase`; on a `GraphQLDataProvider` it is specifically a `GraphQLTransactionGroup` (the wire implementation, not some other transport); fresh status `Pending`; `Submit()` with zero items returns `true` and resets to `Pending` (reusable), never `Complete`. | Transport wiring handing back the wrong implementation, or the documented empty-Submit contract drifting. |
| `transaction-groups.TG2` | Two creates DEFER until Submit, then both persist atomically | Both `Save()` calls return true yet a `BypassCache` DB probe shows **0 rows pre-Submit** and neither entity `IsSaved` (the deferred-execution proof — without it, a provider that ignored the group and saved immediately would pass the rest vacuously). Post-Submit: `Submit()` true, status `Complete`, both entities finalized with server-assigned IDs, both rows in the DB. | A provider silently executing saves eagerly (no atomicity at all), or commit callbacks failing to finalize client entities / thread IDs back. |
| `transaction-groups.TG3` | Item 2 fails (real FK violation) → Submit false, NEITHER row persists, item 1 not finalized | Precondition: the poison `MISSING_PARENT_ID` provably matches no row. Item 2 passes CLIENT validation (nullable FK) and fails only at the DB constraint — inside the server transaction, *after* item 1 already executed. Asserts: `Submit() === false`, group status `Failed`, **0 rows** persisted, and the first (valid) entity left `!IsSaved` — never finalized against phantom data. | **The B49 false-success illusion, wire-pinned.** Pre-fix, `GraphQLTransactionGroup.HandleSubmit` computed per-item success as `resultObject !== null` from `ResultsJSON` — but on a rollback the resolver still serializes each entity's in-memory state (never null), so the transaction-level `Success:false` was ignored: `Submit()` returned **true** for a fully rolled-back group and every entity `finalizeSave`'d itself against data that does not exist in the DB. Fixed 2026-07-21 (per-item success now gated on the server's transaction-level flag); unit-pinned in `graphQLTransactionGroup.test.ts` and wire-pinned here. TG3's failure message names the defect explicitly. |
| `transaction-groups.TG4` | TransactionVariable threads parent PK → child FK across the wire | Child's `ParentID` deliberately unset pre-Submit (asserted); `TransactionVariable('TGParentID', parent, 'ID', 'Define')` + `(…, child, 'ParentID', 'Use')`; post-Submit the in-memory `child.ParentID` equals the server-assigned parent PK **and** the persisted DB row agrees (the in-memory value alone could be a callback artifact). | The Define/Use variable-resolution machinery (Domain 2 CD9) breaking — dependent creates in one transaction silently losing their linkage. |
| `transaction-groups.TG5` | **SEC1 / B1 pin** — a `view:run`-only API key cannot Create via `ExecuteTransactionGroup` | Mints a restricted user API key over the wire (allow `view:run`; **explicit deny** `entity:create`, making the pin independent of the deployment's `defaultBehaviorNoScopes`). Control first: the identical Create-in-a-group succeeds on the system-authenticated channel (payload shape valid — a refusal below is the gate, not a malformed request). The attack: a raw `fetch` of the exact `ExecuteTransactionGroup` document with `x-api-key`. Asserts: not HTTP 401 (authentication failure would mean the gate was never reached — inconclusive, not a pass); the mutation did **not** succeed; a GraphQL error mentioning `entity:create` (the resolver's scope-gate denial); and **0 rows** leaked into the DB. | **The B1 scope bypass.** Pre-fix, `TransactionResolver` made zero `CheckAPIKeyScopeAuthorization` calls, so a `view:run`-only key could Create/Update/Delete over the wire (entity RLS still ran; the API-key scope ceiling was skipped). Fixed 2026-07-21: the resolver now extends `ResolverBase` and runs a per-item scope **pre-pass** (`entity:create/update/delete` mapped from each item's `OperationType`) through the exact check the singular CRUD resolvers use, before any entity work. Reproduced live pre-fix by this check (restricted key CREATED a row → red); green post-fix. That proven-to-fail red run is the point of the pin. |

---

## Bundle 4 — `field-rules-bulk-update` (FR1–FR3, IT10) — declarative rules over a record set

Source: `src/checks/field-rules-bulk-update.checks.ts` · Test record: `.IT10-field-rules-bulk-update.json` ("IT10 - Field Rules Bulk Update", deterministic suite, **server** transport) · Graduated verbatim from the retired `integration-test-scripts/field-rules-bulk-update-tests.ts`.

### Machinery under test

The full FieldRules stack end-to-end: `FieldRulesProcessor` (`@memberjunction/record-set-processor`) → `EntityFieldRules` (`@memberjunction/core`) → the pure field-rules engine (`@memberjunction/global`), driven through `RecordSetProcessor.Instance.Process` over an `ArraySource`. The shared `RULE_SET` exercises both rule kinds: a **formula** (`Description = fields.Name + ' — bulk updated'`) and a **conditional static** (`Status = 'Disabled'` only where `Name.endsWith('-2')` — per-record gating).

### Fixtures / lifecycle / tier

Typed slot `ctx.FieldRulesFixture`. `Setup` creates 3 throwaway `MJ: Action Categories` (`mj-frbu-test-1..3`, Description starting null) — publishing the fixture handle with a **shared, still-empty `Ids` array before creating any record**, then pushing each ID as it lands, so a mid-Setup crash leaves teardown exactly the rows already created (nothing orphaned). Teardown deletes them. No per-check `RequiresMutation` flags — the bundle mutates by design (lifecycle fixtures + FR2's apply), is fully self-cleaning, and runs in the ungated deterministic tier. The three checks are **order-dependent within the bundle** (FR3 reads the state FR2 applied), which the registry's registered-in-array-order invariant preserves.

### Checks

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `field-rules-bulk-update.FR1` | DRY-RUN computes the diff and writes nothing | `Processed === 3`; after a settle, every fixture row's `Description` is **still null** via `BypassCache` reads. | A "preview" that actually writes — the exact failure mode a dry-run exists to prevent in the Bulk Operations studio. |
| `field-rules-bulk-update.FR2` | APPLY writes the formula result (+ reports Record Change capture) | `Success === 3`; each row's `Description` equals the exact formula output (`mj-frbu-test-N — bulk updated`). Record-Changes capture is **reported, not asserted**: the check reads `TrackRecordChanges` and counts audit rows, then logs both. | Rule evaluation or write-back regression across the whole processor→rules→engine stack. **Known open item (B33, register disposition FIX-NOW):** the hedge ("entity-config + key-format dependent") masks a filter bug, not a config limitation — `RecordChange.RecordID` stores the CompositeKey **text** (`ID\|<uuid>`), so FR2's `RecordID='<uuid>'` probe matches nothing by construction; `MJ: Action Categories` demonstrably *does* track changes (EW1 proves it with exact `ChangesJSON`, using the `recordIdValue()` CompositeKey parse FR2 lacks). The register's fix — adopt the CompositeKey-format filter and promote the report to a real assertion — has **not yet landed in this check**; until it does, FR2's audit leg contributes reporting, not coverage. |
| `field-rules-bulk-update.FR3` | A false condition leaves the field untouched | Reading all three rows post-apply: exactly **one** is `Disabled`, and it is `mj-frbu-test-2` (the only name matching the condition); the others kept `Active`. | Condition evaluation applying a rule to non-matching records — the per-record gating contract that makes conditional bulk updates safe. |

---

## Bundle 5 — `record-process` (RP1–RP8, IT04) — the Record Set Processing substrate

Source: `src/checks/record-process.checks.ts` · Test record: `.IT04-record-process.json` ("IT04 - RecordSetProcessor Substrate", deterministic suite, **server** transport) · Graduated verbatim from the retired `integration-test-scripts/record-process-tests.ts`.

### Machinery under test

The hardened substrate itself (`packages/RecordSetProcessor/engine` + `base`; see the RECORD_SET_PROCESSING guide): `RecordSetProcessor.Instance.Process` composing a **Source** (`ArraySource` here) × a **Processor** (a `FunctionRecordProcessor` — pure code, no model calls, which is what makes this bundle deterministic) × the default **Tracker** persisting `MJ: Process Runs` and `MJ: Process Run Details`. The engine behaviors under proof are exactly the ones every bulk operation in MJ leans on: batching, bounded concurrency, per-record error isolation, the error-rate circuit breaker, the `DryRun` header flag, and the fire-and-forget detail-write queue that `CompleteRun` flushes.

### Fixtures / lifecycle / tier

**No lifecycle and no teardown.** Each check fabricates its own in-memory record descriptors (`{EntityID, RecordID: 'rp-…-n'}` — the RecordIDs never resolve to real rows; the processor is a function, so nothing is loaded or mutated). The only shared need is one valid `EntityID` for the `ProcessRun` FK, resolved per check via `RunView`. The `ProcessRun`/`Detail` rows the substrate writes are its own audit output under test and are deliberately left in place. No `RequiresMutation` flags — the writes are the observable.

### Checks

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `record-process.RP1` | 3-record run persists a Process Run + one terminal Detail per record | Result: `ProcessRunID` set, `Status 'Completed'`, `Processed 3`, `Success 3`. Persisted (after settle): the run row with `Status='Completed'`, `ProcessedItems=3`; **exactly 3** detail rows, each with a terminal status (`Succeeded/Failed/Skipped`) and non-null `CompletedAt`. | The audit backbone breaking — lost fire-and-forget detail writes, non-terminal details, or in-memory results diverging from what was persisted. |
| `record-process.RP2` | Mixed success/error/skip counts recorded accurately | `Processed 3`, `Success 1`, `Error 1`, `Skipped 1` from a processor that returns one of each; 3 persisted details. | Counter cross-wiring (an error counted as a skip, etc.) — the numbers operators trust in the run history UI. |
| `record-process.RP3` | A processor that THROWS isolates the bad record | One record's processor throws; `Processed 3` (no abort), `Success 2`, `Error 1`; all 3 details persisted; the throwing record's detail is `Failed` **with the error message captured**. | Per-record isolation regressing — one bad record aborting the whole run, or a swallowed exception losing its message. |
| `record-process.RP4` | Error-rate circuit breaker trips and stops the run | An always-failing processor at `batchSize 1`, `errorThresholdPercent 50`: run `Status 'Failed'`, `Processed < 10` (stopped early), and `ErrorMessage` matches `/circuit breaker/i`. | The breaker never tripping (a poisoned 100k-record job burning to the end) or tripping without saying why. |
| `record-process.RP5` | A run spanning multiple batches processes every record | 5 records at `batchSize 2` (3 batches of 2/2/1): `Status 'Completed'`, `Processed 5`, 5 persisted details. | Batch-boundary loss — the classic off-by-one that drops the short final batch. |
| `record-process.RP6` | Bounded concurrency: parallel but never above the cap | An instrumented processor counts in-flight executions: `Processed 6`, measured `maxActive > 1` (genuinely concurrent — anti-vacuity) **and** `maxActive <= 3` (`maxConcurrency` honored). | Concurrency silently serialized (perf) or the cap ignored (DB/API stampedes from bulk jobs). |
| `record-process.RP7` | Dry-run records `DryRun=1` on the run header | `dryRun: true` → persisted run row has `DryRun === true`. | Previews indistinguishable from applies in the run history — an operator can't tell what actually wrote. |
| `record-process.RP8` | Normal pass records `DryRun=0` (default) | `dryRun` omitted entirely → persisted `DryRun === false`, not null. | The default leaking as null/true — the complement that keeps RP7 meaningful. |

---

## Bundle 6 — `record-process-facade` (RPF1–RPF2, IT05) — the RecordProcessExecutor facade

Source: `src/checks/record-process-facade.checks.ts` · Test record: `.IT05-record-process-facade.json` ("IT05 - RecordProcessExecutor Facade", deterministic suite, **server** transport) · Graduated verbatim from the retired `integration-test-scripts/record-process-facade-tests.ts`.

### Machinery under test

The metadata-driven layer above the substrate: a saved `MJ: Record Processes` definition run through `RecordProcessExecutor`, which maps `ScopeType` → a source and `WorkType` → a processor and persists a `ProcessRun` **linked back** to the definition (`RecordProcessID`). The fixture definition is engineered for zero side effects: `ScopeType 'Filter'` with `ScopeFilter '1 = 0'` (deterministically matches no records) and `WorkType 'Action'` pointing at a real Action FK that is **never invoked** (0 rows). What remains observable is precisely the facade's own work: definition resolution, scope→source mapping, run linkage, and completion.

### Fixtures / lifecycle / tier

Typed slot `ctx.RpFacadeFixture` — the file's header calls itself **the reference pattern for a shared-fixture mutating bundle**: `Setup` resolves a seed entity + action via one batched `RunViews` call and saves the single Record Process definition (`mj-integration-test-record-process (safe to delete)`); checks push every `ProcessRunID` they create into the fixture; `Teardown` cleans FK-safe (Process Run Details → Process Runs → the Record Process). No `RequiresMutation` flags; deterministic tier.

### Checks

| Id | Name (abridged) | Asserted observable | Failure it catches |
|---|---|---|---|
| `record-process-facade.RPF1` | `executor.Run(definition)` persists a Completed, linked ProcessRun | Result `Status 'Completed'`, `Processed 0`; the persisted run row: `RecordProcessID` == the fixture definition's ID, `Status 'Completed'`, `SourceType 'Filter'` (ScopeType faithfully reflected), `ProcessedItems 0`. | The facade running detached from its definition (unlinked runs — history/telemetry orphaned), mis-mapping ScopeType, or failing on the legitimate empty-set case. |
| `record-process-facade.RPF2` | `executor.RunByID(id)` resolves the definition from just its ID and runs identically | Same `verifyRun` contract as RPF1, reached from only the definition's ID. | The by-ID resolution path (the one schedulers and Remote Operations actually call) diverging from the direct-entity path. |

---

## Bug-register cross-reference (pins, warns, and known gaps)

Where a check in this family pins behavior, warns instead of failing, or documents a wire-fidelity gap, here is the consolidated map into the [bug register](../../../../plans/integration-test-expansion/bug-register.md):

| Register ID | Check | Status in this family |
|---|---|---|
| **B1** (TransactionGroup API-key scope bypass, High/security) | TG5 | **FIXED and pinned red-then-green.** TG5 reproduced the bypass live pre-fix (restricted key created a row through `ExecuteTransactionGroup`), and is green post-fix (denied with the `entity:create` scope error, 0 rows leaked). The explicit deny rule makes the pin independent of `defaultBehaviorNoScopes`; a 401 is treated as inconclusive-fail, never a pass. |
| **B49** (GraphQLTransactionGroup rolled-back-group false success, High) | TG3 | **FIXED and pinned at the wire** (plus a unit pin in `graphQLTransactionGroup.test.ts`). TG3's assertion message names the defect: a `Submit() === true` here means the client swallowed a server rollback. *Register note:* the register currently contains **two entries labeled B49** (this one and the `statusUpdates` subscription-hijack finding); the second is outside this family's scope but the duplicate ID is worth knowing when reading the register. |
| **B31 / B52** (`AfterKeyNotSupportedError` reason/message lost over the GraphQL wire) | EW4 | **Documented gap, asserted at honest strength.** All three guardrail refusals are strictly asserted as `Success === false`; the NULL-`ErrorMessage` fidelity loss is reported in-body, not asserted — the check will tighten once the typed error propagates (register: DECIDE/OPEN). The sibling client-transport pin is RVM14 in the `runview-matrix` rig. |
| **B53** (server-entity `ValidateAsync` message lost on the UPDATE wire path) | ESI2 (with EW8 as the create-path control) | **Refusal strict; fidelity warns.** ESI2 asserts the gate fired, and emits a loud `console.warn` when the specific message ("TagScope row(s) exist") arrives genericized. EW8 proves the asymmetry is update-path-specific: spCreate-path messages survive the wire byte-recognizably. |
| **B33** (FR2's Record-Changes probe filters on the bare UUID; `RecordID` stores CompositeKey text) | FR2 (EW1 has the correct pattern) | **OPEN — register disposition FIX-NOW, not yet applied.** FR2 still reports the (structurally zero) audit-row count informationally. EW1's `recordIdValue()` helper is the in-family reference for the correct CompositeKey-text handling and delivers the real Record-Changes coverage in the meantime. |
| **B15** (Tag delete cascade swallows partial FK-cleanup failures) | ESI3 | **DECIDE item; happy path pinned only.** ESI3 pins the contract any B15 fix must preserve (delete succeeds, children swept). The swallow-failure leg is deliberately not probed — it cannot be triggered deterministically over the wire without corrupting real FK state. |
| **B16 / CD13** (server-side Save is last-write-wins; `SkipOldValuesCheck` is client-only) | *(none yet)* | **Not implemented in this family.** CD13 remains a Domain-2 catalog row (PIN disposition) with no shipped check; nothing in `entity-writes` currently exercises concurrent-edit clobbering. Listed here so the omission is explicit rather than silent. |
| *(PR #2732 predicate — no register ID; regression class)* | EW9 | **Regression-pinned.** The inverted-`IsSaved` `OriginalMessageChanged` predicate shipped broken for its whole life because nothing asserted it; EW9 pins both the fire and the streaming-exemption non-fire, over the wire where the dirty-tracking mechanics actually differ. |

### Other shipped-vs-catalog divergences worth knowing

- **CD3 scale**: the catalog sketched a 500-row keyset walk; EW3 ships 12 rows @ page 5 — the invariants proven (exact union, no dups, short-final-page signal, cursor-advance guard) are the same; only the magnitude was scaled down for suite runtime.
- **`entity-writes` header comment** still titles the bundle "EW1–EW8"; the file exports **9** checks (EW9 was added 2026-07-21 and is fully described in the IT27 record). Cosmetic drift in the header only.
- **Coverage-loss guard table**: `src/__tests__/check-registry.test.ts`'s per-bundle count table includes `record-process` (8), `record-process-facade` (2), and `field-rules-bulk-update` (3), but has **no rows for `entity-writes`, `entity-server-invariants`, or `transaction-groups`** — despite the package README's "update the count table" step. The sibling-parity test still guards their IT-record/suite membership, but their check *counts* are currently unguarded.
- **Record-Changes latency**: EW1's 15-second poll exists because the versioning queue is fire-and-forget; under the full aggregated suite the arrival lag was observed in seconds, and immediate reads raced it (standalone-green / suite-red). The poll removes the race without weakening the assertion.

## Related reading

- [test-catalog.md](./test-catalog.md) — the full expansion catalog; Domains 2 and 6 are this family's design ancestors (Domain 2's CD6/CD7/CD14/CD15 and Domain 6's ES2–ES9 remain unbuilt or live in other bundles).
- [Bug register](../../../../plans/integration-test-expansion/bug-register.md) — every defect referenced above, with dispositions.
- `packages/TestingFramework/integration-test-suite/README.md` — how bundles load (`checkModules`), the five-step recipe for adding one, and the sibling-parity rule.
- `guides/RECORD_SET_PROCESSING_GUIDE.md` and `guides/INTEGRATION_TESTING_QUICKSTART.md` — the substrate and the testing tier this family lives in.
