# Viewing System - Bug List

## Critical Bugs

### BUG-001: Save Failure Silently Ignored - Panel Closes Regardless
**Severity:** CRITICAL
**Location:** `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts` (~line 1134)

**Description:**
When a user saves a new view (or updates an existing one), the `onSaveView()` method calls `newView.Save()` but only handles the success case inside an `if (saved)` block. The panel close call (`this.stateService.closeViewConfigPanel()`) is **outside** the if block, so it executes regardless of whether the save succeeded or failed.

**Impact:**
User spends time configuring a view (columns, filters, sorts, aggregates), clicks "Save As New", the save fails silently (e.g., duplicate name, permission denied, DB constraint), and the panel closes. All their configuration is lost with no error message or opportunity to retry.

**Steps to Reproduce:**
1. Open Data Explorer, select an entity
2. Open View Config Panel
3. Configure columns, filters, etc.
4. Enter a view name and click "Save As New"
5. If save fails for any reason (network, DB constraint, etc.), panel closes and configuration is lost

**Fix:**
Move `closeViewConfigPanel()` inside the `if (saved)` block. Add error notification when save fails. Keep panel open on failure so user can retry.

---

### BUG-002: No Success/Error Notifications on View Save
**Severity:** CRITICAL
**Location:** `data-explorer-dashboard.component.ts` (~lines 1034-1144)

**Description:**
The `onSaveView()` method has no user-facing notifications for success or failure. Compare to `onSaveDefaultViewSettings()` which properly calls `this.showNotification()` for both success and error cases.

**Impact:**
Users have no feedback about whether their save succeeded. The panel just closes - was it saved? Did it fail? They don't know.

**Fix:**
Add `showNotification()` calls for:
- Success: "View created successfully" / "View updated successfully"
- Failure: "Failed to save view: [error details]"

---

## High Severity Bugs

### BUG-003: Race Condition on Double-Click Save
**Severity:** HIGH
**Location:** `view-config-panel.component.ts` (~line 1336) and `data-explorer-dashboard.component.ts` (~line 1037)

**Description:**
The ViewConfigPanel has a local `isSaving` guard, but this is set by the *parent* component via `@Input()`. The parent sets `isSavingView = true` only after receiving the event. Between the first click emitting the event and the parent updating the Input, a second click can emit another event.

**Impact:**
Two concurrent save operations could run in parallel, potentially creating duplicate views.

**Fix:**
Set a local saving flag immediately on click before emitting, or use a debounce/throttle on the save button.

---

### BUG-004: No Validation of Required Fields Before Save
**Severity:** HIGH
**Location:** `data-explorer-dashboard.component.ts` (~lines 1052-1075)

**Description:**
The parent component creates a new `UserViewEntityExtended` and sets `Name = event.name || 'Custom'` with a fallback. But there's no validation for:
- Empty/whitespace-only names (UI prevents empty but not whitespace-only)
- Duplicate view names for the same entity
- Missing entity or user context
- Description length constraints

**Impact:**
Invalid or duplicate views could be created, leading to confusion in the view selector.

**Fix:**
Add pre-save validation with clear error messages for each constraint.

---

### BUG-005: Grid State Not Reliably Captured for New Views
**Severity:** HIGH
**Location:** `data-explorer-dashboard.component.ts` (~lines 1219-1242, `buildGridState()`)

**Description:**
When saving a new view, grid state is built from `event.columns` (from the config panel). But if the user hasn't interacted with the grid, `currentGridState` may not be populated. The `buildGridState()` method has a fallback chain:
1. `event.columns` (from config panel)
2. `this.currentGridState.columnSettings` (from grid interactions)
3. `return null` (no columns!)

If both sources are empty, the view is saved with no column configuration, which means it loads with entity defaults instead of what the user configured.

**Impact:**
Views saved without proper grid state will show all default columns instead of the user's intended configuration.

**Fix:**
Always initialize column state from entity fields when opening the config panel. Never allow a null grid state on save.

---

### BUG-006: Filter Mode Switch Loses Data Without Warning
**Severity:** HIGH
**Location:** `view-config-panel.component.ts` (~lines 1401-1419)

