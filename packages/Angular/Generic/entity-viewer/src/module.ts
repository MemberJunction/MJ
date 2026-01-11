import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridModule } from 'ag-grid-angular';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { TimelineModule } from '@memberjunction/ng-timeline';

import { EntityGridComponent } from './lib/entity-grid/entity-grid.component';
import { EntityCardsComponent } from './lib/entity-cards/entity-cards.component';
import { EntityViewerComponent } from './lib/entity-viewer/entity-viewer.component';
import { EntityRecordDetailPanelComponent } from './lib/entity-record-detail-panel/entity-record-detail-panel.component';
import { PillComponent } from './lib/pill/pill.component';
import { PaginationComponent } from './lib/pagination/pagination.component';
import { EntityDataGridComponent } from './lib/entity-data-grid/entity-data-grid.component';

/**
 * EntityViewerModule - Provides components for viewing entity data
 *
 * This module exports:
 * - EntityViewerComponent: Composite component with grid/cards toggle, server-side filtering/sorting/pagination
 * - EntityGridComponent: AG Grid-based table view with standalone or parent-managed data (deprecated, use EntityDataGridComponent)
 * - EntityDataGridComponent: Modern AG Grid-based grid with Before/After cancelable events
 * - EntityCardsComponent: Card-based view with standalone or parent-managed data
 * - EntityRecordDetailPanelComponent: Detail panel for displaying single record information
 * - PillComponent: Semantic color pills for categorical values
 * - PaginationComponent: Beautiful "Load More" pagination with progress indicator
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
    EntityGridComponent,
    EntityCardsComponent,
    EntityViewerComponent,
    EntityRecordDetailPanelComponent,
    PillComponent,
    PaginationComponent,
    EntityDataGridComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    SharedGenericModule,
    TimelineModule
  ],
  exports: [
    EntityGridComponent,
    EntityCardsComponent,
    EntityViewerComponent,
    EntityRecordDetailPanelComponent,
    PillComponent,
    PaginationComponent,
    EntityDataGridComponent
  ]
})
export class EntityViewerModule { }
