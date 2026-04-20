# Migration Plan: `mj-user-view-grid` to `mj-entity-data-grid` in Custom Forms

**Date**: 2026-01-29
**Scope**: Replace all 7 usages of `<mj-user-view-grid>` in `core-entity-forms/src/lib/custom/` with `<mj-explorer-entity-data-grid>`

---

## Background

### What We're Replacing
- **`mj-user-view-grid`** (`@memberjunction/ng-user-view-grid`) - Legacy Kendo Grid-based component
- **Status**: Marked as DEPRECATED in its own package.json
- **Grid Engine**: Kendo Angular Grid (licensed, heavy)
- **EditMode values**: `"None" | "Save" | "Queue"`

### What We're Replacing With
- **`mj-explorer-entity-data-grid`** - Explorer wrapper around `mj-entity-data-grid`
- **Package**: `@memberjunction/ng-entity-viewer` (already used by generated forms)
- **Grid Engine**: AG Grid Community (free, modern)
- **EditMode values**: `'none' | 'cell' | 'row' | 'batch'`
- **Already used by**: All 168+ generated form templates via CodeGen

### Why `mj-explorer-entity-data-grid` (not raw `mj-entity-data-grid`)
The wrapper adds MJ Explorer navigation - double-click a row to open the record in a new tab via `SharedService.OpenEntityRecord()`. This is the same component CodeGen generates into forms, so we maintain consistency.

---

## API Mapping

### Input Property Translation

| user-view-grid Input | explorer-entity-data-grid Input | Notes |
|---|---|---|
| `[Params]="BuildRelationshipViewParamsByEntityName(...)"` | `[Params]="BuildRelationshipViewParamsByEntityName(...)"` | **Identical** - same RunViewParams |
| `[NewRecordValues]="NewRecordValues(...)"` | `[NewRecordValues]="NewRecordValues(...)"` | **Identical** |
| `[AllowLoad]="true"` or `IsCurrentTab(...)` | `[AllowLoad]="true"` or `IsSectionExpanded(...)` | Same concept, different lazy-load trigger |
| `[EditMode]="GridEditMode()"` | *(see below)* | **Needs mapping** |
| `style="height: 200px;"` | `[Height]="200"` or default | Use `Height` input instead of inline style |

### EditMode Translation

The old `GridEditMode()` returns `"Queue"` when the form is in edit mode and `"None"` otherwise. The new grid uses different enum values:

| Old Value | New Value | Behavior |
|---|---|---|
| `"None"` | `'none'` | Read-only grid |
| `"Save"` | `'row'` | Save immediately after row edit |
| `"Queue"` | `'batch'` | Queue changes (closest equivalent) |

**However**: Looking at how these grids are used in the custom forms, they serve as **related entity browsers** where users view and manage child records. The generated forms already use `mj-explorer-entity-data-grid` with `[ShowToolbar]="false"` and no EditMode at all. The "New" button in the toolbar handles record creation, and editing happens by double-clicking to open the record form.

**Recommendation**: For these custom form usages, we should follow the same pattern as generated forms - no inline editing, just browsing with double-click navigation. This simplifies the migration and matches the established UX pattern.

---

## The 7 Replacements

### 1. AI Prompts Form - Result Cache Grid

**File**: `AIPrompts/ai-prompt-form.component.html` (~line 1039)

**Before:**
```html
<mj-user-view-grid
    [Params]="BuildRelationshipViewParamsByEntityName('AI Result Cache','AIPromptID')"
    [NewRecordValues]="NewRecordValues('AI Result Cache')"
    [AllowLoad]="true"
    [EditMode]="GridEditMode()"
    style="height: 300px;">
</mj-user-view-grid>
```

**After:**
```html
<mj-explorer-entity-data-grid
    [Params]="BuildRelationshipViewParamsByEntityName('AI Result Cache','AIPromptID')"
    [NewRecordValues]="NewRecordValues('AI Result Cache')"
    [AllowLoad]="true"
    [ShowToolbar]="false"
    (AfterDataLoad)="SetSectionRowCount('aiResultCache', $event.totalRowCount)">
</mj-explorer-entity-data-grid>
```

**UX Change**: Grid auto-sizes instead of fixed 300px. Toolbar hidden (matches generated form pattern). Row count tracked for badge display if using collapsible panels.

---

### 2. AI Prompts Form - Agent Prompts Grid

**File**: `AIPrompts/ai-prompt-form.component.html` (~line 1068)

**Before:**
```html
<mj-user-view-grid
    [Params]="BuildRelationshipViewParamsByEntityName('MJ: AI Agent Prompts','PromptID')"
    [NewRecordValues]="NewRecordValues('MJ: AI Agent Prompts')"
    [AllowLoad]="true"
    [EditMode]="GridEditMode()"
    style="height: 200px;">
</mj-user-view-grid>
```

