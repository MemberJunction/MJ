---
"@memberjunction/server": patch
---

Fix v5.45 migration bugs: dynamically resolve FK constraint name in APIKeyUsageLog cascade delete (SQL Server + PostgreSQL) and deactivate Skip agent instead of deleting it in Metadata Sync. Add commit-message version override (`[version:X.Y.Z]`) to publish workflow.
