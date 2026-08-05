# Field-Level Security for MemberJunction

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
