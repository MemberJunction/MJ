# View System Enhancements - 2nd Pass

## Executive Summary

This document outlines improvements to the MemberJunction entity viewer and data grid system based on analysis of the current implementation. The focus areas are:

1. **Phase 1:** Critical bug fixes (column visibility, width calculation, FK navigation)
2. **Phase 2:** Column management power features
3. **Phase 3:** Filtering and search enhancements
4. **Phase 4:** Bulk operations and export
5. **Phase 5:** Data analysis features
6. **Phase 6:** Navigation and efficiency
7. **Phase 7:** Relationship navigation
8. **Phase 8:** Visual customization and polish

---

## Issue Analysis

### Issue 1: Poor Default Column Widths

**Current Behavior:**
- Column widths are estimated in `entity-data-grid.component.ts:1609-1663` via `estimateColumnWidth()`
- The algorithm considers field type, name patterns, and Length property
- `nvarchar(max)` fields (Length > 500) get only 150px width
- **Header text (DisplayName) is not adequately considered** - long headers like "Final Payload Validation Status" get truncated

**Evidence from Screenshots:**
- AI Agents grid shows "Description" column too narrow
- Many boolean/status columns extremely narrow with truncated headers
- Columns with long names like "Model Selection Mode" or "Final Payload Validation..." are cut off

