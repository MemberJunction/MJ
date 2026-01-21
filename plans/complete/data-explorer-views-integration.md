# Data Explorer + User Views Integration Plan

**Created:** 2024-11-30
**Completed:** 2025-11-30
**Status:** Completed
**Target Version:** v2.123.x

---

## Executive Summary

This plan integrates MemberJunction's powerful User Views system into the new Data Explorer dashboard, creating a unified, world-class data exploration experience. Users will be able to save, switch, and share customized views of their data directly within Data Explorer, with support for both grid and card display modes.

---

## Background & Context

### Current State

**User Views System (Legacy):**
- Fully-featured view configuration: columns, filters (Kendo-style with AND/OR), sorting
- Smart Filter with AI-powered natural language filtering
- View sharing via ResourcePermissions
- Stored in `UserView` entity with `GridState`, `FilterState`, `SortState` JSON fields
- Executed via `RunView`/`RunViews` classes
- UI: `UserViewGridComponent` + `UserViewPropertiesDialogComponent` (6-tab modal)

**Data Explorer (New):**
- Modern, streamlined UX with grid and card views
- Uses `mj-entity-viewer` composite component
- Simple `UserSearchString` filtering (additive text search)
- Per-entity filter caching in state service
- URL-based deep linking
- Detail panel for record preview
- No concept of saved views - just transient filter states

### Gap Analysis

| Feature | User Views | Data Explorer | Unified Vision |
|---------|-----------|---------------|----------------|
| Saved configurations | ✅ | ❌ | ✅ |
| Column customization | ✅ | ❌ | ✅ |
| Advanced filtering | ✅ (Kendo) | ❌ | ✅ |
| Smart Filter (AI) | ✅ | ❌ | ✅ (Front & Center) |
| Quick search (additive) | ✅ | ✅ | ✅ |
| Grid view | ✅ | ✅ | ✅ |
| Card view | ❌ | ✅ | ✅ (New!) |
| View sharing | ✅ | ❌ | ✅ |
| Modern sliding panel | ❌ | N/A | ✅ (New!) |
| Mobile responsive | ❌ | ✅ | ✅ |
| Open in tab | ✅ | ❌ | ✅ |

---

## Design Decisions

### 1. Default View Naming
- Default view (no saved view selected) displays as "(Default)"
- Not a real saved view - just entity defaults
- When user modifies default, auto-create a view named "Custom" with help tooltip

### 2. View Selector Location
- In Data Explorer header bar, always visible
- Dropdown shows: (Default), My Views, Shared Views
- Icon-only "Open in Tab" button (↗️)

### 3. Smart Filter Prominence
- Smart Filter (AI) is the primary filtering method, front and center
- Quick search is secondary (additive UserSearchString)
- Advanced Kendo filter builder available for power users

### 4. Additive Filtering Architecture
- View's `WhereClause` = saved business rule filters
- `UserSearchString` = quick search, layered on top
- Combined with AND: `(ViewWhereClause) AND (UserSearchString matches)`

### 5. View Modification Workflow
- Changes are NOT auto-saved (expensive on large tables)
- Explicit save required via button
- Shared views: user cannot modify (read-only unless granted Edit permission via ResourcePermissions)
- Modifying default creates new "Custom" view with onboarding tooltip

### 6. Card Configuration
- New `CardState` field on UserView entity (consistent with GridState, FilterState, SortState naming)
- Allows customizing card layout per view
- Stores: titleField, subtitleField, displayFields, thumbnailFields, etc.

### 7. Sliding Panel for Configuration
- Not a modal dialog - sliding panel from right
- User sees live preview of changes
- Mobile: full-screen overlay with back button

### 8. Advanced Info Visibility
- LLM-generated filter explanation and raw WHERE clause available
- Hidden by default, expandable for power users

---

## Schema Changes

### Migration: Add CardState to UserView

**File:** `V202411301200__v2.123.x__UserView_CardConfiguration.sql`

```sql
-- Add CardState field to UserView table
-- Stores card display configuration for views in Data Explorer
-- Named consistently with GridState, FilterState, SortState

ALTER TABLE ${flyway:defaultSchema}.UserView
ADD CardState NVARCHAR(MAX) NULL;

-- Add extended property for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration for card display mode. Contains titleField, subtitleField, descriptionField, displayFields[], thumbnailFields[], badgeField, layout (compact/standard/expanded), and other card rendering options.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserView',
    @level2type = N'COLUMN', @level2name = N'CardState';
```

