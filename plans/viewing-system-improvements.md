# Viewing System Improvements Plan

## Overview
This document tracks improvements to the MemberJunction viewing system, including the Data Explorer, entity-data-grid, entity-viewer, and related components.

---

## Task List

### 1. Multi-Select Mode Toggle
**Status**: Not Started
**Priority**: Medium
**Complexity**: Low

**Current State**:
- Grid selection mode is hardcoded to `'checkbox'` in `data-explorer-dashboard.component.html` (line 485)
- Selection mode infrastructure exists: `GridSelectionMode = 'none' | 'single' | 'multiple' | 'checkbox'`
- entity-data-grid already supports `SelectionMode` as an `@Input`

**Implementation**:
1. Add `multiSelectEnabled: boolean = false` property to DataExplorerDashboardComponent
2. Add toggle button in header near view mode toggles (grid/cards/timeline)
3. Bind `[gridSelectionMode]="multiSelectEnabled ? 'checkbox' : 'single'"` to entity-viewer
4. Clear selection when toggling off
5. Optionally persist preference via UserInfoEngine

**Files to Modify**:
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts`
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.html`

---

### 2. Smart Filter WHERE Clause Generation - Modern AI Patterns
**Status**: Not Started
**Priority**: High
**Complexity**: Medium-High

**Current State**:
- Implementation in `packages/MJCoreEntitiesServer/src/custom/userViewEntity.server.ts`
- Hardcoded to use OpenAI (`AIVendorName` returns `'OpenAI'`)
- Does NOT use modern MJ patterns (AIPromptRunner, stored prompts)
- Direct LLM instantiation via `ClassFactory.CreateInstance<BaseLLM>`
- No vendor fallback mechanism

**Implementation**:
1. Create stored AI Prompt for smart filter generation in `/metadata/ai-prompts/`
2. Refactor to use `AIPromptRunner.ExecutePrompt()` instead of direct LLM calls
3. Implement vendor fallback chain: Cerebras (GPT-OSS-120B) → Groq → OpenAI
4. Override `GetAIModel()` to search for `gpt-oss` models first
5. Leverage AIEngine's centralized model management

**Model Priority**:
```
1. Cerebras - GPT-OSS-120B (fastest inference)
2. Groq - GPT-OSS models (fast inference)
3. OpenAI - fallback (reliable but slower/costlier)
```

**Files to Modify**:
- `packages/MJCoreEntitiesServer/src/custom/userViewEntity.server.ts`
- Create: `/metadata/ai-prompts/.smart-filter-generation.json`

---

### 3. Drag-Drop Field Reordering Fix
**Status**: Not Started
**Priority**: Medium
**Complexity**: Medium

**Current State**:
- Uses Kendo Sortable in `user-view-properties.component.html` (lines 52-75)
- Blue drop indicator line positioning is "wonky"
- Component dialog is moved to `document.body` via `moveDialogToBody()` which breaks positioning context

**Root Causes Identified**:
1. Missing `position: relative` on container elements
2. Dialog moved to body breaks DOM hierarchy for absolute positioning
3. Tab content overflow settings affecting child positioning
4. Variable item heights causing inconsistent center point calculations

**Implementation**:
1. Add CSS to establish proper positioning context:
   ```css
   ::ng-deep .k-sortable { position: relative; overflow: visible; }
   ::ng-deep .k-tabstrip-content { position: relative; }
   ```
2. Standardize item heights with `min-height: 40px`
3. Test with animation disabled to isolate issues
4. Consider using fixed positioning for drop hint if needed

**Files to Modify**:
- `packages/Angular/Explorer/user-view-properties/src/lib/user-view-properties.component.css`

---

### 4. Configurable Alternating Row Color
**Status**: Not Started
**Priority**: Low
**Complexity**: Low

**Current State**:
- Alt row color hardcoded in CSS: `--grid-row-bg-alt: #fafafa`
- `GridVisualConfig` interface already supports `alternateRows` and `alternateRowContrast`
- Three contrast levels exist: subtle, medium, strong (rgba overlays)
- NOT persisted to views or user settings

**Implementation**:
1. Extend `ViewDisplayState.grid` to include visual config properties
2. Parse visual config from `UserView.DisplayState` JSON
3. Pass to entity-viewer's `VisualConfig` input
4. Add UI controls in view properties panel (optional)

**Option**: Use existing `DisplayState` column (no schema changes needed)

