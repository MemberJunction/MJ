# Unified Permissions Architecture

## Executive Summary

MemberJunction currently has **12+ distinct permission subsystems** that evolved independently: Entity Permissions, Authorizations, Resource Permissions, Dashboard Permissions, Artifact Permissions, Collection Permissions, AI Agent Permissions, Query Permissions, Access Control Rules, MCP Connection Permissions, File Storage Permissions, and API Key Scopes. Each has its own table schema, grantee model (some role-only, some user-only, some both), permission vocabulary (CRUD vs View/Edit/Owner vs custom), and enforcement code. There is no unified API to answer "what can User X do?" or "who has access to Resource Y?", and application-level access control does not exist at all — `UserApplication` is a visibility preference, not a security boundary.

This plan delivers the fix in two phases:

- **Phase 1 — Application Roles & Immediate Fixes**: Add `ApplicationRole` entity, wire enforcement, build admin UI in the Admin app, update CodeGen to auto-assign roles to new apps, and seed metadata for all shipped apps. ✅ **COMPLETED** (see [Phase 1 Deliverables Checklist](#18-phase-1-deliverables-checklist)).
- **Phase 2 — Unified Permission Provider Architecture**: Define `IPermissionProvider` interface, create `PermissionDomain` catalog entity, wrap each existing permission subsystem in a provider, build a unified `PermissionEngine` singleton, and deliver a "Sharing Center" admin UI.

---

## Current State: The Problem

### 12+ Permission Models, Zero Unification

| # | Subsystem | Tables | Grantee | Permission Shape | Deny? | Engine |
|---|-----------|--------|---------|-----------------|-------|--------|
| 1 | Entity Permissions | `EntityPermission` + `RowLevelSecurityFilter` | Role only | CanCreate/Read/Update/Delete + RLS | No | `EntityInfo.GetUserPermissions()` |
| 2 | Authorizations | `Authorization` + `AuthorizationRole` | Role only | Named capability (Allow/Deny) | **Yes** | `AuthorizationEvaluator` |
| 3 | Resource Permissions | `ResourcePermission` + `ResourceType` | User or Role | View/Edit/Owner + temporal + status | No | `ResourcePermissionEngine` |
| 4 | Dashboard Permissions | `DashboardPermission` + `DashboardCategoryPermission` | User only | CanRead/Edit/Delete/Share + category inheritance | No | `DashboardEngine` |
| 5 | Artifact Permissions | `ArtifactPermission` + `CollectionPermission` + `ConversationArtifactPermission` | User only | CanRead/Edit/Delete/Share + cascade | No | Angular services only |
| 6 | AI Agent Permissions | `AIAgentPermission` | User or Role | CanView/Run/Edit/Delete | No | Ad-hoc |
| 7 | Query Permissions | `QueryPermission` | Role only | Existence = permission | No | None |
| 8 | Access Control Rules | `AccessControlRule` | User/Role/Everyone/Public | CanRead/Create/Update/Delete/Share + expiry | No | None |
| 9 | MCP Connection Perms | `MCPServerConnectionPermission` | User or Role | CanExecute/Modify/ViewCredentials | No | None |
| 10 | File Storage Perms | `FileStorageAccountPermission` | User/Role/Everyone | CanRead/CanWrite | No | None |
| 11 | List Sharing | `ListShare` | User only | Role: View/Edit/Owner | No | `ListSharingService` |
| 12 | API Key Scopes | `APIApplicationScope` + `APIKeyScope` | Application/Key | Include/Exclude patterns + IsDeny + Priority | **Yes** | `ScopeEvaluator` |

### Key Structural Problems

1. **No application-level security.** `UserApplication` is a UI preference table. Users can navigate directly to any app URL. No `ApplicationRole` exists.

2. **Inconsistent grantee models.** Entity Permissions = role-only. Dashboard Permissions = user-only. Resource Permissions = both. No standard "who is the grantee?" abstraction.

3. **Inconsistent permission vocabulary.** CRUD flags vs View/Edit/Owner levels vs custom domain flags. No canonical action set.

4. **Deny only in Authorizations.** `AuthorizationRole.Type` has Allow/Deny, but `AuthorizationInfo.UserCanExecute()` doesn't actually evaluate Deny — it just checks for any matching role. Entity Permissions are purely additive (OR across roles).

5. **No unified query API.** Cannot answer "show me everything User X has access to" without writing code against 12 separate systems.

6. **Front-end only enforcement for sharing.** Dashboard, artifact, and collection permissions are checked only in Angular. The GraphQL layer doesn't enforce them.

7. **No centralized admin UX.** Each permission type has its own management UI (or none at all). No "Sharing Center" for administrators.

### What Works Well

- **Entity Permissions + RLS**: Solid. Role-based CRUD enforced server-side in `ResolverBase` and `EntityCRUDHandler`. Per-operation RLS filters with user-token substitution.
- **Authorizations**: Good bones — hierarchical, Allow/Deny semantics, used for Actions.
- **Resource Permissions**: Best generalization attempt — generic resource types, User+Role, temporal, status workflow, notification integration.
- **Access Control Rules**: Well-designed record-level model — User/Role/Everyone/Public, CRUD+Share, expiration.

---

## Phase 1: Application Roles (Tech Fellow) ✅ COMPLETED

### Overview

Add role-based access control to Applications. Today, any authenticated user can access any application — `UserApplication` only controls which apps appear in the nav sidebar, not which apps a user is *authorized* to use. Phase 1 fixes this with an `ApplicationRole` entity, enforcement in the application loading flow, admin UI, CodeGen integration, and metadata seeding.

**Status**: Implemented, tested, and merged on branch `claude/unified-permissions-architecture-PFdnU`. See the [Phase 1 Deliverables Checklist](#18-phase-1-deliverables-checklist) for per-item status.

### 1.1 Database Migration

**New Table: `ApplicationRole`**

```sql
-- File: migrations/v5/V202604101200__v5.26.x__Application_Roles.sql

CREATE TABLE ${flyway:defaultSchema}.ApplicationRole (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ApplicationID UNIQUEIDENTIFIER NOT NULL,
    RoleID UNIQUEIDENTIFIER NOT NULL,
    CanAccess BIT NOT NULL DEFAULT 1,
    CanAdmin BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_ApplicationRole PRIMARY KEY (ID),
    CONSTRAINT FK_ApplicationRole_Application
        FOREIGN KEY (ApplicationID) REFERENCES ${flyway:defaultSchema}.Application(ID),
    CONSTRAINT FK_ApplicationRole_Role
        FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.Role(ID),
    CONSTRAINT UQ_ApplicationRole_App_Role
        UNIQUE (ApplicationID, RoleID)
);

-- Extended properties for CodeGen
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls which roles can access and administer specific applications. When no ApplicationRole records exist for an application, all roles can access it (open access). When at least one record exists, only roles with CanAccess=1 are permitted.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Application this role grant applies to',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole',
    @level2type = N'COLUMN', @level2name = N'ApplicationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Role being granted or denied access',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole',
    @level2type = N'COLUMN', @level2name = N'RoleID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, users in this role can access the application. When false, this record acts as an explicit deny for the role.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole',
    @level2type = N'COLUMN', @level2name = N'CanAccess';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true, users in this role can modify application settings, manage nav items, and configure the application.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ApplicationRole',
    @level2type = N'COLUMN', @level2name = N'CanAdmin';
```

**Access Logic (IMPORTANT — open by default):**
- If an application has **zero** `ApplicationRole` records → **all roles can access** (backwards compatible)
- If an application has **one or more** `ApplicationRole` records → only roles with `CanAccess=1` can access
- `CanAccess=0` is an explicit deny for that role (useful when you want most roles to have access but exclude specific ones)
- `CanAdmin=1` grants ability to manage the application's settings and nav items

### 1.2 Entity Registration (After CodeGen)

After running the migration and CodeGen, the generated entity class `MJApplicationRoleEntity` will be created in `entity_subclasses.ts` with properties: `ID`, `ApplicationID`, `RoleID`, `CanAccess`, `CanAdmin`, plus virtual fields `Application` (name) and `Role` (name).

**Entity Name**: `MJ: Application Roles` (uses MJ prefix per convention for new core entities)

### 1.3 Enforcement: Update `UserInfoEngine`

**File**: `packages/MJCoreEntities/src/engines/UserInfoEngine.ts`

Update `CheckUserApplicationAccess()` to check `ApplicationRole` records:

```typescript
// BEFORE (current — just checks UserApplication preference)
public CheckUserApplicationAccess(applicationId: string): UserApplicationAccessStatus {
    const userApp = this.GetUserApplicationByAppId(applicationId);
    if (!userApp) return 'not_installed';
    return userApp.IsActive ? 'installed_active' : 'installed_inactive';
}

// AFTER (with role-based authorization)
public CheckUserApplicationAccess(applicationId: string): UserApplicationAccessStatus {
    // Step 1: Check role-based authorization first
    if (!this.UserHasApplicationAccess(applicationId)) {
        return 'not_authorized';  // NEW status value
    }

    // Step 2: Then check installation status (existing logic)
    const userApp = this.GetUserApplicationByAppId(applicationId);
    if (!userApp) return 'not_installed';
    return userApp.IsActive ? 'installed_active' : 'installed_inactive';
}

/**
 * Checks if the current user's roles grant access to the application.
 * If no ApplicationRole records exist for the app, access is open (backwards compatible).
 * If records exist, user must have at least one role with CanAccess=1.
 */
public UserHasApplicationAccess(applicationId: string): boolean {
    const appRoles = this._applicationRoles.filter(
        ar => UUIDsEqual(ar.ApplicationID, applicationId)
    );

    // No role records = open access (backwards compatible)
    if (appRoles.length === 0) return true;

    // Check if any of the user's roles have CanAccess=1
    const user = this.CurrentUser;
    if (!user || !user.UserRoles) return false;

    return user.UserRoles.some(ur =>
        appRoles.some(ar =>
            UUIDsEqual(ar.RoleID, ur.RoleID) && ar.CanAccess
        )
    );
}

/**
 * Checks if the current user can admin a specific application.
 */
public UserCanAdminApplication(applicationId: string): boolean {
    const appRoles = this._applicationRoles.filter(
        ar => UUIDsEqual(ar.ApplicationID, applicationId)
    );
    if (appRoles.length === 0) return false; // No admin without explicit grant

    const user = this.CurrentUser;
    if (!user || !user.UserRoles) return false;

    return user.UserRoles.some(ur =>
        appRoles.some(ar =>
            UUIDsEqual(ar.RoleID, ur.RoleID) && ar.CanAdmin
        )
    );
}
```

Also add `MJ: Application Roles` to the engine's `Config()` data loading:

```typescript
{
    Type: 'entity',
    EntityName: 'MJ: Application Roles',
    PropertyName: "_applicationRoles",
    CacheLocal: true
}
```

Add `'not_authorized'` to the `UserApplicationAccessStatus` type.

### 1.4 Enforcement: Update Application Manager (Angular)

**File**: `packages/Angular/Explorer/base-application/src/lib/application-manager.ts`

The `ApplicationManager` currently handles `installed_active`, `installed_inactive`, `not_installed`, and `not_found`. Add handling for the new `not_authorized` status:

```typescript
case 'not_authorized': {
    // User's roles do not grant access to this application
    // Show a "Request Access" or "Not Authorized" message
    this.showNotAuthorizedMessage(appInfo);
    break;
}
```

### 1.5 Admin UI: Application Roles Management

**Location**: `packages/Angular/Explorer/explorer-settings/src/lib/application-management/`

Add a new sub-component within the existing Application Management dashboard. This will be a new tab or expandable section within the app management UI.

**Component**: `ApplicationRolesComponent`

**Functionality**:
- Shows a grid of all Applications with their assigned roles
- For each application, shows which roles have CanAccess and CanAdmin
- Inline editing with checkboxes
- Add/remove role assignments
- Bulk operations: "Grant all standard roles to this app"

**Nav Item**: Add to Admin app's `DefaultNavItems` in metadata:

```json
{
    "Label": "App Roles",
    "Icon": "fa-solid fa-user-shield",
    "ResourceType": "Custom",
    "DriverClass": "ApplicationRolesResource",
    "isDefault": false
}
```

### 1.6 CodeGen: Auto-Assign Roles to New Applications

**File**: `packages/CodeGenLib/src/Config/config.ts`

Add a new config section for application role defaults:

```typescript
const newSchemaDefaultsSchema = z.object({
    CreateNewApplicationWithSchemaName: z.boolean().default(true),
    // NEW: Auto-assign roles when CodeGen creates a new application
    ApplicationRoleDefaults: z.object({
        AutoAddRolesForNewApplications: z.boolean().default(true),
        Roles: z.array(z.object({
            RoleName: z.string(),
            CanAccess: z.boolean(),
            CanAdmin: z.boolean(),
        })).default([
            { RoleName: 'UI', CanAccess: true, CanAdmin: false },
            { RoleName: 'Developer', CanAccess: true, CanAdmin: true },
            { RoleName: 'Integration', CanAccess: true, CanAdmin: false },
        ]),
    }).default({
        AutoAddRolesForNewApplications: true,
        Roles: [
            { RoleName: 'UI', CanAccess: true, CanAdmin: false },
            { RoleName: 'Developer', CanAccess: true, CanAdmin: true },
            { RoleName: 'Integration', CanAccess: true, CanAdmin: false },
        ],
    }),
});
```

**File**: `packages/CodeGenLib/src/Database/manage-metadata.ts`

Update `createNewApplication()` to also insert `ApplicationRole` records based on config:

```typescript
protected async createNewApplication(pool, appID, appName, schemaName, currentUser) {
    // ... existing app creation logic ...

    // NEW: Auto-assign roles
    if (configInfo.newSchemaDefaults.ApplicationRoleDefaults?.AutoAddRolesForNewApplications) {
        await this.addDefaultRolesForApplication(pool, appID, appName);
    }

    return appID;
}

protected async addDefaultRolesForApplication(
    pool: CodeGenConnection,
    appId: string,
    appName: string
): Promise<void> {
    const defaults = configInfo.newSchemaDefaults.ApplicationRoleDefaults;
    if (!defaults?.AutoAddRolesForNewApplications) return;

    const md = new Metadata();
    for (const roleDef of defaults.Roles) {
        const role = md.Roles.find(
            r => r.Name.trim().toLowerCase() === roleDef.RoleName.trim().toLowerCase()
        );
        if (role) {
            const sql = `INSERT INTO ${this.qs(mj_core_schema(), 'ApplicationRole')}
                         (ApplicationID, RoleID, CanAccess, CanAdmin,
                          __mj_CreatedAt, __mj_UpdatedAt)
                         VALUES ('${appId}', '${role.ID}',
                                 ${roleDef.CanAccess ? 1 : 0},
                                 ${roleDef.CanAdmin ? 1 : 0},
                                 ${this.utcNow()}, ${this.utcNow()})`;
            await this.LogSQLAndExecute(pool, sql,
                `Adding role ${roleDef.RoleName} to application ${appName}`);
        } else {
            LogError(`Unable to find Role '${roleDef.RoleName}' for app ${appName}`);
        }
    }
}
```

### 1.7 Metadata Seeding: Application Roles for Shipped Apps

**New Directory**: `metadata/application-roles/`

Create `.mj-sync.json`:
```json
{
    "entity": "MJ: Application Roles",
    "filePattern": "**/.*.json",
    "defaults": {},
    "pull": {
        "createNewFileIfNotFound": true,
        "newFileName": ".application-roles.json",
        "appendRecordsToExistingFile": true,
        "updateExistingRecords": true,
        "lookupFields": {},
        "relatedEntities": {}
    }
}
```

Create `.application-roles.json` seeding standard roles for all shipped apps:

```json
[
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Admin",
            "RoleID": "@lookup:MJ: Roles.Name=Developer",
            "CanAccess": true,
            "CanAdmin": true
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Admin",
            "RoleID": "@lookup:MJ: Roles.Name=Integration",
            "CanAccess": true,
            "CanAdmin": false
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Home",
            "RoleID": "@lookup:MJ: Roles.Name=UI",
            "CanAccess": true,
            "CanAdmin": false
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Home",
            "RoleID": "@lookup:MJ: Roles.Name=Developer",
            "CanAccess": true,
            "CanAdmin": true
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Home",
            "RoleID": "@lookup:MJ: Roles.Name=Integration",
            "CanAccess": true,
            "CanAdmin": false
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Data Explorer",
            "RoleID": "@lookup:MJ: Roles.Name=UI",
            "CanAccess": true,
            "CanAdmin": false
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Data Explorer",
            "RoleID": "@lookup:MJ: Roles.Name=Developer",
            "CanAccess": true,
            "CanAdmin": true
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Data Explorer",
            "RoleID": "@lookup:MJ: Roles.Name=Integration",
            "CanAccess": true,
            "CanAdmin": false
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Chat",
            "RoleID": "@lookup:MJ: Roles.Name=UI",
            "CanAccess": true,
            "CanAdmin": false
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=Chat",
            "RoleID": "@lookup:MJ: Roles.Name=Developer",
            "CanAccess": true,
            "CanAdmin": true
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=AI",
            "RoleID": "@lookup:MJ: Roles.Name=Developer",
            "CanAccess": true,
            "CanAdmin": true
        }
    },
    {
        "fields": {
            "ApplicationID": "@lookup:MJ: Applications.Name=AI",
            "RoleID": "@lookup:MJ: Roles.Name=Integration",
            "CanAccess": true,
            "CanAdmin": false
        }
    }
]
```

> **Note**: Not every app needs role records. Apps without any `ApplicationRole` records remain open-access (backwards compatible). Only seed records for apps that should be restricted. The above is a starter set — the admin UI lets operators customize after deployment.

### 1.8 Phase 1 Deliverables Checklist

All Phase 1 deliverables are complete.

| # | Deliverable | Package/Location | Status |
|---|-------------|-----------------|--------|
| 1 | SQL migration creating `ApplicationRole` table | `migrations/v5/V202604101200__v5.26.x__Application_Roles.sql` | ✅ |
| 2 | Run CodeGen to generate entity class `MJApplicationRoleEntity` | `MJCoreEntities/src/generated/entity_subclasses.ts` | ✅ |
| 3 | Update `UserInfoEngine` with role checking (`UserHasApplicationAccess`, `UserCanAdminApplication`, `'not_authorized'` status) | `MJCoreEntities/src/engines/UserInfoEngine.ts` | ✅ |
| 4 | Add `'not_authorized'` status handling in `ApplicationManager` + `GetAuthorizedSystemApps` filtering for sidebar & settings menu | `Angular/Explorer/base-application/` | ✅ |
| 5 | Build `ApplicationRolesResourceComponent` admin UI | `Angular/Explorer/dashboards/src/ApplicationRoles/` *(located in `dashboards` rather than `explorer-settings`, following the existing Resource component pattern)* | ✅ |
| 6 | Register as resource in Admin app (module declarations + public-api + shell dialog mapping) | `Angular/Explorer/dashboards/src/core-dashboards.module.ts`, `public-api.ts`; `explorer-core` shell | ✅ |
| 7 | Add "App Roles" nav item to Admin app metadata | `metadata/applications/.admin-application.json` | ✅ |
| 8 | Update CodeGen config schema for `ApplicationRoleDefaults` | `CodeGenLib/src/Config/config.ts` | ✅ |
| 9 | Update `createNewApplication()` to auto-assign roles via `addDefaultRolesForApplication()` | `CodeGenLib/src/Database/manage-metadata.ts` | ✅ |
| 10 | Create `metadata/application-roles/` with seed data (12 records for Admin, Home, Data Explorer, Chat, AI) | `metadata/application-roles/` | ✅ |
| 11 | Unit tests for `UserHasApplicationAccess()`, `UserCanAdminApplication()`, `CheckUserApplicationAccess()` (17 tests) | `MJCoreEntities/src/__tests__/UserInfoEngine.applicationRoles.test.ts` | ✅ |
| 12 | Compile all affected packages, run tests | `MJCoreEntities`, `CodeGenLib`, `ng-base-application`, `ng-explorer-core`, `ng-explorer-settings`, `ng-dashboards` — all build clean; 17/17 tests pass | ✅ |

---

## Phase 2: Unified Permission Provider Architecture

### Overview

Phase 2 introduces the **Permission Catalog + Provider Registry** pattern. Each existing permission subsystem keeps its specialized tables but registers as a provider behind a common interface. A central `PermissionEngine` singleton routes permission checks to the right provider and aggregates results for cross-cutting queries. A "Sharing Center" admin UI provides a single pane of glass.

### 2.1 Core Interface: `IPermissionProvider`

**File**: `packages/MJCore/src/generic/permissionInterfaces.ts` (new file)

```typescript
/**
 * Standardized permission actions that all providers map their
 * domain-specific flags onto.
 */
export type PermissionAction =
    | 'Read'
    | 'Create'
    | 'Update'
    | 'Delete'
    | 'Share'
    | 'Execute'
    | 'Admin';

/**
 * Who is being granted/denied a permission.
 */
export type GranteeType = 'User' | 'Role' | 'Everyone' | 'Public';

/**
 * A normalized permission record returned by any provider.
 */
export interface NormalizedPermission {
    /** The permission domain (e.g., 'Entity Permissions', 'Dashboard Permissions') */
    DomainName: string;
    /** The specific resource type within the domain (e.g., entity name, resource type) */
    ResourceType: string;
    /** The ID of the specific resource */
    ResourceID: string;
    /** Human-readable name of the resource */
    ResourceName?: string;
    /** The type of grantee */
    GranteeType: GranteeType;
    /** The ID of the grantee (null for Everyone/Public) */
    GranteeID: string | null;
    /** Human-readable name of the grantee */
    GranteeName?: string;
    /** Which actions are permitted */
    Actions: PermissionAction[];
    /** Whether this is an Allow or Deny record */
    Effect: 'Allow' | 'Deny';
    /** Source-specific permission ID for editing */
    SourceRecordID: string;
    /** Optional expiration */
    ExpiresAt?: Date;
}

/**
 * Result of a single permission check.
 */
export interface PermissionCheckResult {
    Allowed: boolean;
    /** Which provider made the decision */
    DomainName: string;
    /** Why the decision was made */
    Reason: string;
    /** The matching permission record, if any */
    MatchedPermission?: NormalizedPermission;
}

/**
 * Interface that each permission subsystem implements to participate
 * in the unified permission architecture.
 */
export interface IPermissionProvider {
    /**
     * Unique name for this provider's domain.
     * Must match the PermissionDomain.Name in the catalog.
     */
    readonly DomainName: string;

    /**
     * Human-readable description of what this provider covers.
     */
    readonly Description: string;

    /**
     * What grantee types this provider supports.
     */
    readonly SupportedGranteeTypes: GranteeType[];

    /**
     * What actions this provider can evaluate.
     */
    readonly SupportedActions: PermissionAction[];

    /**
     * Whether this provider supports Deny records.
     */
    readonly SupportsDeny: boolean;

    /**
     * Check if a user has a specific permission on a specific resource.
     */
    CheckPermission(
        userId: string,
        resourceType: string,
        resourceId: string,
        action: PermissionAction,
        userRoles: UserRoleInfo[]
    ): PermissionCheckResult;

    /**
     * Get all effective permissions for a user on a specific resource.
     */
    GetEffectivePermissions(
        userId: string,
        resourceType: string,
        resourceId: string,
        userRoles: UserRoleInfo[]
    ): NormalizedPermission[];

    /**
     * Get all resources the user has access to within this domain.
     */
    GetUserResources(
        userId: string,
        userRoles: UserRoleInfo[],
        resourceType?: string
    ): NormalizedPermission[];

    /**
     * Get all permissions on a specific resource (all grantees).
     */
    GetResourcePermissions(
        resourceType: string,
        resourceId: string
    ): NormalizedPermission[];
}
```

### 2.2 Database: `PermissionDomain` Catalog Entity

**New Table: `PermissionDomain`**

```sql
CREATE TABLE ${flyway:defaultSchema}.PermissionDomain (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    ProviderClassName NVARCHAR(500) NOT NULL,
    SupportedGranteeTypes NVARCHAR(200) NOT NULL DEFAULT 'User,Role',
    SupportedActions NVARCHAR(500) NOT NULL DEFAULT 'Read,Create,Update,Delete',
    SupportsDeny BIT NOT NULL DEFAULT 0,
    SupportsExpiration BIT NOT NULL DEFAULT 0,
    SupportsHierarchyInheritance BIT NOT NULL DEFAULT 0,
    IsActive BIT NOT NULL DEFAULT 1,
    DisplayOrder INT NOT NULL DEFAULT 100,
    Icon NVARCHAR(100) NULL,
    CONSTRAINT PK_PermissionDomain PRIMARY KEY (ID),
    CONSTRAINT UQ_PermissionDomain_Name UNIQUE (Name)
);
```

Seed records for each existing subsystem:

| Name | ProviderClassName | SupportedGranteeTypes | SupportedActions | SupportsDeny |
|------|-------------------|----------------------|------------------|-------------|
| Entity Permissions | `EntityPermissionProvider` | Role | Read,Create,Update,Delete | No (Phase 2b adds) |
| Authorizations | `AuthorizationPermissionProvider` | Role | Execute | Yes |
| Application Roles | `ApplicationRolePermissionProvider` | Role | Read,Admin | No |
| Dashboard Permissions | `DashboardPermissionProvider` | User | Read,Update,Delete,Share | No |
| Resource Permissions | `ResourcePermissionProvider` | User,Role | Read,Update,Admin | No |
| Artifact Permissions | `ArtifactPermissionProvider` | User | Read,Update,Delete,Share | No |
| AI Agent Permissions | `AIAgentPermissionProvider` | User,Role | Read,Execute,Update,Delete | No |
| Query Permissions | `QueryPermissionProvider` | Role | Execute | No |
| Access Control Rules | `AccessControlRuleProvider` | User,Role,Everyone,Public | Read,Create,Update,Delete,Share | No |
| API Key Scopes | `APIKeyScopePermissionProvider` | (special) | (pattern-based) | Yes |

### 2.3 `PermissionEngine` Singleton

**File**: `packages/MJCoreEntities/src/engines/PermissionEngine.ts` (new file)

```typescript
@RegisterForStartup()
export class PermissionEngine extends BaseEngine<PermissionEngine> {
    public static get Instance(): PermissionEngine {
        return super.getInstance<PermissionEngine>();
    }

    private _domains: MJPermissionDomainEntity[] = [];
    private _providers: Map<string, IPermissionProvider> = new Map();

    public async Config(forceRefresh?, contextUser?, provider?) {
        // Load PermissionDomain catalog
        const c = [{
            Type: 'entity',
            EntityName: 'MJ: Permission Domains',
            PropertyName: '_domains',
            CacheLocal: true
        }];
        await super.Load(c, provider, forceRefresh, contextUser);

        // Instantiate providers via ClassFactory
        for (const domain of this._domains.filter(d => d.IsActive)) {
            const provider = MJGlobal.Instance.ClassFactory.CreateInstance<IPermissionProvider>(
                IPermissionProvider, domain.ProviderClassName
            );
            if (provider) {
                this._providers.set(domain.Name, provider);
            }
        }
    }

    /**
     * Check a permission across ALL domains. Returns the first definitive
     * answer (Deny from any domain = denied, else check specific domain).
     */
    public CheckPermission(
        userId: string,
        domainName: string,
        resourceType: string,
        resourceId: string,
        action: PermissionAction,
        userRoles: UserRoleInfo[]
    ): PermissionCheckResult {
        const provider = this._providers.get(domainName);
        if (!provider) {
            return { Allowed: false, DomainName: domainName, Reason: 'Unknown domain' };
        }
        return provider.CheckPermission(userId, resourceType, resourceId, action, userRoles);
    }

    /**
     * "What can this user access?" — aggregates across ALL providers.
     * Powers the Sharing Center "User Access Report" view.
     */
    public GetAllUserPermissions(
        userId: string,
        userRoles: UserRoleInfo[]
    ): NormalizedPermission[] {
        const results: NormalizedPermission[] = [];
        for (const [name, provider] of this._providers) {
            results.push(...provider.GetUserResources(userId, userRoles));
        }
        return results;
    }

    /**
     * "Who has access to this resource?" — queries the relevant provider.
     * Powers the Sharing Center "Resource Access Report" view.
     */
    public GetResourcePermissions(
        domainName: string,
        resourceType: string,
        resourceId: string
    ): NormalizedPermission[] {
        const provider = this._providers.get(domainName);
        if (!provider) return [];
        return provider.GetResourcePermissions(resourceType, resourceId);
    }

    /** Get all registered, active domains */
    public get Domains(): MJPermissionDomainEntity[] {
        return this._domains.filter(d => d.IsActive);
    }

    /** Get a specific provider by domain name */
    public GetProvider(domainName: string): IPermissionProvider | undefined {
        return this._providers.get(domainName);
    }
}
```

### 2.4 Example Provider Implementation: `EntityPermissionProvider`

Shows how an existing subsystem wraps itself to satisfy `IPermissionProvider`:

```typescript
@RegisterClass(IPermissionProvider, 'EntityPermissionProvider')
export class EntityPermissionProvider implements IPermissionProvider {
    readonly DomainName = 'Entity Permissions';
    readonly Description = 'CRUD permissions on MJ entities, role-based with optional RLS filters';
    readonly SupportedGranteeTypes: GranteeType[] = ['Role'];
    readonly SupportedActions: PermissionAction[] = ['Read', 'Create', 'Update', 'Delete'];
    readonly SupportsDeny = false;

    CheckPermission(userId, resourceType, resourceId, action, userRoles): PermissionCheckResult {
        const md = new Metadata();
        const entity = md.EntityByName(resourceType);
        if (!entity) return { Allowed: false, DomainName: this.DomainName, Reason: 'Entity not found' };

        // Delegate to existing EntityInfo.GetUserPermissions() logic
        const user = new UserInfo();
        user.ID = userId;
        user._UserRoles = userRoles;
        const perms = entity.GetUserPermisions(user);

        const actionMap: Record<PermissionAction, boolean> = {
            Read: perms.CanRead,
            Create: perms.CanCreate,
            Update: perms.CanUpdate,
            Delete: perms.CanDelete,
            Share: false, Execute: false, Admin: false,
        };

        return {
            Allowed: actionMap[action] ?? false,
            DomainName: this.DomainName,
            Reason: actionMap[action] ? 'Role grants permission' : 'No matching role permission',
        };
    }

    // ... other methods delegate to existing EntityInfo/Metadata APIs
}
```

### 2.5 Sharing Center UI

**Location**: `packages/Angular/Explorer/explorer-settings/src/lib/sharing-center/`

A new admin dashboard added to the Admin app that provides two views:

**View 1: "User Access Report"**
- Select a user → see everything they can access across all domains
- Grouped by domain (Entity Permissions, Dashboards, AI Agents, etc.)
- Shows effective permissions (resolved from roles + direct grants)
- Export to CSV

**View 2: "Resource Access Report"**
- Select a resource type and resource → see all grantees
- Shows who has what level of access
- Shows permission source (owner, direct, role, inherited)
- Quick actions: Grant, Revoke, Modify

**View 3: "Permission Audit"**
- Timeline of permission changes
- Filter by user, domain, resource, date range
- Shows who granted/revoked and when

### 2.6 Phase 2 Sub-Phases

**Phase 2a: Foundation** (after Phase 1 ships)
- Create `IPermissionProvider` interface
- Create `PermissionDomain` table + migration
- Create `PermissionEngine` singleton
- Wrap Entity Permissions + Dashboard Permissions + Resource Permissions as providers
- Basic Sharing Center with User Access Report

**Phase 2b: Full Provider Coverage**
- Wrap remaining subsystems as providers (Artifacts, AI Agents, Collections, etc.)
- Add Resource Access Report to Sharing Center
- Add Deny support to Entity Permissions
- Fix `AuthorizationInfo.UserCanExecute()` to actually evaluate Deny rules

**Phase 2c: Advanced Features**
- Permission Audit timeline view
- Server-side enforcement for sharing subsystems (Dashboard, Artifact, Collection)
- Permission change notifications
- Programmatic unified API for checking permissions from Actions, AI Agents, etc.

### 2.7 Phase 2 Deliverables Checklist

| # | Deliverable | Sub-Phase | Package |
|---|-------------|-----------|---------|
| 1 | `IPermissionProvider` interface | 2a | `MJCore` |
| 2 | `NormalizedPermission` types | 2a | `MJCore` |
| 3 | `PermissionDomain` migration | 2a | `migrations/v5/` |
| 4 | `PermissionEngine` singleton | 2a | `MJCoreEntities` |
| 5 | `EntityPermissionProvider` | 2a | `MJCoreEntities` |
| 6 | `DashboardPermissionProvider` | 2a | `MJCoreEntities` |
| 7 | `ResourcePermissionProvider` | 2a | `MJCoreEntities` |
| 8 | `ApplicationRoleProvider` | 2a | `MJCoreEntities` |
| 9 | Sharing Center - User Access Report | 2a | `Angular/Explorer` |
| 10 | `ArtifactPermissionProvider` | 2b | `MJCoreEntities` |
| 11 | `AIAgentPermissionProvider` | 2b | `MJCoreEntities` |
| 12 | `CollectionPermissionProvider` | 2b | `MJCoreEntities` |
| 13 | `QueryPermissionProvider` | 2b | `MJCoreEntities` |
| 14 | `AccessControlRuleProvider` | 2b | `MJCoreEntities` |
| 15 | Sharing Center - Resource Access Report | 2b | `Angular/Explorer` |
| 16 | Add Deny to Entity Permissions | 2b | Migration + `MJCore` |
| 17 | Fix Authorization Deny evaluation | 2b | `MJCore` |
| 18 | Permission Audit timeline | 2c | `Angular/Explorer` |
| 19 | Server-side sharing enforcement | 2c | `MJServer` |
| 20 | Unified programmatic API | 2c | `MJCore` |

---

## ERD: Entity Relationship Diagrams

### Phase 1 ERD: Application Roles

```
┌─────────────────────┐       ┌─────────────────────────┐       ┌──────────────────┐
│     Application     │       │    ApplicationRole       │       │       Role       │
│─────────────────────│       │─────────────────────────│       │──────────────────│
│ ID            (PK)  │──┐    │ ID              (PK)    │    ┌──│ ID          (PK) │
│ Name                │  │    │ ApplicationID   (FK) ───│────┘  │ Name             │
│ Description         │  └────│ RoleID          (FK) ───│───────│ Description      │
│ Icon                │       │ CanAccess       (bit)   │       │ DirectoryID      │
│ DefaultForNewUser   │       │ CanAdmin        (bit)   │       │ SQLName          │
│ Color               │       │ __mj_CreatedAt          │       └──────────────────┘
│ DefaultSequence     │       │ __mj_UpdatedAt          │             │
│ Status              │       └─────────────────────────┘             │
│ DefaultNavItems     │       UNIQUE(ApplicationID, RoleID)           │
│ ...                 │                                               │
└─────────────────────┘                                               │
        │                                                             │
        │                     ┌─────────────────────────┐             │
        │                     │     UserRole            │             │
        │                     │─────────────────────────│             │
        │                     │ ID              (PK)    │             │
        │                     │ UserID          (FK) ───│──┐          │
        │                     │ RoleID          (FK) ───│──│──────────┘
        │                     └─────────────────────────┘  │
        │                                                  │
        │                     ┌─────────────────────────┐  │
        └─────────────────────│   UserApplication       │  │
                              │─────────────────────────│  │
                              │ ID              (PK)    │  │
                              │ UserID          (FK) ───│──┘
                              │ ApplicationID   (FK)    │
                              │ Sequence        (int)   │
                              │ IsActive        (bit)   │
                              └─────────────────────────┘
```

**Relationship Summary**:
- `Application` 1──N `ApplicationRole` (which roles can access this app)
- `Role` 1──N `ApplicationRole` (which apps this role can access)
- `ApplicationRole` has unique constraint on (ApplicationID, RoleID)
- `UserApplication` remains for UI preferences (display order, active/inactive)
- Authorization flows through: User → UserRole → Role → ApplicationRole → Application

### Phase 2 ERD: Permission Domain Catalog

```
┌──────────────────────────────┐
│      PermissionDomain        │
│──────────────────────────────│
│ ID                    (PK)   │
│ Name                  (UQ)   │  ← e.g. "Entity Permissions", "Dashboard Permissions"
│ Description                  │
│ ProviderClassName            │  ← e.g. "EntityPermissionProvider"
│ SupportedGranteeTypes        │  ← e.g. "User,Role"
│ SupportedActions             │  ← e.g. "Read,Create,Update,Delete"
│ SupportsDeny          (bit)  │
│ SupportsExpiration    (bit)  │
│ SupportsHierarchy     (bit)  │
│ IsActive              (bit)  │
│ DisplayOrder          (int)  │
│ Icon                         │
└──────────────────────────────┘
         │
         │ (conceptual — no FK, providers registered via ClassFactory)
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    IPermissionProvider                                │
│──────────────────────────────────────────────────────────────────────│
│  CheckPermission(user, resourceType, resourceId, action, roles)     │
│  GetEffectivePermissions(user, resourceType, resourceId, roles)     │
│  GetUserResources(user, roles, resourceType?)                       │
│  GetResourcePermissions(resourceType, resourceId)                   │
└──────────────────────────────────────────────────────────────────────┘
         │
    ┌────┴────┬──────────┬──────────────┬────────────────┐
    ▼         ▼          ▼              ▼                ▼
┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐  ┌──────────┐
│Entity  │ │Dashbrd │ │Resource  │ │AI Agent  │  │App Role  │
│Perm    │ │Perm    │ │Perm      │ │Perm      │  │Perm      │
│Provider│ │Provider│ │Provider  │ │Provider  │  │Provider  │
└───┬────┘ └───┬────┘ └────┬─────┘ └────┬─────┘  └────┬─────┘
    │          │           │             │              │
    ▼          ▼           ▼             ▼              ▼
 Existing   Existing    Existing      Existing     New Phase 1
 Tables     Tables      Tables        Tables       Table
```

### Complete Permission Data Model (All Phases)

```
                    ┌─────────────┐
                    │    User     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌────────────┐ ┌────────┐ ┌──────────────────┐
       │ UserRole   │ │UserApp │ │ Direct User Perms│
       └─────┬──────┘ └────────┘ │ (Dashboard,      │
             │                    │  Artifact,       │
             ▼                    │  Collection,     │
       ┌──────────┐              │  List, etc.)     │
       │   Role   │              └──────────────────┘
       └────┬─────┘
            │
    ┌───────┼───────────┬────────────┬──────────────┐
    ▼       ▼           ▼            ▼              ▼
┌───────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Entity │ │Authorizn │ │App Role  │ │Resource  │ │AI Agent  │
│Perm   │ │Role      │ │(NEW)     │ │Perm      │ │Perm      │
│       │ │(Allow/   │ │          │ │          │ │          │
│       │ │ Deny)    │ │          │ │          │ │          │
└───┬───┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
    │
    ▼
┌────────────┐
│ RLS Filter │  (Row-Level Security — SQL WHERE clause templates)
└────────────┘
```

---

## Flow Charts

### BEFORE: Application Access Flow (Current — No Security)

```
User navigates to /app/admin
         │
         ▼
┌─────────────────────────┐
│ AuthGuardService        │
│ Is user authenticated?  │
├────────┬────────────────┤
│  Yes   │      No        │
│        │  → Redirect    │
│        │    to login     │
▼        └────────────────┘
┌─────────────────────────┐
│ ApplicationManager      │
│ CheckUserApplicationAccess()│
│                         │
│ ① Check UserApplication │
│   table for this user   │
│   + this app            │
│                         │
│ ② If no record:         │
│   return 'not_installed'│
│   → auto-create if      │
│     DefaultForNewUser   │
│                         │
│ ③ If record exists:     │
│   return IsActive ?     │
│   'installed_active'    │
│   : 'installed_inactive'│
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ ⚠️ NO ROLE CHECK!       │
│ Any authenticated user  │
│ can access any app.     │
│ UserApplication is just │
│ a UI preference.        │
└─────────────────────────┘
```

### AFTER: Application Access Flow (Phase 1)

```
User navigates to /app/admin
         │
         ▼
┌─────────────────────────┐
│ AuthGuardService        │
│ Is user authenticated?  │
├────────┬────────────────┤
│  Yes   │      No        │
│        │  → Redirect    │
│        │    to login     │
▼        └────────────────┘
┌─────────────────────────┐
│ ApplicationManager      │
│ CheckUserApplicationAccess()│
│                         │
│ ① NEW: Check            │
│   ApplicationRole table │
│   for this app          │
│   ┌─────────────────┐   │
│   │Any AppRole rows?│   │
│   ├──Yes────────────┤   │
│   │ Check user's    │   │
│   │ roles against   │   │
│   │ AppRole records │   │
│   │                 │   │
│   │ Any role with   │   │
│   │ CanAccess=1?    │   │
│   │ ┌──Yes──┐ ┌No──┐│  │
│   │ │Continue│ │DENY ││  │
│   │ │  ↓    │ │return││  │
│   │ │       │ │'not_ ││  │
│   │ │       │ │auth' ││  │
│   │ └───────┘ └──────┘│  │
│   ├──No (0 rows)──────┤   │
│   │ Open access       │   │
│   │ (backwards compat)│   │
│   └───────────────────┘   │
│                         │
│ ② Check UserApplication │
│   (existing logic)      │
│   → 'installed_active'  │
│   → 'installed_inactive'│
│   → 'not_installed'     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ ✅ AUTHORIZED!          │
│ User has role that      │
│ grants app access.      │
│ Load application.       │
└─────────────────────────┘
```

### BEFORE vs AFTER: Permission Check Flow (Phase 2)

**BEFORE — Checking permissions across systems:**

```
Developer code needs to check:
"Can User X share Dashboard Y?"

         │
         ▼
┌─────────────────────────────────────────────┐
│ Developer must KNOW which subsystem to call  │
│                                             │
│ Option A: DashboardEngine                    │
│   .GetDashboardPermissions(dashId, userId)   │
│   → check .CanShare on result               │
│                                             │
│ Option B: ResourcePermissionEngine           │
│   .GetUserResourcePermissionLevel(...)       │
│   → interpret 'Owner' as can-share          │
│                                             │
│ Option C: ArtifactPermissionService          │
│   .checkPermission(artifactId, userId, ...)  │
│                                             │
│ ⚠️ Developer must pick the RIGHT system!    │
│ ⚠️ No way to query across all systems!      │
│ ⚠️ Each returns different data shapes!      │
└─────────────────────────────────────────────┘
```

**AFTER — Unified Permission Engine:**

```
Developer code needs to check:
"Can User X share Dashboard Y?"

         │
         ▼
┌─────────────────────────────────────────────┐
│ PermissionEngine.Instance.CheckPermission(   │
│   userId,                                    │
│   'Dashboard Permissions',                   │
│   'Dashboards',                             │
│   dashboardId,                              │
│   'Share',                                  │
│   user.UserRoles                            │
│ )                                           │
│                                             │
│ → Returns { Allowed: true/false,            │
│             DomainName, Reason }            │
│                                             │
│ ✅ Single API for ALL permission types      │
│ ✅ Consistent result shape                  │
│ ✅ Developer doesn't need to know internals │
└─────────────────────────────────────────────┘

"Show me everything User X has access to"

         │
         ▼
┌─────────────────────────────────────────────┐
│ PermissionEngine.Instance                    │
│   .GetAllUserPermissions(userId, userRoles) │
│                                             │
│ → Returns NormalizedPermission[] from ALL    │
│   registered providers, aggregated          │
│                                             │
│ [                                           │
│   { Domain: "Entity Permissions",           │
│     ResourceType: "Users",                  │
│     Actions: ["Read", "Update"], ... },     │
│   { Domain: "Dashboard Permissions",        │
│     ResourceType: "Dashboards",             │
│     ResourceName: "Sales Dashboard",        │
│     Actions: ["Read", "Share"], ... },      │
│   { Domain: "AI Agent Permissions",         │
│     ResourceType: "AI Agents",              │
│     ResourceName: "Code Reviewer",          │
│     Actions: ["Read", "Execute"], ... },    │
│   ...                                       │
│ ]                                           │
│                                             │
│ ✅ Single call, all domains                 │
│ ✅ Powers Sharing Center UI                 │
└─────────────────────────────────────────────┘
```

---

## UX Mocks

### Mock 1: Application Roles Admin (Phase 1)

Located under **Admin App → App Roles** nav item.

```
┌──────────────────────────────────────────────────────────────────┐
│  Admin > App Roles                                         [+]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Filter: [All Apps        ▼]  [All Roles       ▼]  [Search]  │
│  │                                                               │
│  │  ┌────────────────────────────────────────────────────────┐   │
│  │  │ Application       │ Role        │ Access │ Admin │ ✕   │   │
│  │  ├───────────────────┼─────────────┼────────┼───────┼─────│   │
│  │  │ Admin             │ Developer   │  [✓]   │  [✓]  │  🗑  │   │
│  │  │ Admin             │ Integration │  [✓]   │  [ ]  │  🗑  │   │
│  │  │ ─────────────────────────────────────────────────────  │   │
│  │  │ Home              │ UI          │  [✓]   │  [ ]  │  🗑  │   │
│  │  │ Home              │ Developer   │  [✓]   │  [✓]  │  🗑  │   │
│  │  │ Home              │ Integration │  [✓]   │  [ ]  │  🗑  │   │
│  │  │ ─────────────────────────────────────────────────────  │   │
│  │  │ Data Explorer     │ UI          │  [✓]   │  [ ]  │  🗑  │   │
│  │  │ Data Explorer     │ Developer   │  [✓]   │  [✓]  │  🗑  │   │
│  │  │ Data Explorer     │ Integration │  [✓]   │  [ ]  │  🗑  │   │
│  │  │ ─────────────────────────────────────────────────────  │   │
│  │  │ Chat              │ UI          │  [✓]   │  [ ]  │  🗑  │   │
│  │  │ Chat              │ Developer   │  [✓]   │  [✓]  │  🗑  │   │
│  │  │ ─────────────────────────────────────────────────────  │   │
│  │  │ 💡 Component Studio — No roles assigned (open access)  │   │
│  │  │ 💡 Lists — No roles assigned (open access)             │   │
│  │  └────────────────────────────────────────────────────────┘   │
│  │                                                               │
│  │  [Save Changes]                                               │
│  └───────────────────────────────────────────────────────────────│
│                                                                  │
│  ℹ️ Apps with no role assignments are accessible to all users.   │
│  Add at least one role to restrict access.                       │
└──────────────────────────────────────────────────────────────────┘
```

**Interactions**:
- `[+]` button opens an "Add Role to App" dialog with two dropdowns (Application, Role)
- Checkboxes toggle `CanAccess` / `CanAdmin` inline
- Trash icon removes the `ApplicationRole` record
- Apps with no roles show an info banner at the bottom
- "Save Changes" batch-saves all modifications

### Mock 2: Not Authorized Screen (Phase 1)

When a user tries to access an app they don't have role access to:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                                                                  │
│                   🔒                                             │
│                                                                  │
│             Access Restricted                                    │
│                                                                  │
│     You don't have permission to access the Admin application.   │
│     Contact your administrator to request access.                │
│                                                                  │
│     Your roles: UI                                               │
│     Required: Developer or Integration                           │
│                                                                  │
│             [Go to Home]   [Request Access]                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Mock 3: Sharing Center — User Access Report (Phase 2)

```
┌──────────────────────────────────────────────────────────────────┐
│  Admin > Sharing Center                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [User Access Report]  [Resource Access Report]  [Audit Log]     │
│  ═══════════════════                                             │
│                                                                  │
│  User: [John Smith (john@company.com)  ▼]         [Export CSV]   │
│  Roles: Developer, Integration                                   │
│                                                                  │
│  ┌─ Entity Permissions (142 entities) ──────────────────────┐    │
│  │  Entity              │ Read │ Create │ Update │ Delete   │    │
│  │  Users               │  ✓   │   ✓    │   ✓    │   ✗     │    │
│  │  Accounts            │  ✓   │   ✓    │   ✓    │   ✓     │    │
│  │  AI Agents           │  ✓   │   ✓    │   ✓    │   ✗     │    │
│  │  ... (expandable)                                        │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Application Access (5 apps) ────────────────────────────┐    │
│  │  Application         │ Access │ Admin │ Source           │    │
│  │  Admin               │   ✓    │   ✓   │ Developer role  │    │
│  │  Home                │   ✓    │   ✓   │ Developer role  │    │
│  │  Data Explorer       │   ✓    │   ✓   │ Developer role  │    │
│  │  Chat                │   ✓    │   ✓   │ Developer role  │    │
│  │  Component Studio    │   ✓    │   ✗   │ Open access     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Dashboard Permissions (3 dashboards) ───────────────────┐    │
│  │  Dashboard           │ Read │ Edit │ Delete │ Share      │    │
│  │  Sales Overview      │  ✓   │  ✓   │  ✗    │  ✓        │    │
│  │  Team KPIs           │  ✓   │  ✗   │  ✗    │  ✗        │    │
│  │  My Dashboard        │  ✓   │  ✓   │  ✓    │  ✓  Owner │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ AI Agent Permissions (2 agents) ────────────────────────┐    │
│  │  Agent               │ View │ Run │ Edit │ Delete        │    │
│  │  Code Reviewer       │  ✓   │  ✓  │  ✗   │  ✗           │    │
│  │  Data Analyst        │  ✓   │  ✓  │  ✓   │  ✗           │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Mock 4: Sharing Center — Resource Access Report (Phase 2)

```
┌──────────────────────────────────────────────────────────────────┐
│  Admin > Sharing Center                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [User Access Report]  [Resource Access Report]  [Audit Log]     │
│                        ═══════════════════════                   │
│                                                                  │
│  Domain: [Dashboard Permissions ▼]                               │
│  Resource: [Sales Overview Dashboard ▼]        [Grant Access]    │
│                                                                  │
│  Owner: Sarah Johnson (sarah@company.com)                        │
│                                                                  │
│  ┌─ Who Has Access ─────────────────────────────────────────┐    │
│  │  Grantee           │ Type │ Read │ Edit │ Del │ Share │ ✕│    │
│  │  Sarah Johnson     │ Owner│  ✓   │  ✓   │  ✓  │  ✓   │  │    │
│  │  John Smith        │ User │  ✓   │  ✓   │  ✗  │  ✓   │ 🗑│   │
│  │  Jane Doe          │ User │  ✓   │  ✗   │  ✗  │  ✗   │ 🗑│   │
│  │  Analyst (category)│ Cat. │  ✓   │  ✗   │  ✗  │  ✗   │  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ Permission History ─────────────────────────────────────┐    │
│  │  2026-04-08 14:23  Sarah shared with John (Read+Edit)    │    │
│  │  2026-04-05 09:15  Sarah shared with Jane (Read)         │    │
│  │  2026-03-20 16:42  Sarah created dashboard               │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key File Locations Reference

### Existing Files to Modify (Phase 1)

| File | Change |
|------|--------|
| `packages/MJCoreEntities/src/engines/UserInfoEngine.ts` | Add `UserHasApplicationAccess()`, `UserCanAdminApplication()`, load ApplicationRole data |
| `packages/Angular/Explorer/base-application/src/lib/application-manager.ts` | Handle `'not_authorized'` status |
| `packages/CodeGenLib/src/Config/config.ts` | Add `ApplicationRoleDefaults` to `newSchemaDefaults` |
| `packages/CodeGenLib/src/Database/manage-metadata.ts` | Call `addDefaultRolesForApplication()` in `createNewApplication()` |
| `metadata/applications/.admin-application.json` | Add "App Roles" nav item |

### New Files to Create (Phase 1)

| File | Purpose |
|------|---------|
| `migrations/v5/V202604101200__v5.26.x__Application_Roles.sql` | Database migration |
| `metadata/application-roles/.mj-sync.json` | Metadata sync config |
| `metadata/application-roles/.application-roles.json` | Seed data for shipped apps |
| `packages/Angular/Explorer/explorer-settings/src/lib/application-roles/` | Admin UI component directory |

### New Files to Create (Phase 2)

| File | Purpose |
|------|---------|
| `packages/MJCore/src/generic/permissionInterfaces.ts` | `IPermissionProvider`, `NormalizedPermission` types |
| `packages/MJCoreEntities/src/engines/PermissionEngine.ts` | Unified `PermissionEngine` singleton |
| `packages/MJCoreEntities/src/custom/PermissionProviders/*.ts` | Provider implementations |
| `packages/Angular/Explorer/explorer-settings/src/lib/sharing-center/` | Sharing Center UI |
| `migrations/v5/V[timestamp]__v5.x__Permission_Domains.sql` | PermissionDomain table |
| `metadata/permission-domains/` | Seed data for domain catalog |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking existing app access for users without roles | High | High | Open-by-default: apps with zero ApplicationRole records remain unrestricted |
| Performance: PermissionEngine loading all providers at startup | Medium | Medium | Lazy-load providers; use existing engine caching patterns |
| Migration conflicts with concurrent development | Low | Medium | Use timestamp-based naming; coordinate with team |
| Provider implementation inconsistencies | Medium | Medium | Comprehensive unit tests per provider; shared test harness |
| Phase 2 scope creep | High | Medium | Strict sub-phase boundaries; ship 2a before starting 2b |

---

## Glossary

| Term | Definition |
|------|-----------|
| **Permission Domain** | A registered category of permissions (e.g., "Entity Permissions", "Dashboard Permissions") |
| **Permission Provider** | A TypeScript class implementing `IPermissionProvider` that handles permission logic for one domain |
| **Grantee** | The user, role, or group receiving a permission (User, Role, Everyone, Public) |
| **Normalized Permission** | A standardized permission record format returned by all providers |
| **Permission Action** | A canonical action type: Read, Create, Update, Delete, Share, Execute, Admin |
| **Open Access** | An application with zero `ApplicationRole` records — accessible to all authenticated users |
| **Deny** | An explicit refusal of permission that overrides any Allow grants at the same scope |
| **RLS (Row-Level Security)** | SQL WHERE clause filters that restrict which records a user can see/modify |
| **Sharing Center** | The unified admin UI for viewing and managing permissions across all domains |
