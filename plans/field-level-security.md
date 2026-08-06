# Field-Level Security for MemberJunction

---

## Implementation Status (As-Built) — READ FIRST

> This section is the working context for the implementation. The design sections below are
> unchanged except where a factual error is corrected inline and marked. Branch:
> `JF_Entity_Field_Security`. Last updated after Phase 2.

### Where things stand

| Phase | Status |
|---|---|
| Phase 1 — Schema & Metadata | **Committed** (`cdd78a2d9d`) |
| Phase 2 — Server-Side Enforcement (§2.1–§2.4, §2.6) | **Built, tested, uncommitted** |
| Phase 2.5 — Saved queries (§2.5) | **Deferred by decision** — see below; saved queries are NOT FLS-filtered |
| Phase 3 — Skip integration | **ON HOLD** — superseded pending the new direction below |
| Phase 4 — Admin UI | Not started |

> **A new architectural direction was set by leadership after Phase 2 landed.** Read
> "NEW DIRECTION (post-leadership review)" below before starting anything. It moves enforcement
> into the database (base views + SQL roles) and into the SELECT list, and it collides with
> several verified decisions in the design that follows.

### Decisions taken during implementation (do not re-litigate)

1. **NO per-user exemption.** §1.5 called for an admin/Owner exemption; it was dropped. Its stated
   justification — "an admin locks themselves out of the admin UI" — is wrong: that UI edits
   `EntityFieldPermission` rows, not the secured field's *values*, so denying yourself `Salary`
   never blocks administering permissions. What IS a real lockout is self-referential
   configuration, so the guard is on **which targets are restrictable**, not which users are
   bound. Nothing overrides a Deny — a feature selling compensation/donor confidentiality cannot
   ship with a role that quietly reads everything.

2. **Unrestrictable targets** (guarded at BOTH save time and in the aggregation):
   primary keys (hard + soft), `__mj_` system columns, and the security-configuration + identity
   entities (`MJ: Entities`, `Entity Fields`, `Entity Permissions`, `Entity Field Permissions`,
   `Roles`, `Users`, `User Roles`).

