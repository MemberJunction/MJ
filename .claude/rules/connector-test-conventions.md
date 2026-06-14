---
description: Conventions for connector test files.
applies_to: connectors-registry/**/src/__tests__/*.test.ts
---

# Connector test conventions

Applies to vitest test files under `packages/Integration/connectors-registry/<vendor>/src/__tests__/`. These tests are consumed by tiers T4 (mocked fixture) + T5 (mock HTTP server) of the verification ladder.

## Framework

- Vitest (the MJ standard; not Jest).
- Imports: `import { describe, it, expect, vi, beforeEach } from 'vitest';`
- All credential-required cases run via `mj-test-runner` MCP at T10 — NOT in these vitest files.

## Test structure

- One test file per connector (`<Name>Connector.test.ts`).
- Group tests by lifecycle phase: `describe('TestConnection', ...)`, `describe('DiscoverObjects', ...)`, `describe('FetchChanges', ...)`, etc.
- Use real fixtures from `__tests__/fixtures/` — canonical vendor response samples copied from real responses with all PII scrubbed via `scrub-fixture`. PROVENANCE.json entries cite the source URL.

## What to test

- **TestConnection** — happy path + auth failure path + network-error path + (if applicable) scope-missing path.
- **DiscoverObjects** — at least one IO present + capability flags (`SupportsCreate`/`SupportsUpdate`/`SupportsDelete`/`SupportsRead`) match the IO metadata.
- **DiscoverFields** — at least one IOF per known IO; `IsPrimaryKey` set only where the source declares a PK (per the Phase 0 B-fix), not inferred from `IsUniqueKey`.
- **Generic CRUD via per-operation IO columns** (v5.39.x — required when capability flag is true):
  - `CreateRecord` — happy path (URL templated from `CreateAPIPath` + record; method = `CreateMethod`; body shaped per `CreateBodyShape`/`CreateBodyKey`; ID extracted per `CreateIDLocation`) + filters out `IsReadOnly` fields + applies `FieldMappingMJName` if set.
  - `UpdateRecord` — same as Create + honors `If-Match` ETag when the IO declares one.
  - `DeleteRecord` — happy path + soft-delete pattern if applicable; ID location per `DeleteIDLocation`.
  - `GetRecord` — happy path + 404 path.
  - `SearchRecords` — filter syntax per vendor + pagination.
  - `ListRecords` — pagination + `NextCursor` surfacing.
- **FetchChanges (incremental)** for every IO with `SupportsIncrementalSync=true`:
  - First sync: no watermark → full fetch + max-watermark persisted (reads from `IncrementalWatermarkField`).
  - Subsequent sync: watermark → incremental query param added + new max persisted.
  - Out-of-order batch: tracks max-seen, not most-recent.
  - Partial failure: watermark NOT updated; next call resumes from old value.
  - Format-mismatch: ValidateWatermark rejects.
- **State recovery** — mid-fetch failure leaves watermark unchanged; idempotent Create with same key returns same vendor result.
- **OnUninstall** — revoke succeeds + tolerates failure.
- **NormalizeResponse** — envelope unwrapping for wrapped + direct shapes.
- **ExtractPaginationInfo** — every supported `PaginationType` the connector declares.
- **TransformRecord** (v5.39.x hook) — when overridden, both happy + null-input paths. Default identity does not need a test.
- **Per-tenant overrides** — `BatchSizeOverride`, `ExcludedIOs`, `FieldMappingOverrides`, `WatermarkResetIOs` respected.
- **Multi-tenant** — two `CompanyIntegration` contexts don't cross-contaminate state (per the "global provider" guidance in CLAUDE.md — connectors must respect their bound provider).

## Mocking

- Mock `companyIntegration.Configuration` as a string (post-§2.3, code reads the typed property directly).
- Mock HTTP via a test subclass that overrides `LoadMetadata`, `Authenticate`, `MakeHTTPRequest` — captures the call args (URL/method/headers/body) and returns canned responses. Read whichever existing connector's `__tests__/<Name>Connector.test.ts` exercises the same protocol family for the canonical `Mocked<Name>Connector` pattern.
- For T10 live tests, do NOT mock — those run via the `mj-test-runner` MCP with real credentials.

## PII safety in fixtures (Gap 7)

- Fixtures derived from real vendor responses MUST run through `scrub-fixture` before commit:
  - Names → `<scrubbed-name-N>`
  - Emails → `example+N@example.com`
  - Phones → `555-01XX` test-range
  - Addresses → `123 Test St, Example, XX 00000`
  - Dates → randomized in `2026-01-01` to `2026-12-31`
  - IDs (ExternalIDs) → kept (needed for FK relationship verification)
  - Free-text → `<redacted>` when no safe substitution
- Run-directory test data under `connectors-registry/<vendor>/runs/<runID>/test-data/` is wiped before PR open. Presence of unscrubbed test data at PR-open time is a floor-check failure.

## Live e2e harness — separate from the vitest files; the HubSpot framework is the template

> **🚨 READ-ONLY REVISION (BINDING) — supersedes the write/bidirectional/delete/dual-dialect material below.**
> The current **LIVE** contract is **READ-ONLY, ceiling T8** — **WHEN testing against a CUSTOMER/USER credential.**
> **T8 against a user-supplied credential is READ-ONLY** (TestConnection + discover + one read page — never create/update/delete/ack a customer's records).
>
> **⚠️ SELF-SERVE EXCEPTION (user-directed, 2026-06-14, explicitly allowed): the read-only contract protects a CUSTOMER's data reached via a CUSTOMER credential — it does NOT restrict your own disposable SELF-SERVE org.** The agent must PREFER a self-serve live DB (vendor free Developer Edition / sandbox / test-mode creds — never the user's creds; see `connector-credential-testing.md` § "🥇/STANDING RULE") and, on that self-serve org, run the **FULL read+write hybrid-e2e** (create/update/delete/bidirectional/conflict/idempotency), tagging created records (`mj_test_run=<runID>`) and deleting them in a `finally`. Write-back is forbidden ONLY against a customer credential. **Substitute a self-serve org for the user's credential every time one exists.**
>
> **⚠️ DISAMBIGUATION (2026-06-14) — "there is no T9–T12" means no LIVE/CREDENTIALED tier above T8. It does
> NOT mean the runner's credential-free tiers T9–T12 don't exist — they DO, and the testing-agent MUST run
> them every build.** The `mj-test-runner` ladder is **T0..T12**, where T9_EndpointReality / T10_TransportSmoke /
> T11_SandboxProbe / T12_IdempotencyReplay are **CREDENTIAL-FREE** real-setting rungs (no creds, part of the
> non-live suite). The "T10/T11" labels in THIS doc's §3.x material refer to the live `hybrid-e2e` **phase**
> numbering — a SEPARATE scheme that collided with the runner-tier numbering and caused the runner's T9–T12 to be
> silently skipped. Run BOTH: the runner's credential-free T0–T12 ladder AND (where creds exist) the read-only
> live hybrid-e2e phases. See `.claude/agents/testing-agent.md`. The live gate `floor-check` enforces is the **read-only `hybrid-e2e`** primitive plus the
> read-only `reality-probe` — NOT a write/bidirectional/delete/dual-dialect matrix. `phase0-slots.json`'s
> `e2eLivePhases` reflects this (Phase B sub-phase 3.4 deletes removed; 3.2 reframed inbound-read-only;
> `E2E.DualDialect` removed; all phases `dualDialect:false` = SQL-Server-only). **Write-path correctness
> (Create/Update/Delete, bidirectional conflict, idempotency) is proven by the MOCKED tiers T4/T5 below and
> by unit tests — NEVER by a live mutation against a real vendor.**
>
> Therefore, in everything below: treat the §3.2 write-paths, §3.4 deletes/tombstoning, and §7 dual-dialect
> cells as the **aspirational full plan, NOT run live** — author them as mocked T4/T5 coverage or omit them with
> a logged `skipReason`. The "T10/T11" naming throughout refers to this read-only `hybrid-e2e` live harness, not
> a write tier. The binding source of truth is `SKILL.md` (read-only-only) + `phase0-slots.json` + the
> `verification-ladder` / `floor-check` primitives — if this doc and those disagree, those win.

The vitest files above are the credential-free mocked tiers (T4/T5). The **live** tier is a separate artifact: a connector-specific e2e harness modeled on the reference framework at `packages/Integration/connectors/test/` — `gql-live-harness.mjs` (orchestration), `gql-live-adapters.mjs` (the fetch/DB/vendor adapters), `plans.mjs` (the named read-only + write plans), run through `credential-broker.mjs`. It is NOT a vitest file and does NOT hit the vendor directly from test code; it drives the connector **through the MJ GraphQL API** (`IntegrationCreateConnection` → discover → `CreateEntityMaps`/`FieldMaps` → `ApplyAll` → `StartSync` → `IntegrationTailRunEvents`/`GetRun` → teardown) exactly as a real client would.

Author one per connector, covering only the subset of the capability matrix the connector supports (pull-only → no push/bidirectional plans; no incremental signal → content-hash/keyset cells instead of watermark). It must:
- **Assert outcomes, never `Status='Success'`** — ground-truth counts vs MJ rowcounts, every second-layer/association table `> 0` when its upstream has data, and read the structured `SyncWarning`s.
- **Run on SQL Server** (Postgres SUSPENDED for the per-connector loop — see Dialect policy below) — UUID comparisons go through `UUIDsEqual` (SQL Server upper- vs Postgres lower-case).
- **Tag + clean up** — every created record carries `mj_test_run=<runID>`; teardown deletes exactly those in a `finally`, and the result reports `cleanup:{created,deleted,remaining:0}`. Never touch users/owners or pre-existing data.
- **Support token-free reference mode** — run against a pre-seeded `companyIntegrationID` with no secret declared (completeness checked via the internal record-map 1:1).
- **Emit dual NLP + JSON results** per cell (a plain-English statement of what was proven + the scrubbed `IntegrationGetRun` payload / DB counts / `progress.jsonl` evidence).

### The ordered §1→§7 phase skeleton — the authoring spec (FIXED order, enforced by `floor-check`)

Every per-connector harness MUST follow the canonical **"Integration Major Enhancement — Test Plan" §1→§7** phase order, declared machine-readably in `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` under `e2eLivePhases`. The HubSpot framework at `packages/Integration/connectors/test/` is the reference implementation of this skeleton. This is the authoring contract; `floor-check` rejects any T10/T11 run that skips, reorders, or leaves a phase unevidenced (see the rule list below). Author phases in this exact order:

| `order` | `phaseId` | Phase | What the harness runs |
|---|---|---|---|
| 0 | `E2E.Env` | §1 Env bring-up | empty DB → `mj migrate` → `mj sync push` → `mj codegen` (in order) → build+start mjapi/mjexplorer → obtain GQL key without exposing it (§0) → create initial Company |
| 1 | `E2E.PhaseA` | §2 Integration & Metadata | create `CompanyIntegration` → link credential + connection-test (broker) → `RefreshMetadata` (all custom tables/columns/absent-metadata/watermark) → LLM/stats **PK-classify** → `additionalSchemaInfo.json` → **`ApplyAllBatch`** over all selectable tables → inspect subscription → structured Phase-A report |
| 2 | `E2E.PhaseB` | §3 Sync 2^N matrix | sub-phases **3.1→3.8** in order (see below) |
| 3 | `E2E.PhaseC` | §4 Value Handling | different value types map + persist without throwing |
| 4 | `E2E.GenAction` | §5 Generation Action / Agents | generation-action path + `mj ai` agent invocation + observe outcome |
| 5 | `E2E.Observability` | §6 Observability (continuous) | structured logs captured throughout EVERY phase, not at the end — this IS the per-test NL+JSON+pass/fail contract below |
| 6 | `E2E.DualDialect` | §7 Dual-dialect | run the ENTIRE applicable suite again on Postgres; both suites as DISTINCT artifacts; SQL-Server↔Postgres concept mapping |

**Phase B sub-phases (run 3.1→3.8 in order):** 3.1 change-detection/efficiency (watermark-first→full/rest + no-watermark path, timestamp incremental, content-hash/Merkle actually skipping work, keyset pagination with mid-sync API restart resuming from logs) · 3.2 directions & write paths (inbound, bidirectional [conflict/echo-loopback/simultaneous-both-sides/ordering], write-backs, watermark fallback save) · 3.3 identity/idempotency (dedupe, replay idempotent) · 3.4 deletes & tombstoning (disposable test records only, §0) · 3.5 schema drift (source-side AND local-side column removal, adversarial, plus other source-side surprises) · 3.6 DAG (ordering follows the contract, deeply) · 3.7 rate-limit/concurrency (429 characterization + per-layer concurrency) · 3.8 resilience (strategy rotation mid-sync, infinite-pagination recovery, generic mid-process failure, grace handling that maximizes landed data).

### Per-connector adaptation — applicable subset, fixed skeleton, no silent omission

The harness runs the **applicable subset** of each phase: a pull-only connector skips Phase B's push/bidirectional cells (3.2) and §5 if no generation action; a connector with **no watermark** exercises the content-hash/keyset axes of 3.1 in place of the watermark cell. **But the phase skeleton + ordering is FIXED** — you may not reorder phases or drop a whole phase. **Any skipped phase/cell MUST be logged with a `skipReason`** (a `livePhaseLog` entry with `status:'skip'` and a non-empty `skipReason`); silent omission is a `floor-check` failure. Determine applicability from the frozen contract's capability flags (`SupportsWrite`, `SupportsIncrementalSync`, generation-action availability), not from convenience.

### Dialect policy (§7) — SQL Server PRIMARY (PostgreSQL SUSPENDED until its baseline is regenerated)

**Per connector, run the live suite on SQL Server.** This **REVERSES** the prior Postgres-primary policy. PostgreSQL is **temporarily SUSPENDED** for the per-connector loop because a **fresh PG install cannot currently CodeGen** — `ApplyAll` registers 0 entities, so no connector can sync on a fresh PG DB.

**Why PG is blocked (so this isn't second-guessed):** the shipped v5.34 + v5.37 PG baselines were regenerated by the SS→PG converter and (a) do NOT contain the 5 CodeGen sprocs and (b) carry `params."`-quoted code + an `integer = boolean` view corruption. The two migrations that fix both — `V202604220000__v5.29.x` (CodeGen sprocs) and `V202605041700__v5.33.x` (un-quote) — sit **below** both baselines, so a fresh install **skips** them. Net: fresh PG → missing-sproc cascade → codegen fails. Empirically confirmed (2026-06-06): dropping **both** upper baselines to the v5.0 floor (full history replay) restores the sprocs and codegen passes — and it must be BOTH, because v5.34 also sits above v5.29/v5.33. Until the PG baseline is **regenerated from replayed history** (or those two migrations re-issued **above** the baseline), a fresh PG DB is not a viable per-connector target. See memory `project_pg_v538_baseline_build_slip` + `project_pg_bug5a_dependent_views`.

**Why SS-primary is sufficient interim proof:** the connector logic (discover, fetch, paginate, upsert-by-identity, incremental watermark, content-hash, delta CRUD, idempotency) is **dialect-independent** — it runs through MJAPI's GraphQL + the IntegrationEngine identically on either backend. The dialect only governs the DDL/type-mapping plumbing, which is framework (not connector) and unchanged under a connector PR. So SS fully exercises the connector. UUID comparisons still go through `UUIDsEqual` (SS upper-cases).

**PG remains the eventual stricter target** (dependent-view protection on type evolution, UUID lowercasing, transaction-abort-on-error). Re-promote PG to primary the moment its baseline is fixed; until then SS carries the per-connector loop and PG is an explicit, separate opt-in.

`e2eLivePhases` phases stay `dualDialect:false`, now meaning **SQL-Server-only**; `floor-check`'s `e2e-dual-dialect-missing` rule only fires if a phase is explicitly re-marked `dualDialect:true` for a framework-level dual run.

### SQL Server live-run setup (the proven operational recipe — 2026-06-06)

The DB + MJAPI + broker recipe that actually works for a per-connector SS live e2e (every step here was a real blocker on the PropFuel run):

1. **DB** — SQL Server in Docker (`sql-claude` container, `localhost:1444`, db `MJ_SS_E2E`, user `sa`). Build it **FRESH** (baseline → migrate → codegen). A reused/degraded DB with malformed entities sinks `ApplyAll`.
2. **MJAPI** on `:4007` against `MJ_SS_E2E`, started with **`MJ_API_KEY` in its env** (MJAPI validates the GraphQL `x-mj-api-key` header against `process.env.MJ_API_KEY` — config.ts:339) and **advancedGen OFF** (see next section).
3. **Broker** (separate-user `mjbroker`) — its **launching env must carry THREE secrets**, not one. The `connector-e2e-live` plan (`plans.mjs`) declares all three; a missing one fails `runCredentialSafe` with `Missing required env var(s)`:
   - `CONNECTOR_API_KEY` = the vendor token (from the broker's `<vendor>.env`).
   - `DB_PASSWORD` = the SS `sa` password.
   - `MJ_API_KEY` = **the exact value MJAPI was started with**. Read it from MJAPI's own process env (`ps -Eww -p <mjapi-pid>` works for your OWN process on macOS), copy it into a **dedicated broker key file**, and **`export` it explicitly** — relying on `set -a` sourcing alone proved unreliable (variable set in shell ≠ exported to the child). Confirm with `env | grep -c '^MJ_API_KEY='` → `1`.
4. **Job env** (`connector-e2e-live` task): `HS_LIVE_PLATFORM=sqlserver`, `HS_LIVE_DB_HOST/PORT/NAME/USER`, `HS_LIVE_GRAPHQL_URL`, `HS_LIVE_COMPANY_ID`, `HS_LIVE_CREDTYPE_ID`, `HS_LIVE_MJ_SCHEMA=__mj`, **`HS_LIVE_OBJECTS=<the connector's real stream names>`** (else it defaults to HubSpot's `contacts,companies,deals` and maps the wrong/empty objects), and a generous **`HS_LIVE_MAX_POLLS`** (now a real *time* budget — see gotchas).
5. **Credential shape** — set `E2E_TOKEN_KEY` (the secret's key name the connector reads, e.g. `Token`) + `E2E_LIVE_CONFIG` (non-secret config JSON, e.g. `{"AccountID":"2019"}`) so `CredentialValues` resolves to what the connector expects. A default `apiKey` key + empty config yields `No credential or Configuration JSON found on CompanyIntegration`.

**Gotchas that cost real time (do not relearn them):**
- **The broker caches results by `jobId`.** Re-submitting the SAME `jobId` returns the STALE cached result — an apparent "still failing" is often a cache hit on an old error. **Use a fresh `jobId` on EVERY submission.**
- **`tailRunToCompletion` now sleeps ~1s/poll**, so `HS_LIVE_MAX_POLLS` is a real time budget (1800 ≈ 30 min) rather than N back-to-back ~3ms round-trips that burn out in seconds and read a still-running sync as `Processed:0`/`Success:false`. The harness now **waits for the sync to fully drain before teardown** (so later streams aren't orphaned by an early map-delete).
- **Bound huge streams** — don't fully drain a 50k-row table every run; prove advancement+termination on a mid-size multi-page "Goldilocks" stream and bound the rest (memory `feedback_bounded_pagination_goldilocks`).
- **DB request timeout** — the `mssql` client defaults to a **15s** `requestTimeout`; a real production-scale sync makes the DB busy enough that a completeness COUNT or the teardown DELETE exceeds 15s and dies with `RequestError: Timeout: Request failed to complete in 15000ms` (rolling back teardown). `gql-live-adapters.mjs` now sets a generous, env-tunable budget on **both** dialects (`requestTimeout`/`statement_timeout`/`query_timeout`, default 10 min, override via `E2E_DB_REQUEST_TIMEOUT_MS`). Postgres previously had the opposite failure (no timeout → hang forever); now symmetric.
- **Lock hygiene — clear/reset BEFORE the run, NEVER `KILL` a session mid-run.** A failed run can leave an orphaned blocking chain (`sys.dm_exec_requests.blocking_session_id`) that makes the next `DELETE`/count hang. Clear it **before** starting (kill the distinct root blockers, then truncate the target tables for an unambiguous count). But once a run is live, do NOT `KILL` SQL sessions to "unstick" it — you'll kill the run's OWN pooled connection and it dies with `Requests can only be made in the LoggedIn state`. The order is: reset clean → submit → leave it strictly alone until the result lands.
- **Watermark vs content-hash incremental — pick the right axis (and the right stream).** `forward.incremental.narrowed` + `idempotent.no-redundant-writes` now pass on EITHER `Processed` dropping (watermark stream) OR `Succeeded===0` (no-watermark/insert-only stream re-fetches but writes nothing). So a cert on insert-only streams (PropFuel opens/clicks) proves **content-hash idempotency**; watermark-narrowing is proven on the watermarked stream (checkin_questions) or in T4 unit tests. Choose the **Goldilocks** streams for the live cert via `HS_LIVE_OBJECTS` (multi-page but not 50k) so it runs in minutes — the huge stream's narrowing is already unit-proven.

### Reusable broker launcher (one command per vendor)

`packages/Integration/connectors/test/launch-broker.sh` encodes the whole secret-passing recipe (all three secrets exported, subshell-orphan survives the tty-less sudo, `*_TOKEN`→`CONNECTOR_API_KEY` auto-map). For each new vendor:
1. One-time: `MJ_API_KEY` lives in `/Users/Shared/mj-broker/mjkey.env` and is **reused across every vendor** — copy it once from the running MJAPI's own process env; never re-derive it.
2. Per vendor: drop the token in `/Users/Shared/mj-broker/<vendor>.env` (as `CONNECTOR_API_KEY=…` or the skill's `<VENDOR>_TOKEN=…`).
3. Launch: `sudo bash packages/Integration/connectors/test/launch-broker.sh <vendor>` — it prints `broker pid(s)` + an `exported to children -> MJ_API_KEY:1 CONNECTOR_API_KEY:1 DB_PASSWORD:1` line (all three must read `1`). Only the vendor token + the job's `HS_LIVE_OBJECTS` change between connectors.

### Run connector E2E with advancedGen OFF (keyless-safe)

Connector E2E runs with **advancedGeneration OFF**. In `mj.config.cjs` set `advancedGeneration: { enableAdvancedGeneration: false, batchSize: 15 }` **and RESTART MJAPI** — the in-process CodeGen reads this flag at **MJAPI startup**, so an already-running server will not pick it up (you'll see `Invalid Vertex AI credentials` keep climbing). **Why required:** `enableAdvancedGeneration` **defaults to `true`**; in a keyless test env the `ApplyAll`/in-process CodeGen would call a credential-less AI model, throw `Invalid Vertex AI credentials`, and **sink the entire CodeGen** — failing the run for a reason unrelated to the connector. **Why correct, not a hack:** advancedGen is an **optional AI enrichment that does not affect connectors** — sync, CRUD, associations, idempotency are **identical** with it off. advancedGen-ON correctness (advancedGen + Postgres — the SaaS product target) is proven **separately in the keyed/broker env**, never gated into a per-connector run.

### Per-phase structured output (§6) — the `livePhaseLog` the floor reads

Each phase/sub-phase/cell emits a `livePhaseLog` entry the testing-agent returns on its T10/T11 tier result and `floor-check` enforces against `e2eLivePhases`:

```json
{ "phaseId": "E2E.PhaseB.3_1", "order": 2, "dialect": "sqlserver",
  "nl": "Plain-English: what was tested + the result",
  "json": { "IntegrationGetRun": { "...scrubbed..." }, "dbCounts": { "...": 0 }, "progressEvents": [] },
  "status": "pass" | "fail" | "skip", "skipReason": "required only when status==='skip'" }
```

`floor-check` rejects the run (`pass=false`) when, for any APPLICABLE `e2eLivePhases` entry, the union of the T10+T11 `livePhaseLog` shows the phase **missing** (`e2e-phase-missing` / `e2e-subphase-missing`), **out of order** (`e2e-phase-out-of-order`), **lacking NL + JSON + explicit pass/fail** (`e2e-phase-evidence-missing`), **skipped without a reason** (`e2e-skip-without-reason`), or — for a `dualDialect` phase — proven on **only one** of SQL Server / Postgres (`e2e-dual-dialect-missing`). This is what makes "run the full thing, in order" enforced rather than trusted.

## DO NOT

- Don't fabricate fixture data. Use real vendor responses copied from runs, with PROVENANCE.json citing the source.
- Don't hit live APIs from these tests — that's T10's job (separate runner, real credentials).
- Don't assert against the killed `connector-generator` output. (ADR-001 — generator gone; tests target the hand-written connector class directly.)
- Don't reference the retired `@memberjunction/integration-connector-validator` package; structural invariants moved into T1 of the verification ladder.