### CardState JSON Schema

```typescript
interface CardConfiguration {
  /** Primary display field (entity name field by default) */
  titleField: string;

  /** Secondary field shown below title */
  subtitleField?: string;

  /** Longer text field for description area */
  descriptionField?: string;

  /** Fields to show as metadata items on card */
  displayFields: string[];

  /** Image fields to try in order (fallback chain) */
  thumbnailFields?: string[];

  /** Field to show as status/priority badge */
  badgeField?: string;

  /** Card density */
  layout?: 'compact' | 'standard' | 'expanded';

  /** Whether to show created/updated timestamp */
  showTimestamp?: boolean;
}
```

---

## Implementation Phases

### Phase 0: Schema Migration (BLOCKING - Must Complete First)
**Owner:** Database
**Dependencies:** None
**Deliverables:**
1. Create migration file: `V202411301200__v2.123.x__UserView_CardConfiguration.sql`
2. Run migration
3. Run CodeGen to update ORM layer

**⚠️ STOP POINT:** Do not proceed until CodeGen completes and `CardState` property is available on `UserViewEntity`.

---

### Phase 1: View Selector Component
**Dependencies:** Phase 0
**Estimated Effort:** Medium

#### Tasks:
1. **Create ViewSelectorComponent** (`packages/Angular/Explorer/dashboards/src/DataExplorer/components/view-selector/`)
   - Dropdown showing: (Default), My Views section, Shared Views section
   - Load views for current entity via `RunView` on `User Views` entity
   - Filter by current user and shared views
   - "Save Current View" action
   - "Manage Views" action (opens view browser)
   - Emit events: `viewSelected`, `saveRequested`, `manageViewsRequested`

2. **Integrate into DataExplorerDashboard**
   - Add view selector to header bar
   - Track `selectedViewId` in `DataExplorerState`
   - When view selected, load its configuration and apply to `mj-entity-viewer`

3. **Open in Tab Button**
   - Icon-only button (↗️) next to view selector
   - Uses `NavigationService.OpenResource('User Views', viewId)`
   - Only visible when a saved view is selected (not default)

4. **Update ExplorerStateService**
   - Add `selectedViewId: string | null` to state
   - Add `viewModified: boolean` indicator
   - Persist selected view ID per entity in `entityCache`

#### Files to Create/Modify:
- `NEW: dashboards/src/DataExplorer/components/view-selector/view-selector.component.ts`
- `NEW: dashboards/src/DataExplorer/components/view-selector/view-selector.component.html`
- `NEW: dashboards/src/DataExplorer/components/view-selector/view-selector.component.css`
- `MODIFY: dashboards/src/DataExplorer/data-explorer-dashboard.component.ts`
- `MODIFY: dashboards/src/DataExplorer/data-explorer-dashboard.component.html`
- `MODIFY: dashboards/src/DataExplorer/services/explorer-state.service.ts`
- `MODIFY: dashboards/src/DataExplorer/models/explorer-state.interface.ts`

---

### Phase 2: View Data Loading Integration
**Dependencies:** Phase 1
**Estimated Effort:** Medium

#### Tasks:
1. **Extend mj-entity-viewer for View Loading**
   - Add `viewEntity: UserViewEntityExtended` input (optional)
   - When provided, use view's `WhereClause` as `ExtraFilter`
   - Apply `GridState` columns to grid
   - Apply `SortState` to `OrderBy`
   - Apply `CardState` to card template

2. **Implement Additive Filtering**
   - View's `WhereClause` + `UserSearchString` combined
   - Update RunView call in entity-viewer to pass both
   - Quick search box labeled "Search within this view..."

3. **Handle Default View**
   - When `selectedViewId` is null, use entity defaults
   - No filter applied, default columns, default sort

#### Files to Modify:
- `MODIFY: Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.ts`
- `MODIFY: Generic/entity-viewer/src/lib/types.ts`
- `MODIFY: Generic/entity-viewer/src/lib/entity-grid/entity-grid.component.ts`
- `MODIFY: Generic/entity-viewer/src/lib/entity-cards/entity-cards.component.ts`

---

### Phase 3: View Configuration Sliding Panel
**Dependencies:** Phase 2
**Estimated Effort:** Large

#### Tasks:
1. **Create ViewConfigPanelComponent**
   - Sliding panel from right (not modal)
   - Tabs: Columns, Filters, Sorting, Card Layout
   - Live preview - changes reflected immediately in grid/cards

