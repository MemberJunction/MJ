# @memberjunction/ng-join-grid

The Join Grid component is a powerful Angular grid that allows you to display and edit relationships between two entities, typically in a many-to-many relationship. It provides a checkbox-based interface for mapping relationships between records.

## Overview

This package provides the `JoinGridComponent` - a flexible grid component designed to manage entity relationships within the MemberJunction framework. It supports both many-to-many relationships through junction entities and direct field editing in related records.

## Features

- **Two Operation Modes**:
  - **Entity Mode**: Creates/deletes records in a junction entity for many-to-many relationships
  - **Fields Mode**: Updates fields directly in related records
- **Flexible Data Sources**: Load data from full entities, views, or arrays
- **Automatic Grid Generation**: Builds grid structure based on provided entity relationships
- **Integrated with MemberJunction**: Works seamlessly with the MJ metadata system and BaseEntity objects
- **Transaction Support**: Manages pending changes with transaction groups
- **Form Integration**: Can be integrated with parent form components and respond to form events
- **Checkbox Value Modes**: Support for both record existence and field value checkboxes
- **Built-in Save/Cancel**: Configurable buttons for managing changes

## Installation

```bash
npm install @memberjunction/ng-join-grid
```

### Prerequisites

This package requires the following peer dependencies:
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2
- `@angular/router`: ^18.0.2

### Dependencies

The component integrates with these MemberJunction packages:
- `@memberjunction/core-entities`
- `@memberjunction/global`
- `@memberjunction/core`
- `@memberjunction/ng-base-types`
- `@memberjunction/ng-container-directives`
- `@memberjunction/ng-shared`

It also uses Kendo UI components:
- `@progress/kendo-angular-buttons`
- `@progress/kendo-angular-dialog`
- `@progress/kendo-angular-layout`
- `@progress/kendo-angular-grid`
- `@progress/kendo-angular-inputs`
- `@progress/kendo-angular-indicators`

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

### Component Selector
```html
<mj-join-grid></mj-join-grid>
```

### Inputs

#### General Configuration
| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `ShowSaveButton` | `boolean` | `true` | Show/hide the save button |
| `ShowCancelButton` | `boolean` | `true` | Show/hide the cancel button |
| `EditMode` | `'None' \| 'Save' \| 'Queue'` | `'None'` | Control editing mode. Use when embedding in parent forms |
| `NewRecordDefaultValues` | `{ [key: string]: any }` | - | Default values for new junction records |

#### Row Configuration
| Input | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `RowsEntityName` | `string` | - | ✓ | Name of the entity for rows |
| `RowsEntityDisplayName` | `string` | - | - | Display name to show instead of entity name |
| `RowsEntityDisplayField` | `string` | - | ✓ | Field to display in the first column |
| `RowsEntityDataSource` | `'FullEntity' \| 'ViewName' \| 'Array'` | `'FullEntity'` | - | Data source type for rows |
| `RowsEntityViewName` | `string` | - | When DataSource='ViewName' | User View name to run |
| `RowsExtraFilter` | `string` | - | - | Additional SQL filter for rows |
| `RowsOrderBy` | `string` | - | - | SQL order by clause for rows |
| `RowsEntityArray` | `BaseEntity[]` | - | When DataSource='Array' | Array of entity objects |

#### Column Configuration
| Input | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `ColumnsMode` | `'Entity' \| 'Fields'` | `'Entity'` | - | Mode for column generation |
| `ColumnsEntityName` | `string` | - | When Mode='Entity' | Name of entity for columns |
| `ColumnsEntityDisplayField` | `string` | - | When Mode='Entity' | Field to display as column headers |
| `ColumnsEntityDataSource` | `'FullEntity' \| 'ViewName' \| 'Array'` | `'FullEntity'` | - | Data source type for columns |
| `ColumnsEntityViewName` | `string` | - | When DataSource='ViewName' | User View name to run |
| `ColumnsExtraFilter` | `string` | - | - | Additional SQL filter for columns |
| `ColumnsOrderBy` | `string` | - | - | SQL order by clause for columns |
| `ColumnsEntityArray` | `BaseEntity[]` | - | When DataSource='Array' | Array of entity objects |

#### Join Entity Configuration
| Input | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `JoinEntityName` | `string` | - | ✓ | Name of the junction/join entity |
| `JoinEntityRowForeignKey` | `string` | - | ✓ | Foreign key field linking to rows |
| `JoinEntityColumnForeignKey` | `string` | - | ✓ | Foreign key field linking to columns |
| `JoinEntityDisplayColumns` | `string[]` | - | When ColumnsMode='Fields' | Columns to display from join entity |
| `JoinEntityExtraFilter` | `string` | - | - | Additional filter for join entity |
| `CheckBoxValueMode` | `'RecordExists' \| 'ColumnValue'` | `'RecordExists'` | - | How checkbox state is determined |
| `CheckBoxValueField` | `string` | - | When CheckBoxValueMode='ColumnValue' | Field storing checkbox value |

