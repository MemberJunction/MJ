import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { TabStripModule } from '@progress/kendo-angular-layout';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { TestingModule } from '@memberjunction/ng-testing';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { SharedDashboardWidgetsModule } from './shared/shared-dashboard-widgets.module';
import { SharedPipesModule } from './shared/shared-pipes.module';

// Testing Components
import { TestingDashboardComponent } from './Testing/testing-dashboard.component';
import { TestingDashboardTabComponent } from './Testing/components/testing-dashboard-tab.component';
import { TestingRunsComponent } from './Testing/components/testing-runs.component';
import { TestingAnalyticsComponent } from './Testing/components/testing-analytics.component';
import { TestingReviewComponent } from './Testing/components/testing-review.component';
import { TestingDashboardTabResourceComponent } from './Testing/components/testing-dashboard-tab-resource.component';
import { TestingRunsResourceComponent } from './Testing/components/testing-runs-resource.component';
import { TestingAnalyticsResourceComponent } from './Testing/components/testing-analytics-resource.component';
import { TestingReviewResourceComponent } from './Testing/components/testing-review-resource.component';
import { TestingExplorerComponent } from './Testing/components/testing-explorer.component';
import { TestingExplorerResourceComponent } from './Testing/components/testing-explorer-resource.component';
import { SuiteTreeComponent, SuiteTreeNodeComponent } from './Testing/components/widgets/suite-tree.component';
import { OracleBreakdownTableComponent } from './Testing/components/widgets/oracle-breakdown-table.component';
import { TestRunDetailPanelComponent } from './Testing/components/widgets/test-run-detail-panel.component';
import { TestingInstrumentationService } from './Testing/services/testing-instrumentation.service';

/**
 * TestingDashboardsModule — Testing feature area: dashboard tabs, runs,
 * analytics, review, explorer, and instrumentation widgets.
 */
@NgModule({
  declarations: [
    TestingDashboardComponent,
    TestingDashboardTabComponent,
    TestingRunsComponent,
    TestingAnalyticsComponent,
    TestingReviewComponent,
    TestingDashboardTabResourceComponent,
    TestingRunsResourceComponent,
    TestingAnalyticsResourceComponent,
    TestingReviewResourceComponent,
    TestingExplorerComponent,
    TestingExplorerResourceComponent,
    SuiteTreeComponent,
    SuiteTreeNodeComponent,
    OracleBreakdownTableComponent,
    TestRunDetailPanelComponent
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
    TabStripModule,
    ContainerDirectivesModule,
    TestingModule,
    SharedGenericModule,
    SharedDashboardWidgetsModule,
    SharedPipesModule
  ],
  providers: [
    TestingInstrumentationService
  ],
  exports: [
    TestingDashboardComponent,
    TestingDashboardTabResourceComponent,
    TestingRunsResourceComponent,
    TestingAnalyticsResourceComponent,
    TestingReviewResourceComponent,
    TestingExplorerComponent,
    TestingExplorerResourceComponent,
    SharedDashboardWidgetsModule
  ]
})
export class TestingDashboardsModule { }
