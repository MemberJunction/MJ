# Plan: Merge BaseFormComponent into Generic, Eliminate Explorer/base-forms

## Goal
Move BaseFormComponent (the class 300+ generated forms extend) into Generic/base-forms, strip all Explorer dependencies, emit events instead, and wire up SingleRecordComponent in Explorer to handle those events.

---

## Phase 1: Rename Generic Package `ng-forms` → `ng-base-forms`

### 1a. Update package identity
- **File**: `packages/Angular/Generic/base-forms/package.json`
  - Change `"name"` from `@memberjunction/ng-forms` to `@memberjunction/ng-base-forms`

### 1b. Update all imports across codebase
Every file that imports from `@memberjunction/ng-forms` needs to change to `@memberjunction/ng-base-forms`. Key locations:
- `packages/Angular/Explorer/base-forms/src/module.ts` (imports MjFormsModule)
- `packages/Angular/Explorer/base-forms/src/lib/base-form-component.ts` (imports MjCollapsiblePanelComponent, FormNavigationEvent)
- `packages/Angular/Explorer/core-entity-forms/src/lib/generated/generated-forms.module.ts`
- `packages/MJExplorer/src/app/generated/generated-forms.module.ts`
- `packages/Angular/Explorer/core-entity-forms/src/lib/custom/custom-forms.module.ts`
- Any other consumers found via grep

