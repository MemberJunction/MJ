# Study Lists Functionality - Comprehensive Implementation Plan

## Executive Summary

This plan transforms MemberJunction's Lists feature from a basic utility into a powerful, first-class citizen of the platform. Lists enable users to create static collections of records from any entity - perfect for task tracking, curation, batch processing, and workflow integration.

**Key Deliverables:**
1. **World-class ListManagementDialog** - Gorgeous, responsive, mobile-friendly shared component
2. **List Actions** - Enable AI agents and workflows to manage lists
3. **Deep UI Integration** - UserViewGrid, Data Explorer, Base Forms toolbar
4. **Record List Membership Visibility** - See which lists contain a record
5. **Bulk Operations** - Add/remove multiple records efficiently
6. **Lists Dashboard** - Central hub for managing all lists

---

## Part 1: Shared ListManagementDialog Component

### 1.1 Component Design Philosophy

Create a single, reusable dialog that provides a **gorgeous, responsive, mobile-friendly** experience for all list operations. This component will be used across UserViewGrid, Data Explorer, and Base Forms.

### 1.2 Component Location

```
packages/Angular/Generic/list-management/
├── src/
│   ├── lib/
│   │   ├── list-management.module.ts
│   │   ├── components/
│   │   │   ├── list-management-dialog/
│   │   │   │   ├── list-management-dialog.component.ts
│   │   │   │   ├── list-management-dialog.component.html
│   │   │   │   └── list-management-dialog.component.css
│   │   │   ├── list-item/
│   │   │   │   ├── list-item.component.ts
│   │   │   │   ├── list-item.component.html
│   │   │   │   └── list-item.component.css
│   │   │   ├── create-list-inline/
│   │   │   │   ├── create-list-inline.component.ts
│   │   │   │   ├── create-list-inline.component.html
│   │   │   │   └── create-list-inline.component.css
│   │   │   └── list-category-tree/
│   │   │       ├── list-category-tree.component.ts
│   │   │       ├── list-category-tree.component.html
│   │   │       └── list-category-tree.component.css
│   │   ├── services/
│   │   │   └── list-management.service.ts
│   │   └── models/
│   │       └── list-management.models.ts
│   ├── public-api.ts
│   └── index.ts
├── package.json
├── tsconfig.lib.json
└── ng-package.json
```

### 1.3 Dialog Features & UX

#### Header Section
```
┌─────────────────────────────────────────────────────────────────────┐
│  [📋] Add to Lists                                              [X] │
│  ─────────────────────────────────────────────────────────────────  │
│  Adding 3 records from Contacts                                     │
│  ═══════════════════════════════════════════════════════════════════│
```

#### Search & Filter Bar
```
│  ┌──────────────────────────────────────────────────────┐  [+New]  │
│  │ 🔍 Search lists...                               [X] │          │
│  └──────────────────────────────────────────────────────┘          │
│  ─────────────────────────────────────────────────────────────────  │
│  [All] [My Lists] [Shared] [Recent]                    Sort: Name ▼│
│  ═══════════════════════════════════════════════════════════════════│
```

#### List Items (with membership indicators)
```
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ☐ 📁 High Priority Leads                              [● 2/3] ││
│  │   └─ "Follow up on hot leads" • 47 items • Updated 2h ago     ││
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ ☑ 📁 Q4 Prospects                                     [✓ 3/3] ││
│  │   └─ "Quarterly prospects list" • 128 items • Updated 1d ago  ││
│  ├─────────────────────────────────────────────────────────────────┤│
│  │ ☐ 📁 Needs Review                                     [○ 0/3] ││
│  │   └─ "Records requiring review" • 23 items • Updated 5m ago   ││
│  └─────────────────────────────────────────────────────────────────┘│
│  ═══════════════════════════════════════════════════════════════════│
```

**Membership Indicators:**
- `[✓ 3/3]` - All selected records are in this list (green)
- `[● 2/3]` - Some selected records are in this list (amber/partial)
- `[○ 0/3]` - No selected records are in this list (gray)

#### Create New List Inline
```
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ ➕ Create New List                                              ││
│  │   ┌────────────────────────────────────────────────────────┐   ││
│  │   │ List Name                                              │   ││
│  │   └────────────────────────────────────────────────────────┘   ││
│  │   ┌────────────────────────────────────────────────────────┐   ││
│  │   │ Description (optional)                                 │   ││
│  │   └────────────────────────────────────────────────────────┘   ││
│  │   Category: [Select Category ▼]        [Create List] [Cancel]  ││
│  └─────────────────────────────────────────────────────────────────┘│
```

