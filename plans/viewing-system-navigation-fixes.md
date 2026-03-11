# Fix: Data Explorer & MJ Explorer View Navigation Issues

## Context

When navigating between views/entities in the Data Explorer and MJ Explorer, two main problems occur:

1. **Stale State**: The grid retains column definitions, sort/filter state, and field references from the previous entity, causing errors when those fields don't exist on the newly selected entity.
2. **URL Not Updating**: The browser URL doesn't always reflect the currently selected entity/view, preventing deep linking and breaking back/forward navigation.

These issues stem from multiple layers of the component hierarchy failing to properly reset state and communicate navigation changes.

---

## Issues Found

### Issue 1: `GridState` setter ignores null (CRITICAL - Primary stale state cause)
**File**: `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts:337-344`

The `GridState` @Input setter only processes truthy values. When switching to an entity without a saved grid state, `null` is passed but the old `_gridState` persists:

```typescript
// CURRENT CODE (BROKEN)
set GridState(value: ViewGridState | null) {
    if (!!value) {  // <-- null is ignored, old state persists!
        const previousValue = this._gridState;
        this._gridState = value;
        if (value !== previousValue) {
            this.onGridStateChanged();
        }
    }
}
```

**Impact**: Old column definitions from Entity A are used when displaying Entity B. The `buildAgColumnDefs()` method at line 2052 checks `this._gridState?.columnSettings?.length` first, so stale grid state takes precedence over fresh entity metadata. Fields that exist in Entity A but not Entity B are silently skipped (line ~2094: `if (!field) continue`), producing an incomplete/wrong grid.

### Issue 2: `UserViewResource.Data` setter only loads once (CRITICAL for MJ Explorer)
**File**: `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/view-resource.component.ts:165-171`

The `dataLoaded` flag prevents re-initialization when the `Data` property changes:

```typescript
// CURRENT CODE (BROKEN)
override set Data(value: ResourceData) {
    super.Data = value;
    if (!this.dataLoaded) {  // <-- Only loads on FIRST set
        this.dataLoaded = true;
        this.loadView();
    }
}
```

**Impact**: When the tab system reuses a `UserViewResource` with different `Data` (new view ID, new entity), `loadView()` is never called again. The component displays stale data from the first view. All internal state (`entityInfo`, `viewEntity`, `gridState`) remains from the previous view.

### Issue 3: URL doesn't always include query params for Data Explorer entity selection
**Files**:
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts:2480-2513`
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts:959-1046`

The `updateUrl()` method calls `navigationService.UpdateActiveTabQueryParams()` which stores params in the tab's `configuration.queryParams`. The shell's `buildResourceUrl()` at line 985-996 builds nav-item URLs and appends query params from `configuration.queryParams` when present.

The flow is: `updateUrl()` -> `UpdateActiveTabQueryParams()` -> tab config update -> workspace config change -> `syncUrlWithWorkspace()` -> `buildResourceUrl()`.

Potential issues:
- The workspace config change subscription might not fire after internal query param updates
- Timing: `syncUrlWithWorkspace()` has a debounce and suppress mechanism that could skip updates
- The `buildResourceUrl()` code at line 991 does check for `queryParams`, so the URL building logic itself is correct

