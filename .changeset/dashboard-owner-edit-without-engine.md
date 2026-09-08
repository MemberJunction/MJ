---
'@memberjunction/core-entities': patch
---

A dashboard's owner can save it when the dashboard engine has not loaded

`MJDashboardEntityExtended.Validate()` resolved edit permission solely through
`DashboardEngine.GetDashboardPermissions()`, which answers from the engine's `_dashboards` array. A
dashboard the engine cannot find returns "no permissions" — indistinguishable from a genuine denial.
In a process that never configures the engine, that array is empty, so *every* dashboard save is
refused, including by the record's own owner.

CLI task mode is exactly such a process: it defers all 14 engines to first use. `mj sync push` on
PostgreSQL therefore failed the whole run on the first owner-owned dashboard it touched, reporting
"You do not have permission to edit this dashboard" while running as that dashboard's owner. It went
unnoticed on SQL Server because the same record is unchanged there, so `Save()` short-circuits before
`Validate()` ever runs.

Ownership does not need the cache to answer: the row carries `UserID`. When the engine is not loaded,
that direct comparison now decides. A loaded engine still makes the call, and a non-owner is still
refused on either path — so no denial is weakened.
