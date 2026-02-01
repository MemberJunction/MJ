import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, RouteReuseStrategy } from '@angular/router';

// Services
import { SystemValidationService } from './lib/services/system-validation.service';
import { StartupValidationService } from './lib/services/startup-validation.service';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons'; 
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { ExcelModule, GridModule, PDFModule } from '@progress/kendo-angular-grid';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { LayoutModule, TabStripModule, CardModule, AvatarModule } from '@progress/kendo-angular-layout';
import { ListViewModule } from '@progress/kendo-angular-listview';
import { TreeViewModule } from '@progress/kendo-angular-treeview';
import { ProgressBarModule } from "@progress/kendo-angular-progressbar";
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { DragDropModule } from '@angular/cdk/drag-drop';

// MJ
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { FileStorageModule } from '@memberjunction/ng-file-storage';
import { QueryGridModule } from '@memberjunction/ng-query-grid';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { RecordSelectorModule } from '@memberjunction/ng-record-selector';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';
import { EntityViewerModule } from '@memberjunction/ng-entity-viewer';
import { ListDetailGridModule } from '@memberjunction/ng-list-detail-grid';

// Local Components
import { ConversationsModule } from '@memberjunction/ng-conversations';
import { DashboardsModule } from '@memberjunction/ng-dashboards';
import { DashboardViewerModule } from '@memberjunction/ng-dashboard-viewer';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { AITestHarnessModule } from '@memberjunction/ng-ai-test-harness';
import { ArtifactsModule } from '@memberjunction/ng-artifacts';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { FormToolbarComponent } from './lib/generic/form-toolbar';
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

@NgModule({
  declarations: [
    FormToolbarComponent,
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
  ],
  imports: [
    AppRoutingModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    GridModule,
    DialogsModule,
    ExcelExportModule,
    IndicatorsModule,
    ButtonsModule,
    TabStripModule,
    ExcelModule,
    PDFModule,
    InputsModule,
    LabelModule,
    RecordChangesModule,
    ContainerDirectivesModule,
    BaseFormsModule,
    ListViewModule,
    TreeViewModule,
    QueryGridModule,
    LayoutModule,
    DropDownsModule,
    MemberJunctionSharedModule,
    ConversationsModule,
    DashboardsModule,
    DashboardViewerModule,
    ExplorerSettingsModule,
    FileStorageModule,
    MJTabStripModule,
    EntityFormDialogModule,
    RecordSelectorModule,
    ResourcePermissionsModule,
    GenericDialogModule,
    ProgressBarModule,
    DateInputsModule,
    DragDropModule,
    CardModule,
    AvatarModule,
    AITestHarnessModule, // [3.0] TO DO TO-DO Need to verify this works correctly!
    ArtifactsModule,
    SharedGenericModule,
    EntityViewerModule,
    ListDetailGridModule
  ],
  exports: [
    FormToolbarComponent,
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
    DashboardPreferencesDialogComponent 
  ],
  providers: [
    { provide: RouteReuseStrategy, useClass: CustomReuseStrategy },
    SystemValidationService,
    StartupValidationService
  ],
})
export class ExplorerCoreModule {}
