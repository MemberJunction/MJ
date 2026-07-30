# Field-Level Security for MemberJunction

## Background

A Nimble client (NATA) asked how MJ and Skip handle row-level and column-level security, specifically for keeping compensation, donor giving, and personnel data from being broadly reportable when Salesforce is the system of record. MJ currently supports entity-level CRUD permissions and row-level security (RLS) via SQL filter templates, but has **no field-level access control**. The only field-level feature today is encryption-at-rest (Encrypt/AllowDecryptInAPI), which obfuscates data but doesn't control visibility per role.

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

### Field Visibility Scope

Field-level security applies at **three enforcement points**:

1. **RunView / GraphQL queries** — Restricted fields excluded from SELECT column list
2. **Entity Load (BaseEntity)** — Restricted field values nulled/stripped after load
3. **Entity Save (BaseEntity)** — Updates to restricted fields rejected before SQL execution

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

#### 1.5 Permission Aggregation on EntityFieldInfo

Add a `GetUserFieldPermissions()` method:

```typescript
public GetUserFieldPermissions(user: UserInfo): { CanRead: boolean; CanUpdate: boolean } {
    // Default: open access when no field permission records exist
    if (!this.HasFieldPermissions) {
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

#### 1.6 Load Field Permissions in Metadata

Update the metadata loading path in `EntityFieldInfo` constructor (or `EntityInfo` constructor where field permissions would be loaded from the GraphQL payload) to populate `_FieldPermissions` from the database.

---

### Phase 2: Server-Side Enforcement

#### 2.1 RunView Field Filtering

In `ResolverBase.RunViewGenericInternal()` (~line 723), after resolving the user and before building the SQL query, filter the field list:

```typescript
// After getting userInfo and entityInfo...
const allowedFields = entityInfo.Fields.filter(f => {
    const perms = f.GetUserFieldPermissions(userInfo);
    return perms.CanRead;
});

// Use allowedFields when building SELECT column list
```

This ensures restricted fields never appear in the SQL SELECT — the data never leaves the database.

#### 2.2 MapFieldNamesToCodeNames Enhancement

In `ResolverBase.MapFieldNamesToCodeNames()` (~line 70), add field permission filtering alongside the existing encryption filtering. Strip any field the user cannot read:

```typescript
// Existing: filter encrypted fields
// New: also filter field-permission-denied fields
if (!fieldInfo.GetUserFieldPermissions(currentUser).CanRead) {
    // Remove field from result row
    continue;
}
```

This is a defense-in-depth layer — RunView filtering prevents the data from being queried, but MapFieldNamesToCodeNames catches any code path that bypasses RunView (e.g., direct entity loads).

#### 2.3 BaseEntity Save Protection

In `BaseEntity.Save()` or the `CheckPermissions()` flow (~line 2753), before generating the UPDATE SQL, verify field-level update permissions:

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

#### 2.4 Entity Load Field Stripping

In `BaseEntity.InnerLoad()` (~line 2869), after loading entity data, null out fields the user cannot read:

```typescript
// After data is loaded into the entity object
for (const field of this.Fields) {
    if (field.EntityFieldInfo.HasFieldPermissions) {
        const perms = field.EntityFieldInfo.GetUserFieldPermissions(this.ActiveUser);
        if (!perms.CanRead) {
            field.Value = null;
            field.ResetOldValue(); // sets OldValue = Value (null), so Dirty = false
        }
    }
}
```

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

### Query Optimization

RunView field filtering happens before SQL generation, so restricted fields are never included in the SELECT clause. This is actually a performance improvement (less data transferred from DB).

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

- RunView excludes restricted fields from results
- Entity Load nulls restricted field values
- Entity Save rejects updates to restricted fields
- API/GraphQL responses don't contain restricted fields
- Encryption + field permissions interact correctly (encrypted + restricted = never returned)

### Skip Integration Tests

- Schema metadata sent to LLM excludes restricted fields
- Data gather results respect field-level security
- Component generation doesn't reference restricted fields

---

## Open Questions

1. **CanCreate flag?** — Should field permissions include CanCreate (control whether a field can be set on INSERT)? Entity-level has CanCreate but it's less clear at field level since most fields have defaults. **Recommendation: Start with CanRead/CanUpdate only, add CanCreate later if needed.**

2. **Field masking vs. null?** — When a user can't read a field, should we return null, omit the field entirely, or return a masked value (e.g., "****")? **Recommendation: Omit the field from the response entirely (don't include in SELECT) for RunView. Return null for entity loads.**

3. **Interaction with Required fields?** — If a field is DB-required (NOT NULL) but the user can't update it, how do we handle entity creation? **Recommendation: CanUpdate restriction only applies to UPDATE operations. On INSERT, the field uses its default value or the value provided by the system (not the user).**

4. **Virtual entity fields?** — Virtual entities are read-only already. Should field-level security apply to their read visibility? **Recommendation: Yes, for consistency.**

5. **Audit trail?** — Should we log when field-level security blocks access? **Recommendation: Yes, at debug level, using the existing MJ logging infrastructure.**

---

## Estimated Scope

| Phase | Packages Affected | Manual Work | CodeGen Handles |
|-------|------------------|-------------|-----------------|
| Phase 1: Schema & Metadata | MJCore, migrations | Migration DDL, `EntityFieldPermissionInfo` class, wiring into `EntityFieldInfo` + metadata loading | Entity/EntityField registration, base view, SPs, TS entity class, Zod, GraphQL, Angular form, `__mj` columns, FK indexes |
| Phase 2: Server Enforcement | MJCore, MJServer | RunView field filtering, MapFieldNamesToCodeNames, BaseEntity Save/Load guards | — |
| Phase 3: Skip Integration | Skip-Brain agents/core | Schema metadata filtering for LLM prompts | — |
| Phase 4: Admin UI | Angular Explorer | Field permission management UI, PermissionDomain registration | Base CRUD form (via CodeGen) |

Phases 1-2 are the core deliverable. Phase 3 is a small incremental change. Phase 4 can be deferred — CodeGen generates a basic CRUD form automatically, so admin management is usable from day one even without a custom UI.
