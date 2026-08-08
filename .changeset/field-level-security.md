---
"@memberjunction/core": minor
"@memberjunction/server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/sql-dialect": minor
---

Field-Level Security: per-field Read/Update control by role.

A new `EntityFieldPermission` table maps a field and a role to `CanRead` / `CanUpdate` flags, with Allow/Deny semantics. When a field has no rows, nothing changes — existing deployments are unaffected until an admin adds a rule. When a field has rows, only roles with an explicit Allow get access, and a single Deny beats every Allow. No person is exempt: there is no admin or Owner bypass. Primary keys, `__mj_` columns, and the security/identity entities cannot be restricted.

**Adding the first rule to a field closes that field for everyone without an explicit Allow** — including users the rule never mentions. It is an allow list that switches on as soon as any rule exists, not a deny list, so add the Allow rows for every role that should keep access in the same change. The one account exempt from this is the **MJ system user**, which is not a person but the account the server runs its own work as; without the exemption the first rule an admin writes would silently strip the field from the server itself, and its process-wide engine caches would then serve partially loaded records to every user. The exemption protects no data from anyone — the server already reads every column through its service login — and MJ additionally refuses to attach restricted roles to that account.

Enforcement (server-side, all of it):

- **Reads.** Denied columns are stripped from RunView results on both the cache-hit and cache-miss paths, and from single-record GraphQL responses.
- **Caller-written SQL.** A request is rejected if `ExtraFilter`, `OrderBy`, or an `Aggregates` expression names a denied field. Without this, `MIN(Salary)` or `Salary > 200000` reads the values back without the column ever appearing in a result. `UserSearchString` is not rejected; denied fields are simply excluded from the search.
- **Fetching.** A restricted user's cacheable queries now fetch only the columns they may see, and their cache slots are keyed separately (an `fls:` fingerprint segment, matching how `rls:` works). Unrestricted users keep byte-identical fingerprints and shared slots. The SELECT list is filtered too, so denied values never leave the database on this path.
- **Writes.** A save that changes a field the user cannot update is rejected. Values a client sends for fields it cannot *read* are ignored, unless the field is write-only (read-denied but update-allowed), which still saves.
- **Direct database connections (SQL Server only).** CodeGen emits column-level `DENY SELECT` on base views for roles with an explicit Deny rule, restricted to custom DBA-created roles, and skips any role a service login belongs to. PostgreSQL emits nothing — it has no DENY, so Deny-wins cannot be expressed there. See the guide.

Also in this release:

- **Permission removal now reaches the database.** CodeGen reads live permission state and re-asserts it each run, so deleting a permission row actually revokes the grant or deny. Previously CodeGen only ever added grants, so a deleted `EntityPermission` row left its `GRANT` in place until the view happened to be rebuilt.
- **Partial entity objects are now safe.** `EntityField` gains a not-loaded marker, set when the data an entity was loaded from left a field out. Such fields are skipped on save, are never dirty, and are exempt from the required-field check, so the stored value is kept instead of being overwritten with a default. This fixes silent data loss when a user edits an unrelated field on a record containing columns they cannot read.
- **`entity_object` requests always fetch every column the user may see**, whether or not the query is cacheable. This was already true on the server but not for clients, so a client could build a partial entity and write defaults over real data on the next save.

New guide: `guides/FIELD_LEVEL_SECURITY_GUIDE.md`. Read the configuration limits before restricting anything — in particular, do not restrict NOT NULL columns, and do not grant `MJ: Record Changes` read to roles that carry field denials, since the audit trail holds the old and new values. Saved queries are not field-filtered; run access to a query is the grant.