2. **Columns Tab**
   - List of entity fields with checkboxes for visibility
   - Drag-drop reordering (using Kendo Sortable)
   - Width configuration (optional)
   - Shows entity's `DefaultInView` fields initially

3. **Filters Tab**
   - **Smart Filter section (prominent):**
     - Natural language input textarea
     - "Apply Smart Filter" button
     - Shows generated explanation and WHERE clause (expandable)
   - **Advanced Filters section (collapsed by default):**
     - Kendo Filter component for AND/OR filter building
     - Field-specific operators
   - **Active Filters Strip:**
     - Visual pills for each active filter condition
     - Click ✕ to remove individual filters
     - Click pill to edit in filter builder

4. **Sorting Tab**
   - Add/remove sort rules
   - Field selector dropdown
   - Direction toggle (Asc/Desc)
   - Drag-drop to reorder sort priority

5. **Card Layout Tab** (only visible when in card mode)
   - Title field selector
   - Subtitle field selector
   - Display fields multi-select
   - Thumbnail field selector
   - Badge field selector
   - Layout density selector (compact/standard/expanded)

6. **Save Actions**
   - "Save" button (updates existing view, disabled for shared views without edit permission)
   - "Save As New View" button (creates new view)
   - "Discard Changes" button
   - "Reset to Default" button (when on default view)

7. **Responsive Design**
   - Desktop: Panel takes 350-400px width
   - Tablet: Panel takes 50% width
   - Mobile: Full-screen overlay with back button

#### Files to Create:
- `NEW: dashboards/src/DataExplorer/components/view-config-panel/view-config-panel.component.ts`
- `NEW: dashboards/src/DataExplorer/components/view-config-panel/view-config-panel.component.html`
- `NEW: dashboards/src/DataExplorer/components/view-config-panel/view-config-panel.component.css`
- `NEW: dashboards/src/DataExplorer/components/view-config-panel/columns-tab.component.ts`
- `NEW: dashboards/src/DataExplorer/components/view-config-panel/filters-tab.component.ts`
- `NEW: dashboards/src/DataExplorer/components/view-config-panel/sorting-tab.component.ts`
- `NEW: dashboards/src/DataExplorer/components/view-config-panel/card-layout-tab.component.ts`
- `NEW: dashboards/src/DataExplorer/components/active-filters-strip/active-filters-strip.component.ts`

---

### Phase 4: View CRUD Operations
**Dependencies:** Phase 3
**Estimated Effort:** Medium

#### Tasks:
1. **Create New View**
   - When user modifies "(Default)" settings, auto-create view named "Custom"
   - Show onboarding tooltip explaining views (AppCues-style, non-blocking)
   - Save button creates new UserView record
   - Set `UserID` to current user, `EntityID` to current entity

2. **Update Existing View**
   - Load view, modify, save
   - Check `UserCanEdit` permission (owner or ResourcePermission with Edit)
   - If shared view without edit: prompt to "Save As New View"

3. **Delete View**
   - Confirmation dialog
   - Only available for owned views
   - After delete, switch to "(Default)"

4. **Duplicate View**
   - Creates copy of view with "(Copy)" suffix
   - Opens immediately for editing

5. **Rename View**
   - Inline rename in view selector or in config panel header

#### Files to Modify:
- `MODIFY: dashboards/src/DataExplorer/components/view-config-panel/view-config-panel.component.ts`
- `MODIFY: dashboards/src/DataExplorer/components/view-selector/view-selector.component.ts`
- `MODIFY: dashboards/src/DataExplorer/services/explorer-state.service.ts`

---

### Phase 5: Smart Filter Integration
**Dependencies:** Phase 3
**Estimated Effort:** Medium

#### Tasks:
1. **Smart Filter UI**
   - Prominent input in Filters tab (top position)
   - "Apply Smart Filter" button
   - Loading state while LLM processes
   - Success: Show explanation and generated WHERE clause (expandable)
   - Error: Show error message with retry option

2. **Connect to Existing Smart Filter Logic**
   - Use `UserViewEntityExtended.GenerateSmartFilterWhereClause()`
   - Store result in view's `SmartFilterEnabled`, `SmartFilterPrompt`, `SmartFilterWhereClause`, `SmartFilterExplanation`

3. **View/List Reference Insertion**
   - Button to insert view reference: `View(Name: "...", ID: "...")`
   - Button to insert list reference: `List(Name: "...", ID: "...")`
   - Uses existing `FindRecordDialogComponent`

