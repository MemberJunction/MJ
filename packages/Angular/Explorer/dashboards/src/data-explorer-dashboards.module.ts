import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ExportServiceModule } from '@memberjunction/ng-export-service';
import { ListManagementModule } from '@memberjunction/ng-list-management';
import { NgTreesModule } from '@memberjunction/ng-trees';

// Data Explorer Components
import { DataExplorerDashboardComponent } from './DataExplorer/data-explorer-dashboard.component';
import { DataExplorerResourceComponent } from './DataExplorer/data-explorer-resource.component';
import { NavigationPanelComponent as ExplorerNavigationPanelComponent } from './DataExplorer/components/navigation-panel/navigation-panel.component';
import { ExplorerStateService } from './DataExplorer/services/explorer-state.service';

/**
 * DataExplorerDashboardsModule — Data Explorer feature area: the dashboard and its left
 * navigation panel. The saved-view lifecycle (selector, config panel, dialogs) now lives in
 * mj-view-workspace from @memberjunction/ng-entity-viewer.
 */
@NgModule({
  declarations: [
    DataExplorerDashboardComponent,
    DataExplorerResourceComponent,
    ExplorerNavigationPanelComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ContainerDirectivesModule,
    MJEmptyStateComponent,
    EntityViewerModule,
    SharedGenericModule,
    ExportServiceModule,
    ListManagementModule,
    NgTreesModule
  ],
  providers: [
    ExplorerStateService
  ],
  exports: [
    DataExplorerDashboardComponent,
    DataExplorerResourceComponent
  ]
})
export class DataExplorerDashboardsModule { }

// Re-export types and components needed by consumers via subpath import
export { DataExplorerDashboardComponent } from './DataExplorer/data-explorer-dashboard.component';
export type { DataExplorerFilter } from './DataExplorer/models/explorer-state.interface';
