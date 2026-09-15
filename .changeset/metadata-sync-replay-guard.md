---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Record creates in the SQL log as create-or-update guarded on the primary key (MemberJunction/MJ#4503). The consolidated Metadata_Sync migrations are recordings of `mj sync push`, and a push creates rows with the fixed primary keys from `metadata/**`; replaying an unguarded `spCreate` on a database where a push already created the row failed on the primary key, which is what stopped the CDP upgrade to 6.1.1. SQL Server's logged form of a create is now `IF NOT EXISTS (row with this PK) EXEC spCreate ELSE EXEC spUpdate` with the same argument list, so a replay converges on the recorded content instead of failing. Executed SQL is unchanged. The record-change-free form is now offered to the logger for every save, not only for entities that track record changes, so the guard reaches every recording.
