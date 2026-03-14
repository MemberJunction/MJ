import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { FilterBuilderModule } from '@memberjunction/ng-filter-builder';
import { ExportServiceModule } from '@memberjunction/ng-export-service';
import { ListManagementModule } from '@memberjunction/ng-list-management';

// Data Explorer Components
import { DataExplorerDashboardComponent } from './DataExplorer/data-explorer-dashboard.component';
import { DataExplorerResourceComponent } from './DataExplorer/data-explorer-resource.component';
import { NavigationPanelComponent as ExplorerNavigationPanelComponent } from './DataExplorer/components/navigation-panel/navigation-panel.component';
import { ViewSelectorComponent } from './DataExplorer/components/view-selector/view-selector.component';
import { FilterDialogComponent } from './DataExplorer/components/filter-dialog/filter-dialog.component';
import { ExplorerStateService } from './DataExplorer/services/explorer-state.service';

/**
 * DataExplorerDashboardsModule — Data Explorer feature area: dashboard,
 * navigation panel, view selector, and filter dialog.
 */
@NgModule({
  declarations: [
    DataExplorerDashboardComponent,
    DataExplorerResourceComponent,
    ExplorerNavigationPanelComponent,
    ViewSelectorComponent,
    FilterDialogComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonsModule,
    GridModule,
    DropDownsModule,
    InputsModule,
    DialogsModule,
    WindowModule,
    TreeViewModule,
    ContainerDirectivesModule,
    EntityViewerModule,
    SharedGenericModule,
    FilterBuilderModule,
    ExportServiceModule,
    ListManagementModule
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
