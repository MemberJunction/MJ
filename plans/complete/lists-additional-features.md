# Lists Additional Features - Implementation Plan

## Executive Summary

This plan extends MemberJunction's Lists functionality with advanced features:
1. **Dashboard Consolidation** - Merge "My Lists" into "Browse Lists" for a unified experience
2. **List Sharing System** - Full sharing with permissions (excluding notifications)
3. **Advanced List Operations** - Interactive Venn diagram for set operations with D3.js
4. **View Filtering Integration** - Filter views by list membership

---

## Phase 1: Dashboard Consolidation

### Goal
Merge the "My Lists" functionality into "Browse Lists", eliminating redundancy while preserving the best features from both.

### Features to Preserve from My Lists
- Card view with entity icons and colors
- Category hierarchy tree view with expand/collapse
- Create/Edit/Duplicate/Delete operations
- Grid/List view toggle

### Tasks

#### 1.1 Add View Mode Toggle to Browse Lists
**File**: `packages/Angular/Explorer/dashboards/src/Lists/components/lists-browse-resource.component.ts`

- Add `viewMode: 'table' | 'card' | 'hierarchy'` property
- Add view toggle buttons in header
- Keep table view as default for backwards compatibility

#### 1.2 Port Card View from My Lists
- Add card rendering template from `ListsMyListsResource`
- Reuse entity color/icon generation logic
- Add card grid with responsive layout

#### 1.3 Add Category Hierarchy View
- Port `CategoryNode` interface and tree building logic
- Add recursive template for hierarchy rendering
- Add expand/collapse functionality

#### 1.4 Add "My Lists" Filter Toggle
- Add owner filter with "Mine" / "All" / "Others" options
- "Mine" becomes the equivalent of the old "My Lists" tab
- Default to "Mine" for first-time users

#### 1.5 Add CRUD Operations to Browse
- Port create/edit dialog from My Lists
- Port duplicate functionality
- Port delete with confirmation
- Add context menu for row actions

#### 1.6 Update Application Metadata
**File**: `metadata/applications/.lists-application.json`

- Remove "My Lists" nav item
- Make "Browse" the default tab
- Rename "Browse" to "Lists" for cleaner navigation

#### 1.7 Cleanup - Remove My Lists Resource
- Remove `ListsMyListsResource` class
- Remove `LoadListsMyListsResource` export
- Update module exports

---

## Phase 2: List Sharing System

### Goal
Enable users to share lists with others with role-based permissions.

### 2.1 Database Schema

#### Migration: List Shares Table
**File**: `migrations/v2/V2026MMDDHHMI__list_sharing.sql`

```sql
-- List Shares: tracks who has access to a list
CREATE TABLE ${flyway:defaultSchema}.ListShare (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    ListID UNIQUEIDENTIFIER NOT NULL,
    SharedWithUserID UNIQUEIDENTIFIER NOT NULL,
    Role NVARCHAR(20) NOT NULL DEFAULT 'Viewer', -- 'Viewer', 'Editor', 'Admin'
    SharedByUserID UNIQUEIDENTIFIER NOT NULL,
    SharedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_ListShare_List FOREIGN KEY (ListID) REFERENCES ${flyway:defaultSchema}.List(ID) ON DELETE CASCADE,
    CONSTRAINT FK_ListShare_SharedWith FOREIGN KEY (SharedWithUserID) REFERENCES ${flyway:defaultSchema}.User(ID),
    CONSTRAINT FK_ListShare_SharedBy FOREIGN KEY (SharedByUserID) REFERENCES ${flyway:defaultSchema}.User(ID),
    CONSTRAINT UQ_ListShare_ListUser UNIQUE (ListID, SharedWithUserID)
);

-- List Invitations: pending invitations (optional, for email-based sharing)
CREATE TABLE ${flyway:defaultSchema}.ListInvitation (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    ListID UNIQUEIDENTIFIER NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    Role NVARCHAR(20) NOT NULL DEFAULT 'Viewer',
    Token NVARCHAR(100) NOT NULL,
    ExpiresAt DATETIME NOT NULL,
    InvitedByUserID UNIQUEIDENTIFIER NOT NULL,
    AcceptedAt DATETIME NULL,
    AcceptedByUserID UNIQUEIDENTIFIER NULL,
    __mj_CreatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    __mj_UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT FK_ListInvitation_List FOREIGN KEY (ListID) REFERENCES ${flyway:defaultSchema}.List(ID) ON DELETE CASCADE,
    CONSTRAINT FK_ListInvitation_InvitedBy FOREIGN KEY (InvitedByUserID) REFERENCES ${flyway:defaultSchema}.User(ID)
);
```

### 2.2 Entity Metadata
- Register `List Shares` and `List Invitations` entities
- Run CodeGen to generate TypeScript classes

### 2.3 Permission Logic