**Description:**
When switching between Smart Filter and Traditional Filter modes, the previous mode's data is cleared without warning:
- Smart -> Traditional: Clears smart filter prompt
- Traditional -> Smart: Clears traditional filter state

**Impact:**
User spends time building a complex traditional filter, accidentally clicks "Smart Filter" tab, and their filter is gone.

**Fix:**
Show confirmation dialog before switching modes if existing filter data will be lost. Or better: preserve both and only apply the active mode.

---

## Medium Severity Bugs

### BUG-007: Async View Refresh Not Awaited
**Severity:** MEDIUM
**Location:** `data-explorer-dashboard.component.ts` (~line 1089)

**Description:**
After saving a new view, `this.entityViewerRef?.refresh()` is called but not awaited. The `loadViews()` call IS awaited, but the grid refresh is fire-and-forget.

**Impact:**
Grid may briefly show stale data after view save. Minor visual inconsistency.

**Fix:**
Await the refresh call.

---

### BUG-008: Inconsistent Filter State Handling Between Create and Update
**Severity:** MEDIUM
**Location:** `data-explorer-dashboard.component.ts` (~lines 1073 vs 1115)

**Description:**
When **creating** a new view, if `event.filterState` is null/undefined, the `FilterState` field is never set (stays undefined on the new entity).
When **updating** an existing view, if `event.filterState` is null/undefined, it explicitly sets `FilterState = JSON.stringify({ logic: 'and', filters: [] })` (empty filter).

**Impact:**
New views might have undefined FilterState while updated views always have at least an empty filter object. This inconsistency could cause parse errors when loading views.

**Fix:**
Always set FilterState to at least an empty filter object `{ logic: 'and', filters: [] }`.

---

### BUG-009: Smart Filter Explanation Never Displayed
**Severity:** MEDIUM
**Location:** `view-config-panel.component.ts` (~line 176)

**Description:**
The component accepts `smartFilterExplanation` from the view entity but never renders it in the template. The AI generates a human-readable explanation of what the smart filter does, but the user never sees it.

**Impact:**
Users can't verify what their smart filter prompt actually translates to. They're blind to the actual filter logic.

**Fix:**
Display the explanation text below the smart filter prompt input when available.

---

### BUG-010: Grid State Parse Failure Returns Null Silently
**Severity:** MEDIUM
**Location:** `data-explorer-dashboard.component.ts` (~line 938-939, `parseViewGridState()`)

**Description:**
If `JSON.parse(view.GridState)` fails, the method returns `null` with only a `console.warn`. The caller assigns this null to `currentGridState` without checking.

**Impact:**
Grid renders with no column configuration, showing entity defaults. User sees unexpected columns.

**Fix:**
Fall back to entity default columns when parse fails. Show notification that view configuration may be corrupted.

---

### BUG-011: `saveViewRequested` Event Data Ignored
**Severity:** MEDIUM
**Location:** `data-explorer-dashboard.component.ts` (~lines 959-963)

**Description:**
When the View Selector emits `saveViewRequested` with `{ saveAsNew: true }`, the `onSaveViewRequested()` handler ignores the event data entirely and just opens the config panel. The `saveAsNew` flag should be forwarded to the config panel so it knows to default to "Save As New" mode.

**Impact:**
User clicks "Save As New" in dropdown, config panel opens, but user must still find and click the "Save As New" button in the panel footer. Confusing double-action.

**Fix:**
Pass the `saveAsNew` flag to the config panel via a new Input property, so it can pre-select the appropriate save mode.

---

### BUG-012: Aggregate Toggle State Unreliable
**Severity:** MEDIUM
**Location:** `view-config-panel.component.ts` (~lines 1571-1621)

**Description:**
The aggregate toggle logic uses a complex fallback chain (find by ID, then reference, then label) with extensive console logging. The `this.aggregates = [...this.aggregates]` pattern suggests immutability issues where Angular change detection doesn't pick up nested property changes.

**Impact:**
User toggles an aggregate on/off, but the UI doesn't update reliably. May need to close/reopen panel.

**Fix:**
Use proper immutable update patterns. Create new aggregate objects instead of mutating existing ones.