**Root Cause Analysis:**
Location: [entity-data-grid.component.ts:1609-1663](packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts#L1609-L1663)

```typescript
private estimateColumnWidth(field: EntityFieldInfo): number {
  // Current logic focuses on field name and data type
  // but doesn't adequately consider:
  // 1. DisplayName length (the actual header text shown)
  // 2. Typical content width for the data values
  // 3. Minimum width needed for the header to be readable
}
```

---

### Issue 2: All Columns Showing vs. DefaultInView Columns

**Current Behavior:**
- First time viewing an entity shows ALL columns (minus system fields)
- After opening View Properties and saving, only `DefaultInView` columns remain
- User sees completely different column sets before and after first save

**Root Cause:**
Two different column determination algorithms are used:

1. **Grid's `shouldShowField()` method** ([entity-data-grid.component.ts:1599-1607](packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts#L1599-L1607)):
   ```typescript
   private shouldShowField(field: EntityFieldInfo): boolean {
     if (field.Name.startsWith('__mj_')) return false;
     if (field.IsPrimaryKey && field.SQLFullType?.toLowerCase() === 'uniqueidentifier') return false;
     if (field.DefaultInView === true) return true;  // Force show if DefaultInView
     if (field.Length > 500) return false;           // Hide long text
     return true;                                    // DEFAULT: SHOW EVERYTHING ELSE
   }
   ```

2. **UserViewEntity's `SetDefaultsFromEntity()` method** ([UserViewEntity.ts:417-431](packages/MJCoreEntities/src/custom/UserViewEntity.ts#L417-L431)):
   ```typescript
   e.Fields.filter(f => f.DefaultInView).forEach(f => {
     // ONLY includes fields where DefaultInView === true
   });
   ```

**Problem:** When no saved GridState exists, the grid uses `shouldShowField()` which shows ALL fields by default. But `SetDefaultsFromEntity()` only includes `DefaultInView` fields. This creates the discrepancy.

---

### Issue 3: FK Links Open New Browser Tabs

**Current Behavior:**
- In the Generated Codes grid, clicking "Linked Entity ID" column opens a new browser tab
- Should instead emit an event for the parent to handle navigation within the app
- The detail panel properly handles FK clicks via `openForeignKeyRecord` event

**Root Cause:**
The grid's cell renderer ([entity-data-grid.component.ts:1864-1983](packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts#L1864-L1983)) only has special rendering for:
- Boolean fields (icons)
- Date fields (formatting)
- Currency/Number fields
- Email fields (mailto links)
- URL fields (target="_blank" links)

**Missing:** No FK field detection or rendering. FK fields with `RelatedEntityID` should show:
1. The related record's name field (if available)
2. A clickable link that emits an event instead of opening a new tab

---

# Implementation Phases

## Phase 1: Critical Bug Fixes

### 1.1 Fix Column Visibility Consistency

**Change `shouldShowField()` to align with `SetDefaultsFromEntity()`:**

```typescript
private shouldShowField(field: EntityFieldInfo): boolean {
  // Always exclude system fields
  if (field.Name.startsWith('__mj_')) return false;

  // Always exclude UUID primary keys
  if (field.IsPrimaryKey && field.SQLFullType?.toLowerCase() === 'uniqueidentifier') return false;

  // Only show fields explicitly marked as DefaultInView
  // This aligns with SetDefaultsFromEntity behavior for consistency
  return field.DefaultInView === true;
}
```

**Add fallback for entities with no DefaultInView fields:**

```typescript
private generateAgColumnDefs(entity: EntityInfo): ColDef[] {
  let visibleFields = entity.Fields.filter(f => this.shouldShowField(f));

  // Fallback: if no DefaultInView fields, show first 10 non-system fields
  if (visibleFields.length === 0) {
    visibleFields = entity.Fields
      .filter(f => !f.Name.startsWith('__mj_') &&
                   !(f.IsPrimaryKey && f.SQLFullType?.toLowerCase() === 'uniqueidentifier'))
      .slice(0, 10);
  }

  // ... rest of method
}
```

**Files to Modify:**
- [entity-data-grid.component.ts](packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts)

---

### 1.2 Enhanced Column Width Calculation

**Rewrite `estimateColumnWidth()` to consider header text:**

```typescript
private estimateColumnWidth(field: EntityFieldInfo): number {
  // Priority 1: Use metadata width if set
  if (field.DefaultColumnWidth && field.DefaultColumnWidth > 0) {
    return field.DefaultColumnWidth;
  }

  // Calculate minimum width needed for header text
  const headerText = field.DisplayName || field.Name;
  const headerWidth = this.calculateHeaderWidth(headerText);

  // Calculate estimated data width
  const dataWidth = this.calculateDataWidth(field);

  // Use the larger of header or data width, with bounds
  const estimatedWidth = Math.max(headerWidth, dataWidth);

  // Apply min/max bounds
  return Math.max(Math.min(estimatedWidth, 350), 80);
}

private calculateHeaderWidth(text: string): number {
  // Average char width ~7.5px for typical grid font, plus padding for sort icon
  const charWidth = 7.5;
  const sortIconPadding = 24;
  const cellPadding = 16;
  return Math.ceil(text.length * charWidth + sortIconPadding + cellPadding);
}

private calculateDataWidth(field: EntityFieldInfo): number {
  const fieldNameLower = field.Name.toLowerCase();
  const tsType = field.TSType;

  // Fixed-width types
  if (tsType === 'boolean') return 90;
  if (tsType === 'Date') return 130;

  // Numeric fields
  if (tsType === 'number') {
    if (fieldNameLower.includes('year') || fieldNameLower.includes('age')) return 80;
    if (fieldNameLower.includes('amount') || fieldNameLower.includes('price') ||
        fieldNameLower.includes('cost') || fieldNameLower.includes('total')) return 130;
    return 100;
  }

  // ID fields (typically UUIDs shown truncated or as links)
  if (fieldNameLower.endsWith('id') && field.Length <= 50) return 100;

  // Common string field patterns
  if (fieldNameLower.includes('email')) return 220;
  if (fieldNameLower.includes('phone') || fieldNameLower.includes('mobile')) return 140;
  if (fieldNameLower.includes('description')) return 250;  // Increased from 150
  if (fieldNameLower.includes('name') || fieldNameLower.includes('title')) return 180;
  if (fieldNameLower.includes('address')) return 220;
  if (fieldNameLower.includes('city')) return 130;
  if (fieldNameLower.includes('status') || fieldNameLower.includes('type') ||
      fieldNameLower.includes('category')) return 130;
  if (fieldNameLower.includes('code')) return 110;

  // Long text fields - give them more room
  if (field.Length > 500 || field.Length < 0) return 250;  // nvarchar(max) = -1
  if (field.Length > 200) return 200;

  // Default: estimate based on field length with reasonable bounds
  const estimatedChars = Math.min(field.Length || 50, 40);
  return Math.max(estimatedChars * 6 + 24, 100);
}
```

**Files to Modify:**
- [entity-data-grid.component.ts](packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts)

---

### 1.3 FK Field Rendering with Event Bubbling

**Add FK detection and custom renderer:**

```typescript
private applyFieldFormatter(colDef: ColDef, field: EntityFieldInfo, customFormat?: ColumnFormat): void {
  // Check if this is a FK field FIRST
  if (field.RelatedEntityID && !customFormat) {
    this.applyForeignKeyRenderer(colDef, field);
    return;
  }

  // ... rest of existing logic
}

private applyForeignKeyRenderer(colDef: ColDef, field: EntityFieldInfo): void {
  const relatedEntityId = field.RelatedEntityID;
  const relatedFieldName = field.RelatedEntityNameFieldMap;  // e.g., "Name" field in related entity

  colDef.cellRenderer = (params: ICellRendererParams) => {
    if (params.value === null || params.value === undefined) {
      return '<span class="cell-empty">—</span>';
    }

    // Try to get the display name from a mapped field (e.g., EntityName for EntityID)
    let displayValue = params.value;
    if (relatedFieldName && params.data) {
      // Look for common naming patterns: EntityID -> Entity, UserID -> User
      const baseFieldName = field.Name.replace(/ID$/i, '');
      const possibleDisplayFields = [
        relatedFieldName,
        baseFieldName,
        `${baseFieldName}Name`,
        `${baseFieldName}_Name`
      ];

      for (const displayField of possibleDisplayFields) {
        if (params.data[displayField]) {
          displayValue = params.data[displayField];
          break;
        }
      }
    }

    const escaped = HighlightUtil.escapeHtml(String(displayValue));
    const highlighted = this._filterText
      ? HighlightUtil.highlight(String(displayValue), this._filterText, true)
      : escaped;

    return `<span class="cell-fk-link"
                  data-related-entity-id="${relatedEntityId}"
                  data-record-id="${HighlightUtil.escapeHtml(String(params.value))}">${highlighted}</span>`;
  };

  colDef.cellClass = 'cell-has-fk-link';
}
```

**Add output event and click handler:**

```typescript
@Output() foreignKeyClick = new EventEmitter<ForeignKeyClickEvent>();

// In onCellClicked handler:
private handleCellClick(event: CellClickedEvent): void {
  const target = event.event?.target as HTMLElement;

  // Check for FK link click
  if (target?.classList.contains('cell-fk-link')) {
    const relatedEntityId = target.dataset['relatedEntityId'];
    const recordId = target.dataset['recordId'];

    if (relatedEntityId && recordId) {
      this.foreignKeyClick.emit({
        relatedEntityId,
        recordId,
        fieldName: event.colDef?.field || ''
      });
      return;
    }
  }

  // ... existing click handling
}
```

**Add types to grid-types.ts:**

```typescript
export interface ForeignKeyClickEvent {
  relatedEntityId: string;
  recordId: string;
  fieldName: string;
}
```

**Add CSS styling:**

```css
.cell-fk-link {
  color: var(--mj-link-color, #0066cc);
  cursor: pointer;
  text-decoration: none;
}

.cell-fk-link:hover {
  text-decoration: underline;
}

.cell-has-fk-link {
  cursor: pointer;
}
```

**Files to Modify:**
- [entity-data-grid.component.ts](packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts)
- [entity-data-grid.component.css](packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.css)
- [grid-types.ts](packages/Angular/Generic/entity-viewer/src/lib/entity-data-grid/models/grid-types.ts)
- [entity-viewer.component.ts](packages/Angular/Generic/entity-viewer/src/lib/entity-viewer/entity-viewer.component.ts) - wire up event

---

## Phase 2: Column Management Power Features

### 2.1 Right-Click Column Header Context Menu

**Feature:** Right-click on any column header to access quick actions.

**Menu Options:**
- Pin Left / Pin Right / Unpin
- Hide Column
- Auto-fit Column Width
- Auto-fit All Columns
- Sort Ascending / Sort Descending / Clear Sort
- ---
- Reset All Columns to Default

**Implementation:**

```typescript
// Add to component
@ViewChild('columnContextMenu') columnContextMenu: TemplateRef<unknown>;
contextMenuColumn: ColDef | null = null;
contextMenuPosition = { x: 0, y: 0 };
showColumnContextMenu = false;

onColumnHeaderRightClick(event: MouseEvent, column: ColDef): void {
  event.preventDefault();
  this.contextMenuColumn = column;
  this.contextMenuPosition = { x: event.clientX, y: event.clientY };
  this.showColumnContextMenu = true;
}

pinColumnLeft(): void {
  if (this.contextMenuColumn && this.gridApi) {
    this.gridApi.setColumnPinned(this.contextMenuColumn.field!, 'left');
    this.markGridStateDirty();
  }
  this.showColumnContextMenu = false;
}

hideColumn(): void {
  if (this.contextMenuColumn && this.gridApi) {
    this.gridApi.setColumnVisible(this.contextMenuColumn.field!, false);
    this.markGridStateDirty();
  }
  this.showColumnContextMenu = false;
}

autoFitColumn(): void {
  if (this.contextMenuColumn && this.gridApi) {
    this.gridApi.autoSizeColumn(this.contextMenuColumn.field!);
    this.markGridStateDirty();
  }
  this.showColumnContextMenu = false;
}

autoFitAllColumns(): void {
  if (this.gridApi) {
    this.gridApi.autoSizeAllColumns();
    this.markGridStateDirty();
  }
  this.showColumnContextMenu = false;
}

resetColumnsToDefault(): void {
  // Clear GridState and regenerate
  this._gridState = null;
  this.buildAgColumnDefs();
  if (this.gridApi) {
    this.gridApi.setGridOption('columnDefs', this.agColumnDefs);
  }
  this.markGridStateDirty();
  this.showColumnContextMenu = false;
}
```

**Template:**

```html
<ng-template #columnContextMenu>
  <div class="column-context-menu"
       [style.left.px]="contextMenuPosition.x"
       [style.top.px]="contextMenuPosition.y"
       *ngIf="showColumnContextMenu">
    <div class="menu-item" (click)="pinColumnLeft()">
      <i class="fa-solid fa-thumbtack"></i> Pin Left
    </div>
    <div class="menu-item" (click)="pinColumnRight()">
      <i class="fa-solid fa-thumbtack fa-rotate-90"></i> Pin Right
    </div>
    <div class="menu-item" (click)="unpinColumn()">
      <i class="fa-regular fa-thumbtack"></i> Unpin
    </div>
    <div class="menu-divider"></div>
    <div class="menu-item" (click)="hideColumn()">
      <i class="fa-solid fa-eye-slash"></i> Hide Column
    </div>
    <div class="menu-item" (click)="autoFitColumn()">
      <i class="fa-solid fa-arrows-left-right"></i> Auto-fit Width
    </div>
    <div class="menu-item" (click)="autoFitAllColumns()">
      <i class="fa-solid fa-arrows-left-right-to-line"></i> Auto-fit All
    </div>
    <div class="menu-divider"></div>
    <div class="menu-item" (click)="sortAscending()">
      <i class="fa-solid fa-arrow-up-short-wide"></i> Sort Ascending
    </div>
    <div class="menu-item" (click)="sortDescending()">
      <i class="fa-solid fa-arrow-down-wide-short"></i> Sort Descending
    </div>
    <div class="menu-item" (click)="clearSort()">
      <i class="fa-solid fa-xmark"></i> Clear Sort
    </div>
    <div class="menu-divider"></div>
    <div class="menu-item" (click)="resetColumnsToDefault()">
      <i class="fa-solid fa-rotate-left"></i> Reset All Columns
    </div>
  </div>
</ng-template>
```

---

### 2.2 Double-Click Header Divider to Auto-Fit

**Feature:** Double-click on the column divider in the header to auto-fit that column to its content.

**Implementation:** AG Grid supports this natively with `autoSizeColumns`. We need to enable it:

```typescript
// In grid options
defaultColDef: {
  resizable: true,
  // AG Grid auto-sizes on double-click of header divider by default when resizable is true
}
```

---

### 2.3 Column Visibility Quick Toggle

**Feature:** Add a column visibility panel/dropdown in the grid toolbar.

**Implementation:**

```typescript
// Add property
showColumnVisibilityPanel = false;
allColumns: { field: string; name: string; visible: boolean }[] = [];

toggleColumnVisibilityPanel(): void {
  this.showColumnVisibilityPanel = !this.showColumnVisibilityPanel;
  if (this.showColumnVisibilityPanel) {
    this.refreshColumnList();
  }
}

refreshColumnList(): void {
  if (!this._entityInfo) return;

  const columnState = this.gridApi?.getColumnState() || [];

  this.allColumns = this._entityInfo.Fields
    .filter(f => !f.Name.startsWith('__mj_'))
    .map(f => {
      const colState = columnState.find(c => c.colId === f.Name);
      return {
        field: f.Name,
        name: f.DisplayName || f.Name,
        visible: colState ? !colState.hide : this.shouldShowField(f)
      };
    });
}

toggleColumnVisibility(field: string): void {
  if (!this.gridApi) return;

  const col = this.allColumns.find(c => c.field === field);
  if (col) {
    col.visible = !col.visible;
    this.gridApi.setColumnVisible(field, col.visible);
    this.markGridStateDirty();
  }
}
```

---

### 2.4 Column Header Tooltips

**Feature:** Show tooltips on column headers with full name and description.

**Implementation:**

```typescript
// In buildAgColumnDefsFromGridState or generateAgColumnDefs:
const colDef: ColDef = {
  // ... existing properties
  headerTooltip: this.buildHeaderTooltip(field)
};

private buildHeaderTooltip(field: EntityFieldInfo): string {
  const parts: string[] = [];

  // Full name if different from display name
  if (field.DisplayName && field.DisplayName !== field.Name) {
    parts.push(`Field: ${field.Name}`);
  }

  // Description if available
  if (field.Description) {
    parts.push(field.Description);
  }

  // Type info
  parts.push(`Type: ${field.Type}${field.Length ? `(${field.Length})` : ''}`);

  return parts.join('\n');
}
```

---

## Phase 3: Filtering & Search Enhancements

### 3.1 Column Header Quick Filter

**Feature:** Each column header has a filter icon that opens a quick filter dropdown.

**Implementation:**

```typescript
// AG Grid supports built-in column filters
defaultColDef: {
  filter: true,
  floatingFilter: true,  // Shows filter row below headers
  filterParams: {
    buttons: ['reset', 'apply'],
    closeOnApply: true
  }
}
```

For more sophisticated filtering per data type:

```typescript
private getFilterForField(field: EntityFieldInfo): string | boolean {
  switch (field.TSType) {
    case 'boolean':
      return 'agSetColumnFilter';
    case 'number':
      return 'agNumberColumnFilter';
    case 'Date':
      return 'agDateColumnFilter';
    default:
      return 'agTextColumnFilter';
  }
}
```

---

### 3.2 Active Filter Chips

**Feature:** Show active filters as removable chips above the grid.

**Implementation:**

```typescript
activeFilters: { field: string; displayName: string; value: string }[] = [];

onFilterChanged(): void {
  if (!this.gridApi) return;

  const filterModel = this.gridApi.getFilterModel();
  this.activeFilters = [];

  for (const [field, filter] of Object.entries(filterModel)) {
    const fieldInfo = this._entityInfo?.Fields.find(f => f.Name === field);
    this.activeFilters.push({
      field,
      displayName: fieldInfo?.DisplayName || field,
      value: this.formatFilterValue(filter)
    });
  }
}

removeFilter(field: string): void {
  if (!this.gridApi) return;

  const filterInstance = this.gridApi.getFilterInstance(field);
  if (filterInstance) {
    filterInstance.setModel(null);
    this.gridApi.onFilterChanged();
  }
}

clearAllFilters(): void {
  if (!this.gridApi) return;
  this.gridApi.setFilterModel(null);
}
```

**Template:**

```html
<div class="active-filters" *ngIf="activeFilters.length > 0">
  <span class="filters-label">Filters:</span>
  <span class="filter-chip" *ngFor="let filter of activeFilters">
    {{ filter.displayName }}: {{ filter.value }}
    <i class="fa-solid fa-xmark" (click)="removeFilter(filter.field)"></i>
  </span>
  <button class="clear-all-btn" (click)="clearAllFilters()">Clear All</button>
</div>
```

---

### 3.3 Quick Filter by Cell Value

**Feature:** Right-click a cell to filter by that value.

**Implementation:**

```typescript
// Add to cell context menu
onCellContextMenu(event: CellContextMenuEvent): void {
  const value = event.value;
  const field = event.colDef?.field;

  if (field && value !== null && value !== undefined) {
    this.showCellContextMenu = true;
    this.cellContextMenuData = { field, value };
    this.cellContextMenuPosition = { x: event.event?.clientX || 0, y: event.event?.clientY || 0 };
  }
}

filterByValue(): void {
  if (!this.gridApi || !this.cellContextMenuData) return;

  const { field, value } = this.cellContextMenuData;
  const filterInstance = this.gridApi.getFilterInstance(field);

  if (filterInstance) {
    filterInstance.setModel({
      type: 'equals',
      filter: value
    });
    this.gridApi.onFilterChanged();
  }

  this.showCellContextMenu = false;
}

excludeValue(): void {
  if (!this.gridApi || !this.cellContextMenuData) return;

  const { field, value } = this.cellContextMenuData;
  const filterInstance = this.gridApi.getFilterInstance(field);

  if (filterInstance) {
    filterInstance.setModel({
      type: 'notEqual',
      filter: value
    });
    this.gridApi.onFilterChanged();
  }

  this.showCellContextMenu = false;
}
```

---

### 3.4 Save/Load Filter Presets

**Feature:** Save current filter configuration as a named preset for reuse.

**Implementation:**

```typescript
@Input() entityName: string;

savedFilterPresets: { name: string; model: Record<string, unknown> }[] = [];

async loadFilterPresets(): Promise<void> {
  // Load from UserSettings or dedicated entity
  const settingKey = `grid-filter-presets/${this.entityName}`;
  const saved = UserInfoEngine.Instance.GetSetting(settingKey);
  if (saved) {
    this.savedFilterPresets = JSON.parse(saved);
  }
}

async saveCurrentFilterAsPreset(name: string): Promise<void> {
  if (!this.gridApi) return;

  const filterModel = this.gridApi.getFilterModel();
  this.savedFilterPresets.push({ name, model: filterModel });

  const settingKey = `grid-filter-presets/${this.entityName}`;
  UserInfoEngine.Instance.SetSetting(settingKey, JSON.stringify(this.savedFilterPresets));
}

applyFilterPreset(preset: { name: string; model: Record<string, unknown> }): void {
  if (!this.gridApi) return;
  this.gridApi.setFilterModel(preset.model);
}

deleteFilterPreset(index: number): void {
  this.savedFilterPresets.splice(index, 1);
  const settingKey = `grid-filter-presets/${this.entityName}`;
  UserInfoEngine.Instance.SetSetting(settingKey, JSON.stringify(this.savedFilterPresets));
}
```

---

## Phase 4: Bulk Operations & Export

### 4.1 Export Visible Data to CSV/Excel

**Feature:** Export currently visible (filtered) data to CSV or Excel format.

**Implementation:**

```typescript
exportToCsv(): void {
  if (!this.gridApi) return;

  this.gridApi.exportDataAsCsv({
    fileName: `${this._entityInfo?.Name || 'export'}_${new Date().toISOString().split('T')[0]}.csv`,
    columnKeys: this.getVisibleColumnKeys(),
    processCellCallback: (params) => this.formatCellForExport(params)
  });
}

exportToExcel(): void {
  if (!this.gridApi) return;

  // AG Grid Enterprise has built-in Excel export
  // For Community, we can use a library like xlsx
  const rowData = this.getFilteredRowData();
  const headers = this.getVisibleColumns().map(c => c.headerName || c.field);

  // Convert to worksheet format
  const wsData = [headers];
  for (const row of rowData) {
    const rowValues = this.getVisibleColumnKeys().map(key => row[key]);
    wsData.push(rowValues);
  }

  // Use xlsx library to generate file
  // ... implementation with xlsx library
}

private getVisibleColumnKeys(): string[] {
  return this.gridApi?.getColumns()
    ?.filter(col => col.isVisible())
    .map(col => col.getColId()) || [];
}

private getFilteredRowData(): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  this.gridApi?.forEachNodeAfterFilterAndSort(node => {
    if (node.data) rows.push(node.data);
  });
  return rows;
}
```

---

### 4.2 Bulk Edit Selected Rows

**Feature:** Select multiple rows and edit a field across all of them.

**Implementation:**

```typescript
@Output() bulkEditRequest = new EventEmitter<BulkEditEvent>();

selectedRows: BaseEntity[] = [];

onSelectionChanged(): void {
  this.selectedRows = this.gridApi?.getSelectedRows() || [];
}

openBulkEditDialog(): void {
  if (this.selectedRows.length === 0) return;

  // Emit event for parent to handle, or open dialog directly
  this.bulkEditRequest.emit({
    entityName: this._entityInfo?.Name || '',
    records: this.selectedRows,
    editableFields: this._entityInfo?.Fields.filter(f => f.AllowUpdateInView) || []
  });
}

// Or implement inline:
bulkEditField: string = '';
bulkEditValue: unknown = null;
showBulkEditDialog = false;

async applyBulkEdit(): Promise<void> {
  if (!this.bulkEditField || this.selectedRows.length === 0) return;

  for (const record of this.selectedRows) {
    record.Set(this.bulkEditField, this.bulkEditValue);
  }

  // Save all - could batch this
  const results = await Promise.all(this.selectedRows.map(r => r.Save()));
  const successCount = results.filter(r => r).length;

  this.showBulkEditDialog = false;
  // Show notification
}
```

---

### 4.3 Copy Selected Cells to Clipboard

**Feature:** Ctrl+C copies selected cells in Excel-compatible format.

**Implementation:**

```typescript
// AG Grid supports this with clipboardDelimiter option
gridOptions: {
  enableRangeSelection: true,  // AG Grid Enterprise
  // For Community edition, implement manually:
}

// Manual implementation for Community:
@HostListener('keydown', ['$event'])
onKeyDown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
    this.copySelectedToClipboard();
  }
}

copySelectedToClipboard(): void {
  const selectedRows = this.gridApi?.getSelectedRows() || [];
  if (selectedRows.length === 0) return;

  const visibleCols = this.getVisibleColumnKeys();
  const headers = visibleCols.map(key => {
    const field = this._entityInfo?.Fields.find(f => f.Name === key);
    return field?.DisplayName || key;
  });

  const rows = selectedRows.map(row =>
    visibleCols.map(key => this.formatValueForClipboard(row[key])).join('\t')
  );

  const clipboardText = [headers.join('\t'), ...rows].join('\n');
  navigator.clipboard.writeText(clipboardText);
}

private formatValueForClipboard(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
```

---

## Phase 5: Data Analysis Features

### 5.1 Footer Aggregations

**Feature:** Show Sum/Avg/Count/Min/Max for numeric columns in the grid footer.

**Implementation:**

```typescript
// Add aggregation row at bottom
showAggregations = false;
aggregationData: Record<string, { sum?: number; avg?: number; count: number; min?: number; max?: number }> = {};

toggleAggregations(): void {
  this.showAggregations = !this.showAggregations;
  if (this.showAggregations) {
    this.calculateAggregations();
  }
}

calculateAggregations(): void {
  if (!this._entityInfo || !this.gridApi) return;

  this.aggregationData = {};

  const numericFields = this._entityInfo.Fields.filter(f => f.TSType === 'number');

  for (const field of numericFields) {
    const values: number[] = [];
    this.gridApi.forEachNodeAfterFilterAndSort(node => {
      const val = node.data?.[field.Name];
      if (typeof val === 'number' && !isNaN(val)) {
        values.push(val);
      }
    });

    if (values.length > 0) {
      this.aggregationData[field.Name] = {
        sum: values.reduce((a, b) => a + b, 0),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }
  }
}
```

**Template:**

```html
<div class="grid-footer-aggregations" *ngIf="showAggregations">
  <table>
    <tr>
      <th>Field</th>
      <th>Sum</th>
      <th>Avg</th>
      <th>Min</th>
      <th>Max</th>
      <th>Count</th>
    </tr>
    <tr *ngFor="let field of getNumericFields()">
      <td>{{ field.DisplayName || field.Name }}</td>
      <td>{{ aggregationData[field.Name]?.sum | number }}</td>
      <td>{{ aggregationData[field.Name]?.avg | number:'1.2-2' }}</td>
      <td>{{ aggregationData[field.Name]?.min | number }}</td>
      <td>{{ aggregationData[field.Name]?.max | number }}</td>
      <td>{{ aggregationData[field.Name]?.count }}</td>
    </tr>
  </table>
</div>
```

---

### 5.2 Selected Rows Summary

**Feature:** Status bar showing "5 rows selected | Sum: $1,234.56" for selected rows.

**Implementation:**

```typescript
selectionSummary = {
  count: 0,
  numericSums: {} as Record<string, number>
};

onSelectionChanged(): void {
  const selectedRows = this.gridApi?.getSelectedRows() || [];
  this.selectionSummary.count = selectedRows.length;

  // Calculate sums for numeric fields
  this.selectionSummary.numericSums = {};

  if (this._entityInfo && selectedRows.length > 0) {
    const numericFields = this._entityInfo.Fields.filter(f => f.TSType === 'number');

    for (const field of numericFields) {
      const sum = selectedRows.reduce((acc, row) => {
        const val = row[field.Name];
        return acc + (typeof val === 'number' ? val : 0);
      }, 0);

      if (sum !== 0) {
        this.selectionSummary.numericSums[field.DisplayName || field.Name] = sum;
      }
    }
  }
}
```

**Template:**

```html
<div class="selection-summary" *ngIf="selectionSummary.count > 0">
  <span class="count">{{ selectionSummary.count }} row(s) selected</span>
  <span class="numeric-sums" *ngFor="let entry of selectionSummary.numericSums | keyvalue">
    | {{ entry.key }}: {{ entry.value | number }}
  </span>
</div>
```

---

### 5.3 Conditional Formatting Rules

**Feature:** Define rules to highlight cells based on value conditions.

**Implementation:**

```typescript
interface ConditionalFormatRule {
  field: string;
  condition: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between' | 'isEmpty';
  value: unknown;
  value2?: unknown;  // For 'between'
  style: {
    backgroundColor?: string;
    color?: string;
    fontWeight?: string;
  };
}

conditionalFormatRules: ConditionalFormatRule[] = [];

// Apply in cell renderer
private applyConditionalFormatting(value: unknown, field: string): string {
  for (const rule of this.conditionalFormatRules) {
    if (rule.field !== field) continue;

    if (this.evaluateCondition(value, rule)) {
      const styles = [];
      if (rule.style.backgroundColor) styles.push(`background-color: ${rule.style.backgroundColor}`);
      if (rule.style.color) styles.push(`color: ${rule.style.color}`);
      if (rule.style.fontWeight) styles.push(`font-weight: ${rule.style.fontWeight}`);
      return styles.join('; ');
    }
  }
  return '';
}

private evaluateCondition(value: unknown, rule: ConditionalFormatRule): boolean {
  switch (rule.condition) {
    case 'equals':
      return value === rule.value;
    case 'contains':
      return String(value).toLowerCase().includes(String(rule.value).toLowerCase());
    case 'greaterThan':
      return Number(value) > Number(rule.value);
    case 'lessThan':
      return Number(value) < Number(rule.value);
    case 'between':
      const num = Number(value);
      return num >= Number(rule.value) && num <= Number(rule.value2);
    case 'isEmpty':
      return value === null || value === undefined || value === '';
    default:
      return false;
  }
}
```

---

## Phase 6: Navigation & Efficiency

### 6.1 Keyboard Shortcuts

**Feature:** Comprehensive keyboard navigation for power users.

**Shortcuts:**
- `Ctrl+Home` - Go to first row
- `Ctrl+End` - Go to last row
- `Ctrl+G` - Quick jump to record by ID
- `Ctrl+F` - Focus search/filter
- `Ctrl+A` - Select all rows
- `Escape` - Clear selection / close dialogs
- `Delete` - Delete selected rows (with confirmation)
- `Enter` - Open selected record
- `Space` - Toggle row selection

**Implementation:**

```typescript
@HostListener('keydown', ['$event'])
onKeyDown(event: KeyboardEvent): void {
  // Ctrl+Home - First row
  if (event.ctrlKey && event.key === 'Home') {
    event.preventDefault();
    this.gridApi?.ensureIndexVisible(0);
    this.gridApi?.setFocusedCell(0, this.getFirstVisibleColumn());
  }

  // Ctrl+End - Last row
  if (event.ctrlKey && event.key === 'End') {
    event.preventDefault();
    const lastIndex = this.gridApi?.getDisplayedRowCount() - 1 || 0;
    this.gridApi?.ensureIndexVisible(lastIndex);
    this.gridApi?.setFocusedCell(lastIndex, this.getFirstVisibleColumn());
  }

  // Ctrl+G - Quick jump
  if (event.ctrlKey && event.key === 'g') {
    event.preventDefault();
    this.openQuickJumpDialog();
  }

  // Ctrl+F - Focus filter
  if (event.ctrlKey && event.key === 'f') {
    event.preventDefault();
    this.focusFilterInput();
  }

  // Escape - Clear selection
  if (event.key === 'Escape') {
    this.gridApi?.deselectAll();
    this.closeAllDialogs();
  }

  // Enter - Open record
  if (event.key === 'Enter' && !event.ctrlKey) {
    const focusedCell = this.gridApi?.getFocusedCell();
    if (focusedCell) {
      const rowNode = this.gridApi?.getDisplayedRowAtIndex(focusedCell.rowIndex);
      if (rowNode?.data) {
        this.rowDoubleClick.emit(rowNode.data);
      }
    }
  }
}
```

---

### 6.2 Quick Jump to Record by ID

**Feature:** Dialog to enter a record ID and jump directly to it.

**Implementation:**

```typescript
showQuickJumpDialog = false;
quickJumpId = '';

openQuickJumpDialog(): void {
  this.showQuickJumpDialog = true;
  this.quickJumpId = '';
  // Focus input after dialog opens
  setTimeout(() => {
    document.getElementById('quick-jump-input')?.focus();
  }, 100);
}

async jumpToRecord(): Promise<void> {
  if (!this.quickJumpId || !this.gridApi) return;

  // First try to find in current data
  let found = false;
  this.gridApi.forEachNode((node, index) => {
    if (node.data?.ID === this.quickJumpId) {
      this.gridApi?.ensureIndexVisible(index);
      this.gridApi?.setFocusedCell(index, this.getFirstVisibleColumn());
      this.gridApi?.selectNode(node);
      found = true;
    }
  });

  if (!found) {
    // Record not in current view - could be filtered out or not loaded
    // Option: Load it specifically or show message
    this.showNotification(`Record ${this.quickJumpId} not found in current view`);
  }

  this.showQuickJumpDialog = false;
}
```

---

### 6.3 Recently Viewed Records

**Feature:** Quick access to recently viewed records for this entity.

**Implementation:**

```typescript
recentlyViewedRecords: { id: string; name: string; viewedAt: Date }[] = [];
maxRecentRecords = 10;

onRecordViewed(record: BaseEntity): void {
  const nameField = this._entityInfo?.Fields.find(f => f.IsNameField);
  const name = nameField ? record.Get(nameField.Name) : record.ID;

  // Remove if already in list
  this.recentlyViewedRecords = this.recentlyViewedRecords.filter(r => r.id !== record.ID);

  // Add to front
  this.recentlyViewedRecords.unshift({
    id: record.ID,
    name: String(name),
    viewedAt: new Date()
  });

  // Trim to max
  if (this.recentlyViewedRecords.length > this.maxRecentRecords) {
    this.recentlyViewedRecords = this.recentlyViewedRecords.slice(0, this.maxRecentRecords);
  }

  // Persist to UserSettings
  this.saveRecentRecords();
}

private saveRecentRecords(): void {
  const key = `recent-records/${this._entityInfo?.Name}`;
  UserInfoEngine.Instance.SetSetting(key, JSON.stringify(this.recentlyViewedRecords));
}

private loadRecentRecords(): void {
  const key = `recent-records/${this._entityInfo?.Name}`;
  const saved = UserInfoEngine.Instance.GetSetting(key);
  if (saved) {
    this.recentlyViewedRecords = JSON.parse(saved);
  }
}
```

---

## Phase 7: Relationship Navigation

### 7.1 Inline Related Record Counts

**Feature:** For FK fields, show count of related records as a badge.

**Implementation:**

```typescript
// This requires loading counts for related entities
// Best done as a separate async operation after initial load

relatedRecordCounts: Map<string, Map<string, number>> = new Map();

async loadRelatedRecordCounts(): Promise<void> {
  if (!this._entityInfo || !this.gridApi) return;

  // Find FK fields that point TO this entity (reverse relationships)
  const relationships = this._entityInfo.RelatedEntities;

  // Get all record IDs in current view
  const recordIds: string[] = [];
  this.gridApi.forEachNode(node => {
    if (node.data?.ID) recordIds.push(node.data.ID);
  });

  // Batch query for counts
  const rv = new RunView();
  const countQueries = relationships.map(rel => ({
    EntityName: rel.RelatedEntity,
    ExtraFilter: `${rel.RelatedEntityJoinField} IN ('${recordIds.join("','")}')`,
    ResultType: 'count_only' as const
  }));

  // ... process results into relatedRecordCounts map
}
```

---

### 7.2 FK Hover Preview

**Feature:** Hover over a FK field to see a preview of the related record.

**Implementation:**

```typescript
hoverPreviewData: Record<string, unknown> | null = null;
hoverPreviewPosition = { x: 0, y: 0 };
showHoverPreview = false;
hoverPreviewTimeout: ReturnType<typeof setTimeout> | null = null;

onCellMouseOver(event: CellMouseOverEvent): void {
  const field = this._entityInfo?.Fields.find(f => f.Name === event.colDef?.field);

  if (field?.RelatedEntityID && event.value) {
    // Delay showing preview
    this.hoverPreviewTimeout = setTimeout(() => {
      this.loadAndShowPreview(field.RelatedEntityID!, event.value, event.event);
    }, 500);
  }
}

onCellMouseOut(): void {
  if (this.hoverPreviewTimeout) {
    clearTimeout(this.hoverPreviewTimeout);
    this.hoverPreviewTimeout = null;
  }
  this.showHoverPreview = false;
}

async loadAndShowPreview(entityId: string, recordId: string, event: MouseEvent | null): Promise<void> {
  const md = new Metadata();
  const entity = md.Entities.find(e => e.ID === entityId);
  if (!entity) return;

  const rv = new RunView();
  const result = await rv.RunView({
    EntityName: entity.Name,
    ExtraFilter: `ID='${recordId}'`,
    MaxRows: 1,
    ResultType: 'simple'
  });

  if (result.Success && result.Results.length > 0) {
    this.hoverPreviewData = result.Results[0];
    this.hoverPreviewPosition = { x: event?.clientX || 0, y: event?.clientY || 0 };
    this.showHoverPreview = true;
  }
}
```

---

## Phase 8: Visual Customization & Polish

### 8.1 Row Density Toggle

**Feature:** Switch between Compact, Normal, and Comfortable row heights.

**Implementation:**

```typescript
type RowDensity = 'compact' | 'normal' | 'comfortable';
rowDensity: RowDensity = 'normal';

readonly densitySettings = {
  compact: { rowHeight: 28, headerHeight: 32 },
  normal: { rowHeight: 36, headerHeight: 40 },
  comfortable: { rowHeight: 48, headerHeight: 52 }
};

setRowDensity(density: RowDensity): void {
  this.rowDensity = density;
  const settings = this.densitySettings[density];

  if (this.gridApi) {
    this.gridApi.setGridOption('rowHeight', settings.rowHeight);
    this.gridApi.setGridOption('headerHeight', settings.headerHeight);
    this.gridApi.resetRowHeights();
  }

  // Save preference
  UserInfoEngine.Instance.SetSetting('grid-row-density', density);
}
```

---

### 8.2 Column Type Icons in Headers

**Feature:** Small icons indicating field type (FK, Date, Number, etc.).

**Implementation:**

```typescript
private getColumnTypeIcon(field: EntityFieldInfo): string {
  if (field.IsPrimaryKey) return '<i class="fa-solid fa-key header-type-icon" title="Primary Key"></i>';
  if (field.RelatedEntityID) return '<i class="fa-solid fa-link header-type-icon" title="Foreign Key"></i>';
  if (field.TSType === 'Date') return '<i class="fa-solid fa-calendar header-type-icon" title="Date"></i>';
  if (field.TSType === 'boolean') return '<i class="fa-solid fa-toggle-on header-type-icon" title="Boolean"></i>';
  if (field.TSType === 'number') return '<i class="fa-solid fa-hashtag header-type-icon" title="Number"></i>';
  if (field.Length > 500 || field.Length < 0) return '<i class="fa-solid fa-align-left header-type-icon" title="Long Text"></i>';
  return '';
}

// Use in column def
const colDef: ColDef = {
  headerName: `${this.getColumnTypeIcon(field)} ${field.DisplayNameOrName}`,
  // or use headerComponent for more control
};
```

---

### 8.3 Smart Column Ordering

**Feature:** Automatically order columns by importance when no saved order exists.

**Implementation:**

```typescript
private sortFieldsByImportance(fields: EntityFieldInfo[]): EntityFieldInfo[] {
  return [...fields].sort((a, b) => {
    const priorityA = this.getFieldPriority(a);
    const priorityB = this.getFieldPriority(b);
    return priorityA - priorityB;
  });
}

private getFieldPriority(field: EntityFieldInfo): number {
  // Name fields first
  if (field.IsNameField) return 0;

  // Common important fields
  const nameLower = field.Name.toLowerCase();
  if (nameLower === 'name' || nameLower === 'title') return 1;
  if (nameLower === 'status') return 2;
  if (nameLower === 'type' || nameLower === 'category') return 3;
  if (nameLower.endsWith('name')) return 4;

  // Dates
  if (field.TSType === 'Date') return 50;

  // Foreign keys
  if (field.RelatedEntityID) return 60;

  // Numbers
  if (field.TSType === 'number') return 70;

  // Booleans at end
  if (field.TSType === 'boolean') return 80;

  // Long text at very end
  if (field.Length > 500 || field.Length < 0) return 90;

  // System fields last
  if (field.Name.startsWith('__mj_')) return 100;

  // Default
  return 40;
}
```

---

## Implementation Summary

| Phase | Features | Effort | Dependencies |
|-------|----------|--------|--------------|
| **Phase 1** | Bug fixes (visibility, widths, FK events) | 2-3 days | None |
| **Phase 2** | Column management (context menu, visibility panel, tooltips) | 2-3 days | Phase 1 |
| **Phase 3** | Filtering (quick filters, chips, presets) | 3-4 days | Phase 1 |
| **Phase 4** | Bulk ops (export, bulk edit, clipboard) | 2-3 days | Phase 1 |
| **Phase 5** | Analysis (aggregations, summary, conditional formatting) | 3-4 days | Phase 1 |
| **Phase 6** | Navigation (keyboard, quick jump, recent) | 2-3 days | Phase 1 |
| **Phase 7** | Relationships (counts, hover preview) | 3-4 days | Phase 1 |
| **Phase 8** | Visual polish (density, icons, ordering) | 2-3 days | Phase 1 |

**Total Estimated Effort:** 19-27 days

---

## Files Affected Summary

| File | Phases |
|------|--------|
| `entity-data-grid.component.ts` | All |
| `entity-data-grid.component.html` | 2, 3, 4, 5, 6, 7 |
| `entity-data-grid.component.css` | 1, 2, 3, 5, 8 |
| `grid-types.ts` | 1, 4, 5 |
| `entity-viewer.component.ts` | 1, 4 |
| `entity-viewer.component.html` | 2, 3, 4, 5 |

---

## Testing Checklist

### Phase 1 Testing
- [ ] AI Agents entity shows only DefaultInView columns on first load
- [ ] Column headers are not truncated
- [ ] Description fields have adequate width (~250px)
- [ ] FK field clicks emit event (not open new tab)
- [ ] FK field shows related record name where available

### Phase 2-8 Testing
- [ ] Right-click context menu works on all column headers
- [ ] Column visibility panel shows all fields
- [ ] Filter chips appear and can be removed
- [ ] Export produces valid CSV with current filters
- [ ] Keyboard shortcuts work as documented
- [ ] Aggregations calculate correctly
- [ ] Row density changes apply immediately

---

## Open Questions

1. **AG Grid License** - Some features (range selection, Excel export) require AG Grid Enterprise. What's our license status?

2. **Performance** - Related record counts and hover previews could be expensive. Should we add lazy loading / caching?

3. **Mobile/Touch** - How should right-click context menus work on touch devices?

4. **Persistence** - Should filter presets be user-specific or shareable with team?
