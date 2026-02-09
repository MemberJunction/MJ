import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MjFormToolbarComponent } from './lib/toolbar/form-toolbar.component';
import { MjFormFieldComponent } from './lib/field/form-field.component';
import { MjCollapsiblePanelComponent } from './lib/panel/collapsible-panel.component';
import { MjRecordFormContainerComponent } from './lib/container/record-form-container.component';
import { SectionLoaderComponent } from './lib/section-loader-component';
import { ExplorerEntityDataGridComponent } from './lib/explorer-entity-data-grid.component';
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { ListManagementModule } from '@memberjunction/ng-list-management';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';

/**
 * BaseFormsModule - Form components and base classes for rendering and editing MemberJunction entity records.
 *
 * Provides:
 * - **MjRecordFormContainerComponent** (`<mj-record-form-container>`): Top-level container
 *   with sticky toolbar, section state management, and content slots.
 * - **MjFormToolbarComponent** (`<mj-form-toolbar>`): Configurable toolbar with read/edit mode
 *   actions, IS-A hierarchy breadcrumb, section controls, and inline delete dialog.
 * - **MjCollapsiblePanelComponent** (`<mj-collapsible-panel>`): Collapsible section with
 *   drag-to-reorder, search filtering, and inherited/related variants.
 * - **MjFormFieldComponent** (`<mj-form-field>`): Entity field renderer with clean read-only
 *   display and modern edit-mode inputs (native HTML with custom select and autocomplete).
 * - **SectionLoaderComponent** (`<mj-form-section>`): Dynamic section loader via ClassFactory.
 * - **ExplorerEntityDataGridComponent** (`<mj-explorer-entity-data-grid>`): Data grid wrapper
 *   for related entity sections with Navigate event support.
 *
 * All navigation actions are emitted as events via {@link FormNavigationEvent}.
 * The host application subscribes and maps to its own routing system.
 */
@NgModule({
  declarations: [
    MjFormToolbarComponent,
    MjFormFieldComponent,
    MjCollapsiblePanelComponent,
    MjRecordFormContainerComponent,
    SectionLoaderComponent,
    ExplorerEntityDataGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RecordChangesModule,
    ListManagementModule,
    EntityViewerModule
  ],
  exports: [
    MjFormToolbarComponent,
    MjFormFieldComponent,
    MjCollapsiblePanelComponent,
    MjRecordFormContainerComponent,
    SectionLoaderComponent,
    ExplorerEntityDataGridComponent
  ]
})
export class BaseFormsModule { }
