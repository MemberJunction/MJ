import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridModule } from 'ag-grid-angular';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { PaginationComponent } from '@memberjunction/ng-pagination';
import { TimelineModule } from '@memberjunction/ng-timeline';
import { ExportServiceModule } from '@memberjunction/ng-export-service';
import { ListManagementModule } from '@memberjunction/ng-list-management';
import { MapViewModule } from '@memberjunction/ng-map-view';
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { MjSlidePanelComponent, MJButtonDirective, MJAccordionModule, MJEmptyStateComponent, MJAlertComponent } from '@memberjunction/ng-ui-components';
import { FilterBuilderModule } from '@memberjunction/ng-filter-builder';

import { EntityCardsComponent } from './lib/entity-cards/entity-cards.component';
import { EntityViewerComponent } from './lib/entity-viewer/entity-viewer.component';
import { EntityRecordDetailPanelComponent } from './lib/entity-record-detail-panel/entity-record-detail-panel.component';
import { PillComponent } from './lib/pill/pill.component';
import { EntityDataGridComponent } from './lib/entity-data-grid/entity-data-grid.component';
import { ViewConfigPanelComponent } from './lib/view-config-panel/view-config-panel.component';
import { AggregatePanelComponent } from './lib/aggregate-panel/aggregate-panel.component';
import { AggregateSetupDialogComponent } from './lib/aggregate-setup-dialog/aggregate-setup-dialog.component';
import { ConfirmDialogComponent } from './lib/confirm-dialog/confirm-dialog.component';
import { QuickSaveDialogComponent } from './lib/quick-save-dialog/quick-save-dialog.component';
import { ViewHeaderComponent } from './lib/view-header/view-header.component';
import { DuplicateViewDialogComponent } from './lib/duplicate-view-dialog/duplicate-view-dialog.component';
import { SharedViewWarningDialogComponent } from './lib/shared-view-warning-dialog/shared-view-warning-dialog.component';
import { RecycleBinComponent } from './lib/recycle-bin/recycle-bin.component';
import { RecycleBinChipComponent } from './lib/recycle-bin/recycle-bin-chip.component';
import { ViewSelectorComponent } from './lib/view-selector/view-selector.component';
import { ViewWorkspaceComponent } from './lib/view-workspace/view-workspace.component';
import { ViewTypeSwitcherComponent } from './lib/view-type-switcher/view-type-switcher.component';
import { CardsViewRendererComponent } from './lib/view-types/renderers/cards-view-renderer.component';
import { GridViewRendererComponent } from './lib/view-types/renderers/grid-view-renderer.component';
import { TimelineViewRendererComponent } from './lib/view-types/renderers/timeline-view-renderer.component';
import { MapViewRendererComponent } from './lib/view-types/renderers/map-view-renderer.component';
import { LoadViewTypeDescriptors } from './lib/view-types';
import { EntityActionUXHostComponent, LoadEntityActionUX } from '@memberjunction/ng-entity-action-ux';

// Register the built-in view-type descriptors with the ClassFactory at module load.
// This force-references each @RegisterClass-decorated descriptor so bundlers don't
// tree-shake them out, making them discoverable by the ViewTypeEngine via DriverClass.
LoadViewTypeDescriptors();

// Force-reference the entity-action runtime-UX drivers (e.g. RecordProcessRunnerUX) so the ClassFactory
// can resolve them when the grid mounts a driver named by an entity action's RuntimeUXDriverClass.
LoadEntityActionUX();

/**
 * EntityViewerModule - Provides components for viewing entity data
 *
 * This module exports:
 * - EntityViewerComponent: Composite component with grid/cards toggle, server-side filtering/sorting/pagination
 * - EntityDataGridComponent: Modern AG Grid-based grid with Before/After cancelable events
 * - EntityCardsComponent: Card-based view with standalone or parent-managed data
 * - EntityRecordDetailPanelComponent: Detail panel for displaying single record information
 * - PillComponent: Semantic color pills for categorical values
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
    EntityDataGridComponent,
    ViewConfigPanelComponent,
    AggregatePanelComponent,
    AggregateSetupDialogComponent,
    ConfirmDialogComponent,
    QuickSaveDialogComponent,
    ViewHeaderComponent,
    DuplicateViewDialogComponent,
    SharedViewWarningDialogComponent,
    RecycleBinComponent,
    RecycleBinChipComponent,
    ViewSelectorComponent,
    ViewWorkspaceComponent,
    ViewTypeSwitcherComponent,
    CardsViewRendererComponent,
    GridViewRendererComponent,
    TimelineViewRendererComponent,
    MapViewRendererComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    AgGridModule,
    SharedGenericModule,
    PaginationComponent,
    TimelineModule,
    ExportServiceModule,
    ListManagementModule,
    MapViewModule,
    RecordChangesModule,
    MjSlidePanelComponent,
    MJButtonDirective,
    MJAccordionModule,
    MJEmptyStateComponent,
    MJAlertComponent,
    FilterBuilderModule,
    EntityActionUXHostComponent
  ],
  exports: [
    EntityCardsComponent,
    EntityViewerComponent,
    EntityRecordDetailPanelComponent,
    PillComponent,
    EntityDataGridComponent,
    ViewConfigPanelComponent,
    AggregatePanelComponent,
    AggregateSetupDialogComponent,
    ConfirmDialogComponent,
    QuickSaveDialogComponent,
    ViewHeaderComponent,
    DuplicateViewDialogComponent,
    SharedViewWarningDialogComponent,
    RecycleBinComponent,
    ViewSelectorComponent,
    ViewWorkspaceComponent,
    ViewTypeSwitcherComponent
  ]
})
export class EntityViewerModule { }