**Files to Modify**:
- `packages/MJCoreEntities/src/custom/UserViewEntity.ts` (extend ViewDisplayState interface)
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts`
- `packages/Angular/Explorer/user-view-properties/` (optional UI)

---

### 5. Multi-Column Sorting with Visual Indicators
**Status**: Not Started
**Priority**: High
**Complexity**: Medium

**Current State**:
- Multi-column sorting IS fully implemented in entity-data-grid
- Shift+Click adds secondary sorts
- `DataGridSortState` tracks `index` property (0=primary, 1=secondary, etc.)
- Sort state persists to `ViewGridState.sortSettings`
- **Missing**: Sort order numbers not shown in column headers

**Implementation**:
1. Create custom AG Grid header component to display sort order numbers
2. Show "(1)", "(2)", "(3)" next to sort arrows for multi-sort columns
3. Enhance sorting tab in view properties:
   - Show order numbers next to each sort item
   - Allow drag-to-reorder sort priority
   - Highlight primary sort differently
4. Add tooltip on column headers showing full sort order

**Files to Modify**:
- `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts`
- `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/` (new header component)
- `packages/Angular/Explorer/user-view-properties/src/lib/user-view-properties.component.ts`
- `packages/Angular/Explorer/user-view-properties/src/lib/user-view-properties.component.html`

---

### 6. View Properties Panel Width Persistence
**Status**: Not Started
**Priority**: Low
**Complexity**: Low

**Current State**:
- Panel width managed locally: `panelWidth: number = 400`
- Resize handle exists with min/max constraints (320-800px)
- Width resets to 400px on component reinit
- NOT persisted

**Implementation**:
1. Add `viewConfigPanelWidth` to `ExplorerStateService` state interface
2. Load from UserSettings on init (already done for other widths)
3. Update on resize end (leverages existing debounced save)
4. Pass preferred width to component via `@Input`

**Pattern to Follow**: Same as `navigationPanelWidth` and `detailPanelWidth` in Data Explorer

**Files to Modify**:
- `packages/Angular/Explorer/dashboards/src/DataExplorer/models/explorer-state.interface.ts`
- `packages/Angular/Explorer/dashboards/src/DataExplorer/services/explorer-state.service.ts`
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts`
- `packages/Angular/Generic/entity-viewer/src/lib/view-config-panel/view-config-panel.component.ts`

---

### 7. Recent Records/Entities Limits and Navigation Panel Persistence
**Status**: Not Started
**Priority**: Medium
**Complexity**: Low-Medium

**Current State**:
- Current limits:
  - `MAX_RECENT_ITEMS = 20` (navigation panel)
  - `MAX_RECENT_ENTITIES = 10` (home screen)
  - `MAX_RECENT_RECORDS = 10` (home screen)
  - Home displays 5 recent items (hardcoded `.slice(0, 5)`)
- Navigation panel collapse state IS persisted in Data Explorer
- Panel width/resize NOT implemented for navigation panel
- Home Dashboard sidebar toggle NOT persisted

**Implementation**:
1. Reduce home screen recent items display (already at 5, seems fine)
2. Add navigation panel resize capability:
   - Add resize handle to left edge
   - Bind width to `navigationPanelWidth` in state
   - Save on resize end
3. Ensure collapse state persists (already done in Data Explorer)
4. Add persistence to Home Dashboard sidebar

**Files to Modify**:
- `packages/Angular/Explorer/dashboards/src/DataExplorer/components/navigation-panel/navigation-panel.component.ts`
- `packages/Angular/Explorer/dashboards/src/DataExplorer/components/navigation-panel/navigation-panel.component.html`
- `packages/Angular/Explorer/dashboards/src/Home/home-dashboard.component.ts`

---

### ~~8. View Switching Filter Bug (Default View Shows Nothing)~~
**Status**: COMPLETED
**Priority**: High
**Complexity**: Medium

**Solution Implemented**:
- Added explicit `refresh()` call after clearing filter in `onViewSelected()`
- Added `cdr.detectChanges()` before refresh to ensure state is propagated
- Also added `flushPendingChanges()` call before switching to save any pending column changes

**Files Modified**:
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts`

---

### ~~9. Immediate Save on View/Entity Switch (Flush Debounce)~~
**Status**: COMPLETED
**Priority**: High
**Complexity**: Medium

**Solution Implemented**:
1. Made `flushPendingPersistence()` public and renamed to `flushPendingChanges()` in entity-data-grid
2. Added `flushPendingChanges()` method to entity-viewer that delegates to the data-grid
3. Added ViewChild reference to EntityDataGridComponent in entity-viewer
4. Called `flushPendingChanges()` in both `onViewSelected()` and `onEntitySelected()` before switching

**Files Modified**:
- `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts`
- `packages/Angular/Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.ts`
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts`