**After:**
```html
<mj-explorer-entity-data-grid
    [Params]="BuildRelationshipViewParamsByEntityName('MJ: AI Agent Prompts','PromptID')"
    [NewRecordValues]="NewRecordValues('MJ: AI Agent Prompts')"
    [AllowLoad]="true"
    [ShowToolbar]="false"
    (AfterDataLoad)="SetSectionRowCount('agentPrompts', $event.totalRowCount)">
</mj-explorer-entity-data-grid>
```

---

### 3. AI Prompts Form - Result Selector Prompts Grid

**File**: `AIPrompts/ai-prompt-form.component.html` (~line 1080)

**Before:**
```html
<mj-user-view-grid
    [Params]="BuildRelationshipViewParamsByEntityName('AI Prompts','ResultSelectorPromptID')"
    [NewRecordValues]="NewRecordValues('AI Prompts')"
    [AllowLoad]="true"
    [EditMode]="GridEditMode()"
    style="height: 200px;">
</mj-user-view-grid>
```

**After:**
```html
<mj-explorer-entity-data-grid
    [Params]="BuildRelationshipViewParamsByEntityName('AI Prompts','ResultSelectorPromptID')"
    [NewRecordValues]="NewRecordValues('AI Prompts')"
    [AllowLoad]="true"
    [ShowToolbar]="false"
    (AfterDataLoad)="SetSectionRowCount('resultSelectorPrompts', $event.totalRowCount)">
</mj-explorer-entity-data-grid>
```

---

### 4. Queries Form - Query Permissions Grid

**File**: `Queries/query-form.component.html` (~line 558)

**Before:**
```html
<mj-user-view-grid
    [Params]="BuildRelationshipViewParamsByEntityName('Query Permissions','QueryID')"
    [NewRecordValues]="NewRecordValues('Query Permissions')"
    [AllowLoad]="true"
    [EditMode]="GridEditMode()">
</mj-user-view-grid>
```

**After:**
```html
<mj-explorer-entity-data-grid
    [Params]="BuildRelationshipViewParamsByEntityName('Query Permissions','QueryID')"
    [NewRecordValues]="NewRecordValues('Query Permissions')"
    [AllowLoad]="true"
    [ShowToolbar]="false">
</mj-explorer-entity-data-grid>
```

**Note**: This grid is only shown in edit mode (guarded by `@if (EditMode)`). The read mode already has a custom card-based permission display.

---

### 5. Templates Form - AI Prompts Tab

**File**: `Templates/templates-form.component.html` (~line 193)

**Before:**
```html
<mj-user-view-grid
    [Params]="BuildRelationshipViewParamsByEntityName('AI Prompts','TemplateID')"
    [NewRecordValues]="NewRecordValues('AI Prompts')"
    [AllowLoad]="IsCurrentTab('AI Prompts')"
    [EditMode]="GridEditMode()">
</mj-user-view-grid>
```

**After:**
```html
<mj-explorer-entity-data-grid
    [Params]="BuildRelationshipViewParamsByEntityName('AI Prompts','TemplateID')"
    [NewRecordValues]="NewRecordValues('AI Prompts')"
    [AllowLoad]="IsCurrentTab('AI Prompts')"
    [ShowToolbar]="false">
</mj-explorer-entity-data-grid>
```

---

### 6. Templates Form - Entity Documents Tab

**File**: `Templates/templates-form.component.html` (~line 207)

**Before:**
```html
<mj-user-view-grid
    [Params]="BuildRelationshipViewParamsByEntityName('Entity Documents','TemplateID')"
    [NewRecordValues]="NewRecordValues('Entity Documents')"
    [AllowLoad]="IsCurrentTab('Entity Documents')"
    [EditMode]="GridEditMode()">
</mj-user-view-grid>
```

**After:**
```html
<mj-explorer-entity-data-grid
    [Params]="BuildRelationshipViewParamsByEntityName('Entity Documents','TemplateID')"
    [NewRecordValues]="NewRecordValues('Entity Documents')"
    [AllowLoad]="IsCurrentTab('Entity Documents')"
    [ShowToolbar]="false">
</mj-explorer-entity-data-grid>
```

---

### 7. EntityActions Form - Entity Action Filters Tab

**File**: `EntityActions/entityaction.form.component.html` (~line 82)

**Before:**
```html
<mj-user-view-grid
    [Params]="BuildRelationshipViewParamsByEntityName('Entity Action Filters')"
    [NewRecordValues]="NewRecordValues('Entity Action Filters')"
    [AllowLoad]="IsCurrentTab('Entity Action Filters')"
    [EditMode]="GridEditMode()">
</mj-user-view-grid>
```

**After:**
```html
<mj-explorer-entity-data-grid
    [Params]="BuildRelationshipViewParamsByEntityName('Entity Action Filters')"
    [NewRecordValues]="NewRecordValues('Entity Action Filters')"
    [AllowLoad]="IsCurrentTab('Entity Action Filters')"
    [ShowToolbar]="false">
</mj-explorer-entity-data-grid>
```

---

## Module Changes

### `custom-forms.module.ts` Changes

**Remove:**
```typescript
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
// ... and remove UserViewGridModule from imports array
```