4. **Advanced Info Display**
   - Expandable section showing:
     - Generated WHERE clause (read-only)
     - LLM explanation
   - Hidden by default, for power users

#### Files to Modify:
- `MODIFY: dashboards/src/DataExplorer/components/view-config-panel/filters-tab.component.ts`

---

### Phase 6: View Resource Wrapper (Open in Tab)
**Dependencies:** Phase 1
**Estimated Effort:** Medium

#### Tasks:
1. **Create ViewResourceComponent**
   - Wrapper component for displaying a view in its own tab
   - Uses the same grid/card viewer from Data Explorer
   - Shows view configuration in header (name, entity, filter summary)
   - Option to switch views or lock to single view (TBD)

2. **Register as Resource Type**
   - Ensure "User Views" resource type has proper `DriverClass`
   - Component loads via dynamic component loading

3. **Navigation Integration**
   - "Open in Tab" from Data Explorer uses `NavigationService`
   - View opens as separate tab with full functionality

#### Files to Create:
- `NEW: explorer-core/src/lib/resource-wrappers/view-resource-v2.component.ts`
- `MODIFY: module.ts` to register component

---

### Phase 7: Polish & Refinement
**Dependencies:** Phases 1-6
**Estimated Effort:** Medium

#### Tasks:
1. **Keyboard Shortcuts**
   - `Ctrl+S` / `Cmd+S`: Save view
   - `Ctrl+Shift+S`: Save As New View
   - `/`: Focus smart filter input
   - `Escape`: Close config panel

2. **View Change Indicators**
   - Modified indicator (•) next to view name when unsaved changes
   - Visual diff for what changed

3. **Onboarding Tooltips**
   - First-time user guidance for view creation
   - Non-blocking AppCues-style tooltips
   - Can be dismissed and don't reappear

4. **Mobile Optimizations**
   - Touch-friendly drag handles for column reordering
   - Swipe to dismiss config panel
   - Responsive filter builder

5. **Performance Optimization**
   - Debounce view saves
   - Lazy load views list
   - Cache loaded views per session

6. **Error Handling**
   - Network failure recovery
   - Concurrent edit detection
   - Invalid filter handling

---

## Task List (Ordered)

### Phase 0: Schema Migration ✅
- [x] **0.1** Create migration file `V202411301200__v2.123.x__UserView_CardConfiguration.sql`
- [x] **0.2** Run migration against database
- [x] **0.3** Run CodeGen to generate updated ORM
- [x] **0.4** Verify `CardState` property exists on `UserViewEntity`

### Phase 1: View Selector Component ✅
- [x] **1.1** Create `ViewSelectorComponent` scaffold
- [x] **1.2** Implement view loading logic (RunView for User Views filtered by entity)
- [x] **1.3** Implement dropdown UI with sections (Default, My Views, Shared Views)
- [x] **1.4** Add "Save Current View" menu action
- [x] **1.5** Add "Manage Views" menu action
- [x] **1.6** Create "Open in Tab" icon button
- [x] **1.7** Integrate ViewSelector into DataExplorerDashboard header
- [x] **1.8** Update ExplorerStateService with `selectedViewId` and `viewModified`
- [x] **1.9** Update DataExplorerState interface
- [x] **1.10** Wire up view selection to state changes

### Phase 2: View Data Loading ✅
- [x] **2.1** Add `viewEntity` input to `mj-entity-viewer`
- [x] **2.2** Implement GridState → grid columns mapping
- [x] **2.3** Implement SortState → OrderBy mapping
- [x] **2.4** Implement WhereClause → ExtraFilter mapping
- [x] **2.5** Implement CardState → CardTemplate mapping (deferred - uses existing infrastructure)
- [x] **2.6** Update RunView call to combine WhereClause + UserSearchString
- [x] **2.7** Update search box label to "Search within this view..."
- [x] **2.8** Test default view behavior (no view selected)

### Phase 3: View Configuration Panel ✅
- [x] **3.1** Create ViewConfigPanelComponent scaffold with sliding animation
- [x] **3.2** Implement tab navigation (Columns, Filters, Settings)
- [x] **3.3** Create Columns tab with visibility toggles
- [x] **3.4** Add drag-drop column reordering
- [x] **3.5** Create Filters tab with Smart Filter section
- [x] **3.6** Add Traditional Filters placeholder (future enhancement)
- [x] **3.7** Create Settings tab with name, description, sharing options
- [x] **3.8** Create Sort configuration in Columns tab
- [x] **3.9** Implement Danger Zone with delete option
- [x] **3.10** Implement Save/Save As/Cancel buttons
- [x] **3.11** Add responsive breakpoints for mobile
- [x] **3.12** Wire config panel to DataExplorerDashboard

