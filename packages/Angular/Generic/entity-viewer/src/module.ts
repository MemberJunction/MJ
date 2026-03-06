import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridModule } from 'ag-grid-angular';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { TimelineModule } from '@memberjunction/ng-timeline';
import { ExportServiceModule } from '@memberjunction/ng-export-service';

import { EntityCardsComponent } from './lib/entity-cards/entity-cards.component';
import { EntityViewerComponent } from './lib/entity-viewer/entity-viewer.component';
import { EntityRecordDetailPanelComponent } from './lib/entity-record-detail-panel/entity-record-detail-panel.component';
import { PillComponent } from './lib/pill/pill.component';
import { PaginationComponent } from './lib/pagination/pagination.component';
import { EntityDataGridComponent } from './lib/entity-data-grid/entity-data-grid.component';
import { ViewConfigPanelComponent } from './lib/view-config-panel/view-config-panel.component';
import { AggregatePanelComponent } from './lib/aggregate-panel/aggregate-panel.component';
import { AggregateSetupDialogComponent } from './lib/aggregate-setup-dialog/aggregate-setup-dialog.component';
import { ConfirmDialogComponent } from './lib/confirm-dialog/confirm-dialog.component';
import { QuickSaveDialogComponent } from './lib/quick-save-dialog/quick-save-dialog.component';
import { ViewHeaderComponent } from './lib/view-header/view-header.component';
import { DuplicateViewDialogComponent } from './lib/duplicate-view-dialog/duplicate-view-dialog.component';
import { SharedViewWarningDialogComponent } from './lib/shared-view-warning-dialog/shared-view-warning-dialog.component';

/**
 * EntityViewerModule - Provides components for viewing entity data
 *
 * This module exports:
 * - EntityViewerComponent: Composite component with grid/cards toggle, server-side filtering/sorting/pagination
 * - EntityDataGridComponent: Modern AG Grid-based grid with Before/After cancelable events
 * - EntityCardsComponent: Card-based view with standalone or parent-managed data
 * - EntityRecordDetailPanelComponent: Detail panel for displaying single record information
 * - PillComponent: Semantic color pills for categorical values
 * - PaginationComponent: Beautiful "Load More" pagination with progress indicator
 * - ViewConfigPanelComponent: Sliding panel for configuring view settings (columns, sort, filters)
 *
 * @example
 * ```typescript
 * import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
 *
 * @NgModule({
 *   imports: [EntityViewerModule]
 * })
 * export class MyModule { }
 * ```
 */
@NgModule({
  declarations: [
    EntityCardsComponent,
    EntityViewerComponent,
    EntityRecordDetailPanelComponent,
    PillComponent,
    PaginationComponent,
    EntityDataGridComponent,
    ViewConfigPanelComponent,
    AggregatePanelComponent,
    AggregateSetupDialogComponent,
    ConfirmDialogComponent,
    QuickSaveDialogComponent,
    ViewHeaderComponent,
    DuplicateViewDialogComponent,
    SharedViewWarningDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    SharedGenericModule,
    TimelineModule,
    ExportServiceModule
  ],
  exports: [
    EntityCardsComponent,
    EntityViewerComponent,
    EntityRecordDetailPanelComponent,
    PillComponent,
    PaginationComponent,
    EntityDataGridComponent,
    ViewConfigPanelComponent,
    AggregatePanelComponent,
    AggregateSetupDialogComponent,
    ConfirmDialogComponent,
    QuickSaveDialogComponent,
    ViewHeaderComponent,
    DuplicateViewDialogComponent,
    SharedViewWarningDialogComponent
  ]
})
export class EntityViewerModule { }
