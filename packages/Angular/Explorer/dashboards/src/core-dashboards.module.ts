import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';
import { DashboardViewerModule } from '@memberjunction/ng-dashboard-viewer';
import { VersionsModule } from '@memberjunction/ng-versions';
import { ExportServiceModule } from '@memberjunction/ng-export-service';
import { SharedPipesModule } from './shared/shared-pipes.module';

// Core components — eagerly loaded, most-visited pages
import { EntityAdminDashboardComponent } from './EntityAdmin/entity-admin-dashboard.component';
import { HomeDashboardComponent } from './Home/home-dashboard.component';
import { SystemDiagnosticsComponent } from './SystemDiagnostics/system-diagnostics.component';
import { QueryBrowserResourceComponent } from './QueryBrowser/query-browser-resource.component';
import { DashboardBrowserResourceComponent } from './DashboardBrowser/dashboard-browser-resource.component';
import { DashboardShareDialogComponent } from './DashboardBrowser/dashboard-share-dialog.component';
// API Keys
import { APIKeysResourceComponent } from './APIKeys/api-keys-resource.component';
import { APIKeyCreateDialogComponent } from './APIKeys/api-key-create-dialog.component';
import { APIKeyEditPanelComponent } from './APIKeys/api-key-edit-panel.component';
import { APIKeyListComponent } from './APIKeys/api-key-list.component';
import { APIApplicationsPanelComponent } from './APIKeys/api-applications-panel.component';
import { APIScopesPanelComponent } from './APIKeys/api-scopes-panel.component';
import { APIUsagePanelComponent } from './APIKeys/api-usage-panel.component';
// Version History
import { VersionHistoryLabelsResourceComponent } from './VersionHistory/components/labels-resource.component';
import { VersionHistoryDiffResourceComponent } from './VersionHistory/components/diff-resource.component';
import { VersionHistoryRestoreResourceComponent } from './VersionHistory/components/restore-resource.component';
import { VersionHistoryGraphResourceComponent } from './VersionHistory/components/graph-resource.component';

/**
 * CoreDashboardsModule — eagerly loaded core features: Home, EntityAdmin,
 * SystemDiagnostics, QueryBrowser, DashboardBrowser, APIKeys, VersionHistory.
 */
@NgModule({
  declarations: [
    EntityAdminDashboardComponent,
    HomeDashboardComponent,
    SystemDiagnosticsComponent,
    QueryBrowserResourceComponent,
    DashboardBrowserResourceComponent,
    DashboardShareDialogComponent,
    // API Keys
    APIKeysResourceComponent,
    APIKeyCreateDialogComponent,
    APIKeyEditPanelComponent,
    APIKeyListComponent,
    APIApplicationsPanelComponent,
    APIScopesPanelComponent,
    APIUsagePanelComponent,
    // Version History
    VersionHistoryLabelsResourceComponent,
    VersionHistoryDiffResourceComponent,
    VersionHistoryRestoreResourceComponent,
    VersionHistoryGraphResourceComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonsModule,
    GridModule,
    DropDownsModule,
    InputsModule,
    IndicatorsModule,
    DateInputsModule,
    DialogsModule,
    WindowModule,
    ContainerDirectivesModule,
    SharedGenericModule,
    CodeEditorModule,
    ExplorerSettingsModule,
    EntityRelationshipDiagramModule,
    QueryViewerModule,
    DashboardViewerModule,
    VersionsModule,
    ExportServiceModule,
    SharedPipesModule
  ],
  exports: [
    EntityAdminDashboardComponent,
    HomeDashboardComponent,
    SystemDiagnosticsComponent,
    QueryBrowserResourceComponent,
    DashboardBrowserResourceComponent,
    DashboardShareDialogComponent,
    APIKeysResourceComponent,
    APIKeyCreateDialogComponent,
    APIKeyEditPanelComponent,
    APIKeyListComponent,
    APIApplicationsPanelComponent,
    APIScopesPanelComponent,
    APIUsagePanelComponent,
    VersionHistoryLabelsResourceComponent,
    VersionHistoryDiffResourceComponent,
    VersionHistoryRestoreResourceComponent,
    VersionHistoryGraphResourceComponent,
    SharedPipesModule
  ]
})
export class CoreDashboardsModule { }