**Verify present (should already be there via BaseFormsModule):**
The `ExplorerEntityDataGridComponent` is declared in `BaseFormsModule` which is already imported by the generated forms module. We need to verify that `custom-forms.module.ts` imports either `BaseFormsModule` or `EntityViewerModule`.

If not already imported, add:
```typescript
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
// ... add BaseFormsModule to imports array
```

### `package.json` Changes

**Remove from `core-entity-forms/package.json`:**
```json
"@memberjunction/ng-user-view-grid": "3.3.0"
```

**Verify present (should already be there):**
```json
"@memberjunction/ng-base-forms": "3.3.0"
```

---

## UX Impact Assessment

### Visual Changes

```
┌─────────────────────────────────────────────────────────┐
│  BEFORE (Kendo Grid)                                    │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Name          │ Status   │ Created    │ Actions  ▾│  │
│  ├───────────────┼──────────┼────────────┼──────────┤  │
│  │ Cache Entry 1 │ Active   │ 2025-01-01 │ [Edit]   │  │
│  │ Cache Entry 2 │ Expired  │ 2025-01-02 │ [Edit]   │  │
│  │ Cache Entry 3 │ Active   │ 2025-01-03 │ [Edit]   │  │
│  └───────────────┴──────────┴────────────┴──────────┘  │
│  Kendo pagination bar: << < 1 2 3 > >>                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  AFTER (AG Grid)                                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Name          │ Status   │ Created    │           │  │
│  ├───────────────┼──────────┼────────────┼──────────┤  │
│  │ Cache Entry 1 │ Active   │ Jan 1, 25  │           │  │
│  │ Cache Entry 2 │ Expired  │ Jan 2, 25  │           │  │
│  │ Cache Entry 3 │ Active   │ Jan 3, 25  │           │  │
│  └───────────────┴──────────┴────────────┴──────────┘  │
│  (virtual scroll - no pagination bar)                   │
└─────────────────────────────────────────────────────────┘
```

### Key UX Differences

| Aspect | Before (user-view-grid) | After (entity-data-grid) |
|--------|------------------------|--------------------------|
| **Grid engine** | Kendo Angular Grid | AG Grid Community |
| **Pagination** | Page-based (40 rows/page) | Virtual scroll (smooth) |
| **Editing** | Inline cell editing in grid | Double-click to open record form |
| **Row click** | Navigate to record | Single-click selects |
| **Row double-click** | N/A | Opens record in new tab |
| **Toolbar** | Full toolbar (New, Export, etc.) | Hidden (matches generated forms) |
| **Column resize** | Drag to resize | Drag to resize |
| **Sort** | Click header | Click header |
| **Height** | Inline style (fixed px) | Auto-sizing |
| **Date formatting** | Raw date string | Friendly format |
| **Boolean display** | Text "true"/"false" | Checkmark icons |

### Behavioral Change: No More Inline Editing

The biggest UX change is losing inline grid editing. Currently with `EditMode="Queue"`, users can click a cell and edit it directly in the grid. After migration, users must double-click a row to open the full record form.

**Why this is acceptable:**
1. Generated forms already work this way - all 168+ generated related entity grids use `mj-explorer-entity-data-grid` with no inline editing
2. Inline editing in related grids was inconsistent - some forms had it, most didn't
3. The full record form provides better validation, field descriptions, and related entity context
4. This standardizes the UX across all forms

---

## Verification Steps

After making changes:

1. Build `core-entity-forms`: `cd packages/Angular/Explorer/core-entity-forms && npm run build`
2. Build `MJExplorer`: `cd packages/MJExplorer && npm run build`
3. Manual QA:
   - Open an AI Prompt record -> verify Result Cache, Agent Prompts, and Result Selector grids render
   - Open a Query record -> toggle Edit Mode -> verify Permissions grid renders
   - Open a Template record -> click AI Prompts tab -> verify grid renders
   - Open a Template record -> click Entity Documents tab -> verify grid renders
   - Open an Entity Action record -> click Entity Action Filters tab -> verify grid renders
   - Double-click any row in any of these grids -> verify it opens the record

---

## Follow-Up: Broader user-view-grid Removal

After this change, `core-entity-forms` no longer depends on `@memberjunction/ng-user-view-grid`. The remaining consumers need separate work:

| Consumer | Package | Effort |
|----------|---------|--------|
| explorer-core | `@memberjunction/ng-explorer-core` | Medium - main view rendering |
| explorer-modules | `@memberjunction/ng-explorer-modules` | Low - likely transitive |
| explorer-settings | `@memberjunction/ng-explorer-settings` | Low - settings grids |
| dashboards | `@memberjunction/ng-dashboards` | Medium - dashboard grids |
| ask-skip | `@memberjunction/ng-ask-skip` | N/A - deprecated, remove entirely |
| MJExplorer | `mj_explorer` | Low - direct dep, remove after others |

Once all consumers migrate, the entire `@memberjunction/ng-user-view-grid` package can be deprecated on npm and deleted from the repo.
