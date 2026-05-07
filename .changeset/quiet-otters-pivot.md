---
"@memberjunction/codegen-lib": patch
---

Disable view self-join for virtual NameField across all CodeGen providers. Flip `canSelfJoinViewForVirtualNameField()` default to `false` and drop the now-redundant PostgreSQL override; SQL Server already cannot support the self-reference because the base view emitter uses `DROP VIEW` then `CREATE VIEW` and SQL Server resolves view-body references at parse time. Behavior is unchanged for all currently emitted views.
