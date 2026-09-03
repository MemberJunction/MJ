---
"@memberjunction/core": minor
"@memberjunction/server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/sql-dialect": minor
---

Field-Level Security: per-field Read/Update/Create control by role.

Field security is switched **on or off per entity**, explicitly, via a new
`Entity.EnableFieldLevelSecurity` flag. Nothing is inferred from whether permission rows happen to
exist, so adding a rule can never change access on an entity that has not opted in.

A new `EntityFieldPermission` table holds one row per (field, role) with three independent
verbs — `ReadAccess`, `UpdateAccess`, `CreateAccess` — each `Allow`, `Deny`, or `No Access`:

- **`No Access`** is neutral, and the default. It grants nothing and blocks nothing; another
  role's Allow still wins.
- **`Allow`** grants the action for that role.
- **`Deny`** wins over everything. One Deny anywhere across the user's roles beats any number of
  Allows.

**Read is required for Update and Create.** A field a user cannot see is one they cannot change,
so this is enforced twice: a CHECK constraint refuses the combination within a row, and the
aggregation clamps it again across roles — because two individually legal rows held by one user
(role A grants Read+Update, role B denies Read) would otherwise aggregate to write-only access
that no constraint could see.

**Turning the flag on is safe.** It snapshots the entity's existing entity-level permissions into
per-field rows, so enabling changes nothing until an administrator tightens a specific field.
Turning it off keeps the rows, inactive, so re-enabling does not lose the configuration. Those rows
maintain themselves: adding a column, granting a role entity access, or dropping either one is
reconciled automatically, and an administrator's tightening is never overwritten by that process.

**Nobody is exempt** — no admin bypass, no Owner carve-out, and no exempt account anywhere in
permission evaluation. That includes the **MJ system user**, the account the server runs its own
work as: it is not special-cased at runtime, and gets its access from ordinary `Allow` rows
written for the standard roles it holds. What is protected instead is the CONFIGURATION — a rule
that *denies* anything to a role the system user holds is refused, and so is giving that account a
role which already denies a field. Grants save normally, since they are what the server's own
access depends on. Restricting that account would matter because its engine caches are
process-wide, so a partially loaded cache would reach every user; a configuration rule stops that
somewhere an administrator can see it, rather than behind a bypass that has to be trusted.
Primary keys, `__mj_` columns, and the security/identity entities can never be restricted.

Enforcement (server-side and authoritative):

- **Reads.** Denied columns are stripped from RunView results on both the cache-hit and cache-miss
  paths, and from single-record GraphQL responses.
- **Caller-written SQL.** A request is rejected if `ExtraFilter`, `OrderBy`, or an `Aggregates`
  expression names a denied field. Without this, `MIN(Salary)` or `Salary > 200000` reads the
  values back without the column ever appearing in a result. `UserSearchString` is not rejected;
  denied fields are simply excluded from the search.
- **Writes.** A save that changes a field the user cannot update is rejected. Values a client
  sends for fields it cannot read are ignored — such a field was absent from every payload that
  client received, so any value coming back is fabricated by the transport.
- **Creates.** A value supplied for a field the user may not create is dropped and the column
  takes its default. This never rejects: an error naming the field would confirm it exists and is
  restricted, and silently defaulting is what an unrestricted user gets by leaving it blank.
- **Typed accessors.** `BaseEntity.Get()` and `.Set()` throw for a field the user cannot read, so
  a restricted field surfaces as a clear failure rather than a silent blank. Entity forms check
  access before rendering, so a denied field is simply not shown.
- **Direct database connections (SQL Server only).** CodeGen emits column-level `DENY SELECT` on
  base views for roles with an explicit `ReadAccess = 'Deny'` rule on an enabled entity, restricted
  to custom DBA-created roles, and skips any role a service login belongs to. PostgreSQL emits
  nothing — it has no DENY, so Deny-wins cannot be expressed there. See the guide.

RunView caching is unchanged for everyone else: the server keeps full-width slots shared across
users and narrows each response at read time, so a permission change takes effect on the next
metadata refresh without invalidating cached results. Browsers key their own cache on the fields
the user may see, so tightening access does not leave a stale column on screen.

Also in this release:

- **Permission removal now reaches the database.** CodeGen reads live permission state and
  re-asserts it each run, so deleting a permission row actually revokes the grant or deny.
  Previously CodeGen only ever added grants, so a deleted `EntityPermission` row left its `GRANT`
  in place until the view happened to be rebuilt.
- **Partial entity objects are now safe.** `EntityField` gains a not-loaded marker, set when the
  data an entity was loaded from left a field out. Such fields are skipped on save, are never
  dirty, and are exempt from the required-field check, so the stored value is kept instead of
  being overwritten with a default. This fixes silent data loss when a user edits an unrelated
  field on a record containing columns they cannot read.
- **`entity_object` requests always fetch every column the user may see**, whether or not the
  query is cacheable. This was already true on the server but not for clients, so a client could
  build a partial entity and write defaults over real data on the next save.

New guide: `guides/FIELD_LEVEL_SECURITY_GUIDE.md`. Read the configuration limits before
restricting anything — in particular, do not restrict NOT NULL columns, and do not grant
`MJ: Record Changes` read to roles that carry field denials, since the audit trail holds the old
and new values. Saved queries are not field-filtered; run access to a query is the grant.
