import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutoComplete } from 'primeng/autocomplete';
import { Select } from 'primeng/select';

import { MjFormToolbarComponent } from './lib/toolbar/form-toolbar.component';
import { MjFormFieldComponent } from './lib/field/form-field.component';
import { MjCollapsiblePanelComponent } from './lib/panel/collapsible-panel.component';
import { MjRecordFormContainerComponent } from './lib/container/record-form-container.component';
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { ListManagementModule } from '@memberjunction/ng-list-management';

/**
 * MjFormsModule - Modern form components for rendering and editing MemberJunction entity records.
 *
 * Provides:
 * - **MjRecordFormContainerComponent** (`<mj-record-form-container>`): Top-level container
 *   with sticky toolbar, section state management, and content slots.
 * - **MjFormToolbarComponent** (`<mj-form-toolbar>`): Configurable toolbar with read/edit mode
 *   actions, IS-A hierarchy breadcrumb, section controls, and inline delete dialog.
 * - **MjCollapsiblePanelComponent** (`<mj-collapsible-panel>`): Collapsible section with
 *   drag-to-reorder, search filtering, and inherited/related variants.
 * - **MjFormFieldComponent** (`<mj-form-field>`): Entity field renderer with clean read-only
 *   display and modern edit-mode inputs (native HTML + PrimeNG unstyled).
 *
 * All navigation actions are emitted as events via {@link FormNavigationEvent}.
 * The host application subscribes and maps to its own routing system.
 *
 * @example
 * ```typescript
 * import { MjFormsModule } from '@memberjunction/ng-forms';
 *
 * @NgModule({
 *   imports: [MjFormsModule]
 * })
 * export class AppModule { }
 * ```
 */
@NgModule({
  declarations: [
    MjFormToolbarComponent,
    MjFormFieldComponent,
    MjCollapsiblePanelComponent,
    MjRecordFormContainerComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AutoComplete,
    Select,
    RecordChangesModule,
    ListManagementModule
  ],
  exports: [
    MjFormToolbarComponent,
    MjFormFieldComponent,
    MjCollapsiblePanelComponent,
    MjRecordFormContainerComponent
  ]
})
export class MjFormsModule { }
