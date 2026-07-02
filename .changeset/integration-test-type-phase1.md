---
"@memberjunction/testing-integration": patch
"@memberjunction/testing-cli": patch
---

Add the "Integration Test" TestType (graduation Phase 1). New package `@memberjunction/testing-integration` provides: the dedicated-process bootstrap library (installs an instrumented `LocalCacheManager` as the first caller — `bootstrapIntegrationServer` / `bootstrapIntegrationClient` / `installInstrumentedCacheFirst`), the `IntegrationCheckRegistry` + `IntegrationCheckFn`/`NamedCheck` contract, the `InstrumentedLocalStorageProvider` / `UniqueFilter` / `TestRunner` primitives (lifted from the live harness), and the `IntegrationTestDriver` (`@RegisterClass(BaseTestDriver, 'IntegrationTestDriver')`) which runs an ordered bundle of registered checks against one bootstrapped context and maps each to an `OracleResult`. The server-cache S1/S2 miss/hit pair is the first migrated bundle. `@memberjunction/testing-cli`'s run/suite commands install the instrumented cache first when `MJ_INTEGRATION_TEST=1` (byte-for-byte unchanged otherwise). The existing `lib/harness.ts` becomes a thin re-export shim over the new package.