3. **Error wording is deliberately ambiguous**, SQL Server style:
   `Field 'X' does not exist on entity 'Y' or you do not have access to it.` — never disclosing
   whether the field is missing or forbidden. Echoing back an identifier the caller supplied
   discloses nothing; naming the *reason* turns any predicate into a probe for which columns a
   deployment considers sensitive. This also stays correct after
   [#3485](https://github.com/MemberJunction/MJ/issues/3485) tiers metadata and restricted fields
   stop shipping to clients at all. Used on both the read and write paths.

4. **FLS applies to virtual entities** — uniformly, no special-casing.

5. **Logging**: rejections only (predicate + save), at `LogDebug`. Output-projection stripping is
   NOT logged — it happens per request on every restricted entity and would flood logs with no
   added signal.

### Corrections to the design below

- **§1.1 migration path is WRONG as written.** It says `migrations/v5/…__v5.x.x__…`. Per
  `migrations/CLAUDE.md` the folder must match the major version in the migration's own filename,
  and new work targets the newest era. The migration shipped as
  `migrations/v6/V202608051141__v6.1.x__Entity_Field_Permissions.sql`. The section also never
  mentions the **required PostgreSQL counterpart** (`migrations-pg/v6/`), which
  `scripts/check-pg-migration-parity.mjs` enforces as a CI gate via
  `.github/workflows/pg-migrations.yml`. *(A counterpart was generated, then deleted on
  instruction because PG generation is handled at build time — note this leaves the parity gate
  failing until that build-time path is what CI runs.)*

- **§2.6 placement is WRONG as written.** It says to apply cache-read projection in
  `PostRunView`. On a cache HIT, `ProviderBase.RunView` returns directly out of `PreRunView` and
  **`PostRunView` never runs** — so that placement would miss exactly the cross-user cache leak
  §2.6 exists to close. As built, projection runs on **both** paths (`PreRunView` cache-hit return
  and `PostRunView` cache-miss), single and batch.

- **§2.1 places predicate validation in `ResolverBase`.** As built it sits at the **provider
  layer** (`ProviderBase.PreRunView` / `PreRunViews`) instead, because every RunView funnels
  through there — batch path, server-internal agents/actions under a restricted `contextUser`,
  and the GraphQL resolver alike. One gate, no uncovered path.

### As-built map

| Concern | Location |
|---|---|
| Permission records + aggregation | `MJCore/src/generic/entityInfo.ts` — `EntityFieldPermissionInfo`, `EntityFieldInfo.GetUserFieldPermissions`, `IsUnrestrictableField`, `IsOnUnrestrictableEntity` |
| Entity-level short-circuit | `EntityInfo.HasAnyFieldPermissions` (memoized; **every** enforcement point gates on this first) |
| Per-request precompute | `EntityInfo.GetDeniedReadFields` / `GetDeniedUpdateFields` → `Set<string>` (lowercased). **Never call the per-field primitive inside a row loop** |
| Predicate validation | `ProviderBase.AssertPredicatesRespectFieldSecurity` |
| Identifier detection | `@memberjunction/sql-dialect` → `FindReferencedIdentifiers` |
| Output projection | `ProviderBase.ApplyFieldSecurityProjection` (skips `entity_object` — see §2.4) |
| GraphQL read boundary | `MJServer/src/generic/ResolverBase.ts` → `MapFieldNamesToCodeNames` |
| Save guard | `BaseEntity.CheckFieldLevelUpdatePermissions` (UPDATE only; `CanCreate` unenforced) |
| Save-time target guard | `MJCoreEntitiesServer/src/custom/MJEntityFieldPermissionEntityServer.server.ts` |
| Tests | `MJCore/src/__tests__/fieldSecurity.enforcement.test.ts` (29), `SQLDialect/src/__tests__/identifierReferences.test.ts` (38), `MJCore/src/__tests__/entityFieldInfo.fieldPermissions.test.ts` (39) |

### Identifier detection: why a regex, and why no dialect parameter

`FindReferencedIdentifiers` lives in `sql-dialect` (zero-dep, already a dependency of every
consumer, co-located with the `SQLDialect` drivers) — **not** MJGlobal, which has no SQL surface.

- **Not a SQL parser.** `@memberjunction/sqlglot-ts` spawns a Python subprocess (unusable: MJCore
  is browser-bundled, and this gate is synchronous on every RunView). `@memberjunction/sql-parser`
  (node-sql-parser) *is* viable and more precise, but is dialect-*specific*, adds ~500KB+ to every
  browser bundle (23MB `build/`, no subpath exports), and must fail open on input it cannot parse
  — a parser-differential bypass. Verified empirically: `[Base Salary] > 100` parses under
  `transactsql` and throws under `postgresql`.
- **Direction matters.** It searches for each denied NAME in the fragment; it does NOT tokenize
  the fragment and look tokens up. Tokenizing forces an identifier character class, and every
  field name outside it silently becomes unmatchable — `Base Salary`, `Salary%`, `Salário` all
  leaked through an earlier tokenizing version.
- **No dialect parameter, deliberately.** Delimiters (`[x]` / `"x"` / `` `x` ``) are handled
  without knowing the dialect because they aren't word characters; case-insensitive matching is a
  strict superset of Postgres lower-folding, Oracle upper-folding, and SQL Server collations, so
  it can never *miss*. An enum parameter is what would obstruct adding Oracle. If dialect-specific
  handling is ever needed the seam belongs on the `SQLDialect` driver, with the caller (which
  already knows its `PlatformKey`) passing a normalized form in.

### Phase 2.5 (saved queries / RunQuery) — DEFERRED BY DECISION

**Status: postponed deliberately, pending real-world FLS usage.** Do not implement §2.5 without
revisiting this. Three findings drove the deferral:

1. **The metadata a warning would rest on is heuristic.** `MJ: Query Fields` carries
   `DetectionMethod` / `AutoDetectConfidenceScore` / `IsComputed`, and extraction is LLM-assisted
   and best-effort (`extractAndSyncDataAsync` swallows failures and sets `UsesTemplate = false`).
2. **Its weakness and the leak vector are the same thing.** Computed/aggregate columns
   (`SELECT AVG(Salary) AS TeamMetric`) are both what defeats name-based stripping AND where
   `SourceFieldName` is least reliable — so a warning can be silent on exactly the queries most
   likely to leak, while reading to an admin as reassurance.
3. **§2.5's "save-time warning" does not fit the actual save flow.** `MJQueryEntityServer.Save`
   calls `super.Save()` FIRST and runs the extraction pipeline afterward, so Query Fields do not
   exist yet at save time for a new or SQL-changed query. Any warning is necessarily
   post-extraction, on an already-persisted record, and needs a delivery channel that outlives the
   save call. There is no synchronous validation seam here.

**What must remain true while deferred:** saved-query results are NOT FLS-filtered. This is a
known, bounded gap — it must be stated plainly wherever FLS is described to administrators
(release notes, Phase 4 admin UI), never implied to be covered. `RunQuery` performs no field-level
filtering today.

**Cheapest way to de-risk the eventual decision** (optional, decides no policy): build the Tier 2
standing audit first — read-only, reports `(User, Query, Field)` overlaps, breaks nothing, and
generates the evidence needed to choose between "documented trust boundary" and "execution gate"
once real deployments have configured FLS.

### Verified mechanics (for whoever picks this up)

Confirmed against the generated ORM rather than assumed:

- **`RunQuery` performs NO field-level filtering today.** Saved-query results are entirely
  unfiltered by FLS. This is the largest remaining hole in the feature.
- **`MJ: Query Fields`** carries `SourceEntityID` + `SourceFieldName` (not a direct `EntityFieldID`
  FK), so the metadata join §2.5 assumes is possible — via `(EntityID, FieldName)` → `EntityField`
  → its `FieldPermissions`.
- **But that mapping is heuristic**: the same rows carry `DetectionMethod` and
  `AutoDetectConfidenceScore`, plus `IsComputed` / `ComputationDescription`. So the resolution
  driving any warning (or gate) is AI/heuristic-derived, not guaranteed.
- **`MJ: Query Permissions`** is `QueryID` + `RoleID` — role granularity, matching §2.5's
  "for each role granting run access" framing.

The uncomfortable consequence, which §2.5 does not address: the heuristic weakness and the leak
vector are *the same thing*. Computed/aggregate columns (`SELECT AVG(Salary) AS TeamMetric`) are
both what defeats name-based stripping AND where `SourceFieldName` is least reliable — so a
save-time warning built on that metadata can produce **false negatives on exactly the queries most
likely to leak**, while reading as reassurance. See the open questions raised before building.

---

## Phase 2.6 — Database-Level Enforcement (NEW DIRECTION, post-leadership review) — READ FIRST

Leadership reviewed FLS and set a materially different architecture. **Phase 3 is on hold.** The
direction below supersedes parts of the design above, and collides with decisions in it that were
made for verified reasons — those collisions are catalogued so they are resolved deliberately, not
rediscovered.

### The direction, as given

1. **Check whether CodeGen creates SQL roles for custom MJ Roles.** It currently sets SQL role
   permissions on the three standard MJ roles. If it does not iterate `MJ: Roles` and apply grants
   to the corresponding SQL Server roles, it should. **If `Role.SQLName` is empty, CodeGen should
   CREATE a SQL role for that MJ Role record and write the name back to the record.**
2. **Push FLS down into the base views at the SQL-role level.** CodeGen applies entity field
   permissions to the view's columns during its run, so a SQL user connecting *directly* to the
   database with that role cannot see denied columns. Security stops depending on the API layer.
3. **Filter RunView's column list BEFORE executing the SQL**, so restricted data never leaves the
   database. The SELECT list becomes the intersection of the user's FLS-allowed columns with
   `RunViewParams.Fields` when provided. Acknowledged: this likely breaks
   `ResultType: 'entity_object'`; it works for `'simple'`.
4. **Consider rerouting single-record entity loads through RunView.** Investigate how
   `GetEntityObject()` / `BaseEntity.InnerLoad` load records today.
5. **Research what projecting FLS fields does to entity objects** — `BaseEngine` subclasses and
   beyond. (Expectation from the team: FLS *will* break entity objects.)

### Verified findings (done — do not redo)

- **`MJ: Roles` already has a `SQLName` column.**
- **CodeGen already grants per-MJ-Role, not per-hardcoded-role.**
  `SQLServerCodeGenProvider.ts` (~lines 703–738) iterates `EntityPermission` rows and emits
  `GRANT SELECT ON [schema].[BaseView] TO [ep.RoleSQLName]`, plus `GRANT EXECUTE` on the CRUD
  procs. So the per-role grant loop the direction asks for **exists**.
- **Nothing anywhere in CodeGenLib issues `CREATE ROLE`.** And the grant emitters are guarded by
  `if (ep.RoleSQLName && ep.RoleSQLName.length > 0)` — so a role with a null/blank `SQLName` is
  **silently skipped**. That is precisely the gap item 1 describes: role *creation* + `SQLName`
  backfill, not the grant loop.
- **Single-record loads do NOT go through RunView.** `BaseEntity.InnerLoad`
  (`baseEntity.ts` ~2942) is its own path; the generated GraphQL single-record resolver issues
  `SELECT * FROM {baseView} WHERE {pk} {RLS}` directly. Item 4's premise is correct.

### Collisions with the current implementation — resolve these deliberately

**A. SELECT-list filtering vs. the RunView cache. This is the hard one.**
The cache fingerprint is `EntityName|Filter|OrderBy|MaxRows|StartRow|AggHash[|Connection]` — it
**does not include `Fields`**. That is not an oversight: `PreRunView` deliberately *widens* `Fields`
to every entity column for cache-eligible queries so one cache entry is a universal superset
serving any field subset, then projects down per caller. If the SELECT list instead varies per
user's FLS, two users produce results under the **same fingerprint with different column sets** —
the first warms the slot, the second gets either columns they must not see (leak) or missing
columns (breakage). Any move to pre-execution filtering **must** either fold the effective column
set into the fingerprint (fragmenting the cache, and forfeiting the property that permission
changes take effect on metadata refresh with no result-cache invalidation) or disable caching for
FLS entities. Decide this explicitly and first — it invalidates the §2.6 rationale above.

**B. Entity objects loaded with missing columns will destroy data.**
`GenericDatabaseProvider.GenerateSaveSQL()` (~1057–1089) builds UPDATEs by iterating **all**
`IsSPParameter` fields reading `field.Value` — not just dirty ones. An entity object hydrated
without a restricted column therefore writes that column back as a real `NULL` on the user's next
save. This is the verified failure that caused §2.4 to reject load-time nulling, and item 3/5 walks
straight back into it from a different angle. The team's expectation that "FLS will break entity
objects" is correct, and this is the specific mechanism. Any projection reaching entity objects
needs `GenerateSaveSQL` to distinguish "not loaded" from "loaded as null" — likely a per-field
loaded/unset flag — or entity objects must keep loading every column with enforcement staying at
the output boundary.

**C. Primary keys must survive any projection.** Stripping a PK breaks entity load, `CompositeKey`,
relationship resolution, and cache fingerprinting. Already guarded in the aggregation; a
SELECT-list filter needs the same guard independently.

**D. View-level column security changes the failure mode.** Removing a column from a base view
makes every query referencing it fail with a SQL error rather than a permission message, and it is
a *global* change while FLS is *per-role*. A single view cannot present different column sets to
different roles — so this likely means per-role views, or column-level `GRANT`/`DENY` on the view
(SQL Server supports `GRANT SELECT ON OBJECT::v (col)`; PostgreSQL supports column-level `GRANT`).
Determine which mechanism is intended before building, and confirm the PostgreSQL equivalent since
PG is a first-class target.

**E. What Phase 2 becomes.** If enforcement moves into the database and the SELECT list, the
output-projection layer may become redundant, or may remain as defense-in-depth for cached and
already-materialized rows. The predicate gate (§2.1a) stays valuable regardless — a user must not
be able to *filter* on a column they cannot read even if the column never leaves the server.

### Research agenda for Phase 2.6 — answer these BEFORE writing code

Agreed working order: **research → write the answers into this document as Phase 2.6 → only then
consider implementing.** Nothing below is a coding task; each is a decision whose cost of being
wrong is a rewrite.

**R1 — View mechanism (blocks everything else).**
A single base view cannot present different columns to different roles, so which is intended?
- Column-level `GRANT`/`DENY` on the view — SQL Server supports `GRANT SELECT ON OBJECT::v (col)`.
  **Verify how this interacts with ownership chaining**: when the view and table share an owner,
  SQL Server skips permission checks on the underlying table, so denials must be expressed on the
  view itself. Confirm `DENY` at column level actually blocks a role that has table-level `SELECT`.
- Per-role views (`vwEmployees_RoleX`) — no ambiguity, but multiplies generated objects and every
  consumer must resolve the right view name.
- Confirm the **PostgreSQL** equivalent (PG has column-level `GRANT` on tables and views but no
  `DENY`) — PG is a first-class target, so a mechanism that only works on SQL Server is not viable.

**R2 — Cache strategy (blocks R4).**
Fingerprint is `EntityName|Filter|OrderBy|MaxRows|StartRow|AggHash[|Connection]`; `Fields` is
excluded by design. Either fold the effective column set in (fragments the cache and forfeits
"permission changes take effect on metadata refresh with no result-cache invalidation") or disable
caching for FLS entities. Quantify both — how many entities realistically carry FLS?

**R3 — CodeGen role creation.**
Where the base view + grants are emitted: `SQLServerCodeGenProvider.ts` ~703-738 and the
PostgreSQL counterpart. Determine where `CREATE ROLE` belongs, whether CodeGen already writes back
to metadata elsewhere (it must, to persist `Role.SQLName`), and whether the three standard roles
(`cdp_UI` / `cdp_Developer` / `cdp_Integration`) are seeded with `SQLName` already.

**R4 — SELECT-list filtering.**
Find where the SELECT list is actually built (`GenericDatabaseProvider` view SQL construction).
Establish what breaks for `ResultType: 'entity_object'` versus `'simple'`.

**R5 — Entity-object survivability (the highest-risk unknown).**
Does `EntityField` have — or can it gain — a "not loaded" state distinct from "loaded as null"?
Without one, `GenerateSaveSQL` cannot tell them apart and any projection reaching entity objects
destroys data (collision B). Also survey `BaseEngine` subclasses, which bulk-load `entity_object`
collections and would receive partially-hydrated objects.

**R6 — Single-record load rerouting.**
`BaseEntity.InnerLoad` (~2942) and the generated single-record resolvers. Evaluate last: it
multiplies the blast radius of R5.

### Known pre-existing failures in this tree (NOT caused by this work)

- Integration `ai-providers.AIP1` — 2 Active LLM models have `DriverClass = 'CohereLLM'` but no
  such `BaseLLM` class exists; the Cohere package registers `CohereReranker` under
  `@RegisterClass(BaseReranker, 'CohereLLM')`, which looks like a copy-paste bug. Survives a full
  clean install + rebuild.

---

## Background

A client asked how MJ and Skip handle row-level and column-level security, specifically for keeping sensitive data (e.g. compensation, donor giving, personnel records) from being broadly reportable. MJ currently supports entity-level CRUD permissions and row-level security (RLS) via SQL filter templates, but has **no field-level access control**. The only field-level feature today is encryption-at-rest (Encrypt/AllowDecryptInAPI), which obfuscates data but doesn't control visibility per role.

This plan adds role-based field-level security to MemberJunction, building on the existing entity permission and unified permission infrastructure.

---

## Current State

### What Exists

| Layer | Implementation | Granularity |
|-------|---------------|-------------|
| Entity Permissions | `EntityPermission` table — CanCreate/Read/Update/Delete per Role | Entity |
| Row-Level Security | `RowLevelSecurityFilter` — SQL WHERE templates with `{{UserID}}` tokens | Row |
| Field Encryption | `EntityFieldInfo.Encrypt` / `AllowDecryptInAPI` / `SendEncryptedValue` | Field (data obfuscation only) |
| Allow/Deny Semantics | `EntityPermission.Type` = 'Allow' or 'Deny' (v5.30.x Phase 2) | Entity |

### What's Missing

- No per-field Read/Update permission flags
- No role-based field visibility filtering
- No automatic field stripping in RunView or GraphQL responses
- No field-level Deny semantics
- No integration with Skip's schema metadata sent to LLMs

### Key Files

| Component | Path | Lines |
|-----------|------|-------|
| EntityPermissionInfo | `packages/MJCore/src/generic/securityInfo.ts` | 303-373 |
| EntityFieldInfo | `packages/MJCore/src/generic/entityInfo.ts` | 488-800+ |
| GetUserPermisions | `packages/MJCore/src/generic/entityInfo.ts` | 2182-2223 |
| CheckPermissions | `packages/MJCore/src/generic/baseEntity.ts` | 2753-2826 |
| CheckUserReadPermissions | `packages/MJServer/src/generic/ResolverBase.ts` | 609-640 |
| MapFieldNamesToCodeNames | `packages/MJServer/src/generic/ResolverBase.ts` | 70-138 |
| RunViewGenericInternal | `packages/MJServer/src/generic/ResolverBase.ts` | 723-851 |

---

## Design

### Core Concept

A new `EntityFieldPermission` entity maps (EntityField, Role) to per-field access flags. The permission model mirrors the existing entity-level pattern: Allow/Deny semantics, OR across roles for Allow, Deny always wins.

**Default behavior (no records):** All fields visible and editable per entity-level permission (backwards compatible — zero migration burden for existing deployments).

**When records exist for a field:** Only roles with explicit `CanRead=1` can see the field. Only roles with `CanUpdate=1` can modify it. A single Deny row for any user role blocks access regardless of Allow grants.

### Permission Aggregation

Follows the same algorithm as `EntityInfo.GetUserPermisions()`:

```
1. Collect all EntityFieldPermission rows matching user's roles
2. Bucket into Allow and Deny
3. Allow = OR across all Allow rows (any role grants access)
4. Deny = OR across all Deny rows (any role blocks access)
5. Result = Allow AND NOT(Deny)
6. If no records exist for a field → default open (CanRead=true, CanUpdate=true)
```

### Enforcement Principles

Two principles govern every enforcement point below. Both were validated against the live save/cache pipeline and both follow the precedent set by the existing field-encryption feature:

1. **Mask at the output boundary — never mutate the loaded entity object.** `GenericDatabaseProvider.GenerateSaveSQL()` builds UPDATEs by iterating **all** `IsSPParameter` fields and reading `field.Value` directly — it does *not* restrict to dirty fields. Any in-memory nulling of a restricted field therefore round-trips as a real `NULL` write on the user's next save: silent data loss that no dirty-field guard can catch. The encryption feature avoids this exact trap by masking only in the outbound GraphQL payload (`MapFieldNamesToCodeNames`) and never touching the entity's in-memory `Value`. Field read-security follows the same pattern.

2. **Validate input predicates, not just output columns.** Output stripping alone leaks data: a user denied `Salary` can still send `ExtraFilter: "Salary > 200000"` or `OrderBy: "Salary DESC"` and reconstruct values from the returned row set and paging order — the column never appears in output, so every output-stripping point reports "secure." Predicate validation is a first-class enforcement point, not an afterthought.

Note also that stripping restricted fields from the SQL SELECT is **not** a viable primary enforcement mechanism: `ProviderBase.PreRunView` deliberately widens `params.Fields` to *all* entity fields whenever a query is cache-eligible (and always for `ResultType: 'entity_object'`), then projects back down. Restricted columns are therefore pulled into server memory for any cacheable entity regardless of the requested field list — enforcement must happen at projection/output time.

### Field Visibility Scope

Field-level security applies at **three enforcement points**:

1. **Predicate validation (RunView input)** — `ExtraFilter`, `OrderBy`, and `UserSearchString` referencing a field the user cannot read → request rejected
2. **Output projection (RunView / GraphQL / cache reads)** — Restricted fields stripped from results at the output boundary, post-cache and post-widening
3. **Entity Save** — Updates to restricted fields rejected server-side before SQL generation (the client-side BaseEntity check is UX-level defense-in-depth only)

---

## Implementation Plan

### Phase 1: Schema & Metadata

#### 1.1 Database Migration

Create `EntityFieldPermission` table:

```sql
-- File: migrations/v5/V[TIMESTAMP]__v5.x.x__Entity_Field_Permissions.sql

CREATE TABLE ${flyway:defaultSchema}.EntityFieldPermission (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    EntityFieldID UNIQUEIDENTIFIER NOT NULL,
    RoleID UNIQUEIDENTIFIER NOT NULL,
    Type NVARCHAR(10) NOT NULL DEFAULT 'Allow'
        CONSTRAINT CK_EntityFieldPermission_Type CHECK (Type IN ('Allow', 'Deny')),
    CanRead BIT NOT NULL DEFAULT 0,
    CanUpdate BIT NOT NULL DEFAULT 0,
    -- CanCreate is included in the schema now but NOT enforced initially
    -- (see Open Questions). Adding the column up front is cheaper than a
    -- follow-up schema change and avoids friction if this schema falls under
    -- the publish-then-no-breaking-changes policy.
    CanCreate BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_EntityFieldPermission PRIMARY KEY (ID),
    CONSTRAINT FK_EntityFieldPermission_EntityField
        FOREIGN KEY (EntityFieldID) REFERENCES ${flyway:defaultSchema}.EntityField(ID),
    CONSTRAINT FK_EntityFieldPermission_Role
        FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT UQ_EntityFieldPermission_Field_Role_Type
        UNIQUE (EntityFieldID, RoleID, Type)
);
```

Add column descriptions via extended properties for CodeGen to pick up:

```sql
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Role-based field-level security. Controls per-field Read/Update access by role with Allow/Deny semantics. When no records exist for a field, all access is permitted (backwards compatible).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityFieldPermission';
```

#### 1.2 Run CodeGen

After migration, run CodeGen. It will automatically generate:
- Entity and EntityField metadata records (auto-discovered from new table)
- Base view (`vwEntityFieldPermissions`) with FK joins
- CRUD stored procedures (`spCreateEntityFieldPermission`, `spUpdateEntityFieldPermission`, `spDeleteEntityFieldPermission`)
- FK indexes
- `__mj_CreatedAt` / `__mj_UpdatedAt` columns and update trigger
- `EntityFieldPermissionEntity` TypeScript class with typed getters/setters and Zod validation
- GraphQL ObjectType, query/mutation resolvers
- Angular CRUD form component

#### 1.3 Metadata Info Class

Add `EntityFieldPermissionInfo` to `packages/MJCore/src/generic/securityInfo.ts`:

```typescript
export class EntityFieldPermissionInfo extends BaseInfo {
    ID: string = null;
    EntityFieldID: string = null;
    RoleID: string = null;
    Type: 'Allow' | 'Deny' = 'Allow';
    CanRead: boolean = false;
    CanUpdate: boolean = false;

    // Virtual fields from view
    FieldName: string = null;
    EntityID: string = null;
    EntityName: string = null;
    RoleName: string = null;

    constructor(initData: Partial<EntityFieldPermissionInfo> = null) {
        super();
        this.copyInitData(initData);
    }
}
```

#### 1.4 Wire into EntityFieldInfo

Add to `EntityFieldInfo` in `packages/MJCore/src/generic/entityInfo.ts`:

```typescript
// New property on EntityFieldInfo
private _FieldPermissions: EntityFieldPermissionInfo[] = [];
public get FieldPermissions(): EntityFieldPermissionInfo[] {
    return this._FieldPermissions;
}

// Check if field-level permissions are configured (any records exist)
public get HasFieldPermissions(): boolean {
    return this._FieldPermissions.length > 0;
}
```

Also add an **entity-level** short-circuit to `EntityInfo`, computed once at metadata-load time:

```typescript
// On EntityInfo — true if ANY field on this entity has field permission records.
// Computed once when metadata loads; every enforcement point gates on this first,
// so entities with no FLS configured pay a single boolean test — no per-field
// iteration, no aggregation, no allocation.
private _hasAnyFieldPermissions: boolean = false;
public get HasAnyFieldPermissions(): boolean {
    return this._hasAnyFieldPermissions;
}
```

The per-field `HasFieldPermissions` guard alone does not deliver "zero cost when unused" — the enforcement loops in Phase 2 would still iterate every entity's fields on every query/load even when zero FLS exists anywhere. `HasAnyFieldPermissions` collapses the non-FLS case (the overwhelming majority of entities in every deployment) to one boolean check.

#### 1.5 Permission Aggregation on EntityFieldInfo

Add a `GetUserFieldPermissions()` method:

```typescript
public GetUserFieldPermissions(user: UserInfo): { CanRead: boolean; CanUpdate: boolean } {
    // Unrestrictable fields: PKs and __mj_ system columns are always readable.
    // Stripping a PK breaks entity load, CompositeKey, relationship resolution,
    // and cache fingerprinting — enforced here AND by save-time validation on
    // EntityFieldPermission records (see below).
    if (this.IsPrimaryKey || this.Name.startsWith('__mj_')) {
        return { CanRead: true, CanUpdate: this.hasUpdatePermission(user) };
    }

    // Default: open access when no field permission records exist
    if (!this.HasFieldPermissions) {
        return { CanRead: true, CanUpdate: true };
    }

    // Exemption: mirrors UserExemptFromRowLevelSecurity — without this, an
    // Owner/admin not in a field's allow-role is locked out of both the data
    // AND the Phase 4 UI that administers these very permissions.
    if (this.userIsExemptFromFieldSecurity(user)) {
        return { CanRead: true, CanUpdate: true };
    }

    // Collect permissions matching user's roles
    const matching = this._FieldPermissions.filter(fp =>
        user.UserRoles?.some(ur => UUIDsEqual(ur.RoleID, fp.RoleID))
    );

    if (matching.length === 0) {
        // Field has permission records but none match user's roles → no access
        return { CanRead: false, CanUpdate: false };
    }

    // Aggregate Allow/Deny (same algorithm as EntityInfo.GetUserPermisions)
    const allow = { CanRead: false, CanUpdate: false };
    const deny = { CanRead: false, CanUpdate: false };

    for (const fp of matching) {
        const isDeny = (fp.Type || 'Allow').trim().toLowerCase() === 'deny';
        const bucket = isDeny ? deny : allow;
        bucket.CanRead = bucket.CanRead || fp.CanRead;
        bucket.CanUpdate = bucket.CanUpdate || fp.CanUpdate;
    }

    return {
        CanRead: allow.CanRead && !deny.CanRead,
        CanUpdate: allow.CanUpdate && !deny.CanUpdate,
    };
}
```

Two guards baked in above, both cheap now and painful to retrofit once data exists:

- **Unrestrictable fields (PKs / system columns):** the aggregation forces `CanRead = true` for primary keys and `__mj_` columns, *and* a server-side `EntityFieldPermissionEntity` subclass rejects records targeting PK fields at save time (belt and suspenders — the aggregation guard protects against rows inserted outside the entity path).
- **Admin/owner exemption:** the exact exemption mechanism (Owner role, system user flag, or an entity-level setting analogous to `UserExemptFromRowLevelSecurity`) should mirror the RLS precedent in `EntityInfo.UserExemptFromRowLevelSecurity()`. This must ship **with** the initial rollout, not after — otherwise the first admin to configure a Deny on a field they don't hold an Allow for locks themselves out of the admin UI that edits these records.

#### Per-Request Precompute

`GetUserFieldPermissions()` is the per-field primitive, but enforcement points must **never call it per row**. `MapFieldNamesToCodeNames` runs once per row, so a naive per-field call is `fields × rows` aggregations (40,000 for a 1,000-row × 40-column result), each filtering `user.UserRoles` and allocating a result object. Every Phase 2 enforcement point follows this shape:

```typescript
// Once per (entity, user) per request — NOT per row:
if (entityInfo.HasAnyFieldPermissions) {
    const deniedFields: Set<string> = buildDeniedReadFieldSet(entityInfo, user);
    // pass the Set into the per-row projection/mapping loop
}
```

#### 1.6 Load Field Permissions in Metadata

Update the metadata loading path in `EntityFieldInfo` constructor (or `EntityInfo` constructor where field permissions would be loaded from the GraphQL payload) to populate `_FieldPermissions` from the database.

#### 1.7 What Ships to the Client — an Explicit Decision

`EntityPermissions` already flow to every client inside `AllMetadata` (`PostProcessEntityMetadata` → client `MetadataFromSimpleObject`). If `EntityFieldPermission` records follow the same path by silent inheritance, *which roles can and cannot see which sensitive fields* becomes visible to any authenticated client. Enforcement is server-side, so this is not a data leak — but for a feature whose whole purpose is compensation/donor confidentiality, leaking the **shape** of the restrictions (e.g., "the `Salary` field has Deny rows for these roles") may itself be sensitive.

**Decision: ship all records, for now.** This matches the established MJ convention — `EntityPermissions` (the full role → entity matrix) already ships to every client — and keeps client-side `GetUserFieldPermissions()` identical to the server implementation with no compatibility layer.

This is explicitly an interim position. The convention itself is the problem: broadcasting raw permission matrices (entity-level and field-level), RLS filter SQL, saved-query SQL, and other need-to-know metadata to every authenticated browser is a least-privilege violation across the whole metadata pipeline, not something this feature can fix alone. The long-term fix — tiered metadata with server-computed *effective* permissions shipped in place of raw role matrices — is tracked in [#3485](https://github.com/MemberJunction/MJ/issues/3485). When that lands, `EntityFieldPermission` records move to the effective-flags model along with `EntityPermissions`.

---

### Phase 2: Server-Side Enforcement

#### 2.1 RunView Enforcement: Predicate Validation + Output Projection

In `ResolverBase.RunViewGenericInternal()` (~line 723), the client's `ExtraFilter`, `OrderBy`, and `UserSearchString` currently pass straight to the provider with no field-level check. Two enforcement steps, both gated on `entityInfo.HasAnyFieldPermissions`:

**(a) Predicate validation — before execution.** Reject any request whose `ExtraFilter` or `OrderBy` references a field the user cannot read, and exclude unreadable fields from the `UserSearchString` search-field list. Without this, output projection is security theater: `ExtraFilter: "Salary > 200000"` reconstructs the values without the column ever appearing in a result.

```typescript
if (entityInfo.HasAnyFieldPermissions) {
    const denied = buildDeniedReadFieldSet(entityInfo, userInfo); // per-request precompute (§1.5)
    if (denied.size > 0) {
        // Reject — do NOT silently strip predicate terms; rewriting a WHERE
        // clause changes query semantics and hides the failure from the caller.
        assertPredicatesDoNotReferenceFields(params.ExtraFilter, params.OrderBy, denied, entityInfo);
        // UserSearchString: remove denied fields from the searched-field list
    }
}
```

Field-reference detection should build on the existing SQL expression validation infrastructure (`SQLExpressionValidator`) rather than ad-hoc string matching, and should be conservative: an identifier match on a denied field name anywhere in the predicate rejects the request. False positives (e.g., a string literal containing a field name) are acceptable for a security check on restricted entities; false negatives are not.

**(b) Output projection — after execution.** Strip denied fields from result rows at the output boundary. Note that filtering the SQL SELECT list is *not* the mechanism: `ProviderBase.PreRunView` widens `params.Fields` to all entity fields for cache-eligible queries and `entity_object` results, so restricted columns reach server memory regardless. The projection pass (shared with §2.6's cache-read path) is the authoritative filter, computed once per request from the same denied-field `Set`.

#### 2.2 Single-Record Resolver Field Filtering

**File:** `packages/MJServer/src/generic/ResolverBase.ts`
**CodeGen template:** `packages/CodeGenLib/src/Misc/graphql_server_codegen.ts` (~lines 504-528)

The single-record GraphQL resolver (e.g., `Account(ID: ...)`) is a separate code path from RunView. It builds raw SQL (`SELECT * FROM {baseView} WHERE {pk} {RLS}`) and does **not** go through RunView's field selection logic. Both the regular entity path and the external data source path (`LoadExternalRecordByKey()`, lines 209-223) pass results through `MapFieldNamesToCodeNames()` before returning.

Field-level security must be enforced in `MapFieldNamesToCodeNames()` (~line 70), alongside the existing encryption filtering. Strip any field the user cannot read.

**Performance shape matters here:** `MapFieldNamesToCodeNames` runs **once per row**, so the denied-field `Set` must be computed once per (entity, user) for the request and passed into the per-row mapper — never call `GetUserFieldPermissions()` inside the row loop (see §1.5 Per-Request Precompute). The whole block is skipped when `entityInfo.HasAnyFieldPermissions` is false:

```typescript
// Once, before the row loop:
const deniedFields = entityInfo.HasAnyFieldPermissions
    ? buildDeniedReadFieldSet(entityInfo, currentUser)
    : null;

// Inside the per-row mapper — a Set lookup, no aggregation:
if (deniedFields?.has(fieldInfo.Name)) {
    continue; // omit field from result row
}
```

This covers **all** GraphQL return paths — single-record resolvers, RunView results, and any other code path that calls `MapFieldNamesToCodeNames()`. Together with the RunView projection (§2.1b) it forms the authoritative read boundary, exactly where encryption masking already lives.

#### 2.3 BaseEntity Save Protection

In `BaseEntity.Save()` or the `CheckPermissions()` flow (~line 2753), before generating the UPDATE SQL, verify field-level update permissions.

**Enforcement layer, stated explicitly:** `BaseEntity` also runs client-side, where this guard is trivially bypassable. The **authoritative** check is the server-side execution of this same code path — the MJServer mutation resolver re-instantiates the entity and re-runs Save/CheckPermissions on the server. The client-side occurrence of the guard is UX and defense-in-depth (fail fast with a clear message before a network round-trip), and must never be treated as the security boundary.

```typescript
// In the Save flow, check each dirty field
for (const dirtyField of this.DirtyFields) {
    const fieldInfo = this.EntityInfo.Fields.find(f => f.Name === dirtyField);
    if (fieldInfo?.HasFieldPermissions) {
        const perms = fieldInfo.GetUserFieldPermissions(this.ActiveUser);
        if (!perms.CanUpdate) {
            throw new Error(
                `User ${this.ActiveUser.Email} does not have update permission on field '${dirtyField}' of entity '${this.EntityInfo.Name}'`
            );
        }
    }
}
```

#### 2.4 Entity Load — No In-Memory Stripping (Output-Boundary Enforcement Only)

An earlier draft of this plan nulled restricted field values inside `BaseEntity.InnerLoad()` (`field.Value = null` + `ResetOldValue()`). **That approach is rejected — it causes verified silent data loss.**

The failure sequence: `GenericDatabaseProvider.GenerateSaveSQL()` builds UPDATEs by iterating **all** `IsSPParameter` fields and reading `theField.Value` directly — it does not restrict to dirty fields. So: server loads an Account as `entity_object` for a Salary-restricted user → load-time stripping sets `Salary = null` (deliberately non-dirty) → user edits `Notes` and saves → the UPDATE writes `Salary = NULL` → real value destroyed. The §2.3 guard cannot catch it because the field is not dirty.

The encryption feature already solved this correctly: it masks only in the outbound GraphQL payload (`MapFieldNamesToCodeNames`) and never mutates the entity's in-memory `Value`, so entities round-trip safely. Field read-security follows the identical pattern:

- **Single-record loads (GraphQL):** enforced at `MapFieldNamesToCodeNames` (§2.2) — the value never reaches the client.
- **List results:** enforced by the RunView output projection (§2.1b / §2.6).
- **Server-internal code** (agents, actions, resolvers running with a `contextUser`): entity objects retain real values in server memory, exactly as encrypted fields do today. The trust boundary is the API output, not the server-side object graph.

#### 2.5 Saved Queries: Design-Time Warning + Standing Audit (No Runtime Enforcement)

**File:** `packages/MJCoreEntitiesServer/src/custom/MJQueryEntityServer.server.ts`

`MJQueryEntityServer` extracts entities and fields from SQL via a 5-stage pipeline (parse → resolve → enrich → merge → sync) and stores them in `MJ: Query Fields` and `MJ: Query Entities`.

An earlier draft proposed runtime column-stripping (or blocking) on query results. **That approach is rejected**, for two reasons:

1. **It fights what a saved query is** — an admin-authored, curated artifact. The admin who wrote the query and granted run access is the right owner of the conflict, at the moment they create it.
2. **Output-stripping by column name is defeatable anyway.** Aggregates, `CASE` expressions, and computed columns rename the data out of any field mapping (`SELECT AVG(Salary) AS TeamMetric`). Runtime stripping would report "enforced" while leaking freely — a *false* sense of enforcement is worse than a documented trust boundary.

Instead, MJ already resolves each query's SQL to `MJ: Query Fields → EntityField`, which makes the conflict a cheap static metadata join. Two tiers:

**Tier 1 — save-time warning (role granularity, non-blocking).** In the query save validation path: for each role granting run access (via `UserCanRun`), evaluate field permissions as if a user held only that role; warn the saving admin if any referenced secured field resolves to `CanRead = false`. Pure metadata, no data access. Intentionally conservative — a flagged user might hold another role that grants the field — which is the correct bias for a warning.

**Tier 2 — standing audit (user granularity, on-demand/scheduled).** Enumerate real users, compute effective field permissions across all their roles, and report every `(User, Query, Field)` combination where a user can run a query referencing a field they cannot read. This catches **drift** — the conflict usually appears *after* the query exists (an admin adds FLS to an already-referenced field, or grants run access later), which a one-time save check cannot see. Fits Phase 4 / Sharing Center, and can itself be implemented as a saved query.

**Trust boundary (documented, deliberate):** saved-query results are **not** runtime FLS-filtered. Run access to a query is the grant; the warning + audit keep admins honest about what that grant exposes.

**Ad-hoc SQL** is out of scope for the warning — there is no run-grant or artifact to analyze. Instead, gate the ad-hoc capability itself with an instance/entity-level "may run ad-hoc SQL" permission: if a user can run arbitrary SQL, field-level security is already moot for them, so the control belongs on the capability, not the columns.

#### 2.6 Local Cache Manager Field-Level Security

**Files:**
- `packages/MJCore/src/generic/localCacheManager.ts` (~1400 lines)
- `packages/MJCore/src/generic/providerBase.ts` (PreRunView/PostRunView hooks)

The Local Cache Manager stores **all columns** for a given RunView result. When a RunView executes:

1. `PreRunView` intentionally **widens** `params.Fields` to all entity fields
2. The full result set (all columns) is cached under a fingerprint that excludes `Fields`
3. On cache hit, `ProjectRowsToFields()` filters the cached superset down to the caller's requested fields

This means the cache is **column-agnostic by design** — one cache entry serves requests for different field subsets. RLS is part of the cache fingerprint (different users get separate entries for different row filters), but there is **no field-level filtering on cache read**.

**Security risk:** If user A (unrestricted) warms the cache and user B (field-restricted) hits that same cache entry, user B sees all columns before `ProjectRowsToFields()` filters to their requested fields. Since the caller's `Fields` parameter is unrelated to security, this is a bypass.

**Fix — field-level projection on cache read:**

The field permission filter must be applied **after cache retrieval and before returning results**, regardless of whether it's a cache hit or miss. This should happen in `PostRunView` (or a new step) where the user context is available:

```typescript
// In PostRunView, after ProjectRowsToFields for the caller's requested Fields,
// apply a second projection pass for field-level security.
// This runs on BOTH cache hits and cache misses.
// Gated on the entity-level flag so non-FLS entities skip the pass entirely,
// and the allowed-field list is computed ONCE per request — not per row (§1.5).
if (entityInfo.HasAnyFieldPermissions) {
    const userAllowedFields = entityInfo.Fields
        .filter(f => !f.HasFieldPermissions || f.GetUserFieldPermissions(userInfo).CanRead)
        .map(f => f.Name);

    results = ProjectRowsToFields(results, userAllowedFields);
}
```

**Alternative approach — include field permissions in cache fingerprint:**

Add a hash of the user's field-level restrictions to the cache key so users with different field access get separate cache entries. This is how RLS is handled today. The tradeoff is reduced cache reuse (more entries per entity), but it avoids the post-read filtering step.

```typescript
// Extend fingerprint to include field permission hash
// e.g., "EntityName|Filter|OrderBy|...|rls:<hash>|flp:<hash>"
const fieldPermHash = computeFieldPermissionHash(entityInfo, userInfo);
fingerprint += `|flp:${fieldPermHash}`;
```

**Recommendation:** Post-read projection (first approach) is simpler, consistent with how `Fields` projection already works, and doesn't fragment the cache. The cache stores the universal superset; security filtering happens at read time.

A further concrete advantage over the fingerprint approach: because projection reads *live* metadata at read time, **permission changes take effect immediately after the normal metadata refresh, with no RunView result-cache invalidation** — the cached superset stays valid; only the projection changes. With fingerprinting, a permission change would strand stale entries keyed to the old permission hash (or require a targeted invalidation sweep). This is the same immediacy property that makes the RLS fingerprint approach *necessary* for rows (row membership is baked into the cached data) but *unnecessary* for columns (column visibility is a pure read-time projection).

---

### Phase 3: Skip Integration

#### 3.1 Schema Metadata Filtering

Skip sends entity schema metadata (field names, types, relationships) to LLMs for query generation. When field-level security is active, Skip must filter out restricted fields from the schema sent to the LLM so the AI never generates queries referencing columns the user can't see.

Update the relevant entities/schema metadata gathering in Skip to call `GetUserFieldPermissions()` and exclude restricted fields.

#### 3.2 RunView Result Enforcement

Skip's data gathering agents use RunView internally. Since enforcement happens at the MJ layer (Phase 2), Skip automatically inherits field-level security with no code changes in the data pipeline.

---

### Phase 4: Admin UI

#### 4.1 Entity Field Permission Management

Add a field permission management UI to the MJ Explorer entity admin screen. For each entity field, allow administrators to:
- Add/remove role-based Read/Update permissions
- Set Allow/Deny type
- See effective permissions per role

This could be a sub-grid on the existing Entity Fields tab, or a dedicated "Field Security" tab on the entity admin form.

#### 4.2 Unified Permissions Integration

Register `EntityFieldPermission` as a new permission domain in the `PermissionDomain` catalog (from unified permissions Phase 2) so it appears in the Sharing Center alongside other permission types.

---

## Migration Strategy

### Backwards Compatibility

- **Zero breaking changes**: When no `EntityFieldPermission` records exist for a field, behavior is identical to today (all fields visible/editable per entity-level permissions)
- **Opt-in per field**: Admins explicitly add field permission records to restrict specific sensitive fields
- **Existing RLS unaffected**: Row-level security continues to work independently

### Rollout Recommendation

1. Deploy schema migration (creates table, does nothing until populated)
2. Deploy code changes (enforcement logic, no-op when no records exist)
3. Administrators configure field permissions for sensitive fields as needed
4. No "big bang" — each entity/field can be secured independently

---

## Performance Considerations

### Metadata Caching

Field permissions are loaded with entity metadata at startup and cached in memory on `EntityFieldInfo._FieldPermissions`. No per-request database queries. This matches the existing pattern for `EntityPermissionInfo`.

### Zero Cost When Unused

The dominant case — deployments and entities with no field permissions configured — must pay effectively nothing:

- **Entity-level gate:** every enforcement point checks `EntityInfo.HasAnyFieldPermissions` first (computed once at metadata load). Non-FLS entities collapse to a single boolean test — no field iteration, no allocation.
- **Per-request precompute:** when an entity *does* have FLS, the denied-field `Set` is computed once per (entity, user) per request and shared across the row loop — never `fields × rows` aggregations.

(Note: there is no "restricted fields excluded from SELECT" perf win — `PreRunView` widens cacheable queries to all columns regardless; enforcement is output projection, which is O(rows × denied fields) only on FLS entities.)

### Cache Invalidation

When `EntityFieldPermission` records are modified, the metadata cache must be refreshed. This uses the same cache invalidation mechanism as entity permission changes today.

---

## Testing Strategy

### Unit Tests

- Permission aggregation logic (Allow/Deny/OR semantics)
- Default open behavior when no records exist
- Field has records but none match user roles → blocked
- Multiple roles with conflicting permissions → Deny wins

### Integration Tests

Add to the existing security test suite (`packages/TestingFramework/integration-test-suite/docs/security-suite.md`):

- RunView excludes restricted fields from results (output projection)
- RunView rejects `ExtraFilter` / `OrderBy` referencing a restricted field; `UserSearchString` never searches restricted fields
- Single-record GraphQL responses don't contain restricted fields (`MapFieldNamesToCodeNames` path)
- Entity Save rejects updates to restricted fields (server-side authoritative path)
- **Round-trip safety:** a restricted-read user loads an entity, edits an unrelated field, saves — the restricted column's stored value is unchanged (regression test for the rejected load-time-nulling design)
- Encryption + field permissions interact correctly (encrypted + restricted = never returned)
- PK / `__mj_` system columns are always readable regardless of permission records; saving an `EntityFieldPermission` row targeting a PK field is rejected
- Admin/owner exemption: exempt user retains full field access on an FLS-configured entity, including the ability to administer `EntityFieldPermission` records
- Saved-query save path emits a warning when a run-granted role lacks read on a referenced secured field; standing audit reports `(User, Query, Field)` conflicts, including drift (FLS added after the query existed)
- Ad-hoc SQL capability is gated by its own permission
- Cache hit by restricted user does not leak columns cached by unrestricted user
- Cache miss + cache hit return identical field sets for same user
- Permission change becomes effective after metadata refresh without RunView result-cache invalidation
- Client-side `GetUserFieldPermissions()` produces results identical to the server for the same user/roles (records ship to the client per §1.7)

### Skip Integration Tests

- Schema metadata sent to LLM excludes restricted fields
- Data gather results respect field-level security
- Component generation doesn't reference restricted fields

---

## Resolved Decisions

Formerly open questions, settled during PR review:

1. **CanCreate flag** — The `CanCreate` column ships in the initial migration (a follow-up schema change is more expensive, and the publish-then-no-breaking-changes policy makes additive-now the cheap path), but **enforcement starts with CanRead/CanUpdate only**. CanCreate enforcement is a later, additive change.

2. **Field masking vs. null** — **Omit the field from the response entirely, at the output boundary, in all paths** (RunView projection + `MapFieldNamesToCodeNames`). The earlier "return null for entity loads" answer is rejected: in-memory nulling round-trips as a real `NULL` write via `GenerateSaveSQL` (see §2.4). Never mutate the loaded entity.

3. **Saved queries: filter vs. block** — Neither. **Design-time save warning (role-level) + standing audit (user-level), no runtime enforcement** (see §2.5). Runtime column-stripping is defeatable via aggregates/derived columns and gives false assurance. Ad-hoc SQL is gated by its own capability permission.

4. **Unrestrictable fields** — **Up-front guard, not deferred**: reject `EntityFieldPermission` rows targeting PK fields at save, and force `CanRead = true` for PKs and `__mj_` system columns in the aggregation (see §1.5). Cheap now, painful to retrofit once permission data exists.

5. **Cache fingerprint vs. post-read projection** — **Post-read projection**: simpler, doesn't fragment the cache, consistent with `ProjectRowsToFields()`, and — because projection reads live metadata — permission changes take effect on metadata refresh with no result-cache invalidation (see §2.6).

6. **Client metadata shipping** — **Ship all `EntityFieldPermission` records for now**, consistent with the existing MJ convention for `EntityPermissions` (see §1.7). The restriction *shape* (which roles are denied which sensitive fields) leaking to all authenticated clients is acknowledged as a real problem — but it's a problem with the metadata-shipping convention itself, tracked and to be fixed holistically in [#3485](https://github.com/MemberJunction/MJ/issues/3485).

## Open Questions

1. **Interaction with Required fields?** — If a field is DB-required (NOT NULL) but the user can't update it, how do we handle entity creation? **Recommendation: CanUpdate restriction only applies to UPDATE operations. On INSERT, the field uses its default value or the value provided by the system (not the user).**

2. **Virtual entity fields?** — Virtual entities are read-only already. Should field-level security apply to their read visibility? **Recommendation: Yes, for consistency.**

3. **Audit trail?** — Should we log when field-level security blocks access? **Recommendation: Yes, at debug level, using the existing MJ logging infrastructure.**

4. **Admin exemption mechanism?** — The need for an exemption is settled (§1.5 — without it, admins can lock themselves out of the feature's own admin UI). The *mechanism* is open: Owner role, a system-user flag, or an entity-level setting mirroring `UserExemptFromRowLevelSecurity`. **Recommendation: mirror the RLS exemption precedent; must ship with the initial rollout.**

5. **Predicate rejection error shape?** — When `ExtraFilter`/`OrderBy` references a denied field (§2.1a), what does the client receive — a generic permission error, or one naming the offending field? Naming the field aids debugging but confirms the field is restricted. **Recommendation: name the field — its existence is already visible in entity metadata; only its values are secured.**

---

## Estimated Scope

| Phase | Packages Affected | Manual Work | CodeGen Handles |
|-------|------------------|-------------|-----------------|
| Phase 1: Schema & Metadata | MJCore, migrations | Migration DDL, `EntityFieldPermissionInfo` class, wiring into `EntityFieldInfo` + `EntityInfo.HasAnyFieldPermissions`, metadata loading (records ship to clients per §1.7 / #3485), PK-guard save validation | Entity/EntityField registration, base view, SPs, TS entity class, Zod, GraphQL, Angular form, `__mj` columns, FK indexes |
| Phase 2: Server Enforcement | MJCore, MJServer, MJCoreEntitiesServer | Predicate validation (ExtraFilter/OrderBy/search), output projection (RunView + MapFieldNamesToCodeNames + cache reads), BaseEntity Save guard (server-authoritative), saved-query save-time warning + standing audit, ad-hoc SQL capability gate | — |
| Phase 3: Skip Integration | Skip-Brain agents/core | Schema metadata filtering for LLM prompts | — |
| Phase 4: Admin UI | Angular Explorer | Field permission management UI, PermissionDomain registration | Base CRUD form (via CodeGen) |

Phases 1-2 are the core deliverable. Phase 3 is a small incremental change. Phase 4 can be deferred — CodeGen generates a basic CRUD form automatically, so admin management is usable from day one even without a custom UI.
