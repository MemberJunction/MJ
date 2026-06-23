# Integration Tests (metadata)

Headless, scripted integration checks graduated from `packages/MJServer/integration-test-scripts/`
into the Testing Framework. Each test is a metadata record (`MJ: Tests` entity) executed by the
**IntegrationTestDriver** (`@RegisterClass(BaseTestDriver, 'IntegrationTestDriver')`, in
`@memberjunction/testing-integration`) against a live database / transport — no browser, no LLM.
This is the middle tier of the pyramid: heavier than the mocked Vitest unit gate, far lighter than
the Computer-Use regression suite.

## Quick Reference

```bash
# Push these definitions to the DB (from repo root)
npx mj sync push --dir=metadata --include=test-types,tests,test-suites

# Run a single integration test against your local DB (run the LOCAL workspace cli, not a global mj)
MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT01 - Server RunView Cache Integrity"

# Validate definitions without executing
mj test validate --dir=metadata/tests/integration
```

> **Run the LOCAL cli.** A globally-installed `mj` ships its own published testing packages and does
> NOT contain `@memberjunction/testing-integration`, so the `IntegrationTestDriver` `@RegisterClass`
> never fires and the run fails with `driver.Execute is not a function`. Use the workspace bin
> (`./node_modules/.bin/mj`) so the local testing-cli — which imports the package — is used.

## Tests

| File | `MJ: Tests.Name` | Bundle(s) | Transport | Notes |
|---|---|---|---|---|
| `.IT01-server-cache.json` | IT01 - Server RunView Cache Integrity | `server-cache` (S1–S26) | server (SQL) | 23 default checks; `runMutationTests` adds S17/S23/S24 |
| `.IT02-runquery-cache.json` | IT02 - RunQuery Cache Integrity | `runquery-cache` (Q1–Q9) | server (SQL) | Whole bundle mutates the DB; creates/tears down Query+Category fixtures |
| `.IT03-client-cache.json` | IT03 - Client GraphQL Cache Integrity | `client-cache` (C1–C12) | client (GraphQL) | Requires a running MJAPI + `MJ_API_KEY`; seeded **Skip** on the DB-only suite until Phase 5 |

## Anatomy of an integration Test

```json
{
  "fields": {
    "TypeID": "@lookup:MJ: Test Types.Name=Integration Test",
    "Name": "IT01 - Server RunView Cache Integrity",
    "Description": "...",
    "InputDefinition": {},
    "ExpectedOutcomes": { "summary": "..." },
    "Configuration": {
      "transport": "server",
      "checks": [
        { "type": "server-cache", "config": { "runMutationTests": false } }
      ]
    },
    "Status": "Active"
  }
}
```

- **`Configuration.checks[]`** is an ordered list of check **bundles**. Each `type` is a registry bundle
  name (`server-cache` / `runquery-cache` / `client-cache`) the driver expands via
  `IntegrationCheckRegistry.GetBundle` into that bundle's ordered `NamedCheck[]`. The actual assertions
  are TypeScript in `@memberjunction/testing-integration` — this metadata only **selects** which bundle
  runs, mirroring the existing `Configuration.oracles[].type` pattern. There is no JSON assertion DSL.
- **Ordering is load-bearing**, both across `checks[]` and within each bundle: stateful chains
  (S1→S2→S3 share the `'s1'` cache slot; C3→C4→C5 share `'c3'`) depend on running in array order inside
  one `Execute()`. That is why a bundle is one Test, not one Test per S/C/Q check.
- **`config.runMutationTests`** includes the bundle's mutation-active checks (the original
  `RUN_MUTATION_TESTS` gate). **`transport`** is optional; the driver infers `client` for `client-cache`
  and `server` otherwise.
- Per-check results land in `TestRun.ResultDetails` as a bare `OracleResult[]` (one per check,
  `oracleType = <bundle>.<id>`). The custom TestRun form's check list renders these after the Phase 5
  `getCheckResults()` reconciliation.
- **No `Tags` field** — `MJ: Tests` has no `Tags` column (it lives on `MJ: Test Runs`); tiering metadata
  is carried by suite membership, not a Test column.

## Directory Layout

```
metadata/tests/integration/
├── .mj-sync.json            # inherited from metadata/tests/.mj-sync.json (recursive **/.*.json glob)
├── .IT01-server-cache.json
├── .IT02-runquery-cache.json
└── .IT03-client-cache.json

metadata/test-suites/
└── .integration-suite.json  # "Integration Test Suite" + ordered MJ: Test Suite Tests (IT03 = Skip)
```

See the full S/C/Q → checkId mapping in
[`packages/TestingFramework/testing-integration/CHECK_MAP.md`](../../../packages/TestingFramework/testing-integration/CHECK_MAP.md)
and the orientation doc [`guides/INTEGRATION_TESTING_QUICKSTART.md`](../../../guides/INTEGRATION_TESTING_QUICKSTART.md).