### 1c. Update CodeGen template
- **File**: `packages/CodeGenLib/src/Angular/angular-codegen.ts`
  - Line ~219: Change `import { MjFormsModule } from '@memberjunction/ng-forms'` → `'@memberjunction/ng-base-forms'`
  - Line ~220: Remove separate `import { BaseFormsModule } from '@memberjunction/ng-base-forms'` (they'll be the same package now)
  - Line ~336: Update `generateSubModuleEnding()` — merge `MjFormsModule` + `BaseFormsModule` into single `BaseFormsModule` import
  - Line ~438: Change `import { BaseFormComponent } from '@memberjunction/ng-base-forms'` — this stays the same (correct package name now)

### 1d. Rename module export
- Rename `MjFormsModule` → `BaseFormsModule` in Generic/base-forms module.ts and public-api.ts
  - This aligns with the existing name used by Explorer/base-forms consumers
  - All imports of `MjFormsModule` get updated

---

## Phase 2: Move Supporting Types from Explorer → Generic

Move these files from `Explorer/base-forms/src/lib/` into `Generic/base-forms/src/lib/`:

| File | What it is | Notes |
|------|-----------|-------|
| `base-record-component.ts` | Abstract base with `record` + `FormatValue()` | No Explorer deps, moves as-is |
| `base-form-section-component.ts` | ClassFactory registration anchor for sections | No Explorer deps, moves as-is |
| `base-form-section-info.ts` | Section metadata class | No Explorer deps, moves as-is |
| `base-form-context.ts` | Interface for form context | Merge with existing `FormContext` in `form-types.ts` |
| `form-state.interface.ts` | FormState/FormSectionState interfaces | No Explorer deps, moves as-is |
| `form-state.service.ts` | Persists form state to User Settings | Uses `@memberjunction/core` + `core-entities` only. No Explorer deps, moves as-is |
| `section-loader-component.ts` | Dynamic section loader via ClassFactory | No Explorer deps. Needs to be declared in BaseFormsModule |

| `explorer-entity-data-grid.component.ts` | Explorer wrapper for EntityDataGridComponent | Move to Generic, replace `SharedService.Instance.OpenEntityRecord()` with `@Output() Navigate` event that bubbles up. Rename to `EntityDataGridWrapperComponent` or similar. |

**NOT moved** (merged instead):
- `base-form-component.ts` — Its logic gets MERGED into the Generic version (see Phase 3)

Update `Generic/base-forms/src/public-api.ts` to export the new files.
Update `Generic/base-forms/src/module.ts` to declare `SectionLoaderComponent` and `EntityDataGridWrapperComponent`.

### ExplorerEntityDataGridComponent → EntityDataGridWrapperComponent (Generic)

The current Explorer version calls `SharedService.Instance.OpenEntityRecord()` on double-click. The Generic version:
- Replaces that with an `@Output() Navigate` event emitting a `FormNavigationEvent` of kind `'record'`
- The event bubbles up through the collapsible panel → container → BaseFormComponent → SingleRecordComponent
- SingleRecordComponent handles it the same way as all other Navigate events
- Class rename: `ExplorerEntityDataGridComponent` → `EntityDataGridWrapperComponent`
- Selector stays: `mj-explorer-entity-data-grid` (can rename later to avoid churn)

```typescript
// Before (Explorer-specific):
SharedService.Instance.OpenEntityRecord(entityName, pkey);

// After (Generic, event-driven):
this.Navigate.emit({
  Kind: 'record',
  EntityName: entityName,
  PrimaryKey: pkey,
  OpenInNewTab: true  // double-click = new tab
});
```

---

## Phase 3: Create BaseFormComponent as @Directive in Generic

### Architecture

BaseFormComponent becomes an abstract `@Directive()` in Generic/base-forms. This is the class that 300+ generated forms extend via `extends BaseFormComponent`. It contains ALL form logic with ZERO Explorer deps.

`MjRecordFormContainerComponent` stays as a @Component (renamed to `RecordFormContainerComponent`, selector stays `mj-record-form-container`) — it's the layout/template component used in generated HTML templates. Instead of duck-typing, it takes a typed `BaseFormComponent` reference directly (both live in the same package now).

### 3a. Create BaseFormComponent @Directive

New file: `Generic/base-forms/src/lib/base-form-component.ts`

Merge logic from Explorer's `base-form-component.ts` with these changes:

**Kept as-is (no Explorer deps):**
- `EditMode`, `StartEditMode()`, `EndEditMode()`
- Section management: `initSections()`, `IsSectionExpanded()`, `SetSectionExpanded()`, `toggleSection()`, `expandAllSections()`, `collapseAllSections()`, `getSectionOrder()`, `setSectionOrder()`, section counts, `getFormWidthMode()`, etc. — all delegate to FormStateService
- Permission checking: `CheckUserPermission()`, `UserCanEdit`, `UserCanRead`, `UserCanCreate`, `UserCanDelete` — uses `record.CheckPermissions()` (core, no Explorer dep)
- Favorites: `SetFavoriteStatus()`, `IsFavorite` — uses `Metadata` (core)
- Related entity helpers: `BuildRelationshipViewParams()`, `BuildRelationshipViewParamsByEntityName()`, `NewRecordValues()`, `GetRelatedEntityTabDisplayName()`, `HasRelatedEntities` — all use `EntityInfo` (core)
- Validation: `Validate()`, `ValidatePendingRecords()`
- Pending records: `PendingRecords`, `PopulatePendingRecords()`, `PendingRecordsDirty()`
- Save logic: `SaveRecord()`, `InternalSaveRecord()` — uses `Metadata`, `TransactionGroup` (core)
- Cancel logic: `CancelEdit()` — uses `record.Revert()` (core)
- Delete logic: record.Delete() (core)
- Form context: `formContext` getter, `searchFilter`, `showEmptyFields`
- Dependencies: `GetListsCanAddTo()`, `GetRecordDependencies()`, `ShowDependencies()`
- Event raising via MJGlobal: `RaiseEvent()` for EDITING_COMPLETE, POPULATE_PENDING_RECORDS, etc.
- FormStateService inject

**Removed entirely (legacy tab/splitter code):**
- `TabHeight`, `TopAreaHeight`, `GridBottomMargin`, `setTabHeight()`, `ResizeTab()`, `CalcTopAreaHeight()`
- `@ViewChild(MJTabStripComponent)`, `tabComponent`, `tabStrips`, splitter debounce
- `onTabSelect()`, `IsCurrentTab()`, `ContainerObjectHeight`
- `splitterLayoutChange()`, `setupSplitterLayoutDebounce()`
- All tab/splitter-related imports (MJTabStripComponent, TabEvent, Router, ActivatedRoute)

**Replaced with @Output events (remove Explorer deps):**

| Explorer code | Replacement |
|--------------|-------------|
| `sharedService.CreateSimpleNotification('Record saved...', 'success')` | `@Output() RecordSaved = new EventEmitter<RecordSavedEvent>()` — emit after successful save |
| `sharedService.CreateSimpleNotification('Error saving...', 'error')` | `@Output() RecordSaveFailed = new EventEmitter<RecordSaveFailedEvent>()` — emit on save error |
| `sharedService.CreateSimpleNotification('Validation Errors...', 'warning')` | `@Output() ValidationFailed = new EventEmitter<ValidationFailedEvent>()` — emit on validation failure |
| `sharedService.CreateSimpleNotification('Record deleted...', 'success/error')` | `@Output() RecordDeleted / RecordDeleteFailed` |
| `sharedService.InvokeManualResize()` | Remove entirely — not needed with new panel layout |
| `navigationService.OpenEntityRecord(...)` in OnFormNavigate | `@Output() Navigate` (already exists on container, keep on BaseFormComponent) |
| `navigationService.UpdateActiveTabQueryParams(...)` | Remove — legacy tab code |
| `navigationService.OpenNewEntityRecord(...)` | Handled via Navigate event |

**New @Output events on BaseFormComponent:**
```typescript
@Output() Navigate = new EventEmitter<FormNavigationEvent>();
@Output() RecordSaved = new EventEmitter<RecordSavedEvent>();
@Output() RecordSaveFailed = new EventEmitter<RecordSaveFailedEvent>();
@Output() RecordDeleted = new EventEmitter<RecordDeletedEvent>();
@Output() RecordDeleteFailed = new EventEmitter<RecordDeleteFailedEvent>();
@Output() ValidationFailed = new EventEmitter<ValidationFailedEvent>();
@Output() DeleteRequested = new EventEmitter<void>();  // request confirmation from host
```

Add event types to `form-types.ts`:
```typescript
interface RecordSavedEvent { EntityName: string; PrimaryKey: CompositeKey; }
interface RecordSaveFailedEvent { EntityName: string; ErrorMessage: string; }
interface RecordDeletedEvent { EntityName: string; PrimaryKey: CompositeKey; }
interface RecordDeleteFailedEvent { EntityName: string; ErrorMessage: string; }
interface ValidationFailedEvent { EntityName: string; Errors: string[]; }
```

**Constructor changes:**
- Remove: `SharedService`, `Router`, `ActivatedRoute`
- Keep: `ElementRef`, `ChangeDetectorRef` (via inject())
- Add: `FormStateService` (via inject(), already used)

### 3b. Refactor MjRecordFormContainerComponent → RecordFormContainerComponent

- Rename class to `RecordFormContainerComponent`
- Keep selector as `mj-record-form-container`
- **Remove duck-typed FormComponentRef interface entirely**
- Change `@Input() FormComponent: unknown` → `@Input() Form: BaseFormComponent` (typed!)
- Replace all `fc?.SomeMethod()` calls with `this.Form.SomeMethod()` (direct typed access)
- Remove all `Effective*` bridge getters — bind directly to `Form.property` in template
- Remove save/cancel delegation (BaseFormComponent handles these internally now)
- Keep: toolbar rendering, content projection slots, record changes drawer, list management dialog, navigation event relaying from panels

Template changes — bind to `Form.*` directly:
```html
<mj-form-toolbar
  [Record]="Form.record"
  [EditMode]="Form.EditMode"
  [UserCanEdit]="Form.UserCanEdit"
  ...>
</mj-form-toolbar>
```

---

## Phase 4: Update CodeGen Templates

### 4a. Generated TypeScript
Current:
```typescript
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
```
New (same import, same package name after rename):
```typescript
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
```
No change needed — the import path stays the same because we renamed the Generic package to `@memberjunction/ng-base-forms`.

### 4b. Generated HTML
Current template binds `[FormComponent]="this"`. Change to `[Form]="this"`:
```html
<mj-record-form-container [Record]="record" [Form]="this"
    (Navigate)="..." ...>
```

Also add new event bindings to the container in the template, or handle in BaseFormComponent directly.

### 4c. Generated module imports
Remove the separate `BaseFormsModule` import (now merged with `MjFormsModule` → `BaseFormsModule`).
The generated module only needs one import: `BaseFormsModule` from `@memberjunction/ng-base-forms`.

---

## Phase 5: Wire Up SingleRecordComponent in Explorer

### 5a. Subscribe to BaseFormComponent events

SingleRecordComponent already has the `ComponentRef` for the dynamically created form. Subscribe to @Output events:

```typescript
const componentRef = viewContainerRef.createComponent(formReg.SubClass);
componentRef.instance.record = record;
componentRef.instance.EditMode = !primaryKey.HasValue;

// Subscribe to form events
componentRef.instance.RecordSaved.subscribe((event: RecordSavedEvent) => {
    SharedService.Instance.CreateSimpleNotification('Record saved successfully', 'success', 2500);
    this.recordSaved.emit(record);
});
componentRef.instance.RecordSaveFailed.subscribe((event: RecordSaveFailedEvent) => {
    SharedService.Instance.CreateSimpleNotification('Error saving record: ' + event.ErrorMessage, 'error', 5000);
});
componentRef.instance.RecordDeleted.subscribe((event: RecordDeletedEvent) => {
    SharedService.Instance.CreateSimpleNotification('Record deleted successfully', 'success', 2500);
});
componentRef.instance.Navigate.subscribe((event: FormNavigationEvent) => {
    // Handle navigation via NavigationService
    switch (event.Kind) {
        case 'record':
            NavigationService.Instance.OpenEntityRecord(event.EntityName, event.PrimaryKey, { forceNewTab: event.OpenInNewTab });
            break;
        case 'new-record':
            NavigationService.Instance.OpenNewEntityRecord(event.EntityName, { newRecordValues: event.DefaultValues });
            break;
        case 'external-link':
            window.open(event.Url, '_blank');
            break;
        case 'email':
            window.open(`mailto:${event.EmailAddress}`, '_self');
            break;
    }
});
```

### 5b. Clean up subscriptions
Store subscriptions and unsubscribe in `ngOnDestroy()` (SingleRecordComponent already has cleanup logic).

---

## Phase 6: Delete Explorer/base-forms Package

Once everything is wired up and building:
1. Delete `packages/Angular/Explorer/base-forms/` directory entirely
2. Remove from workspace in root `package.json` if listed
3. Remove `@memberjunction/ng-base-forms` (old Explorer package) from all consumer `package.json` files — they now import from the Generic package with the same npm name
4. Remove the old `FormToolbarComponent` in `Explorer/explorer-core/src/lib/generic/form-toolbar.ts` (legacy, references old BaseFormComponent)

---

## Phase 7: Update package.json Dependencies

### Generic/base-forms/package.json
Add dependency on `@memberjunction/ng-base-types` (for PendingRecordItem, BaseFormComponentEventCodes).

### Explorer/core-entity-forms/package.json
- Remove `@memberjunction/ng-base-forms` (old Explorer package) — replaced by Generic one with same name
- Ensure `@memberjunction/ng-base-forms` (new Generic package) is listed

### MJExplorer/package.json
- Same as above

---

## Summary of What Changes Where

| Package | Changes |
|---------|---------|
| **Generic/base-forms** | Renamed to `@memberjunction/ng-base-forms`. Gets BaseFormComponent @Directive, supporting types, FormStateService, EntityDataGridWrapperComponent (formerly Explorer-only). Container renamed to RecordFormContainerComponent (typed, no duck-typing). Module renamed to BaseFormsModule. |
| **Explorer/base-forms** | DELETED entirely |
| **Explorer/explorer-core** (SingleRecordComponent) | Subscribes to BaseFormComponent @Output events, handles Explorer-specific navigation/notifications |
| **Explorer/core-entity-forms** | Import path stays `@memberjunction/ng-base-forms` (same name, different source). Module import changes from two modules to one. |
| **CodeGenLib** | Template updates: single module import, `[Form]="this"` binding, remove old BaseFormsModule reference |
| **MJExplorer** | Same as core-entity-forms |

## Key Principles
- Generic package has ZERO Explorer dependencies
- All Explorer-specific behavior is event-driven
- SingleRecordComponent is the "Explorer adapter" that maps events to Explorer services
- No duck-typing — everything is properly typed
- ClassFactory registration continues to work exactly as before (`@RegisterClass(BaseFormComponent, 'EntityName')`)
