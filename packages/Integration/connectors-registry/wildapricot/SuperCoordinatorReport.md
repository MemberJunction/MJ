# Wild Apricot Connector — Super-Coordinator Report

**Verdict: PASS** · Mode: `redo` (0.x → **1.0.0**) · Credential-free `[B]` · runID `connector-wildapricot-1782844331649-0a8d294b`

Re-built the pre-Phase-0 baked-catalog connector under the Phase-0 workshop (provable-only, bijection-gated).

## Shape
- **62 objects analyzed** → **25 listable** (authored as Integration Objects) + **37 listless** (nested sub-objects, captured inside their parents).
- **25 Integration Objects**, **332 Integration Object Fields**.
- Nested capture: arrays → json columns (`Tags`, `Contact.FieldValues`); objects → flattened to scalar / overflow keys (`Event.Details` → `Details_*`).

## Primary keys
- **PK-defer 0%** — all 25 IOs have a key.
- 23 natural/evidenced (from the spec, zero fabrication).
- **2 synthetic** (`Donation`, `SentEmailRecipient`) — genuinely keyless in the WildApricot API; resolved via a single synthetic **content-hash PK** (`IdentityKey`). This is the `SoftPKClassifier` synthetic-fallback path, now fixed framework-wide.

## Verification (empirical + lint, both green)
| Gate | Result |
|---|---|
| Ladder T0–T7 + T10 + T12 | ✅ 0 red (T9/T11 skipped: no endpoints/sandbox; T8-live not run — credential-free) |
| **HybridE2E (mock, SQL Server, real engine)** | ✅ **25/25 objects, 45 rows** |
| forward completeness / incremental narrowing / idempotent zero-work | ✅ |
| delta CRUD (Contact create/update/delete) | ✅ |
| DAG (25 obj / 5 FK / 0 cycles) | ✅ |
| custom-column capture (`CustomLoyaltyTier` → overflow) | ✅ |
| nested-object capture (`Event.Details` → flattened overflow) | ✅ |
| keyless-via-content-hash (`IdentityKey` = SHA-256) | ✅ |
| **floor-check (structural)** | ✅ **0 failures** (run deterministically over disk artifacts) |

**Ceiling:** `format-verified-no-creds` + offline-behavioral-proven (mock is a programmable vendor; only a live write round-trip + true rate behavior are credential-only, and were not run).

> **floor-check tool note:** the `floor-check.workflow.js` standalone invocation via the Workflow tool did not receive its `args` global (empty vendor slug → couldn't open the metadata file), false-failing twice. The identical checks were run directly against the disk artifacts (bijection slots, PK-defer, fk-qualifier, build-clean, connector-file) → **0 failures**. Filed as a framework finding.

## Framework fixes made during this build (belong in a separate MJ PR)
1. **`SoftPKClassifier`** — synthetic name `__mj_integration_IdentityHash` → **`IdentityKey`** (the reserved `__mj_` prefix was why synthetic "never materialized"); synthetic fallback **default ON**; **`MIN_STATISTICAL_SAMPLE=8`** significance gate (stops thin-sample false positives); **nullable-awareness** (a declared-nullable field can't be a PK member). +2 new unit tests, 11 pass.
2. **`IntegrationConnectorCreationPipeline.StagePKClassify`** — creates the synthetic IOF when the verdict is `synthetic` (was silently skipping unknown nominees).
3. **`MJServer/orm.ts` + `CodeGenLib/db-connection.ts`** — `DB_ENCRYPT` env override (local/Docker self-signed TLS was rejected even with `trustServerCertificate`).
4. **`hybrid-e2e.workflow.js`** — STEP A2 seeds `remote-operation-categories` **before** `remote-operations` (the AI-Skills `@lookup` rolled back the whole push otherwise); `DB_ENCRYPT=false` in the MJAPI launch.
5. **`HYBRID_E2E_ENV_RUNBOOK.md`** — `DB_ENCRYPT=false` + the `SCHEMA_ID('__mj')` DB-context verify-query gotcha (a false-negative that aborted a working migrate).

## Next
- **PR A (framework, off MJ `next`):** items 1–5 above (+ tests).
- **PR B (connector):** WildApricot metadata + connector + fixtures + this report → **publish as Open App** to `MemberJunction/Integrations`.
