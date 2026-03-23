import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { GridModule } from '@progress/kendo-angular-grid';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DialogsModule, WindowModule } from '@progress/kendo-angular-dialog';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CodeEditorModule } from '@memberjunction/ng-code-editor';
import { SchedulingModule } from '@memberjunction/ng-scheduling';

// Scheduling Components
import { SchedulingDashboardComponent } from './Scheduling/scheduling-dashboard.component';
import { SchedulingOverviewComponent } from './Scheduling/components/scheduling-overview.component';
import { SchedulingJobsComponent } from './Scheduling/components/scheduling-jobs.component';
import { SchedulingActivityComponent } from './Scheduling/components/scheduling-activity.component';
import { SchedulingOverviewResourceComponent } from './Scheduling/components/scheduling-overview-resource.component';
import { SchedulingJobsResourceComponent } from './Scheduling/components/scheduling-jobs-resource.component';
import { SchedulingActivityResourceComponent } from './Scheduling/components/scheduling-activity-resource.component';
import { SchedulingInstrumentationService } from './Scheduling/services/scheduling-instrumentation.service';

/**
 * SchedulingDashboardsModule — Scheduling feature area: overview, jobs,
 * activity monitoring, and job slideout panel (via SchedulingModule).
 */
@NgModule({
  declarations: [
    SchedulingDashboardComponent,
    SchedulingOverviewComponent,
    SchedulingJobsComponent,
    SchedulingActivityComponent,
    SchedulingOverviewResourceComponent,
    SchedulingJobsResourceComponent,
    SchedulingActivityResourceComponent
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
    ContainerDirectivesModule,
    SharedGenericModule,
    CodeEditorModule,
    SchedulingModule
  ],
  providers: [
    SchedulingInstrumentationService
  ],
  exports: [
    SchedulingDashboardComponent,
    SchedulingOverviewResourceComponent,
    SchedulingJobsResourceComponent,
    SchedulingActivityResourceComponent
  ]
})
export class SchedulingDashboardsModule { }
