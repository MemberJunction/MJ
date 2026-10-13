---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Record creates in the SQL log as create-or-update guarded on the primary key (MemberJunction/MJ#4503). The consolidated Metadata_Sync migrations are recordings of `mj sync push`, and a push creates rows with the fixed primary keys from `metadata/**`; replaying an unguarded `spCreate` on a database where a push already created the row failed on the primary key, which is what stopped the CDP upgrade to 6.1.1. SQL Server's logged form of a create is now `IF NOT EXISTS (row with this PK) EXEC spCreate ELSE EXEC spUpdate` with the same named argument list, so a replay converges an existing row to the recorded content (release-owned metadata is overwritten, not skipped). Entities without a generated update proc get the guard with no ELSE branch. Executed SQL is unchanged.

Two things to know. Convergence has one narrow exception: a NOT NULL column with a non-NULL default whose value is left unset on the recording (uniqueidentifier defaults such as `AIAgent.OwnerUserID`) keeps its existing value on the update branch instead of taking the default. And because the logged text of a create now contains both proc names, a SQL-logging filter pattern such as `*spUpdateX*` also matches that entity's creates; in-repo configs already pair the create and update patterns. The record-change-free form is now offered to the logger for every save, not only for entities that track record changes, so the guard reaches every recording; the logger tags a statement "(core SP call only)" only when the logged text differs from what ran.