### Issue 4: `DashboardResource` and `DataExplorerResource` also use one-time `dataLoaded` flag
**Files**:
- `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/dashboard-resource.component.ts:481-487`
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-resource.component.ts:70-76`

Same pattern as Issue 2 - both resource wrappers only process `Data` once. If the tab system ever reuses these components with different data, they won't re-initialize.

### Issue 5: Entity-viewer `entity` setter doesn't invalidate stale view entity
**File**: `packages/Angular/Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.ts:99-120`

When the entity changes, the viewer resets pagination and reloads data, but doesn't clear `_viewEntity` if it belongs to the old entity. The stale `viewEntity` (which references old entity fields in its WhereClause, SortState, etc.) can cause incorrect queries.

---

## Task List

### Task 1: Fix `GridState` setter to handle null values
**File**: `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts`
**Priority**: CRITICAL
**Effort**: Small

Remove the `if (!!value)` guard and handle both truthy and null/undefined values:

```typescript
@Input()
set GridState(value: ViewGridState | null) {
    const previousValue = this._gridState;
    this._gridState = value;
    if (value !== previousValue) {
        if (value) {
            this.onGridStateChanged();
        } else if (previousValue) {
            // Grid state was cleared - rebuild columns from entity metadata
            this.buildAgColumnDefs();
        }
    }
}
```

**Why**: This is the single most impactful fix. When `currentGridState` is set to `null` (entity has no saved view state), the grid will properly drop old columns and regenerate from the new entity's metadata.

### Task 2: Allow re-initialization in `UserViewResource` Data setter
**File**: `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/view-resource.component.ts`
**Priority**: HIGH
**Effort**: Small

Detect meaningful changes in the `Data` setter and re-load when the view ID or entity changes:

```typescript
override set Data(value: ResourceData) {
    const previousRecordId = super.Data?.ResourceRecordID;
    const previousEntity = super.Data?.Configuration?.Entity;
    super.Data = value;

    const newRecordId = value?.ResourceRecordID;
    const newEntity = value?.Configuration?.Entity;

    // Load on first set, or when the view/entity has changed
    if (!this.dataLoaded || newRecordId !== previousRecordId || newEntity !== previousEntity) {
        this.dataLoaded = true;
        // Reset state before loading new view
        this.entityInfo = null;
        this.viewEntity = null;
        this.gridState = null;
        this.errorMessage = null;
        this.loadView();
    }
}
```

### Task 3: Allow re-initialization in `DashboardResource` Data setter
**File**: `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/dashboard-resource.component.ts`
**Priority**: HIGH
**Effort**: Small

Same pattern - detect meaningful changes and re-load:

```typescript
override set Data(value: ResourceData) {
    const previousRecordId = super.Data?.ResourceRecordID;
    super.Data = value;

    const newRecordId = value?.ResourceRecordID;

    if (!this.dataLoaded || newRecordId !== previousRecordId) {
        this.dataLoaded = true;
        // Destroy previous component before loading new one
        if (this.componentRef) {
            this.componentRef.destroy();
            this.componentRef = null;
        }
        this.clearError();
        this.configDashboard = null;
        this.viewerInstance = null;
        this.loadDashboard();
    }
}
```

### Task 4: Allow re-initialization in `DataExplorerResource` Data setter
**File**: `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-resource.component.ts`
**Priority**: MEDIUM
**Effort**: Small

```typescript
override set Data(value: ResourceData) {
    const previousConfig = JSON.stringify(super.Data?.Configuration || {});
    super.Data = value;

    const newConfig = JSON.stringify(value?.Configuration || {});

    if (!this._dataLoaded || previousConfig !== newConfig) {
        this._dataLoaded = true;
        this.loadConfiguration();
    }
}
```

### Task 5: Clear stale view entity on entity change in entity-viewer
**File**: `packages/Angular/Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.ts`
**Priority**: MEDIUM
**Effort**: Small

Add view entity invalidation when the entity changes to a different entity:

```typescript
set entity(value: EntityInfo | null) {
    const previousEntity = this._entity;
    this._entity = value;
    this.detectDateFields();

    if (this._initialized) {
        // If entity changed to a different entity, clear stale view entity
        if (value && previousEntity && value.ID !== previousEntity.ID) {
            if (this._viewEntity && this._viewEntity.EntityID !== value.ID) {
                this._viewEntity = null;
            }
        }

        if (value && !this._records) {
            this.resetPaginationState();
            this.cdr.detectChanges();
            this.loadData();
        } else if (!value) {
            this.internalRecords = [];
            this.totalRecordCount = 0;
            this.filteredRecordCount = 0;
            this.resetPaginationState();
            this.cdr.detectChanges();
        }
    }
}
```

### Task 6: Investigate and fix URL sync for Data Explorer entity changes
**Files**:
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` (lines 510-545, 959-996)
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts` (line 2480-2513)
- `packages/Angular/Explorer/shared/src/lib/navigation.service.ts` (line 693-701)
**Priority**: HIGH
**Effort**: Medium

Trace the full `updateUrl()` -> shell URL sync pipeline:
1. Verify `UpdateActiveTabQueryParams()` properly triggers workspace config change events
2. Verify `syncUrlWithWorkspace()` fires after query param updates (check debounce/suppress logic)
3. Verify `buildResourceUrl()` appends query params for nav-item tabs
4. Add logging if needed to identify where the chain breaks
5. Fix the broken link in the chain

This task requires runtime debugging to pinpoint the exact failure. The code paths exist but may be short-circuited by timing/suppress logic.

---

## Files Modified Summary

| Task | File | Change |
|------|------|--------|
| 1 | `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts` | Fix `GridState` setter null handling |
| 2 | `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/view-resource.component.ts` | Re-initialize on `Data` change |
| 3 | `packages/Angular/Explorer/explorer-core/src/lib/resource-wrappers/dashboard-resource.component.ts` | Re-initialize on `Data` change |
| 4 | `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-resource.component.ts` | Re-initialize on `Data` change |
| 5 | `packages/Angular/Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.ts` | Clear stale view entity on entity change |
| 6 | `packages/Angular/Explorer/explorer-app/src/lib/explorer-app.component.html` | Add hidden router-outlet for URL activation |
| 7 | `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` | Fix initial URL sync timing after initialization |
| 8 | `packages/Angular/Explorer/base-application/src/lib/base-application.ts` | Add appName/navItemName to CreateDefaultTab() config |

---

## Verification

### Manual Testing
1. **Stale State Test**: Open Data Explorer, select Entity A (e.g., Users), note columns. Switch to Entity B (e.g., Actions). Verify:
   - Grid columns reflect Entity B fields, not Entity A
   - No console errors about missing fields
   - Record count updates correctly
   - Sorting and filtering work with Entity B fields

2. **Grid State Persistence Test**: Select Entity A, resize/reorder columns, switch to Entity B, switch back to Entity A. Verify Entity A's column layout is preserved (via user default settings).

3. **URL Update Test**: Select an entity in Data Explorer, verify URL includes `?entity=EntityName`. Select a different entity, verify URL updates. Use browser back button, verify previous entity loads correctly.

4. **View Navigation Test** (MJ Explorer): Open a saved view for Entity A, then navigate to a saved view for Entity B. Verify data refreshes completely with correct columns and data.

5. **Dashboard Re-load Test**: Navigate to a dashboard, then to a different dashboard (if tab reuse occurs). Verify the new dashboard loads.

### Build Verification
```bash
# Build affected packages (in dependency order)
cd packages/Angular/Generic/entity-viewer && npm run build
cd packages/Angular/Explorer/explorer-core && npm run build
cd packages/Angular/Explorer/dashboards && npm run build

# Run tests
cd packages/Angular/Generic/entity-viewer && npm run test
cd packages/Angular/Explorer/explorer-core && npm run test
```
