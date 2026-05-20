---
"@memberjunction/open-app-engine": patch
---

Fix baseline migrations being silently skipped during `mj app install`. The install orchestrator passed `BaselineVersion: '0'` to Skyway, but the resolver only auto-selects the highest baseline file when `BaselineVersion === '1'`. Changed to `'1'` so baseline files (B* prefix) are correctly discovered and executed on fresh database installs. Also allowed mixed-case schema names in manifest validation (SQL Server is case-insensitive) to support apps like BizApps Common (`__mj_BizAppsCommon`).
