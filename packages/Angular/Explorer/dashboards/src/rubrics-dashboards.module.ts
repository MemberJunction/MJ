import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AgGridModule } from 'ag-grid-angular';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
    MJButtonDirective,
    MJEmptyStateComponent,
    MJPageBodyComponent,
    MJPageHeaderComponent,
    MJPageLayoutComponent,
    MJPageSearchComponent,
    MJRefreshButtonComponent,
} from '@memberjunction/ng-ui-components';
import { RubricDriftResourceComponent } from './AI/components/rubric-drift.component';
import { RubricsDashboardComponent } from './Rubrics/rubrics-dashboard.component';
import { RubricsResourceComponent } from './Rubrics/rubrics-resource.component';
import { RubricScalesDashboardComponent } from './Rubrics/scales-dashboard.component';
import { RubricScalesResourceComponent } from './Rubrics/scales-resource.component';

/** Rubrics application: catalog, scales, and drift. */
@NgModule({
    declarations: [
        RubricsDashboardComponent,
        RubricsResourceComponent,
        RubricScalesDashboardComponent,
        RubricScalesResourceComponent,
    ],
    imports: [
        CommonModule,
        AgGridModule,
        SharedGenericModule,
        MJButtonDirective,
        MJEmptyStateComponent,
        MJPageBodyComponent,
        MJPageHeaderComponent,
        MJPageLayoutComponent,
        MJPageSearchComponent,
        MJRefreshButtonComponent,
        RubricDriftResourceComponent,
    ],
    exports: [
        RubricsDashboardComponent,
        RubricsResourceComponent,
        RubricScalesDashboardComponent,
        RubricScalesResourceComponent,
        RubricDriftResourceComponent,
    ],
})
export class RubricsDashboardsModule {}
