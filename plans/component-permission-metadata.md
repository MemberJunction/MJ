# Plan: Component Permission Metadata for Skip Components

**Date:** June 8, 2026  
**Author:** Jordan Fanapour  
**Status:** Draft — pending team review  
**Relates to:** Security audit finding 10.5, action item 13.6

---

## 1. Problem Statement

When Skip generates a component, the component embeds RunView and RunQuery calls for specific entities. When a different user loads that component in their MJ environment, those data calls may fail silently if the user lacks read permissions on the referenced entities. The user sees a broken or empty component with no explanation of why.

Additionally, there's no way to evaluate *before rendering* whether a user has sufficient permissions to run a component. This leads to wasted time and a confusing experience.

**Goal:** Components should know what access is required to run them, so the client can quickly evaluate whether the current user has sufficient permissions and provide a clear message if not. Nice-to-have: a button/link to request access from an administrator.

## 2. Current State

### What Already Exists

The infrastructure is largely in place:

- **`dataRequirements`** on `ComponentSpec` already tracks which entities and queries a component needs, including `entities[].name` and `queries[].entityNames`
- **`SkipUserComponentVersion.Specification`** stores the full ComponentSpec JSON, which includes `dataRequirements`
- **MJ's `EntityInfo.GetUserPermisions(user)`** can check read/write/delete permissions for any entity against any user
- **The component registry** (`/components/:namespace/:name`) already serves component specs to the client with full dependency hierarchies
- **All current components are read-only** — no ReadWrite components exist today

### What's Missing

1. **No pre-render permission check** — the client fetches and renders the component before discovering permission failures
2. **No client-side permission evaluation** before rendering
3. **No user-facing message** explaining which permissions are missing
4. **No centralized query permission check** usable from both client and server
5. **No "request access" flow**

## 3. Proposed Design

### 3.1 No Dedicated Column — Derive from dataRequirements

The permission requirements are fully derivable from the `dataRequirements` already present in the ComponentSpec. The client always loads the full spec before rendering, so there's no need for a separate denormalized column. This avoids:
- A migration
- Keeping a denormalized field in sync on revisions
- Backfill of existing components

The client simply reads `spec.dataRequirements.entities` and `spec.dataRequirements.queries` from the spec it already has and evaluates permissions locally.

### 3.2 Centralize Query Permission Logic in MJQueryEntityExtended

Add a `UserCanExecute(user: UserInfo)` method to `MJQueryEntityExtended` that encapsulates the full permission logic:

1. If the query has explicit Query Permissions, check if the user has a matching role (existing `UserHasRunPermissions()`)
2. If no explicit Query Permissions are defined, check entity read permissions for all referenced entities via the Query Entities bridge

This mirrors the logic already implemented in `GenericDatabaseProvider.ValidateQueryForExecution()` but makes it available as a reusable method callable from both the Angular client and the server. The `GenericDatabaseProvider` can then delegate to this method instead of maintaining its own inline logic.

**Location:** `MJ/packages/MJCoreEntities/src/custom/MJQueryEntityExtended.ts`

```typescript
/**
 * Checks whether a user can execute this query, considering both
 * query-level permissions and entity-level read permissions.
 *
 * If the query has explicit Query Permissions, those take precedence
 * (stored-procedure semantics — the query author controls access).
 * If no Query Permissions are defined, falls back to checking that
 * the user has read permission on all referenced entities.
 */
public UserCanExecute(user: UserInfo): boolean {
    const permissions = this.QueryPermissions;

    // Explicit query permissions override entity checks
    if (permissions && permissions.length > 0) {
        return this.UserHasRunPermissions(user);
    }

    // No explicit permissions — check entity read access
    const queryEntities = this.QueryEntities;
    if (!queryEntities || queryEntities.length === 0) {
        return true;  // No entity associations — allow (backward compat)
    }

    for (const qe of queryEntities) {
        const entityInfo = Metadata.Provider.Entities.find(
            e => e.ID === qe.EntityID
        );
        if (!entityInfo) continue;  // Stale reference — skip

        const perms = entityInfo.GetUserPermisions(user);
        if (!perms || !perms.CanRead) {
            return false;
        }
    }

    return true;
}
```

### 3.3 Client-Side Permission Evaluation

On the MJ client, before rendering a component, evaluate the user's permissions against the component's `dataRequirements`:

