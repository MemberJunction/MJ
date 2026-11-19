---
"@memberjunction/server": patch
---

MJServer now fails startup when it loaded no entity metadata, instead of reporting ready. The check runs in a new `Checking entity metadata` phase on both the SQL Server and PostgreSQL paths, so `/healthcheck` answers 503 with `status: 'failed'` and that phase, and the log names the cause (the last metadata load error, or that the `MJ_Metadata` dataset held no entities). Before this, a server whose metadata load failed answered `/healthcheck` with 200 and then failed every request that needs metadata.