**Roles**:
- **Owner** (implicit via `Lists.UserID`): Full control, delete list, manage shares
- **Admin**: Add/remove items, edit properties, manage shares (except delete)
- **Editor**: Add/remove items, edit properties
- **Viewer**: Read-only access

**Access Rules**:
```typescript
interface ListPermissions {
  canView: boolean;      // Owner OR has ListShare record
  canEdit: boolean;      // Owner OR Role in ('Editor', 'Admin')
  canDelete: boolean;    // Owner only
  canShare: boolean;     // Owner OR Role = 'Admin'
  canAddItems: boolean;  // Owner OR Role in ('Editor', 'Admin')
  canRemoveItems: boolean; // Owner OR Role in ('Editor', 'Admin')
}
```

### 2.4 Sharing UI Components

#### Share Dialog Component
**File**: `packages/Angular/Generic/list-management/src/lib/components/list-share-dialog/`

Features:
- User search with autocomplete
- Role selection dropdown
- Current shares list with edit/remove
- Pending invitations section
- Copy shareable link (for invitations)

#### Sharing Indicators in Browse
- Add share icon badge on shared lists
- Show "Shared with you" / "Shared by you" badges
- Filter by sharing status

### 2.5 Server-Side Updates

#### ListEntity Extended
**File**: `packages/MJCoreEntities/src/custom/ListEntityExtended.ts`

- Add permission checking methods
- Add `getShares()` method
- Add `addShare()`, `removeShare()`, `updateShareRole()` methods

#### Browse Query Updates
- Include shared lists in browse query
- Add JOIN to ListShare for permission filtering
- Add sharing metadata to response

---

## Phase 3: Advanced List Operations Dashboard

### Goal
Create an amazing, interactive visualization for set operations using D3.js Venn diagrams.

### 3.1 New Resource Component
**File**: `packages/Angular/Explorer/dashboards/src/Lists/components/lists-operations-resource.component.ts`

Features:
- Select multiple lists of the same entity type
- Interactive Venn diagram visualization
- Real-time set calculations
- Export results to new or existing list

### 3.2 D3.js Venn Diagram Implementation

Using existing D3 patterns from the codebase (see `performance-heatmap.component.ts`):

```typescript
interface VennSet {
  listId: string;
  listName: string;
  recordIds: Set<string>;
  color: string;
}

interface VennIntersection {
  sets: string[];        // List IDs
  size: number;          // Count of records
  recordIds: string[];   // Actual record IDs
  label: string;         // Display label
}
```

**Visualization Features**:
- Proportional circle sizing based on list size
- Overlap regions with intersection counts
- Hover to highlight specific regions
- Click regions to select for operations
- Animated transitions when lists change
- Zoom/pan for large visualizations

### 3.3 Set Operations

**Operations Available**:
| Operation | Description | SQL Equivalent |
|-----------|-------------|----------------|
| Union (A ∪ B) | All records in any selected list | UNION |
| Intersection (A ∩ B) | Records in ALL selected lists | INTERSECT |
| Difference (A - B) | Records in A but not in B | EXCEPT |
| Symmetric Difference | Records in exactly one list | XOR |
| Complement | Records NOT in selected lists | NOT IN |

### 3.4 UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [📊] List Operations                                    [Entity: ▼]    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─── Selected Lists ────────────────────────────────────────────────┐  │
│  │ [+] Add List                                                      │  │
│  │ ┌───────────┐ ┌───────────┐ ┌───────────┐                        │  │
│  │ │ 🔵 Q4     │ │ 🟢 Active │ │ 🟠 Review │   (drag to reorder)    │  │
│  │ │ Prospects │ │ Customers │ │ Pending   │                        │  │
│  │ │ 47 items  │ │ 128 items │ │ 23 items  │                        │  │
│  │ │     [×]   │ │     [×]   │ │     [×]   │                        │  │
│  │ └───────────┘ └───────────┘ └───────────┘                        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── Venn Diagram ──────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │           ╭───────────────╮                                       │  │
│  │        ╭──┤   Q4 Props    │──╮                                    │  │
│  │       ╱   │      32       │   ╲                                   │  │
│  │      │    ╰───────────────╯    │                                  │  │
│  │      │    ╭───┬───────╮        │                                  │  │
│  │      │ ╭──┤ 8 │  15   │──╮     │                                  │  │
│  │      │ │  ╰───┴───────╯  │     │                                  │  │
│  │      ╰─┤     Active      ├─────╯                                  │  │
│  │        │      105        │                                        │  │
│  │        ╰─────────────────╯       ╭───────────────╮                │  │
│  │                                  │ Review: 23    │                │  │
│  │                   ╭───╮          ╰───────────────╯                │  │
│  │                   │ 3 │                                           │  │
│  │                   ╰───╯                                           │  │
│  │                                                                    │  │
│  │  [Click a region to select]                                       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── Selected Region ───────────────────────────────────────────────┐  │
│  │ Q4 Prospects ∩ Active Customers: 15 records                       │  │
│  │                                                                    │  │
│  │ [Create New List from Selection]  [Add to Existing List]          │  │
│  │ [View Records]  [Export to Excel]                                 │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─── Quick Operations ──────────────────────────────────────────────┐  │
│  │ [Union All] [Intersection] [Only in First] [Unique to Each]       │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Implementation Details