### Public Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `Refresh()` | - | `Promise<void>` | Reload all grid data |
| `Save()` | - | `Promise<boolean>` | Save all pending changes |
| `CancelEdit()` | - | `void` | Cancel all pending changes |
| `UpdateCellValueDirect()` | `row: JoinGridRow, colIndex: number, newValue: any` | `void` | Update cell value (Fields mode) |
| `AddJoinEntityRecord()` | `row: JoinGridRow` | `Promise<void>` | Add new join record (Fields mode) |
| `RemoveJoinEntityRecord()` | `row: JoinGridRow` | `Promise<void>` | Remove join record (Fields mode) |

### Exported Classes

#### JoinGridCell
```typescript
export class JoinGridCell {
  index: number;
  RowForeignKeyValue: any;
  ColumnForeignKeyValue?: any;
  data?: BaseEntity;        // Used in Entity mode
  value?: any;              // Used in Fields mode
}
```

#### JoinGridRow
```typescript
export class JoinGridRow {
  FirstColValue: any;
  JoinExists: boolean;
  RowForeignKeyValue: any;
  ColumnData: JoinGridCell[];
  
  GetColumnValue(colIndex: number): any;
  constructor(data: any);
}
```

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
      [NewRecordDefaultValues]="defaultValues"
      [ShowSaveButton]="true"
      [ShowCancelButton]="true">
    </mj-join-grid>
  `
})
export class ProductCategoriesComponent {
  defaultValues = {
    'IsPrimary': false,
    'CreatedAt': new Date()
  };
}
```

### Fields Mode Example - User Preferences

```typescript
// Edit fields directly in the join entity
@Component({
  selector: 'app-user-preferences',
  template: `
    <mj-join-grid
      [RowsEntityName]="'Users'"
      [RowsEntityDisplayField]="'FullName'"
      [ColumnsMode]="'Fields'"
      [JoinEntityName]="'UserPreferences'"
      [JoinEntityRowForeignKey]="'UserID'"
      [JoinEntityDisplayColumns]="['PreferenceName', 'Value', 'IsEnabled']"
      [JoinEntityExtraFilter]="'CategoryID = 5'"
      [ShowSaveButton]="true"
      [ShowCancelButton]="true">
    </mj-join-grid>
  `
})
export class UserPreferencesComponent { }
```

### Using Views and Filters

```typescript
// Component using views and filters for data sources
@Component({
  selector: 'app-active-user-permissions',
  template: `
    <mj-join-grid
      [RowsEntityName]="'Users'"
      [RowsEntityDisplayField]="'UserName'"
      [RowsEntityDataSource]="'ViewName'"
      [RowsEntityViewName]="'Active Users'"
      [RowsOrderBy]="'LastLogin DESC'"
      
      [ColumnsEntityName]="'Permissions'"
      [ColumnsEntityDisplayField]="'PermissionName'"
      [ColumnsExtraFilter]="'IsActive = 1 AND CategoryID IN (1,2,3)'"
      [ColumnsOrderBy]="'DisplayOrder ASC, PermissionName ASC'"
      
      [JoinEntityName]="'UserPermissions'"
      [JoinEntityRowForeignKey]="'UserID'"
      [JoinEntityColumnForeignKey]="'PermissionID'"
      [JoinEntityExtraFilter]="'GrantedDate IS NOT NULL'"
      
      [ShowSaveButton]="true"
      [ShowCancelButton]="true">
    </mj-join-grid>
  `
})
export class ActiveUserPermissionsComponent { }
```

### Using Array Data Sources

