import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, RouteReuseStrategy } from '@angular/router';

// Services
import { SystemValidationService } from './lib/services/system-validation.service';
import { StartupValidationService } from './lib/services/startup-validation.service';

import { ExportServiceModule } from '@memberjunction/ng-export-service';
import { MJProgressBarComponent } from '@memberjunction/ng-ui-components';
import { DragDropModule } from '@angular/cdk/drag-drop';

// MJ
import { MJButtonDirective, MJDialogComponent, MJDialogTitlebarComponent, MJDialogActionsComponent, MJDropdownComponent, MJWindowComponent, MJWindowTitlebarComponent } from '@memberjunction/ng-ui-components';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FileStorageModule } from '@memberjunction/ng-file-storage';
import { QueryViewerModule } from '@memberjunction/ng-query-viewer';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
// RecordTagsModule removed — now imported by @memberjunction/ng-base-forms
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { RecordSelectorModule } from '@memberjunction/ng-record-selector';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { ListDetailGridModule } from '@memberjunction/ng-list-detail-grid';
import { ListManagementModule } from '@memberjunction/ng-list-management';

// Local Components
import { ConversationsModule } from '@memberjunction/ng-conversations';
import { CoreDashboardsModule } from '@memberjunction/ng-dashboards/core-dashboards.module';
import { DashboardViewerModule } from '@memberjunction/ng-dashboard-viewer';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { AITestHarnessModule } from '@memberjunction/ng-ai-test-harness';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { ResourceContainerComponent } from './lib/generic/resource-container-component';
import { DashboardPreferencesDialogComponent } from './lib/dashboard-preferences-dialog/dashboard-preferences-dialog.component';
import { DashboardResource } from './lib/resource-wrappers/dashboard-resource.component';
import { QueryResource } from './lib/resource-wrappers/query-resource.component';
import { EntityRecordResource } from './lib/resource-wrappers/record-resource.component';
import { SearchResultsResource } from './lib/resource-wrappers/search-results-resource.component';
import { UserViewResource } from './lib/resource-wrappers/view-resource.component';
import { AddItemComponent } from './lib/single-dashboard/Components/add-item/add-item.component';
import { DeleteItemComponent } from './lib/single-dashboard/Components/delete-item/delete-item.component';
import { EditDashboardComponent } from './lib/single-dashboard/Components/edit-dashboard/edit-dashboard.component';
import { SingleDashboardComponent } from './lib/single-dashboard/single-dashboard.component';
import { SingleQueryComponent } from './lib/single-query/single-query.component';
import { SingleRecordComponent } from './lib/single-record/single-record.component';
import { SingleSearchResultComponent } from './lib/single-search-result/single-search-result.component';
import { UserNotificationsComponent } from './lib/user-notifications/user-notifications.component';
import { UserProfileComponent } from './lib/user-profile/user-profile.component';
import { AppRoutingModule, CustomReuseStrategy } from './app-routing.module';
import { GenericDialogModule } from '@memberjunction/ng-generic-dialog';
import {SingleListDetailComponent} from './lib/single-list-detail/single-list-detail.component';
import { ListDetailResource } from './lib/resource-wrappers/list-detail-resource.component';
import { ChatConversationsResource } from './lib/resource-wrappers/chat-conversations-resource.component';
import { ChatCollectionsResource } from './lib/resource-wrappers/chat-collections-resource.component';
import { ChatTasksResource } from './lib/resource-wrappers/chat-tasks-resource.component';
import { ArtifactResource } from './lib/resource-wrappers/artifact-resource.component';
import { NotificationsResource } from './lib/resource-wrappers/notifications-resource.component';
import { OAuthCallbackComponent } from './lib/oauth/oauth-callback.component';
import { SearchModule } from '@memberjunction/ng-search';
import { MJWordCloudComponent } from '@memberjunction/ng-word-cloud';
import { PaginationComponent } from '@memberjunction/ng-pagination';
import { ConversationFeedbackResource } from './lib/conversation-feedback';

@NgModule({
  declarations: [
    OAuthCallbackComponent,
    ResourceContainerComponent,
    DashboardResource,
    EntityRecordResource,
    SearchResultsResource,
    UserViewResource,
    SingleRecordComponent,
    SingleSearchResultComponent,
    SingleQueryComponent,
    UserProfileComponent,
    SingleDashboardComponent,
    AddItemComponent,
    DeleteItemComponent,
    EditDashboardComponent,
    UserNotificationsComponent,
    QueryResource,
    SingleListDetailComponent,
    ListDetailResource,
    ChatConversationsResource,
    ChatCollectionsResource,
    ChatTasksResource,
    ArtifactResource,
    NotificationsResource,
    DashboardPreferencesDialogComponent,
    ConversationFeedbackResource,
  ],
  imports: [
    AppRoutingModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    ExportServiceModule,
    RecordChangesModule,
    ContainerDirectivesModule,
    BaseFormsModule,
    QueryViewerModule,
    MemberJunctionSharedModule,
    ConversationsModule,
    CoreDashboardsModule,
    DashboardViewerModule,
    ExplorerSettingsModule,
    FileStorageModule,
    EntityFormDialogModule,
    RecordSelectorModule,
    ResourcePermissionsModule,
    GenericDialogModule,
    MJProgressBarComponent,
    DragDropModule,
    AITestHarnessModule, // [3.0] TO DO TO-DO Need to verify this works correctly!
    ArtifactsModule,
    SharedGenericModule,
    EntityViewerModule,
    ListDetailGridModule,
    ListManagementModule,
    SearchModule,
    MJWordCloudComponent,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogTitlebarComponent,
    MJDialogActionsComponent,
    MJDropdownComponent,
    MJWindowComponent,
    MJWindowTitlebarComponent,
    PaginationComponent
  ],
  exports: [
    ResourceContainerComponent,
    DashboardResource,
    EntityRecordResource,
    SearchResultsResource,
    UserViewResource,
    SingleRecordComponent,
    SingleSearchResultComponent,
    UserProfileComponent,
    SingleDashboardComponent,
    AddItemComponent,
    DeleteItemComponent,
    EditDashboardComponent,
    UserNotificationsComponent,
    ListDetailResource,
    DashboardPreferencesDialogComponent,
    ConversationFeedbackResource
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: CustomReuseStrategy },
    SystemValidationService,
    StartupValidationService
  ],
})
export class ExplorerCoreModule {}
