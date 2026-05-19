# Finding B — In-Tree Connector Audit (deferred to PR work)

**Status**: Audited + scoped. **Not fixed in this session** — properly fixing requires test-setup refactor across 4 connectors that exceeds the close-out scope without breaking the green test state.

**Spec**: `MJ-INTEGRATIONS-ARCHITECTURE.md` §4.6 — `DiscoverObjects` MUST read from `IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integrationID)` cache, not from hardcoded TypeScript constants.

**Base class contract verified**: `BaseRESTIntegrationConnector.DiscoverObjects` at `packages/Integration/engine/src/BaseRESTIntegrationConnector.ts:188` correctly calls `IntegrationEngineBase.Instance.GetActiveIntegrationObjects(...)` at line 192. The default base implementation IS spec-compliant. Concrete connectors that OVERRIDE this method to return hardcoded data are the violations.

## In-tree audit findings

| Connector | DiscoverObjects pattern | Verdict |
|---|---|---|
| `HubSpotConnector.ts` (line 1291) | Hardcoded `STANDARD_OBJECTS` constant + live `/crm/v3/schemas` custom-object merge | **VIOLATION (mixed)** — hardcoded part bypasses cache |
| `YourMembershipConnector.ts` (line 2498) | Pure hardcoded `YM_ACTION_OBJECTS.map()` | **VIOLATION (pure)** |
| `QuickBooksConnector.ts` (line 416) | Pure hardcoded `QUICKBOOKS_OBJECTS.map()` | **VIOLATION (pure)** |
| `SalesforceConnector.ts` (line 450) | Live `/sobjects/` API call + filter | OK (no hardcoded data) |
| `RasaConnector.ts` | No override (inherits base) | OK |
| `SageIntacctConnector.ts` (line 608) | Hardcoded `SAGE_INTACCT_OBJECTS` + dynamic `inspect *` merge | **VIOLATION (mixed)** — hardcoded part bypasses cache |
| `WicketConnector.ts` | No override (inherits base) | OK |
| `FileFeedConnector.ts` | No override (inherits base) | OK |
| `RelationalDBConnector.ts` (line 138) | Custom SQL-paradigm logic | N/A — different paradigm; base contract assumes REST |

## Registry (agent-built) findings

| Connector | DiscoverObjects pattern | Verdict |
|---|---|---|
| `connectors-registry/hubspot/src/HubSpotConnector.ts` | `super.DiscoverObjects()` + live `/crm/v3/schemas` merge | OK (correct cache + augmentation pattern) |
| `connectors-registry/your-membership/src/YourMembershipConnector.ts` | No override (inherits base) | OK |
| `connectors-registry/quickbooks/src/QuickBooksConnector.ts` (line 480) | Pure hardcoded `QBO_ACCOUNTING_ENTITIES.map()` + `QBO_REPORT_ENTITIES.map()` | **VIOLATION (pure)** |

## Why the fix is deferred

The connector code change itself is small (replace the override with `super.DiscoverObjects(...)` delegation, or with `super + augment` for mixed patterns). The blocker is the **tests**:

- Each connector's vitest suite asserts `expect(objects.length).toBe(N)` and `expect(objects).toContain('Name')` against the hardcoded constants.
- These assertions PASS today because the connector returns the hardcoded data.
- After the AS-IS fix, the same assertions read from `IntegrationEngineBase.Instance` cache, which is empty in unit-test context → assertions fail with empty array.

Properly fixing requires **per-test cache setup** in each `beforeEach` block:
- Mock `IntegrationEngineBase.Instance.GetActiveIntegrationObjects(integrationID)` to return a known fixture array.
- Update assertions to check against the fixture instead of bare hardcoded counts.

Verified empirically in this session: I applied the AS-IS fix to `connectors-registry/quickbooks/src/QuickBooksConnector.ts` (the agent-built registry connector). Build remained clean. Vitest collapsed to 4 failures of the form `expected +0 to be 81 // Object.is equality` and `expected [] to include 'Invoice'`. Reverted to preserve session's green-test state.

## Recommended PR-stage approach

One PR per connector to keep blast radius bounded:
1. **PR 1**: `fix(qb-connector): DiscoverObjects reads from cache per AS-IS §4.6` — `connectors-registry/quickbooks/src/QuickBooksConnector.ts` + its test suite.
2. **PR 2**: `fix(in-tree-yourmembership): DiscoverObjects reads from cache` — `connectors/src/YourMembershipConnector.ts` + tests.
3. **PR 3**: `fix(in-tree-quickbooks): DiscoverObjects reads from cache` — `connectors/src/QuickBooksConnector.ts` + tests.
4. **PR 4**: `fix(in-tree-hubspot): DiscoverObjects super-delegates static catalog` — `connectors/src/HubSpotConnector.ts` mixed pattern → super + custom-object augment.
5. **PR 5**: `fix(in-tree-sageintacct): DiscoverObjects super-delegates static catalog` — same mixed pattern.

Per-PR work:
- Connector code change: ~10 lines per connector
- Test setup: ~15-30 lines per connector (one shared `setupMockCache(integrationID, fixtures)` helper added to `@memberjunction/test-utils` would amortize this — separate fixture PR worth considering)
- Regression check: vendor's existing integrations continue to discover the same set of entities at runtime (validates that `mj sync push` of the per-vendor metadata file populates the cache with the expected set)

## Phase 2d rubric (commit `dbf845d15d`) now catches this prospectively

For future agent-built connectors, the coordinator audit's Phase 2d rubric explicitly checks:

> **NO hardcoded catalog mirror**: connector class's `DiscoverObjects` reads from `IntegrationEngineBase.Instance` cache (per `MJ-INTEGRATIONS-ARCHITECTURE.md` §4.6), NOT from a hardcoded TypeScript constant. Tests assert against the cache, not against a hardcoded count.

So new agent-built connectors won't regress into this pattern. The audit catches it before code-builder declares done. The in-tree connectors above are pre-existing tech debt the rubric didn't catch retroactively — that's the PR-stage cleanup.