---

### 10. Additional User Preference Persistence (Proposed)
**Status**: Not Started
**Priority**: Low
**Complexity**: Varies

**Areas to Consider**:

1. **Filter panel expanded/collapsed state** per entity
2. **Timeline orientation preference** (vertical/horizontal) - already persisted
3. **Card view column count preference**
4. **Default page size for pagination** (10, 25, 50, 100)
5. **Column auto-fit preference** (auto-fit on load vs. preserve widths)
6. **Header style preference** (flat, elevated, gradient, bold) - infrastructure exists
7. **Dark mode / theme preference** (if implemented)
8. **Keyboard shortcut customization**
9. **Smart filter history** (last N prompts per entity)
10. **Export format default** (Excel, CSV, JSON)

**Already Persisted**:
- View mode (grid/cards/timeline)
- Navigation panel width and collapse state
- Detail panel width
- Smart filter prompts per entity (cached)
- Section expansion states (favorites, recent, entities, views)
- Timeline date field and sort order

---

## Implementation Priority Order

### Phase 1: Critical Fixes - COMPLETED
1. ~~**Task 8**: View Switching Filter Bug~~ - DONE
2. ~~**Task 9**: Immediate Save on View/Entity Switch~~ - DONE

### Phase 2: High Value Improvements
3. **Task 2**: Smart Filter AI Modernization - use better/faster models
4. **Task 5**: Multi-Column Sorting Visual Indicators - power user feature

### Phase 3: User Experience Polish
5. **Task 1**: Multi-Select Mode Toggle - reduce UI clutter
6. **Task 3**: Drag-Drop Field Reordering Fix - usability issue
7. **Task 7**: Navigation Panel Persistence - remember user preferences

### Phase 4: Nice to Have
8. **Task 4**: Configurable Alt Row Color - minor customization
9. **Task 6**: View Properties Panel Width Persistence - convenience
10. **Task 10**: Additional Preferences - future enhancements

---

## Key File References

| Component | Path | Purpose |
|-----------|------|---------|
| Data Explorer Dashboard | `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts` | Main orchestrator |
| Explorer State Service | `packages/Angular/Explorer/dashboards/src/DataExplorer/services/explorer-state.service.ts` | State management |
| State Interface | `packages/Angular/Explorer/dashboards/src/DataExplorer/models/explorer-state.interface.ts` | State types |
| Navigation Panel | `packages/Angular/Explorer/dashboards/src/DataExplorer/components/navigation-panel/` | Left sidebar |
| View Selector | `packages/Angular/Explorer/dashboards/src/DataExplorer/components/view-selector/` | View dropdown |
| Entity Viewer | `packages/Angular/Generic/entity-viewer/src/lib/entity-viewer.component.ts` | Composite grid component |
| Entity Data Grid | `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts` | AG Grid wrapper |
| Grid Types | `packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/models/grid-types.ts` | Type definitions |
| View Config Panel | `packages/Angular/Generic/entity-viewer/src/lib/view-config-panel/` | Slide-in panel |
| User View Properties | `packages/Angular/Explorer/user-view-properties/src/lib/` | View settings dialog |
| UserView Entity | `packages/MJCoreEntities/src/custom/UserViewEntity.ts` | View entity types |
| UserView Server | `packages/MJCoreEntitiesServer/src/custom/userViewEntity.server.ts` | Smart filter generation |

---

## Session Notes

_Use this section to track progress across sessions_

### Session 1 - Initial Analysis
- Completed comprehensive study of all components
- Identified 10 improvement areas
- Created this planning document
- Ready to begin implementation

### Session 1 - Phase 1 Implementation
- **Task 8 (View Switching Filter Bug)**: Fixed by adding explicit `refresh()` call after clearing filter
- **Task 9 (Immediate Save on View/Entity Switch)**: Fixed by exposing `flushPendingChanges()` method and calling it before view/entity switches
- Both packages built successfully (`ng-entity-viewer` and `ng-dashboards`)

---

## Questions for Stakeholder Review

1. For **multi-select toggle**: Should this be on by default for power users? Or off by default?
2. For **smart filter AI**: Confirm priority order is Cerebras → Groq → OpenAI?
3. For **alt row color**: Should this be per-view or global user preference?
4. For **recent items limits**: Are current limits (5 displayed, 10-20 stored) appropriate?
5. For **additional preferences**: Which of the proposed items in Task 10 are highest priority?
