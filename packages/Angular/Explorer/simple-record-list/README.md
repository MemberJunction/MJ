# @memberjunction/ng-simple-record-list

A lightweight, reusable Angular component for displaying, editing, creating, and deleting records in any MemberJunction entity.

## Features

- Simple, streamlined UI for entity data
- Configurable columns display
- Automatic column detection from entity metadata
- Support for creating, editing, and deleting records
- Custom actions with dynamic icons and tooltips
- Confirmation dialogs for delete and custom actions
- Responsive design with loading indicators

## Installation

```bash
npm install @memberjunction/ng-simple-record-list
```

## Usage

Import the module in your application:

```typescript
import { SimpleRecordListModule } from '@memberjunction/ng-simple-record-list';

@NgModule({
  imports: [
    // ...
    SimpleRecordListModule
  ]
})
export class YourModule { }
```

Basic implementation example:

```html
<mj-simple-record-list
  EntityName="Users"
  SortBy="Name"
  [Columns]="['Name', 'Email', 'IsActive']"
  (RecordSelected)="handleRecordSelected($event)"
></mj-simple-record-list>
```

## Input Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| EntityName | string | '' | Name of the entity to display records for |
| Columns | string[] | [] | List of columns to display (auto-detected if empty) |
| SortBy | string | '' | Name of the column to sort by |
| AllowDelete | boolean | true | Whether to show delete button |
| AllowNew | boolean | true | Whether to show new button |
| AllowEdit | boolean | true | Whether to show edit button |
| AllowCustomAction | boolean | false | Whether to show custom action button |
| CustomActionIcon | string | '' | Font Awesome class for custom action icon |
| CustomActionIconFunction | Function | null | Function to determine custom action icon based on record |
| CustomActionTooltip | string | '' | Tooltip text for custom action |
| CustomActionTooltipFunction | Function | null | Function to determine tooltip based on record |
| CustomActionDialogTitle | string | 'Confirm Action' | Title for custom action confirmation dialog |
| CustomActionDialogMessage | string | 'Are you sure...' | Message for custom action confirmation dialog |
| CustomActionDialogInfo | string | '' | Additional info for custom action dialog |
| EditSectionName | string | 'details' | Section name for entity form dialog |

## Output Events

| Event | Type | Description |
|-------|------|-------------|
| RecordSelected | EventEmitter<BaseEntity> | Emitted when a record is selected |
| RecordEdited | EventEmitter<BaseEntity> | Emitted when a record is edited |
| RecordCreated | EventEmitter<BaseEntity> | Emitted when a record is created |
| CustomActionClicked | EventEmitter<BaseEntity> | Emitted when custom action is clicked |
| CustomActionConfirmed | EventEmitter<BaseEntity> | Emitted when custom action is confirmed |

## Custom Actions Example

```html
<mj-simple-record-list
  EntityName="Users"
  [Columns]="['Name', 'Email', 'IsActive']"
  [AllowDelete]="false"
  [AllowCustomAction]="true"
  [CustomActionIconFunction]="getUserToggleIcon"
  [CustomActionTooltipFunction]="getUserToggleTooltip"
  [CustomActionDialogTitle]="'Toggle User Activation'"
  [CustomActionDialogMessage]="'Are you sure you want to toggle activation for this user?'"
  [CustomActionDialogInfo]="'Active users can log in to the system. Inactive users cannot log in.'"
  (RecordSelected)="selectUser($event)"
  (CustomActionConfirmed)="toggleUserActivation($event)"
></mj-simple-record-list>
```

Example of icon and tooltip functions:

```typescript
public getUserToggleIcon(record: BaseEntity): string {
  const user = record as UserEntity;
  return user.IsActive ? 'fa-user-lock' : 'fa-user-check';
}

public getUserToggleTooltip(record: BaseEntity): string {
  const user = record as UserEntity;
  return user.IsActive ? 'Deactivate user' : 'Activate user';
}
```