#### Venn Calculation Service
**File**: `packages/Angular/Explorer/dashboards/src/Lists/services/list-set-operations.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class ListSetOperationsService {

  async calculateIntersections(
    lists: { id: string; name: string }[],
    contextUser: UserInfo
  ): Promise<VennData> {
    // Load all list details in single query
    const rv = new RunView();
    const listIds = lists.map(l => l.id);

    const result = await rv.RunView<ListDetailEntity>({
      EntityName: 'List Details',
      ExtraFilter: `ListID IN ('${listIds.join("','")}')`,
      Fields: ['ListID', 'RecordID'],
      ResultType: 'simple'
    }, contextUser);

    // Build sets per list
    const sets = new Map<string, Set<string>>();
    // ... calculate all possible intersections

    return { sets, intersections, layoutData };
  }

  union(sets: Set<string>[]): Set<string>;
  intersection(sets: Set<string>[]): Set<string>;
  difference(a: Set<string>, b: Set<string>): Set<string>;
  symmetricDifference(sets: Set<string>[]): Set<string>;
}
```

#### D3 Venn Component
**File**: `packages/Angular/Explorer/dashboards/src/Lists/components/venn-diagram/`

Key D3 patterns to use (from existing codebase):
- `d3.select()` for DOM binding
- `d3.scaleLinear()` for sizing circles
- `d3.transition()` for animations
- `d3.drag()` for interactive positioning
- Mouse events for hover/click interactions
- SVG paths for intersection regions

### 3.6 Add to Navigation
Update `metadata/applications/.lists-application.json`:
```json
{
  "Label": "Operations",
  "Icon": "fa-solid fa-diagram-project",
  "ResourceType": "Custom",
  "DriverClass": "ListsOperationsResource",
  "isDefault": false
}
```

---

## Phase 4: View Filtering by List Membership

### Goal
Enable filtering views to include/exclude records based on list membership.

### 4.1 Filter State Interface Updates

**File**: `packages/Angular/Generic/filter-builder/src/lib/types/filter.types.ts`

Add new filter type:
```typescript
interface ListMembershipFilter {
  type: 'list-membership';
  listId: string;
  listName: string;        // For display
  mode: 'include' | 'exclude';  // In list vs Not in list
}

// Extend FilterDescriptor union
type ExtendedFilterDescriptor = FilterDescriptor | ListMembershipFilter;

// Update CompositeFilterDescriptor
interface CompositeFilterDescriptor {
  logic: FilterLogic;
  filters: (FilterDescriptor | CompositeFilterDescriptor | ListMembershipFilter)[];
}
```

### 4.2 Filter Builder UI Updates

**File**: `packages/Angular/Generic/filter-builder/src/lib/filter-builder/filter-builder.component.ts`

- Add "List Membership" as a special filter type
- Add list picker component with search
- Show list name with item count
- Support multiple list selections

```html
<!-- List membership filter row -->
<div class="filter-row list-filter" *ngIf="filter.type === 'list-membership'">
  <select [(ngModel)]="filter.mode" class="mode-select">
    <option value="include">In List</option>
    <option value="exclude">Not In List</option>
  </select>

  <mj-list-picker
    [entityId]="currentEntityId"
    [(selectedListId)]="filter.listId"
    (listSelected)="onListSelected($event)">
  </mj-list-picker>
</div>
```

### 4.3 Server-Side WHERE Clause Generation

**File**: `packages/MJCoreEntitiesServer/src/custom/userViewEntity.server.ts`

Update `GenerateWhereClause` to handle list membership filters:

```typescript
private generateListMembershipClause(
  filter: ListMembershipFilter,
  entityInfo: EntityInfo
): string {
  const pkField = entityInfo.PrimaryKeys[0].Name;
  const operator = filter.mode === 'include' ? 'IN' : 'NOT IN';

  // For single PK entities, RecordID is the raw PK value
  // For composite PK, need to match the concatenated format
  if (entityInfo.PrimaryKeys.length === 1) {
    return `[${pkField}] ${operator} (
      SELECT RecordID FROM [${this.SchemaName}].vwListDetails
      WHERE ListID = '${filter.listId}'
    )`;
  } else {
    // Composite key: build concatenation expression
    const concatExpr = this.buildCompositeKeyExpression(entityInfo);
    return `(${concatExpr}) ${operator} (
      SELECT RecordID FROM [${this.SchemaName}].vwListDetails
      WHERE ListID = '${filter.listId}'
    )`;
  }
}
```

