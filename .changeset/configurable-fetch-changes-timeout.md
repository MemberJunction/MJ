---
'@memberjunction/integration-engine': minor
'@memberjunction/server': minor
---

Make the `FetchChanges` per-page timeout configurable instead of a hard-coded 30s.

`IntegrationEngine` previously wrapped every `FetchChanges` call in `DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs` (30s) with no way to change it. That punished the connectors that need it most: a connector that fans out one request per parent record does `BatchSize` requests inside a single `FetchChanges` call, so its page time scales with batch size and with however much concurrency the adaptive controller currently allows. Once a page exceeded 30s the timeout fired, `WithRetry` re-ran the *same* page (paying the cost again), and the resulting failures fed the AIMD controller — which cut concurrency, making the next page slower still.

Two new resolution sources, checked before the framework default:

- `CompanyIntegration.Configuration` → `{"fetchTimeoutMs": 120000}` — per-deployment, no code change. Settable and readable as a typed `FetchTimeoutMs` field on the `IntegrationSetSyncConfig` / `IntegrationGetSyncConfig` GraphQL surface, alongside the concurrency, rate-limit and discovery-budget knobs it sits with in that JSON.
- `BaseIntegrationConnector.FetchChangesTimeoutMs` — a connector declares its own default (`null` keeps the framework's 30s).

Precedence, highest first: `Configuration.fetchTimeoutMs` → `connector.FetchChangesTimeoutMs` → `DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs`. **Both** override sources go through the same guard: non-numeric, non-finite and non-positive values are rejected and fall through to the next source. That matters for the connector source in particular — its declared type is `number | null`, so `0`, a negative, or the `NaN` you get from `Number(process.env.UNSET)` are all type-legal, and `setTimeout` coerces every one of them to ~1ms rather than erroring, which would silently time out every page. Resolution happens once per entity map.

Fully backward compatible — with neither source set, behavior is byte-identical to before. Minor rather than patch because `FetchChangesTimeoutMs` adds a member to the `BaseIntegrationConnector` public surface.

Separately, an **unskippable fetch failure no longer completes silently.** When a persistent error hits a page the engine cannot page past (cursor paging, or the page-skip budget spent), the object stops with an incomplete result set — and previously reported nothing, so an object whose very first page failed was indistinguishable from a clean "nothing changed" run. It now emits a structured `FETCH_ABORTED_INCOMPLETE` warning on the run-event stream **and** records a `Warning`-severity entry in `CompanyIntegrationRun.ErrorLog`, so the condition survives in queryable run history rather than only in a pod-local artifact. The run's `Status` is deliberately unchanged (`Success` unless a record actually errored): the watermark is held, so the unfetched window is retried next run — this is a warning, not a failed run.
