---
'@memberjunction/sql-converter': patch
---

Fix 25 tables of drift in the SS→PG boolean-column catalog, and close the hole that hid it.

`CORE_METADATA_BOOLEAN_COLUMNS` tells the converter which baseline-table columns are PG `BOOLEAN`
so SQL Server `BIT` literals (`0`/`1`) get rewritten to `FALSE`/`TRUE`. When an entry is missing,
the literal passes through unchanged and the migration fails **at apply time** with
`column "X" is of type boolean but expression is of type integer` — never at conversion time.

The catalog had drifted from the v5.46 baseline by **25 tables**: 21 absent entirely
(`RemoteOperation`, `RecordProcess`, `ProcessRun`, `AISkillPermission`, `SignatureProvider`,
`ExternalDataSourceType`, `ViewType`, …) plus missing columns on `AIAgent`
(`AllowMemoryWrite`, `SupportsPlanMode`, `RequirePlanMode`), `AIAgentRun` (`PlanMode`),
`ScheduledJob` (`RunImmediatelyIfNeverRun`) and `IntegrationObject` (`SupportsCreate`,
`SupportsUpdate`, `SupportsDelete`, `ContentHashApplicable`).

The root cause was in the file's own regeneration recipe: it matched the type name as `/BOOLEAN/`,
uppercase-only. pg_dump-style baselines spell it lowercase, so re-running the recipe produced an
**empty** result and the catalog silently stopped tracking the schema. The recipe is now
case-insensitive and documents why.

A new test re-derives the catalog from the newest `B*__Baseline.pg.sql` and fails on any gap, so
this cannot drift silently again. The change is purely additive — no existing entry was removed.

Found while converting a connector migration that set `IntegrationObject.SupportsCreate`:
`SupportsWrite` in the same `UPDATE` converted correctly while `SupportsCreate` did not.