#### Footer Actions
```
│  ═══════════════════════════════════════════════════════════════════│
│                                           [Cancel]  [Apply Changes] │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.4 Component API

```typescript
// list-management.models.ts
export interface ListManagementDialogConfig {
  mode: 'add' | 'remove' | 'manage';  // Operation mode
  entityId: string;                    // Entity ID for filtering lists
  entityName: string;                  // Display name
  recordIds: string[];                 // Records to add/remove
  recordDisplayNames?: string[];       // Optional display names for context
  allowCreate?: boolean;               // Allow inline list creation (default: true)
  allowRemove?: boolean;               // Allow removing from lists (default: true in 'manage' mode)
  showMembership?: boolean;            // Show membership indicators (default: true)
  preSelectedListIds?: string[];       // Pre-select specific lists
}

export interface ListManagementResult {
  action: 'apply' | 'cancel';
  added: { listId: string; recordIds: string[] }[];
  removed: { listId: string; recordIds: string[] }[];
  newListsCreated: ListEntity[];
}

export interface ListItemViewModel {
  list: ListEntity;
  itemCount: number;
  membershipCount: number;        // How many of the selected records are in this list
  totalSelectedRecords: number;   // Total records being managed
  isFullMember: boolean;          // All records are in this list
  isPartialMember: boolean;       // Some records are in this list
  isNotMember: boolean;           // No records are in this list
  lastUpdated: Date;
  category?: ListCategoryEntity;
}
```

### 1.5 Responsive Design

**Desktop (>1024px):**
- Dialog width: 650px
- Full feature display
- Side-by-side category tree (optional)

**Tablet (768px - 1024px):**
- Dialog width: 90vw (max 650px)
- Stacked layout
- Collapsible category filter

**Mobile (<768px):**
- Full-screen bottom sheet pattern
- Large touch targets (min 48px)
- Swipe gestures for list items
- Floating action button for create
- Virtual keyboard-aware positioning

```css
/* Responsive breakpoints */
@media (max-width: 768px) {
  .list-dialog {
    width: 100vw;
    height: 80vh;
    bottom: 0;
    left: 0;
    right: 0;
    border-radius: 16px 16px 0 0;
    animation: slideUp 0.3s ease-out;
  }

  .list-item {
    min-height: 56px;  /* Touch-friendly */
    padding: 12px 16px;
  }

  .list-item-checkbox {
    width: 24px;
    height: 24px;
  }
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

### 1.6 State Management

```typescript
// list-management.service.ts
@Injectable({ providedIn: 'root' })
export class ListManagementService {
  // Cache lists by entity ID
  private listCache = new Map<string, { lists: ListEntity[]; timestamp: Date }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Get lists for entity with caching
  async getListsForEntity(entityId: string, userId: string): Promise<ListEntity[]>;

  // Get membership info for records
  async getRecordMembership(
    entityId: string,
    recordIds: string[]
  ): Promise<Map<string, string[]>>; // Map<listId, recordIds[]>

  // Batch add records to lists
  async addRecordsToLists(
    listIds: string[],
    recordIds: string[],
    contextUser: UserInfo
  ): Promise<{ success: number; failed: number; errors: string[] }>;

  // Batch remove records from lists
  async removeRecordsFromLists(
    listIds: string[],
    recordIds: string[],
    contextUser: UserInfo
  ): Promise<{ success: number; failed: number; errors: string[] }>;

  // Create new list
  async createList(
    name: string,
    description: string,
    entityId: string,
    categoryId?: string,
    contextUser: UserInfo
  ): Promise<ListEntity>;

  // Invalidate cache
  invalidateCache(entityId?: string): void;
}
```

---

## Part 1.5: List Sharing & Security Model

### 1.5.1 Philosophy
Instead of a generic system, we are implementing a purpose-built sharing model for Lists to ensure performance and rapid delivery. The `UserID` on the `Lists` entity represents the **Owner**.

### 1.5.2 Schema Additions

#### `__mj.ListShare` -> Entity: `List Shares`
Tracks active access to lists for other users.

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier PK | |
| ListID | uniqueidentifier FK | Target List |
| UserID | uniqueidentifier FK | User granted access |
| Role | nvarchar(50) | 'Editor', 'Viewer' |
| Status | nvarchar(20) | 'Active', 'Pending' |
| CreatedAt | datetime | |

**Roles:**
- **Owner**: (Implicit via `Lists.UserID`) Full control, can delete list.
- **Editor**: Can add/remove items, rename list, manage shares.
- **Viewer**: Read-only access to list items.

#### `__mj.ListInvitation` -> Entity: `List Invitations`
Tracks pending invitations (especially for external or non-mapped users).

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier PK | |
| ListID | uniqueidentifier FK | Target List |
| Email | nvarchar(255) | Recipient email |
| Role | nvarchar(50) | 'Editor', 'Viewer' |
| Token | nvarchar(100) | Secure access token |
| ExpiresAt | datetime | Expiration |
| CreatedByUserID | uniqueidentifier FK | Who sent it |

### 1.5.3 Security Logic
1. **View Access**:
   Users can see lists where they are the **Owner** (`Lists.UserID`) OR where they have a record in `ListShares`.
2. **Edit Access**:
   Requires **Owner** status OR `ListShares.Role = 'Editor'`.
3. **Manage Sharing**:
   Requires **Owner** status OR `ListShares.Role = 'Editor'` (if configured to allow editors to share).
4. **Delete Access**:
   Strictly **Owner** only.

---

## Part 2: List Actions for AI/Workflows

### 2.1 Action Package Structure

```
packages/Actions/CoreActions/src/lists/
├── index.ts
├── add-records-to-list.action.ts
├── remove-records-from-list.action.ts
├── create-list.action.ts
├── get-list-records.action.ts
├── update-list-item-status.action.ts
├── copy-list.action.ts
├── merge-lists.action.ts
└── get-record-list-membership.action.ts
```

### 2.2 Action Definitions

#### AddRecordsToListAction
```typescript
@RegisterClass(BaseAction, 'Add Records to List')
export class AddRecordsToListAction extends BaseAction {
  // Params:
  // - ListID: string (required) - Target list ID
  // - RecordIDs: string[] (required) - Records to add
  // - SkipDuplicates: boolean (optional, default: true) - Skip already-added records
  // - SetStatus: string (optional) - Initial status for new items
  // - AdditionalData: object (optional) - Custom metadata per item

  // Returns:
  // - TotalRecords: number
  // - Added: number
  // - Skipped: number (duplicates)
  // - Failed: number
  // - Errors: string[]
}
```

#### RemoveRecordsFromListAction
```typescript
@RegisterClass(BaseAction, 'Remove Records from List')
export class RemoveRecordsFromListAction extends BaseAction {
  // Params:
  // - ListID: string (required) - Target list ID
  // - RecordIDs: string[] (optional) - Specific records to remove
  // - FilterByStatus: string (optional) - Remove only items with this status
  // - RemoveAll: boolean (optional) - Remove all items from list

  // Returns:
  // - Removed: number
  // - Failed: number
  // - Errors: string[]
}
```

#### CreateListAction
```typescript
@RegisterClass(BaseAction, 'Create List')
export class CreateListAction extends BaseAction {
  // Params:
  // - Name: string (required)
  // - Description: string (optional)
  // - EntityName: string (required) - Entity this list is for
  // - CategoryID: string (optional)
  // - AddRecordIDs: string[] (optional) - Initial records to add

  // Returns:
  // - ListID: string
  // - List: ListEntity
  // - RecordsAdded: number
}
```

#### GetListRecordsAction
```typescript
@RegisterClass(BaseAction, 'Get List Records')
export class GetListRecordsAction extends BaseAction {
  // Params:
  // - ListID: string (required)
  // - FilterByStatus: string (optional)
  // - IncludeRecordDetails: boolean (optional, default: false)
  // - MaxRecords: number (optional)

  // Returns:
  // - Records: ListDetailEntity[] or full entity objects
  // - TotalCount: number
}
```

#### UpdateListItemStatusAction
```typescript
@RegisterClass(BaseAction, 'Update List Item Status')
export class UpdateListItemStatusAction extends BaseAction {
  // Params:
  // - ListID: string (required)
  // - RecordIDs: string[] (optional) - Specific records, or all if omitted
  // - CurrentStatus: string (optional) - Filter by current status
  // - NewStatus: 'Active' | 'Complete' | 'Disabled' | 'Error' | 'Pending' | 'Rejected'

  // Returns:
  // - Updated: number
  // - Failed: number
}
```

#### CopyListAction
```typescript
@RegisterClass(BaseAction, 'Copy List')
export class CopyListAction extends BaseAction {
  // Params:
  // - SourceListID: string (required)
  // - NewName: string (required)
  // - NewDescription: string (optional)
  // - IncludeItems: boolean (optional, default: true)
  // - FilterByStatus: string (optional) - Only copy items with this status

  // Returns:
  // - NewListID: string
  // - NewList: ListEntity
  // - ItemsCopied: number
}
```

#### GetRecordListMembershipAction
```typescript
@RegisterClass(BaseAction, 'Get Record List Membership')
export class GetRecordListMembershipAction extends BaseAction {
  // Params:
  // - EntityName: string (required)
  // - RecordID: string (required)
  // - IncludeSharedLists: boolean (optional, default: false)

  // Returns:
  // - Lists: ListEntity[]
  // - MembershipDetails: { listId: string; addedAt: Date; status: string }[]
}
```

---

## Part 3: UserViewGrid Integration

### 3.1 Current State Analysis

The UserViewGrid already has "Add to List" functionality, but it's basic:
- Simple list selection dialog
- No membership indicators
- No inline list creation
- Basic search only
- No bulk remove capability

### 3.2 Enhancement Plan

#### Replace Existing Dialog
Replace the current dialog in `ng-user-view-grid.component.html` (lines 211-271) with the new `ListManagementDialog`:

```typescript
// In ng-user-view-grid.component.ts

// Add import
import { ListManagementDialogComponent, ListManagementDialogConfig } from '@memberjunction/ng-list-management';

// Replace dialog toggle method
public async openListManagementDialog(): Promise<void> {
  const selectedRecordIds = this.recordsToCompare.map(r =>
    this._entityInfo.PrimaryKey.Value(r).toString()
  );

  const config: ListManagementDialogConfig = {
    mode: 'manage',
    entityId: this._entityInfo.ID,
    entityName: this._entityInfo.Name,
    recordIds: selectedRecordIds,
    allowCreate: true,
    allowRemove: true,
    showMembership: true
  };

  // Use WindowService or inline component
  this.listManagementConfig = config;
  this.showListManagementDialog = true;
}

public onListManagementComplete(result: ListManagementResult): void {
  this.showListManagementDialog = false;
  if (result.action === 'apply') {
    // Show success notification
    const added = result.added.reduce((sum, a) => sum + a.recordIds.length, 0);
    const removed = result.removed.reduce((sum, r) => sum + r.recordIds.length, 0);

    if (added > 0 || removed > 0) {
      this.sharedService.CreateSimpleNotification(
        `Updated lists: ${added} added, ${removed} removed`,
        'info',
        2500
      );
    }
  }

  // Exit selection mode
  this.enableCheckbox(true, 'addToList');
}
```

#### Add Context Menu Integration
Add right-click context menu option for "Add to List":

```typescript
// Add to grid configuration
public contextMenuItems = [
  { text: 'Add to List', icon: 'fa-rectangle-list', action: 'addToList' },
  { text: 'View Lists', icon: 'fa-list-check', action: 'viewLists' },
  // ... other items
];

public onContextMenuSelect(item: ContextMenuItem, dataItem: any): void {
  switch (item.action) {
    case 'addToList':
      this.openListManagementForSingleRecord(dataItem);
      break;
    case 'viewLists':
      this.showListsForRecord(dataItem);
      break;
  }
}
```

### 3.3 Template Changes

```html
<!-- Replace existing dialog with new component -->
<mj-list-management-dialog
  *ngIf="showListManagementDialog"
  [config]="listManagementConfig"
  (complete)="onListManagementComplete($event)"
  (cancel)="showListManagementDialog = false">
</mj-list-management-dialog>
```

---

## Part 4: Data Explorer Integration

### 4.1 Current State

Data Explorer uses `EntityViewerModule` and has no list integration. Need to add:
- Toolbar button for list operations
- Selection mode for bulk list operations
- Context menu for individual records

### 4.2 Enhancement Plan

#### Add to View Selector Toolbar

In `/packages/Angular/Explorer/dashboards/src/DataExplorer/components/view-selector/view-selector.component.html`:

```html
<!-- After Export to Excel button -->
<button kendoButton
        [look]="'flat'"
        [title]="'Add to List'"
        (click)="onAddToListClick()"
        [disabled]="!hasSelectedRecords">
  <span class="fa-solid fa-rectangle-list"></span>
</button>
```

#### Add Selection Mode Toggle

```html
<!-- In header-right section -->
<button kendoButton
        [look]="'flat'"
        [title]="selectionMode ? 'Exit Selection Mode' : 'Select Records'"
        (click)="toggleSelectionMode()"
        [class.active]="selectionMode">
  <span class="fa-solid fa-check-double"></span>
</button>
```

#### State Management

```typescript
// In data-explorer-dashboard.component.ts

// Add selection state
selectionMode: boolean = false;
selectedRecordIds: string[] = [];

// Toggle selection mode
toggleSelectionMode(): void {
  this.selectionMode = !this.selectionMode;
  if (!this.selectionMode) {
    this.selectedRecordIds = [];
  }
}

// Handle record selection from viewer
onRecordSelectionChanged(recordIds: string[]): void {
  this.selectedRecordIds = recordIds;
}

// Open list management
openListManagement(): void {
  if (this.selectedRecordIds.length === 0) {
    this.sharedService.CreateSimpleNotification(
      'Please select at least one record',
      'warning',
      2000
    );
    return;
  }

  this.listManagementConfig = {
    mode: 'manage',
    entityId: this.state.selectedEntity.ID,
    entityName: this.state.selectedEntity.Name,
    recordIds: this.selectedRecordIds,
    allowCreate: true,
    allowRemove: true,
    showMembership: true
  };
  this.showListManagementDialog = true;
}
```

#### Entity Viewer Enhancements

The `EntityViewerComponent` needs to support selection mode:

```typescript
// Add to entity-viewer.component.ts
@Input() selectionMode: boolean = false;
@Output() selectionChanged = new EventEmitter<string[]>();

// Track selected records
selectedRecordIds: Set<string> = new Set();

onRecordCheckboxChange(recordId: string, checked: boolean): void {
  if (checked) {
    this.selectedRecordIds.add(recordId);
  } else {
    this.selectedRecordIds.delete(recordId);
  }
  this.selectionChanged.emit([...this.selectedRecordIds]);
}

selectAll(): void {
  // Select all visible records
}

clearSelection(): void {
  this.selectedRecordIds.clear();
  this.selectionChanged.emit([]);
}
```

---

## Part 5: Base Forms Toolbar Enhancement

### 5.1 Current State

The toolbar has a basic "Add to List" button that opens a simple dialog. Need to:
- Replace with new ListManagementDialog
- Add "View Lists" option to see which lists contain this record
- Show list count badge on button

### 5.2 Enhancement Plan

#### Update FormToolbarComponent

```typescript
// In form-toolbar.ts

// Add imports
import {
  ListManagementDialogComponent,
  ListManagementDialogConfig,
  ListManagementService
} from '@memberjunction/ng-list-management';

// Add properties
listMembershipCount: number = 0;
showListManagementDialog: boolean = false;
showListMembershipPanel: boolean = false;
listManagementConfig: ListManagementDialogConfig | null = null;
recordListMembership: ListEntity[] = [];

// Inject service
constructor(
  private listService: ListManagementService,
  // ... other dependencies
) {}

// Load list membership on record load
async loadListMembership(): Promise<void> {
  if (!this.form.record?.IsSaved) return;

  const recordId = this.form.EntityInfo.PrimaryKey.Value(this.form.record).toString();
  const membership = await this.listService.getRecordMembership(
    this.form.EntityInfo.ID,
    [recordId]
  );

  this.listMembershipCount = 0;
  membership.forEach((recordIds, listId) => {
    if (recordIds.includes(recordId)) {
      this.listMembershipCount++;
    }
  });
}

// Open list management dialog
openListManagement(): void {
  const recordId = this.form.EntityInfo.PrimaryKey.Value(this.form.record).toString();

  this.listManagementConfig = {
    mode: 'manage',
    entityId: this.form.EntityInfo.ID,
    entityName: this.form.EntityInfo.Name,
    recordIds: [recordId],
    allowCreate: true,
    allowRemove: true,
    showMembership: true
  };
  this.showListManagementDialog = true;
}

// Show lists containing this record
async showRecordLists(): Promise<void> {
  const recordId = this.form.EntityInfo.PrimaryKey.Value(this.form.record).toString();
  this.recordListMembership = await this.listService.getListsForRecord(
    this.form.EntityInfo.ID,
    recordId
  );
  this.showListMembershipPanel = true;
}
```

#### Update Template

```html
<!-- Replace existing list button with enhanced version -->
@if (!form.EditMode && form.record?.IsSaved) {
  <div class="list-button-group">
    <!-- Main list button with badge -->
    <button kendoButton
            (click)="openListManagement()"
            title="Manage List Membership"
            class="list-button">
      <span class="fa-solid fa-rectangle-list"></span>
      @if (listMembershipCount > 0) {
        <span class="list-badge">{{listMembershipCount}}</span>
      }
    </button>

    <!-- Dropdown for additional options -->
    <kendo-dropdownbutton
      [data]="listMenuItems"
      [icon]="'chevron-down'"
      [look]="'flat'"
      (itemClick)="onListMenuClick($event)">
    </kendo-dropdownbutton>
  </div>
}

<!-- List Management Dialog -->
<mj-list-management-dialog
  *ngIf="showListManagementDialog"
  [config]="listManagementConfig"
  (complete)="onListManagementComplete($event)"
  (cancel)="showListManagementDialog = false">
</mj-list-management-dialog>

<!-- List Membership Side Panel -->
<kendo-drawer
  *ngIf="showListMembershipPanel"
  [mode]="'overlay'"
  [position]="'end'"
  [width]="350"
  [expanded]="true"
  (close)="showListMembershipPanel = false">

  <ng-template kendoDrawerTemplate>
    <div class="list-membership-panel">
      <h3>
        <span class="fa-solid fa-list-check"></span>
        Lists Containing This Record
      </h3>

      @if (recordListMembership.length === 0) {
        <div class="empty-state">
          <span class="fa-solid fa-inbox"></span>
          <p>This record is not in any lists</p>
          <button kendoButton (click)="openListManagement()">
            Add to a List
          </button>
        </div>
      } @else {
        <div class="list-membership-items">
          @for (list of recordListMembership; track list.ID) {
            <div class="membership-item">
              <div class="membership-info">
                <strong>{{list.Name}}</strong>
                <span class="list-meta">{{list.Description}}</span>
              </div>
              <button kendoButton
                      [look]="'flat'"
                      [fillMode]="'outline'"
                      (click)="removeFromList(list)"
                      title="Remove from this list">
                <span class="fa-solid fa-times"></span>
              </button>
            </div>
          }
        </div>
      }
    </div>
  </ng-template>
</kendo-drawer>
```

#### Styling

```css
.list-button-group {
  display: inline-flex;
  align-items: center;
}

.list-button {
  position: relative;
}

.list-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #3b82f6;
  color: white;
  font-size: 10px;
  font-weight: 600;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
}

.list-membership-panel {
  padding: 20px;
}

.list-membership-panel h3 {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e5e7eb;
}

.membership-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 8px;
  transition: background 0.2s;
}

.membership-item:hover {
  background: #f9fafb;
}

.membership-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.list-meta {
  font-size: 12px;
  color: #6b7280;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6b7280;
}

.empty-state .fa-inbox {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}
```

---

## Part 6: Record List Membership Visibility

### 6.1 Feature: "Which Lists Is This Record In?"

Enable users to quickly see and manage which lists contain a specific record.

#### Implementation Points:

1. **Form Toolbar Badge** - Show count on list button (covered in Part 5)

2. **Detail Panel Integration** - Add to `EntityRecordDetailPanel`:
   ```html
   <div class="record-lists-section" *ngIf="recordLists.length > 0">
     <h4>
       <span class="fa-solid fa-rectangle-list"></span>
       In {{recordLists.length}} list(s)
     </h4>
     <div class="list-chips">
       @for (list of recordLists.slice(0, 3); track list.ID) {
         <span class="list-chip" (click)="navigateToList(list)">
           {{list.Name}}
         </span>
       }
       @if (recordLists.length > 3) {
         <span class="list-chip more" (click)="showAllLists()">
           +{{recordLists.length - 3}} more
         </span>
       }
     </div>
   </div>
   ```

3. **Hover Tooltip** - Quick preview on grid rows showing list membership

4. **Grid Column Option** - Optional "Lists" column showing membership badges

### 6.2 Service Method

```typescript
// In ListManagementService
async getListsForRecord(
  entityId: string,
  recordId: string
): Promise<ListEntity[]> {
  const rv = new RunView();

  // Get all list details for this record
  const detailsResult = await rv.RunView<ListDetailEntity>({
    EntityName: 'List Details',
    ExtraFilter: `RecordID = '${recordId}'`,
    ResultType: 'entity_object'
  });

  if (!detailsResult.Success || detailsResult.Results.length === 0) {
    return [];
  }

  const listIds = detailsResult.Results.map(d => d.ListID);

  // Get the lists (filtered by entity)
  const listsResult = await rv.RunView<ListEntity>({
    EntityName: 'Lists',
    ExtraFilter: `ID IN ('${listIds.join("','")}') AND EntityID = '${entityId}'`,
    ResultType: 'entity_object'
  });

  return listsResult.Success ? listsResult.Results : [];
}
```

---

## Part 7: Bulk Operations

### 7.1 Stored Procedure: spCreateListDetailBatch

```sql
-- migrations/v2/VYYYYMMDDHHMI__list_batch_operations.sql

CREATE OR ALTER PROCEDURE ${flyway:defaultSchema}.spCreateListDetailBatch
    @ListID UNIQUEIDENTIFIER,
    @RecordIDs ${flyway:defaultSchema}.IDListTableType READONLY,
    @DefaultStatus NVARCHAR(30) = 'Pending',
    @SkipDuplicates BIT = 1
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @InsertedCount INT = 0;
    DECLARE @SkippedCount INT = 0;

    -- Create temp table for results
    CREATE TABLE #Results (
        ID UNIQUEIDENTIFIER,
        RecordID NVARCHAR(445),
        Status NVARCHAR(10)
    );

    -- Insert new records, optionally skipping duplicates
    IF @SkipDuplicates = 1
    BEGIN
        INSERT INTO ${flyway:defaultSchema}.ListDetail (
            ID, ListID, RecordID, Sequence, Status
        )
        OUTPUT inserted.ID, inserted.RecordID, 'Added' INTO #Results
        SELECT
            NEWID(),
            @ListID,
            r.ID,
            ROW_NUMBER() OVER (ORDER BY r.ID) + ISNULL(
                (SELECT MAX(Sequence) FROM ${flyway:defaultSchema}.ListDetail WHERE ListID = @ListID), 0
            ),
            @DefaultStatus
        FROM @RecordIDs r
        WHERE NOT EXISTS (
            SELECT 1 FROM ${flyway:defaultSchema}.ListDetail ld
            WHERE ld.ListID = @ListID AND ld.RecordID = r.ID
        );

        SET @InsertedCount = @@ROWCOUNT;
        SET @SkippedCount = (SELECT COUNT(*) FROM @RecordIDs) - @InsertedCount;
    END
    ELSE
    BEGIN
        INSERT INTO ${flyway:defaultSchema}.ListDetail (
            ID, ListID, RecordID, Sequence, Status
        )
        OUTPUT inserted.ID, inserted.RecordID, 'Added' INTO #Results
        SELECT
            NEWID(),
            @ListID,
            r.ID,
            ROW_NUMBER() OVER (ORDER BY r.ID) + ISNULL(
                (SELECT MAX(Sequence) FROM ${flyway:defaultSchema}.ListDetail WHERE ListID = @ListID), 0
            ),
            @DefaultStatus
        FROM @RecordIDs r;

        SET @InsertedCount = @@ROWCOUNT;
    END

    -- Return results
    SELECT
        @InsertedCount AS InsertedCount,
        @SkippedCount AS SkippedCount,
        (SELECT * FROM #Results FOR JSON PATH) AS Details;

    DROP TABLE #Results;
END;
GO
```

### 7.2 Stored Procedure: spDeleteListDetailBatch

```sql
CREATE OR ALTER PROCEDURE ${flyway:defaultSchema}.spDeleteListDetailBatch
    @ListID UNIQUEIDENTIFIER,
    @RecordIDs ${flyway:defaultSchema}.IDListTableType READONLY
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @DeletedCount INT;

    DELETE FROM ${flyway:defaultSchema}.ListDetail
    WHERE ListID = @ListID
      AND RecordID IN (SELECT ID FROM @RecordIDs);

    SET @DeletedCount = @@ROWCOUNT;

    SELECT @DeletedCount AS DeletedCount;
END;
GO
```

### 7.3 Stored Procedure: spUpdateListDetailStatusBatch

```sql
CREATE OR ALTER PROCEDURE ${flyway:defaultSchema}.spUpdateListDetailStatusBatch
    @ListID UNIQUEIDENTIFIER,
    @RecordIDs ${flyway:defaultSchema}.IDListTableType READONLY,
    @NewStatus NVARCHAR(30),
    @FilterByCurrentStatus NVARCHAR(30) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @UpdatedCount INT;

    UPDATE ${flyway:defaultSchema}.ListDetail
    SET Status = @NewStatus,
        __mj_UpdatedAt = GETUTCDATE()
    WHERE ListID = @ListID
      AND RecordID IN (SELECT ID FROM @RecordIDs)
      AND (@FilterByCurrentStatus IS NULL OR Status = @FilterByCurrentStatus);

    SET @UpdatedCount = @@ROWCOUNT;

    SELECT @UpdatedCount AS UpdatedCount;
END;
GO
```

---

## Part 8: Lists Dashboard Component

### 8.1 Dashboard Features

Create a dedicated dashboard for managing all lists:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [📋] My Lists                                          [+ New List]    │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ 🔍 Search lists...                                              [X] ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ [All Entities ▼]  [All Categories ▼]  [Sort: Recent ▼]                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ 📁 High Priority Leads                                    Contacts  ││
│ │    47 items • Last updated 2 hours ago                             ││
│ │    ──────────────────────────────────────────────────────────────  ││
│ │    Status: ○○○○○●●●●● (40% Complete)                               ││
│ │                                        [View] [Edit] [⋮]          ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ 📁 Q4 Prospects                                           Accounts  ││
│ │    128 items • Last updated 1 day ago                              ││
│ │    ──────────────────────────────────────────────────────────────  ││
│ │    Status: ●●●●●●●●●● (100% Complete)                              ││
│ │                                        [View] [Edit] [⋮]          ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Component Structure

```
packages/Angular/Explorer/explorer-core/src/lib/lists-dashboard/
├── lists-dashboard.component.ts
├── lists-dashboard.component.html
├── lists-dashboard.component.css
├── list-card/
│   ├── list-card.component.ts
│   ├── list-card.component.html
│   └── list-card.component.css
└── list-quick-actions-menu/
    ├── list-quick-actions-menu.component.ts
    ├── list-quick-actions-menu.component.html
    └── list-quick-actions-menu.component.css
```

### 8.3 Dashboard Features

1. **Filtering & Search**
   - Search by name/description
   - Filter by entity type
   - Filter by category
   - Sort options (name, recent, item count)

2. **List Cards**
   - Visual status breakdown (progress bar)
   - Item count with trend indicator
   - Last updated timestamp
   - Quick actions menu

3. **Quick Actions**
   - View list contents
   - Edit list properties
   - Duplicate list
   - Export to Excel
   - Delete list

4. **Empty States**
   - No lists yet
   - No matching results
   - Category-specific empty states

### 8.4 Registration

```typescript
// In explorer-core module or app registration
@RegisterClass(BaseResourceComponent, 'ListsDashboard')
export class ListsDashboardComponent extends BaseResourceComponent {
  // Dashboard implementation
}

// Add to navigation
const navItem = {
  Label: 'My Lists',
  Icon: 'fa-solid fa-rectangle-list',
  ResourceType: 'Custom',
  DriverClass: 'ListsDashboard'
};
```

---

## Part 9: Implementation Order

### Phase 1: Foundation (Week 1)
1. Create `@memberjunction/ng-list-management` package
2. Implement `ListManagementService` with caching
3. Build `ListManagementDialogComponent` with full UX
4. Add responsive/mobile styles

### Phase 2: Actions & Backend (Week 2)
5. Create database batch stored procedures
6. Create List Sharing and Lists Invitation entities
7. Implement List Actions in CoreActions package
8. Add metadata for new stored procedures

### Phase 3: UI Integration (Week 3)
8. Integrate into UserViewGrid (replace existing dialog)
9. Integrate into Data Explorer (add selection mode)
10. Enhance Base Forms toolbar
11. Add record list membership visibility

### Phase 4: Dashboard & Polish (Week 4)
12. Build Lists Dashboard component
13. Add to application navigation
14. Performance optimization
15. Testing and refinement

---

## Part 10: Testing Plan

### Unit Tests
- ListManagementService methods
- Action parameter validation
- Membership calculation logic

### Integration Tests
- Batch stored procedures
- Action execution flows
- Dialog state management

### E2E Tests
- Add records to list flow
- Remove records from list flow
- Create new list inline
- View record list membership
- Mobile responsive behavior

### Performance Tests
- Large list handling (10,000+ items)
- Batch operation performance
- Cache effectiveness

---

## Appendix A: File Changes Summary

### New Packages
- `packages/Angular/Generic/list-management/` - New shared component package

### New Action Files
- `packages/Actions/CoreActions/src/lists/*.action.ts` - 8 new action files

### Modified Files
- `packages/Angular/Explorer/user-view-grid/src/lib/ng-user-view-grid.component.ts`
- `packages/Angular/Explorer/user-view-grid/src/lib/ng-user-view-grid.component.html`
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.ts`
- `packages/Angular/Explorer/dashboards/src/DataExplorer/data-explorer-dashboard.component.html`
- `packages/Angular/Explorer/form-toolbar/src/lib/form-toolbar.ts`
- `packages/Angular/Explorer/form-toolbar/src/lib/form-toolbar.html`
- `packages/Angular/Explorer/form-toolbar/src/lib/form-toolbar.css`
- `packages/Angular/Explorer/explorer-core/src/lib/entity-record-detail-panel/`

### New Migration
- `migrations/v2/VYYYYMMDDHHMI__list_batch_operations.sql`

### New Dashboard Components
- `packages/Angular/Explorer/explorer-core/src/lib/lists-dashboard/`

---

## Appendix B: Dependencies

### NPM Packages (existing, no new deps needed)
- @progress/kendo-angular-dialog
- @progress/kendo-angular-buttons
- @progress/kendo-angular-inputs
- @progress/kendo-angular-layout
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/global

### Internal Package Dependencies
- @memberjunction/ng-shared-generic (for mj-loading)
- @memberjunction/ng-container-directives
- @memberjunction/ng-base-forms (for integration)
