---
"@memberjunction/integration-test-suite": patch
---

The performance and agent overhead benchmark integration test is now IT128. It shipped as IT123, a number "IT123 - Search Scope Bound" already used; IT124 through IT127 are claimed by open PRs. The test and its suite row keep their primary keys, so a sync renames them in place.

The benchmark's exported report types (`PrimitiveBenchmarkMetrics`, `AgentRunTreeMetrics`, `PerformanceBenchmarkReport`) now use PascalCase member names, as the naming-conventions standard requires. Their 33 camelCase members failed the adopted-standards gate on every PR that touches a package's TypeScript. The keys in the JSON report the benchmark writes change with them (`wallTimeMs` is now `WallTimeMs`, and so on).
