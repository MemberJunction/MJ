import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  MJButtonDirective,
  MJClickableDirective,
  MJDatepickerComponent,
  MJWindowComponent,
  MJWindowTitlebarComponent,
  MJDropdownComponent,
  MJComboboxComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJPageBodyComponent,
  MJPageSearchComponent,
  MJFilterPopoverComponent,
  MJFilterPanelComponent,
  MJFilterChipComponent,
  MJPageHeaderInteriorComponent,
  MJPageBodyInteriorComponent,
  MJViewToggleComponent,
  MJStatBadgeComponent,
  MJRefreshButtonComponent,
  MJLeftNavComponent,
  MJLeftNavContentComponent,
  MJTabNavComponent,
  MJEmptyStateComponent
} from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { EntityRelationshipDiagramModule } from '@memberjunction/ng-entity-relationship-diagram';
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';
import { DashboardViewerModule } from '@memberjunction/ng-dashboard-viewer';
import { VersionsModule } from '@memberjunction/ng-versions';
import { ExportServiceModule } from '@memberjunction/ng-export-service';
import { NgTreesModule } from '@memberjunction/ng-trees';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';
import { SharedPipesModule } from './shared/shared-pipes.module';

// Core components — eagerly loaded, most-visited pages
import { EntityAdminDashboardComponent } from './EntityAdmin/entity-admin-dashboard.component';
import { HomeDashboardComponent } from './Home/home-dashboard.component';
import { ActionPinConfigDialogComponent } from './Home/action-pin-config-dialog.component';
import { ActionPinRunnerDialogComponent } from './Home/action-pin-runner-dialog.component';
// HomeApplication is a non-Angular class registered via @RegisterClass(BaseApplication, 'HomeApplication').
// It must be imported here so ESBuild includes it in this chunk, making it discoverable
// via the lazy loading system when ApplicationManager calls CreateInstanceAsync.
import { HomeApplication } from './Home/home-application';
import { SystemDiagnosticsComponent } from './SystemDiagnostics/system-diagnostics.component';
// Developer Tools
import { AppStateInspectorComponent } from './DevTools/app-state-inspector.component';
import { LayoutInspectorComponent } from './DevTools/layout-inspector.component';
import { ClassRegistryInspectorComponent } from './DevTools/class-registry.component';
import { LazyModuleStatusComponent } from './DevTools/lazy-module-status.component';
import { SettingsExplorerComponent } from './DevTools/settings-explorer.component';
import { EventMonitorComponent } from './DevTools/event-monitor.component';
import { GraphQLConsoleComponent } from './DevTools/graphql-console.component';
// Admin Containers
import { AdminDevToolsResourceComponent } from './Admin/admin-dev-tools-resource.component';
import { AdminIdentityAccessComponent } from './Admin/admin-identity-access.component';
import { BulkOperationsContainerComponent } from './BulkOperations/bulk-operations-container.component';
import { BulkOperationsOperationsComponent } from './BulkOperations/bulk-operations-operations.component';
import { BulkOperationsRunHistoryComponent } from './BulkOperations/bulk-operations-run-history.component';
import { RecordProcessStudioComponent, RecordProcessHistoryComponent } from '@memberjunction/ng-record-process-studio';
import { AdminDataSchemaComponent } from './Admin/admin-data-schema.component';
import { AdminMonitoringComponent } from './Admin/admin-monitoring.component';
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
// Application Roles
import { ApplicationRolesResourceComponent } from './ApplicationRoles/application-roles-resource.component';
// Realtime Recordings (recorded realtime sessions — replay audio + transcript)
import { RealtimeRecordingsDashboardComponent } from './RealtimeRecordings/realtime-recordings-dashboard.component';
import { MJStorageMediaPlayerComponent } from '@memberjunction/ng-media-player';
import { AngularSplitModule } from 'angular-split';
// Permissions (Phase 2a/b/c — unified permissions admin); three independent resources
import { PermissionsUserAccessResourceComponent } from './Permissions/user-access-resource.component';
import { PermissionsResourceAccessResourceComponent } from './Permissions/resource-access-resource.component';
import { PermissionsAuditLogResourceComponent } from './Permissions/audit-log-resource.component';
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
    BulkOperationsContainerComponent,
    BulkOperationsOperationsComponent,
    BulkOperationsRunHistoryComponent,
    EntityAdminDashboardComponent,
    HomeDashboardComponent,
    ActionPinConfigDialogComponent,
    ActionPinRunnerDialogComponent,
    SystemDiagnosticsComponent,
    AppStateInspectorComponent,
    LayoutInspectorComponent,
    ClassRegistryInspectorComponent,
    LazyModuleStatusComponent,
    SettingsExplorerComponent,
    EventMonitorComponent,
    GraphQLConsoleComponent,
    AdminDevToolsResourceComponent,
    AdminIdentityAccessComponent,
    AdminDataSchemaComponent,
    AdminMonitoringComponent,
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
    // Application Roles
    ApplicationRolesResourceComponent,
    // Realtime Recordings
    RealtimeRecordingsDashboardComponent,
    // Permissions admin — three independent resource tabs
    PermissionsUserAccessResourceComponent,
    PermissionsResourceAccessResourceComponent,
    PermissionsAuditLogResourceComponent,
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
    MJButtonDirective,
    MJClickableDirective,
    MJDatepickerComponent,
    MJWindowComponent,
    MJWindowTitlebarComponent,
    MJDropdownComponent,
    MJComboboxComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJPageBodyComponent,
    MJPageSearchComponent,
    MJFilterPopoverComponent,
    MJFilterPanelComponent,
    MJFilterChipComponent,
    MJPageHeaderInteriorComponent,
    MJPageBodyInteriorComponent,
    MJViewToggleComponent,
    MJStatBadgeComponent,
    MJRefreshButtonComponent,
    MJLeftNavComponent,
    MJLeftNavContentComponent,
    MJTabNavComponent,
    MJEmptyStateComponent,
    ContainerDirectivesModule,
    SharedGenericModule,
    RecordProcessStudioComponent,
    RecordProcessHistoryComponent,
    CodeEditorModule,
    ExplorerSettingsModule,
    EntityRelationshipDiagramModule,
    QueryViewerModule,
    DashboardViewerModule,
    VersionsModule,
    ExportServiceModule,
    NgTreesModule,
    ResourcePermissionsModule,
    SharedPipesModule,
    AngularSplitModule,
    MJStorageMediaPlayerComponent
  ],
  exports: [
    BulkOperationsContainerComponent,
    BulkOperationsOperationsComponent,
    BulkOperationsRunHistoryComponent,
    EntityAdminDashboardComponent,
    HomeDashboardComponent,
    SystemDiagnosticsComponent,
    AppStateInspectorComponent,
    LayoutInspectorComponent,
    ClassRegistryInspectorComponent,
    LazyModuleStatusComponent,
    SettingsExplorerComponent,
    EventMonitorComponent,
    GraphQLConsoleComponent,
    AdminDevToolsResourceComponent,
    AdminIdentityAccessComponent,
    AdminDataSchemaComponent,
    AdminMonitoringComponent,
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
    ApplicationRolesResourceComponent,
    RealtimeRecordingsDashboardComponent,
    PermissionsUserAccessResourceComponent,
    PermissionsResourceAccessResourceComponent,
    PermissionsAuditLogResourceComponent,
    VersionHistoryLabelsResourceComponent,
    VersionHistoryDiffResourceComponent,
    VersionHistoryRestoreResourceComponent,
    VersionHistoryGraphResourceComponent,
    SharedPipesModule
  ]
})
export class CoreDashboardsModule { }

// Re-export types needed by consumers via subpath import
export type { ShareDialogResult } from './DashboardBrowser/dashboard-share-dialog.component';
export { DashboardShareDialogComponent } from './DashboardBrowser/dashboard-share-dialog.component';

// Re-export HomeApplication so it's reachable from this subpath for lazy loading.
// The @RegisterClass decorator fires on import, registering it with ClassFactory.
export { HomeApplication } from './Home/home-application';
