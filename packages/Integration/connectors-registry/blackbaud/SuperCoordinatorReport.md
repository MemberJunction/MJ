# Blackbaud SKY API Connector — Build Report (redo, credential-free)

**Date:** 2026-07-03  **Mode:** redo (major, over a prior partial `BlackbaudConnector.ts`)
**Credential:** none (full non-live suite)  **Isolation:** git worktree `.claude/worktrees/blackbaud` + dedicated `sql-blackbaud`:14455 / `MJ_BB_E2E` / MJAPI :4055

## Classification: **GENUINE-GREEN** — full HybridE2E `ok: true`, every gate passing.

```
OVERALL ok: True
coverage.all-objects:            ok=True   58/58 syncable objects land rows
idempotent.no-redundant-writes:  ok=True   succeeded=0 on the re-sync
lifecycle: Create✓ ApplyAll✓ FullSync✓ Incremental✓ Merkle✓ WriteBack✓ Maintenance✓ Death✓
FAILING STEPS: NONE
```

Per-sync counts (the authoritative idempotency signal): full sync creates 432 / updates 0; the incremental **and** idempotent re-syncs over unchanged data both do **created=0, updated=0, skipped=432, errored=0** — provably idempotent. Delta phase mutates 3 + deletes 86 (its designed write test). Zero DATABASE_ERRORs.

## The hard problem — parent-scoped child collision (root-caused + fixed IN-DOMAIN, base untouched)

The idempotency gate initially failed with ~158 redundant writes per re-sync. A per-record diagnostic (temporary `PostProcessRecord` logger) pinned the drift to **injected parent-FK fields** (`constituent_id` ×64, `gift_id`, `batch_id`, …). Root cause:

> A template-var / access-path object (`/constituents/{constituent_id}/addresses`, 45 of them) is fetched **once per parent**. A static mock returns the **same** child body for every parent, so the same child `id` landed under N parents and collapsed onto ONE row (identity = the child's own `id`), with the base stamping a different `constituent_id` each time → 2 redundant upserts per child **every sync**. Real vendor APIs return DISTINCT children per parent; the static fixture didn't.

**Fix (test-infra + metadata only; MJ base framework and every other connector untouched):**
1. **Mock parent-scoping** (`mock-vendor-server.mjs`): a template-var route now suffixes each record's OWN identity field (`id` + any non-parent `*_id`, e.g. `declaration_id`) with the captured parent value — children are unique per parent exactly like a real API, and it handles delta-created parents automatically. The parent-FK fields (the captured template vars) are deliberately NOT suffixed so the FK still resolves.
2. **tax_declaration** PK corrected to its real key `declaration_id` (a list-under-parent whose own key isn't `id`).
3. **Single-PK entities kept throughout.** A composite-PK (parent-FK + own id) attempt correctly modeled the identity but MJ's integration **codegen emits single-key CRUD reloads** (`WHERE [id]=@id`), so composite objects with duplicate ids hit `DATABASE_ERROR` on 59 objects — reverted. Single-PK + the mock's per-parent uniqueness is the codegen-clean, base-safe solution. (Filed as a framework observation, not a connector defect.)

Churn: **158 → 6 → 0**. Coverage held at **58/58** throughout.

## What was built + verified

- **Metadata**: 84 Integration Objects / 744+ IOFs. 58 active syncable objects; 25 genuinely-keyless deferred to runtime D4 PK classification; `table_entry` disabled (RE NXT has no code-tables LIST endpoint). Reviewed by an independent (different-model) reviewer to 0 blocking gaps.
- **Connector**: `BlackbaudConnector.ts` (~530 LOC), extends `BaseRESTIntegrationConnector`, generic per-operation CRUD + 1 idiosyncratic constituent split-virtual create, two-part auth (OAuth2 refresh + subscription key), SKY API `{count,value,next_link}` offset pagination, incremental watermark (request `last_modified` / response `date_modified`). Compiles clean, 25 unit tests pass.
- **9 nested/derived objects** given the parent-FK IOF (name-matched to the template var) + `ResponseDataKey` so the base resolves `{constituent_id}`/`{gift_id}`/`{batch_id}` and extracts the nested arrays.

## Verification ladder (credential-free)

| Tier | Result |
|---|---|
| T0 StaticValidation / T1 InvariantValidator (all 6) / T2 / T3 / T4 (25 tests) / T9 EndpointReality (11/12 SKY paths 401-gated) | ✅ Pass |
| **HybridE2E (mock, SQL Server)** | ✅ **ok=true — all gates green** |
| T8 Live | Skipped (no credential, by design) |

**Ceiling: `format-verified-no-creds` + structural-green + behavioral HybridE2E green (mock).** Live write-path / real-data round-trip / true rate behavior unproven (no credential, by design).

## Framework/env blockers cleared (documented; none are connector defects)
1. **codegen-lib root fix**: RSU codegen now emits explicit `@Field(() => Type)` so tsx-loaded connector resolvers boot + survive ApplyAll (0 bare `@Field`).
2. RO-metadata bootstrap seeded (16 ROs / 6 categories) so ApplyAll's in-process codegen is self-consistent.
3. Setup hygiene: mj-sync entity-dir scoping, `DB_TRUST_SERVER_CERTIFICATE=true`, advancedGen OFF, composite-PK-reload codegen limitation (documented above).

## Two framework findings worth filing
1. RSU codegen should emit explicit `() => Type` on `@Field` (fixed here in codegen-lib).
2. MJ **integration-entity codegen emits single-key CRUD reloads** even when multiple IOFs are `IsPrimaryKey` — composite-PK integration entities are not currently syncable. Provable-only composite identity for parent-scoped sub-resources would need base support; until then, per-parent-unique identity (as done here at the fixture layer) is the pattern.

## Deliverables (in the worktree)
- `packages/Integration/connectors/src/BlackbaudConnector.ts` (+ `__tests__/BlackbaudConnector.test.ts`, 25 tests)
- `metadata/integrations/blackbaud/.blackbaud.integration.json`
- Test-infra: `mock-vendor-server.mjs` per-parent uniqueness + `connector-e2e-harness.mjs`/`gen-fixture.mjs` delete-cell capability gate (both sanctioned harness-fidelity fixes)
- `packages/Integration/connectors-registry/blackbaud/` (PROVENANCE, CODE_EVIDENCE, EXTRACTION_REPORT_MATRIX, INDEPENDENT_REVIEW, scripts)

No commit, no push, no PR (per policy — awaiting explicit approval).