### 4.4 LLM Prompt Updates (LATER - Task for follow-up)

The smart filter system already includes list filtering documentation in the system prompt. Review and enhance:

**File**: `packages/MJCoreEntitiesServer/src/custom/userViewEntity.server.ts` (GenerateSysPrompt method)

Current support (lines ~167-195):
- Already documents `vwListDetails` usage
- Supports filtering by ListID or List Name
- Provides example SQL patterns

**Enhancement needed**:
- Add examples for "records NOT in list X"
- Add examples for "records in list X AND list Y"
- Add examples for composite key entities

---

## Phase 5: Actions for List Operations

### 5.1 Copy List Action
**File**: `packages/Actions/CoreActions/src/custom/lists/copy-list.action.ts`

```typescript
@RegisterClass(BaseAction, 'Copy List')
export class CopyListAction extends BaseAction {
  // Params:
  // - SourceListID: string (required)
  // - NewName: string (required)
  // - NewDescription: string (optional)
  // - IncludeItems: boolean (default: true)
  // - TargetCategoryID: string (optional)

  // Returns:
  // - NewListID: string
  // - NewList: ListEntity
  // - ItemsCopied: number
}
```

### 5.2 Merge Lists Action
**File**: `packages/Actions/CoreActions/src/custom/lists/merge-lists.action.ts`

```typescript
@RegisterClass(BaseAction, 'Merge Lists')
export class MergeListsAction extends BaseAction {
  // Params:
  // - SourceListIDs: string[] (required, 2+ lists)
  // - Operation: 'union' | 'intersection' | 'difference' (default: union)
  // - TargetListID: string (optional - create new if not provided)
  // - NewListName: string (required if no TargetListID)

  // Returns:
  // - TargetListID: string
  // - RecordsAdded: number
  // - TotalRecords: number
}
```

---

## Implementation Order

### Sprint 1: Dashboard Consolidation
1. ✅ Task 1.1: Add view mode toggle
2. ✅ Task 1.2: Port card view
3. ✅ Task 1.3: Add hierarchy view
4. ✅ Task 1.4: Add owner filter
5. ✅ Task 1.5: Port CRUD operations
6. ✅ Task 1.6: Update app metadata
7. ✅ Task 1.7: Cleanup old component

### Sprint 2: Sharing System
1. Task 2.1: Create migration for ListShare/ListInvitation
2. Task 2.2: Register entities and run CodeGen
3. Task 2.3: Implement permission logic in ListEntityExtended
4. Task 2.4: Build share dialog component
5. Task 2.5: Update Browse with sharing indicators

### Sprint 3: Advanced Operations
1. Task 3.1: Create ListsOperationsResource
2. Task 3.2: Build ListSetOperationsService
3. Task 3.3: Implement D3 Venn diagram component
4. Task 3.4: Add region selection and operations
5. Task 3.5: Add to navigation

### Sprint 4: View Filtering
1. Task 4.1: Update filter types
2. Task 4.2: Add list picker to filter builder
3. Task 4.3: Update WHERE clause generation
4. Task 4.4: Test with saved views

### Sprint 5: Actions and Polish
1. Task 5.1: Implement CopyListAction
2. Task 5.2: Implement MergeListsAction
3. Testing and refinements

---

## Technical Notes

### D3.js Venn Diagram Libraries
Consider using `venn.js` (d3-based) or implementing custom:
- Custom gives more control over styling
- Use `d3.forceSimulation()` for optimal circle positioning
- SVG clip-paths for intersection regions

### Performance Considerations
- Cache list details for selected lists
- Use `shareReplay(1)` for reactive data streams
- Batch operations for large lists
- Virtual scrolling for record lists

### UX Principles
- Immediate visual feedback on interactions
- Smooth transitions (300-500ms)
- Clear affordances for clickable regions
- Mobile-responsive design
- Keyboard accessibility for all operations

---

## Files to Create/Modify

### New Files
- `lists-operations-resource.component.ts` - Operations dashboard
- `venn-diagram.component.ts` - D3 Venn visualization
- `list-set-operations.service.ts` - Set calculations
- `list-share-dialog.component.ts` - Sharing UI
- `list-picker.component.ts` - Reusable list selector
- `copy-list.action.ts` - Copy action
- `merge-lists.action.ts` - Merge action
- `V2026XXXX__list_sharing.sql` - Database migration

### Modified Files
- `lists-browse-resource.component.ts` - Major enhancements
- `lists-application.json` - Navigation updates
- `filter.types.ts` - List filter type
- `filter-builder.component.ts` - List filter UI
- `userViewEntity.server.ts` - WHERE clause generation
- `dashboards/module.ts` - New component exports