```typescript
// Component using pre-loaded arrays
@Component({
  selector: 'app-team-skills',
  template: `
    <mj-join-grid
      [RowsEntityName]="'Employees'"
      [RowsEntityDisplayField]="'Name'"
      [RowsEntityDataSource]="'Array'"
      [RowsEntityArray]="teamMembers"
      
      [ColumnsEntityName]="'Skills'"
      [ColumnsEntityDisplayField]="'SkillName'"
      [ColumnsEntityDataSource]="'Array'"
      [ColumnsEntityArray]="relevantSkills"
      
      [JoinEntityName]="'EmployeeSkills'"
      [JoinEntityRowForeignKey]="'EmployeeID'"
      [JoinEntityColumnForeignKey]="'SkillID'"
      
      [ShowSaveButton]="true"
      [ShowCancelButton]="true">
    </mj-join-grid>
  `
})
export class TeamSkillsComponent implements OnInit {
  teamMembers: BaseEntity[] = [];
  relevantSkills: BaseEntity[] = [];

  async ngOnInit() {
    // Load team members and skills
    const md = new Metadata();
    
    // Load team members
    const employeeEntity = await md.GetEntityObject<BaseEntity>('Employees');
    const teamRv = new RunView();
    const teamResult = await teamRv.RunView({
      EntityName: 'Employees',
      ExtraFilter: 'DepartmentID = 5',
      ResultType: 'entity_object'
    });
    this.teamMembers = teamResult.Results;
    
    // Load relevant skills
    const skillsRv = new RunView();
    const skillsResult = await skillsRv.RunView({
      EntityName: 'Skills',
      ExtraFilter: 'CategoryID IN (1,2,3)',
      ResultType: 'entity_object'
    });
    this.relevantSkills = skillsResult.Results;
  }
}
```

### Embedded in Parent Form with Edit Mode Control

```typescript
// Component embedded in a larger form
@Component({
  selector: 'app-employee-form',
  template: `
    <form>
      <!-- Other form fields -->
      
      <mj-join-grid
        #skillsGrid
        [RowsEntityName]="'Employees'"
        [RowsEntityDisplayField]="'Name'"
        [RowsEntityArray]="[currentEmployee]"
        
        [ColumnsEntityName]="'Skills'"
        [ColumnsEntityDisplayField]="'SkillName'"
        
        [JoinEntityName]="'EmployeeSkills'"
        [JoinEntityRowForeignKey]="'EmployeeID'"
        [JoinEntityColumnForeignKey]="'SkillID'"
        
        [EditMode]="editMode"
        [ShowSaveButton]="false"
        [ShowCancelButton]="false">
      </mj-join-grid>
      
      <button (click)="saveAll()">Save Employee</button>
      <button (click)="cancel()">Cancel</button>
    </form>
  `
})
export class EmployeeFormComponent {
  @ViewChild('skillsGrid') skillsGrid!: JoinGridComponent;
  
  currentEmployee: BaseEntity;
  editMode: 'None' | 'Save' | 'Queue' = 'Queue';
  
  async saveAll() {
    // Save the grid changes
    const gridSaved = await this.skillsGrid.Save();
    
    if (gridSaved) {
      // Save other form data
      await this.currentEmployee.Save();
    }
  }
  
  cancel() {
    this.skillsGrid.CancelEdit();
    // Cancel other form changes
  }
}
```

### Checkbox Value Mode Example

```typescript
// Using checkbox to update a field value instead of record existence
@Component({
  selector: 'app-feature-access',
  template: `
    <mj-join-grid
      [RowsEntityName]="'Users'"
      [RowsEntityDisplayField]="'UserName'"
      
      [ColumnsEntityName]="'Features'"
      [ColumnsEntityDisplayField]="'FeatureName'"
      
      [JoinEntityName]="'UserFeatureAccess'"
      [JoinEntityRowForeignKey]="'UserID'"
      [JoinEntityColumnForeignKey]="'FeatureID'"
      
      [CheckBoxValueMode]="'ColumnValue'"
      [CheckBoxValueField]="'IsEnabled'"
      
      [ShowSaveButton]="true"
      [ShowCancelButton]="true">
    </mj-join-grid>
  `
})
export class FeatureAccessComponent { }
```

## Advanced Usage

### Integration with MemberJunction Forms

The Join Grid component can be integrated with MemberJunction's form system and responds to form events:

```typescript
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@Component({
  template: `
    <mj-join-grid
      [parentForm]="parentFormComponent"
      ...other properties>
    </mj-join-grid>
  `
})
export class MyComponent {
  parentFormComponent: BaseFormComponent;
}
```

### Transaction Support

The component automatically manages transactions when editing:
- Creates transaction groups for batch operations
- Rolls back changes on save failure
- Supports both immediate save and queued edit modes

### Event Handling

The component emits events through the MemberJunction event system:
- Form editing complete events
- Save/cancel events
- Data refresh events

## Building

To build the package:

```bash
cd packages/Angular/Generic/join-grid
npm run build
```

## Notes

- The component requires proper entity metadata configuration in MemberJunction
- Junction entities must have appropriate foreign key relationships defined
- When using Fields mode, ensure the join entity has the display columns configured
- The component respects entity permissions and validation rules