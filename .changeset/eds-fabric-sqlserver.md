---
"@memberjunction/external-data-source-sqlserver": minor
---

Add Microsoft Fabric SQL endpoint support to the SQL Server external data source driver. Fabric Warehouse / Lakehouse SQL analytics endpoints speak the SQL Server wire protocol (TDS) but refuse SQL auth, so the driver gains an `authMode: 'entra-service-principal'` connection option (also inferred when the credential carries a `clientId`) that authenticates via a Microsoft Entra service principal (`tenantId` / `clientId` / `clientSecret`).

Two Fabric-specific fixes are included: the `mssql` floor is raised to `^12.7.0` to pull the tedious ≥ 19.2.1 fedauth `FeatureExt` fix ([tediousjs/tedious#1718](https://github.com/tediousjs/tedious/issues/1563)) — older tedious silently drops the Fabric login right after LOGIN7 — and the driver sets `abortTransactionOnError: null` on the Entra path so tedious emits neither form of the `SET XACT_ABORT` statement, which Fabric Warehouse rejects (error 15869). Regular SQL Server (username/password) connections are unchanged. Adds unit tests for the Entra pool config and a manual (`workflow_dispatch`) live Fabric integration suite gated by `RUN_FABRIC_INTEGRATION=1`.
