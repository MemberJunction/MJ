# Join Grid

The Join Grid component is a powerful Angular grid that allows you to display and edit relationships between two entities, typically in a many-to-many relationship. It provides a checkbox-based interface for mapping relationships between records.

## Features

- **Two Operation Modes**:
  - **Entity Mode**: Creates/deletes records in a junction entity
  - **Fields Mode**: Updates fields in related records
- **Flexible Data Sources**: Load data from full entities, views, or arrays
- **Automatic Grid Generation**: Builds grid structure based on provided entity relationships
- **Integrated with MemberJunction**: Works with the MJ metadata system and BaseEntity objects
- **Transaction Support**: Manages pending changes with transaction groups
- **Form Integration**: Can be integrated with parent form components and respond to form events

## Installation

```bash
npm install @memberjunction/ng-join-grid
```

## Usage

### Import the Module

```typescript
import { JoinGridModule } from '@memberjunction/ng-join-grid';

@NgModule({
  imports: [
    JoinGridModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage (Entity Mode)

Use this mode when you want to manage relationships between two entities by creating or deleting records in a junction entity.

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

### Fields Mode

Used when you want to edit fields in a related entity:

```html
<mj-join-grid
  [RowsEntityName]="'Users'"
  [RowsEntityDisplayField]="'UserName'"
  [ColumnsMode]="'Fields'"
  [JoinEntityName]="'UserPreferences'"
  [JoinEntityRowForeignKey]="'UserID'"
  [JoinEntityDisplayColumns]="['PreferenceType', 'PreferenceValue']"
  [ShowSaveButton]="true"
  [ShowCancelButton]="true">
</mj-join-grid>
```

## API Reference

### Inputs

#### General Configuration
- `ShowSaveButton`: boolean - Show/hide the save button
- `ShowCancelButton`: boolean - Show/hide the cancel button
- `EditMode`: 'None' | 'Save' | 'Queue' - Control editing mode
- `NewRecordDefaultValues`: { [key: string]: any } - Default values for new records

#### Row Configuration
- `RowsEntityName`: string - Name of the entity for rows
- `RowsEntityDisplayName`: string - (Optional) Display name instead of entity name
- `RowsEntityDisplayField`: string - Field to display in the first column
- `RowsEntityDataSource`: 'FullEntity' | 'ViewName' | 'Array' - Data source for rows
- `RowsEntityViewName`: string - View name when datasource is 'ViewName'
- `RowsExtraFilter`: string - Additional filter for rows
- `RowsOrderBy`: string - Order by clause for rows
- `RowsEntityArray`: BaseEntity[] - Array of entities when datasource is 'Array'

#### Column Configuration
- `ColumnsMode`: 'Entity' | 'Fields' - Mode for column generation
- `ColumnsEntityName`: string - Name of entity for columns (Entity mode)
- `ColumnsEntityDisplayField`: string - Field to display as column headers (Entity mode)
- `ColumnsEntityDataSource`: 'FullEntity' | 'ViewName' | 'Array' - Data source for columns
- `ColumnsEntityViewName`: string - View name when datasource is 'ViewName'
- `ColumnsExtraFilter`: string - Additional filter for columns
- `ColumnsOrderBy`: string - Order by clause for columns
- `ColumnsEntityArray`: BaseEntity[] - Array of entities when datasource is 'Array'

#### Join Entity Configuration
- `JoinEntityName`: string - Name of junction entity
- `JoinEntityRowForeignKey`: string - Foreign key field for rows
- `JoinEntityColumnForeignKey`: string - Foreign key field for columns
- `JoinEntityDisplayColumns`: string[] - Columns to display (Fields mode)
- `JoinEntityExtraFilter`: string - Additional filter for junction entity
- `CheckBoxValueMode`: 'RecordExists' | 'ColumnValue' - How checkbox values are stored
- `CheckBoxValueField`: string - Field for checkbox values when mode is 'ColumnValue'

### Methods

- `Refresh()`: Load/reload grid data
- `Save()`: Save all pending changes
- `CancelEdit()`: Cancel pending changes
- `UpdateCellValueDirect(row, colIndex, newValue)`: Update a cell value (Fields mode)
- `AddJoinEntityRecord(row)`: Add a new junction record (Fields mode)
- `RemoveJoinEntityRecord(row)`: Remove a junction record (Fields mode)

## Examples

### User-Role Assignment Grid

```typescript
// Component
@Component({
  selector: 'app-user-roles',
  template: `
    <mj-join-grid
      [RowsEntityName]="'Users'"
      [RowsEntityDisplayField]="'UserName'"
      [ColumnsEntityName]="'Roles'"
      [ColumnsEntityDisplayField]="'RoleName'"
      [JoinEntityName]="'UserRoles'"
      [JoinEntityRowForeignKey]="'UserID'"
      [JoinEntityColumnForeignKey]="'RoleID'"
      [RowsExtraFilter]="'IsActive = 1'"
      [ColumnsExtraFilter]="'IsActive = 1'"
      [RowsOrderBy]="'UserName ASC'"
      [ColumnsOrderBy]="'RoleName ASC'"
      [ShowSaveButton]="true"
      [ShowCancelButton]="true">
    </mj-join-grid>
  `
})
export class UserRolesComponent { }
```

### Product Category Assignment with Custom Values

```typescript
// Component with defaults for new junction records
@Component({
  selector: 'app-product-categories',
  template: `
    <mj-join-grid
      [RowsEntityName]="'Products'"
      [RowsEntityDisplayField]="'ProductName'"
      [ColumnsEntityName]="'Categories'"
      [ColumnsEntityDisplayField]="'CategoryName'"
      [JoinEntityName]="'ProductCategories'"
      [JoinEntityRowForeignKey]="'ProductID'"
      [JoinEntityColumnForeignKey]="'CategoryID'"
      [NewRecordDefaultValues]="{'IsPrimary': false}"
      [ShowSaveButton]="true"
      [ShowCancelButton]="true">
    </mj-join-grid>
  `
})
export class ProductCategoriesComponent {
  // Additional component logic
}
```