### Phase 4: View CRUD Operations ✅
- [x] **4.1** Implement "Create View" via Save As New
- [x] **4.2** Implement "Save View" with permission checking
- [x] **4.3** Implement "Save As New View"
- [x] **4.4** Implement "Delete View" with confirmation
- [x] **4.5** Build GridState and SortState JSON properly

### Phase 5: Smart Filter Integration ✅
- [x] **5.1** Add Smart Filter toggle and prompt textarea to Filters tab
- [x] **5.2** Save SmartFilterEnabled and SmartFilterPrompt to view
- [x] **5.3** Load Smart Filter settings from existing views
- [x] **5.4** Display SmartFilterExplanation when available
- [x] **5.5** Add tip explaining AI filter generation

### Phase 6: View Resource Wrapper ✅
- [x] **6.1** Verified existing UserViewResource component in explorer-core
- [x] **6.2** Implemented onOpenInTabRequested using OpenEntityRecord.emit
- [x] **6.3** Views open in tabs using existing resource type system

### Phase 7: Polish & Refinement ✅
- [x] **7.1** Add keyboard shortcut (Escape to close config panel)
- [x] **7.2** Implement modified indicator (•) in view selector
- [x] **7.3** Add Smart Filter CSS styles
- [x] **7.4** Verify mobile responsive design
- [x] **7.5** Build verification successful

---

## Open Questions / TBD

1. **View Resource Tab Behavior:** When a view is opened in its own tab, should users be able to switch to other views within that tab, or is it locked to the opened view?

2. **Default View Per Entity:** Should we support marking a view as "default for this entity" so it auto-loads instead of (Default)?

3. **View Templates:** Should there be system-level view templates that users can clone?

4. **Bulk Operations in Views:** Should the view resource tab support the same bulk operations (merge, compare, add to list) as the full Data Explorer?

---

## Success Criteria

1. Users can save their current Data Explorer configuration as a named view
2. Users can switch between saved views with one click
3. Smart Filter is prominently accessible and works as expected
4. View configuration (columns, filters, sort) is fully customizable via sliding panel
5. Views work in both grid and card display modes
6. Card layout is customizable per view
7. Shared views are accessible but read-only (unless Edit permission granted)
8. Views can be opened in their own tab
9. Mobile users can effectively use all features
10. Performance remains acceptable on large datasets

---

## Dependencies & Prerequisites

- CodeGen must be run after Phase 0 migration
- Existing `UserViewEntityExtended` class must be compatible
- `ResourcePermissionEngine` must be available for sharing logic
- `NavigationService` must support view resource opening
- Kendo Angular components must be available (Filter, Sortable, etc.)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large dataset performance | High | Debounce saves, lazy load views, pagination |
| Smart Filter LLM latency | Medium | Loading states, async processing, fallback to manual |
| Mobile UX complexity | Medium | Progressive disclosure, responsive breakpoints |
| Backward compatibility | Low | New field is nullable, no breaking changes |
| User confusion (Default vs Saved) | Medium | Clear labeling, onboarding tooltips |

---

## Appendix: Existing Code References

### Key Files to Study:
- `packages/MJCoreEntities/src/custom/UserViewEntity.ts` - Extended view entity with helper methods
- `packages/MJCore/src/views/runView.ts` - RunView/RunViews execution
- `packages/Angular/Explorer/user-view-properties/` - Legacy view config dialog
- `packages/Angular/Explorer/user-view-grid/` - Legacy view grid component
- `packages/Angular/Explorer/dashboards/src/DataExplorer/` - Current Data Explorer
- `packages/Angular/Generic/entity-viewer/` - mj-entity-viewer composite component
- `packages/MJCoreEntities/src/generated/entity_subclasses.ts` - ResourcePermissionEntity

### Existing JSON Schemas:
- `GridState`: `{ columnSettings: ViewColumnInfo[] }`
- `FilterState`: Kendo `CompositeFilterDescriptor` format
- `SortState`: `{ field: string, direction: 'asc' | 'desc' }[]`
