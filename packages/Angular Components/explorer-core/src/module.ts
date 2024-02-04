import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Kendo UI Angular imports
import { ExcelExportModule } from '@progress/kendo-angular-excel-export';
import { DialogsModule } from "@progress/kendo-angular-dialog";
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { GridModule, ExcelModule, PDFModule } from '@progress/kendo-angular-grid';
import { LabelModule } from '@progress/kendo-angular-label';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { ChartsModule } from '@progress/kendo-angular-charts';
import { TabStripModule } from '@progress/kendo-angular-layout';
import { IconsModule, IconModule } from '@progress/kendo-angular-icons';
import { ListViewModule } from '@progress/kendo-angular-listview';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { SortableModule } from "@progress/kendo-angular-sortable";
import { FilterModule } from "@progress/kendo-angular-filter";


// MJ
import { CompareRecordsModule } from '@memberjunction/ng-compare-records';
import { RecordChangesModule } from '@memberjunction/ng-record-changes';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';
import { QueryGridModule } from '@memberjunction/ng-query-grid';

// Local Components
import { FormToolbarComponent } from './lib/generic/form-toolbar';
import { SectionLoaderComponent } from './lib/generic/section-loader-component';
import { ResourceContainerComponent } from './lib/generic/resource-container-component';
import { AuthButtonComponent } from './lib/auth-button/auth-button.component';
import { DashboardBrowserComponent } from './lib/dashboard-browser-component/dashboard-browser.component';
import { DataBrowserComponent } from './lib/data-browser-component/data-browser.component';
import { GenericBrowseListComponent } from './lib/generic-browse-list/generic-browse-list.component';
import { HomeComponent } from './lib/home-component/home.component';
import { NavigationComponent } from './lib/navigation/navigation.component';
import { ReportBrowserComponent } from './lib/report-browser-component/report-browser.component';
import { DashboardResource } from './lib/resource-wrappers/dashboard-resource.component';
import { EntityRecordResource } from './lib/resource-wrappers/record-resource.component';
import { ReportResource } from './lib/resource-wrappers/report-resource.component';
import { SearchResultsResource } from './lib/resource-wrappers/search-results-resource.component';
import { UserViewResource } from './lib/resource-wrappers/view-resource.component';
import { SettingsComponent } from './lib/settings/settings.component';
import { SingleApplicationComponent } from './lib/single-application/single-application.component';
import { FavoritesComponent } from './lib/favorites/favorites.component';
import { HeaderComponent } from './lib/header/header.component';
import { JoinGridComponent } from './lib/join-grid/join-grid.component';
import { SingleEntityComponent } from './lib/single-entity/single-entity.component';
import { SingleRecordComponent } from './lib/single-record/single-record.component';
import { SingleReportComponent } from './lib/single-report/single-report.component';
import { SingleSearchResultComponent } from './lib/single-search-result/single-search-result.component';
import { SingleViewComponent } from './lib/single-view/single-view.component';
import { UserProfileComponent } from './lib/user-profile/user-profile.component';
import { ViewPropertiesDialogComponent } from './lib/user-view-properties/view-properties-dialog.component';
import { SingleDashboardComponent } from './lib/single-dashboard/single-dashboard.component';
import { AddItemComponent } from './lib/single-dashboard/Components/add-item/add-item.component';
import { EditDashboardComponent } from './lib/single-dashboard/Components/edit-dashboard/edit-dashboard.component';
import { MemberJunctionSharedModule } from '@memberjunction/ng-shared';
import { UserNotificationsComponent } from './lib/user-notifications/user-notifications.component';
import { DeleteItemComponent } from './lib/single-dashboard/Components/delete-item/delete-item.component';
import { SingleQueryComponent } from './lib/single-query/single-query.component';
import { QueryResource } from './lib/resource-wrappers/query-resource.component';
import { QueryBrowserComponent } from './lib/query-browser-component/query-browser.component';
import { AskSkipModule } from '@memberjunction/ng-ask-skip';

@NgModule({
  declarations: [
    FormToolbarComponent,
    SectionLoaderComponent,
    ResourceContainerComponent,
    AuthButtonComponent,
    DashboardBrowserComponent,
    DataBrowserComponent,
    GenericBrowseListComponent,
    HomeComponent,
    NavigationComponent,
    ReportBrowserComponent,
    QueryBrowserComponent,
    DashboardResource,
    EntityRecordResource,
    ReportResource,
    SearchResultsResource,
    UserViewResource,
    SettingsComponent,
    SingleApplicationComponent,
    FavoritesComponent,
    HeaderComponent,
    JoinGridComponent,
    SingleEntityComponent,
    SingleRecordComponent,
    SingleReportComponent,
    SingleSearchResultComponent,
    SingleViewComponent,
    SingleQueryComponent,
    UserProfileComponent,
    ViewPropertiesDialogComponent,
    SingleDashboardComponent,
    AddItemComponent,
    DeleteItemComponent,
    EditDashboardComponent,
    UserNotificationsComponent,
    QueryResource
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    GridModule,
    DialogsModule,
    ExcelExportModule,
    ButtonsModule,
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
    IconModule,
    IconsModule,
    CompareRecordsModule,
    RecordChangesModule,
    ContainerDirectivesModule,
    ListViewModule,
    UserViewGridModule,
    QueryGridModule,
    SortableModule,
    LayoutModule,
    FilterModule,
    DropDownsModule,
    MemberJunctionSharedModule,
    AskSkipModule
  ],
  exports: [
    FormToolbarComponent,
    SectionLoaderComponent,
    ResourceContainerComponent,
    AuthButtonComponent,
    DashboardBrowserComponent,
    DataBrowserComponent,
    GenericBrowseListComponent,
    HomeComponent,
    NavigationComponent,
    ReportBrowserComponent,
    DashboardResource,
    EntityRecordResource,
    ReportResource,
    SearchResultsResource,
    UserViewResource,
    SettingsComponent,
    SingleApplicationComponent,
    FavoritesComponent,
    HeaderComponent,
    JoinGridComponent,
    SingleEntityComponent,
    SingleRecordComponent,
    SingleReportComponent,
    SingleSearchResultComponent,
    SingleViewComponent,
    UserProfileComponent,
    ViewPropertiesDialogComponent,
    SingleDashboardComponent,
    AddItemComponent,
    DeleteItemComponent,
    EditDashboardComponent,
    UserNotificationsComponent
  ]
})
export class ExplorerCoreModule { }