```typescript
interface PermissionEvaluationResult {
    canRun: boolean;
    missingEntities: string[];
    missingQueries: string[];
}

function evaluateComponentPermissions(
    spec: ComponentSpec,
    currentUser: UserInfo
): PermissionEvaluationResult {
    const missingEntities: string[] = [];
    const missingQueries: string[] = [];
    const dataReqs = spec.dataRequirements;
    if (!dataReqs) return { canRun: true, missingEntities: [], missingQueries: [] };

    // Check entity permissions (all current components are read-only)
    for (const entityReq of dataReqs.entities ?? []) {
        const entityInfo = Metadata.EntityByName(entityReq.name);
        if (!entityInfo) continue;

        const perms = entityInfo.GetUserPermisions(currentUser);
        if (!perms?.CanRead) {
            missingEntities.push(entityReq.name);
        }
    }

    // Check query permissions using centralized logic
    for (const queryReq of dataReqs.queries ?? []) {
        if (!queryReq.name) continue;
        const queryInfo = QueryEngine.Instance.Queries.find(
            q => q.Name === queryReq.name
        );
        if (!queryInfo) continue;

        if (!queryInfo.UserCanExecute(currentUser)) {
            missingQueries.push(queryReq.name);
        }
    }

    return {
        canRun: missingEntities.length === 0 && missingQueries.length === 0,
        missingEntities,
        missingQueries,
    };
}
```

This check runs entirely on the client using already-loaded metadata — no additional server call needed.

**Where to place this:** A utility function in `MJ/packages/InteractiveComponents/src/` or alongside the component artifact viewer, so it's available wherever components are rendered.

### 3.4 Recursive Dependency Check

Components can have dependencies (child components). The permission check should walk the full dependency tree:

```typescript
function evaluateComponentPermissionsRecursive(
    spec: ComponentSpec,
    currentUser: UserInfo
): PermissionEvaluationResult {
    const result = evaluateComponentPermissions(spec, currentUser);

    for (const dep of spec.dependencies ?? []) {
        const depResult = evaluateComponentPermissionsRecursive(dep, currentUser);
        result.missingEntities.push(...depResult.missingEntities);
        result.missingQueries.push(...depResult.missingQueries);
    }

    // Deduplicate
    result.missingEntities = [...new Set(result.missingEntities)];
    result.missingQueries = [...new Set(result.missingQueries)];
    result.canRun = result.missingEntities.length === 0 && result.missingQueries.length === 0;

    return result;
}
```

### 3.5 User-Facing Permission Messages

When a user lacks permissions, show a clear message before rendering:

**Insufficient permissions view:**
```
This component requires access that you don't currently have:

  Entities:
    • Sales Opportunities
    • Revenue Forecasts

  Queries:
    • SalesByQuarter

Contact your administrator to request access.

[Request Access]   [View Component Anyway]
```

- **"Request Access"** (nice-to-have, Phase 2): Creates a notification or email to the MJ admin listing the user, the component, and the required permissions. A simple mailto link as a first pass.
- **"View Component Anyway"**: Loads the component knowing some data sections will be empty. Some users may have partial access and still find the component useful.

### 3.6 Handling Shared Components

When a user shares a component with others, the permission evaluation enables the recipient to immediately understand what access they need:

```
This component requires read access to:
  ✓ Contacts (you have access)
  ✓ Organizations (you have access)
  ✗ Sales Opportunities (you need access)
```

## 4. Implementation Phases

### Phase 1: Core Logic
1. Add `UserCanExecute(user)` to `MJQueryEntityExtended` — centralizes query permission logic
2. Refactor `GenericDatabaseProvider.ValidateQueryForExecution()` to delegate to `UserCanExecute()`
3. Add `evaluateComponentPermissions()` utility function in MJ's InteractiveComponents or React runtime package
4. Build and test

**Effort:** ~1-2 days

### Phase 2: Client Integration
1. Integrate permission evaluation into the component artifact viewer (before rendering)
2. Show permission warning with missing entities/queries
3. Add "View Component Anyway" option for partial access
4. Add "Request Access" button (mailto link or MJ notification as first pass)

**Effort:** ~2 days

## 5. Data Flow Summary

```
RENDER TIME:
  Client loads component spec from registry (existing flow)
  Client calls evaluateComponentPermissionsRecursive(spec, currentUser)
    → Walks dataRequirements.entities → checks EntityInfo.GetUserPermisions()
    → Walks dataRequirements.queries → checks MJQueryEntityExtended.UserCanExecute()
    → Recurses into dependencies
  If canRun → render component normally
  If !canRun → show permission message listing missing entities/queries
  User can request access or view anyway with partial data
```

No server-side changes needed beyond the centralized `UserCanExecute()` method. No migration. No backfill.
