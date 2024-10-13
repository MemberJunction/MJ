import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, RouteReuseStrategy } from '@angular/router';

// Kendo UI Angular imports
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { ChartsModule } from '@progress/kendo-angular-charts';
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { FilterModule } from '@progress/kendo-angular-filter';
import { ExcelModule, GridModule, PDFModule } from '@progress/kendo-angular-grid';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { LabelModule } from '@progress/kendo-angular-label';
import { LayoutModule, TabStripModule } from '@progress/kendo-angular-layout';
import { ListViewModule } from '@progress/kendo-angular-listview';
import { SortableModule } from '@progress/kendo-angular-sortable';
import { TreeViewModule } from '@progress/kendo-angular-treeview';

// MJ
import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';
import { FileStorageModule } from '@memberjunction/ng-file-storage';
import { QueryGridModule } from '@memberjunction/ng-query-grid';
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { MJTabStripModule } from '@memberjunction/ng-tabstrip';
import { EntityFormDialogModule } from '@memberjunction/ng-entity-form-dialog';
import { UserViewPropertiesDialogModule } from '@memberjunction/ng-user-view-properties';
import { RecordSelectorModule } from '@memberjunction/ng-record-selector';
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';

// Local Components
import { AskSkipModule } from '@memberjunction/ng-ask-skip';
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';
import { AuthButtonComponent } from './lib/auth-button/auth-button.component';
import { DashboardBrowserComponent } from './lib/dashboard-browser-component/dashboard-browser.component';
import { DataBrowserComponent } from './lib/data-browser-component/data-browser.component';
import { FavoritesComponent } from './lib/favorites/favorites.component';
import { FilesComponent } from './lib/files/files.component';
import { GenericBrowseListComponent } from './lib/generic-browse-list/generic-browse-list.component';
import { FormToolbarComponent } from './lib/generic/form-toolbar';
import { ResourceContainerComponent } from './lib/generic/resource-container-component';
import { HeaderComponent } from './lib/header/header.component';
import { GenericBrowserListComponent } from './lib/generic-browser-list/generic-browser-list.component';
import { HomeComponent } from './lib/home-component/home.component';
import { NavigationComponent } from './lib/navigation/navigation.component';
import { QueryBrowserComponent } from './lib/query-browser-component/query-browser.component';
import { ReportBrowserComponent } from './lib/report-browser-component/report-browser.component';
import { DashboardResource } from './lib/resource-wrappers/dashboard-resource.component';
import { QueryResource } from './lib/resource-wrappers/query-resource.component';
import { EntityRecordResource } from './lib/resource-wrappers/record-resource.component';
import { ReportResource } from './lib/resource-wrappers/report-resource.component';
import { SearchResultsResource } from './lib/resource-wrappers/search-results-resource.component';
import { UserViewResource } from './lib/resource-wrappers/view-resource.component';
import { SingleApplicationComponent } from './lib/single-application/single-application.component';
import { AddItemComponent } from './lib/single-dashboard/Components/add-item/add-item.component';
import { DeleteItemComponent } from './lib/single-dashboard/Components/delete-item/delete-item.component';
import { EditDashboardComponent } from './lib/single-dashboard/Components/edit-dashboard/edit-dashboard.component';
import { SingleDashboardComponent } from './lib/single-dashboard/single-dashboard.component';
import { SingleEntityComponent } from './lib/single-entity/single-entity.component';
import { SingleQueryComponent } from './lib/single-query/single-query.component';
import { SingleRecordComponent } from './lib/single-record/single-record.component';
import { SingleReportComponent } from './lib/single-report/single-report.component';
import { SingleSearchResultComponent } from './lib/single-search-result/single-search-result.component';
import { SingleViewComponent } from './lib/single-view/single-view.component';
import { UserNotificationsComponent } from './lib/user-notifications/user-notifications.component';
import { UserProfileComponent } from './lib/user-profile/user-profile.component';
import { ExpansionPanelComponent } from './lib/expansion-panel-component/expansion-panel-component';
import { ApplicationViewComponent } from './lib/app-view/application-view.component';
import { AppRoutingModule, CustomReuseStrategy } from './app-routing.module';
import { ListViewComponent } from './lib/list-view/list-view.component';  
import { SingleListDetailComponent } from './lib/single-list-detail/single-list-detail.component';

@NgModule({
  declarations: [
    FormToolbarComponent,
    ResourceContainerComponent,
    AuthButtonComponent,
    DashboardBrowserComponent,
    DataBrowserComponent,
    GenericBrowseListComponent,
    GenericBrowserListComponent,
    HomeComponent,
    NavigationComponent,
    ReportBrowserComponent,
    QueryBrowserComponent,
    DashboardResource,
    EntityRecordResource,
    ReportResource,
    SearchResultsResource,
    UserViewResource,
    FilesComponent,
    SingleApplicationComponent,
    FavoritesComponent,
    HeaderComponent,
    SingleEntityComponent,
    SingleRecordComponent,
    SingleReportComponent,
    SingleSearchResultComponent,
    SingleViewComponent,
    SingleQueryComponent,
    UserProfileComponent,
    SingleDashboardComponent,
    AddItemComponent,
    DeleteItemComponent,
    EditDashboardComponent,
    UserNotificationsComponent,
    QueryResource,
    ExpansionPanelComponent,
    ApplicationViewComponent,
    ListViewComponent,
    SingleListDetailComponent
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
    CompareRecordsModule,
    IndicatorsModule,
    CommonModule,
    FormsModule,
    GridModule,
    ChartsModule,
    ButtonsModule,
    TabStripModule,
    ExcelModule,
    PDFModule,
    IndicatorsModule,
    DialogsModule,
    InputsModule,
    LabelModule,
    CompareRecordsModule,
    RecordChangesModule,
    ContainerDirectivesModule,
    BaseFormsModule,
    ListViewModule,
    TreeViewModule,
    UserViewGridModule,
    QueryGridModule,
    SortableModule,
    LayoutModule,
    FilterModule,
    DropDownsModule,
    MemberJunctionSharedModule,
    AskSkipModule,
    EntityPermissionsModule,
    ExplorerSettingsModule,
    FileStorageModule,
    UserViewPropertiesDialogModule,
    MJTabStripModule,
    EntityFormDialogModule,
    RecordSelectorModule,
    ResourcePermissionsModule
  ],
  exports: [
    FormToolbarComponent,
    ResourceContainerComponent,
    AuthButtonComponent,
    DashboardBrowserComponent,
    DataBrowserComponent,
    GenericBrowseListComponent,
    GenericBrowserListComponent,
    HomeComponent,
    NavigationComponent,
    ReportBrowserComponent,
    DashboardResource,
    EntityRecordResource,
    ReportResource,
    SearchResultsResource,
    UserViewResource,
    SingleApplicationComponent,
    FavoritesComponent,
    HeaderComponent,
    SingleEntityComponent,
    SingleRecordComponent,
    SingleReportComponent,
    SingleSearchResultComponent,
    SingleViewComponent,
    UserProfileComponent,
    SingleDashboardComponent,
    AddItemComponent,
    DeleteItemComponent,
    EditDashboardComponent,
    UserNotificationsComponent,
    ExpansionPanelComponent,
    ApplicationViewComponent,
    ListViewComponent,
    SingleListDetailComponent
  ],
  providers: [{ provide: RouteReuseStrategy, useClass: CustomReuseStrategy }],
})
export class ExplorerCoreModule {}
