---
"@memberjunction/testing-integration": patch
"@memberjunction/testing-cli": patch
---

Integration skips are visible and fail the run. `mj test suite` exits non-zero when an integration check skips without an allowance (a `RequiresMutation` / `RequiresLiveModel` gate or an entry on the registry's skip allowlist), when a bundle skips every check without one, or when a registered check of a selected bundle produces no result. The output lists every allowed skip with its reason. Adds `EvaluateSkipGate`, `ExpectedCheckIds`, `FormatSkipGateReport` and `IntegrationCheckRegistry.AllowSkip`.
