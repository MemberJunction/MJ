# @memberjunction/ng-join-grid

A checkbox-based grid component for managing many-to-many entity relationships in MemberJunction applications. Supports both junction entity record creation/deletion and direct field editing modes.

## Installation

```bash
npm install @memberjunction/ng-join-grid
```

## Overview

The Join Grid displays rows from one entity against columns from another, with checkboxes at each intersection. Checking a box creates a record in the junction entity; unchecking deletes it. An alternative Fields mode allows editing field values directly in related records. All changes are batched in transaction groups for atomic saves.

```mermaid
flowchart LR
    subgraph Rows["Row Entity"]
        R1["User A"]
        R2["User B"]
        R3["User C"]
    end
    subgraph Grid["Join Grid"]
        G["Checkbox Matrix"]
    end
    subgraph Cols["Column Entity"]
        C1["Role 1"]
        C2["Role 2"]
    end
    subgraph Junction["Junction Entity"]
        J["UserRoles records"]
    end

    R1 --> G
    R2 --> G
    R3 --> G
    C1 --> G
    C2 --> G
    G -->|create/delete| J

    style Rows fill:#2d6a9f,stroke:#1a4971,color:#fff
    style Grid fill:#7c5295,stroke:#563a6b,color:#fff
    style Cols fill:#2d8659,stroke:#1a5c3a,color:#fff
    style Junction fill:#b8762f,stroke:#8a5722,color:#fff
```

## Usage

### Module Import

```typescript
import { JoinGridModule } from '@memberjunction/ng-join-grid';

@NgModule({
  imports: [JoinGridModule]
})
export class YourModule {}
```

### Entity Mode (Many-to-Many)

```html
<mj-join-grid
  [RowsEntityName]="'Users'"
  [RowsEntityDisplayField]="'UserName'"
  [ColumnsEntityName]="'Roles'"
  [ColumnsEntityDisplayField]="'RoleName'"
  [JoinEntityName]="'UserRoles'"
  [JoinEntityRowForeignKey]="'UserID'"
  [JoinEntityColumnForeignKey]="'RoleID'"
  [CheckBoxValueMode]="'RecordExists'"
  [ShowSaveButton]="true"
  [ShowCancelButton]="true">
</mj-join-grid>
```

### Fields Mode (Direct Editing)

```html
<mj-join-grid
  [RowsEntityName]="'Users'"
  [RowsEntityDisplayField]="'UserName'"
  [ColumnsMode]="'Fields'"
  [JoinEntityName]="'UserPreferences'"
  [JoinEntityRowForeignKey]="'UserID'"
  [JoinEntityDisplayColumns]="['PreferenceType', 'PreferenceValue']"
  [ShowSaveButton]="true">
</mj-join-grid>
```

## Operation Modes

| Mode | `CheckBoxValueMode` | Behavior |
|------|---------------------|----------|
| Entity + RecordExists | `'RecordExists'` | Checkbox creates/deletes junction records |
| Entity + ColumnValue | `'ColumnValue'` | Checkbox toggles a boolean field on existing records |
| Fields | N/A | Displays and edits field values in the join entity |

## Key Inputs

### Row Configuration

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `RowsEntityName` | `string` | -- | Entity for rows (required) |
| `RowsEntityDisplayField` | `string` | -- | Field to display in first column (required) |
| `RowsEntityDataSource` | `'FullEntity' \| 'ViewName' \| 'Array'` | `'FullEntity'` | Data source type |
| `RowsExtraFilter` | `string` | -- | SQL filter for rows |
| `RowsOrderBy` | `string` | -- | SQL order by for rows |

### Column Configuration

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `ColumnsMode` | `'Entity' \| 'Fields'` | `'Entity'` | Column generation mode |
| `ColumnsEntityName` | `string` | -- | Entity for columns (Entity mode) |
| `ColumnsEntityDisplayField` | `string` | -- | Field for column headers |

### Join Entity Configuration

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `JoinEntityName` | `string` | -- | Junction entity name (required) |
| `JoinEntityRowForeignKey` | `string` | -- | FK linking to row entity (required) |
| `JoinEntityColumnForeignKey` | `string` | -- | FK linking to column entity (required) |
| `CheckBoxValueMode` | `'RecordExists' \| 'ColumnValue'` | `'RecordExists'` | How checkbox state is determined |
| `EditMode` | `'None' \| 'Save' \| 'Queue'` | `'None'` | Editing mode for form integration |

### Public Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `Refresh()` | `Promise<void>` | Reload all grid data |
| `Save()` | `Promise<boolean>` | Save all pending changes |
| `CancelEdit()` | `void` | Cancel pending changes |

## Exported Classes

- `JoinGridCell` -- Represents a single cell in the grid
- `JoinGridRow` -- Represents a row with column data

## Dependencies

- [@memberjunction/core](../../MJCore/README.md) -- Metadata, RunView, BaseEntity
- [@memberjunction/ng-shared](../shared/README.md) -- Shared Angular utilities
- `@progress/kendo-angular-grid` -- Grid rendering
