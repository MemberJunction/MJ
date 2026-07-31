---
'@memberjunction/integration-engine': minor
---

Make the `FetchChanges` per-page timeout configurable instead of a hard-coded 30s.

`IntegrationEngine` previously wrapped every `FetchChanges` call in `DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs` (30s) with no way to change it. That punished the connectors that need it most: a connector that fans out one request per parent record does `BatchSize` requests inside a single `FetchChanges` call, so its page time scales with batch size and with however much concurrency the adaptive controller currently allows. Once a page exceeded 30s the timeout fired, `WithRetry` re-ran the *same* page (paying the cost again), and the resulting failures fed the AIMD controller — which cut concurrency, making the next page slower still.

Two new resolution sources, checked before the framework default:

- `CompanyIntegration.Configuration` → `{"fetchTimeoutMs": 120000}` — per-deployment, no code change.
- `BaseIntegrationConnector.FetchChangesTimeoutMs` — a connector declares its own default (`null` keeps the framework's 30s).

Precedence, highest first: `Configuration.fetchTimeoutMs` → `connector.FetchChangesTimeoutMs` → `DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs`. Non-numeric and non-positive values are rejected and fall through to the next source. Resolution happens once per entity map.

Fully backward compatible — with neither source set, behavior is byte-identical to before. Minor rather than patch because `FetchChangesTimeoutMs` adds a member to the `BaseIntegrationConnector` public surface.
