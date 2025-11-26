import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Kendo UI
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { ChartsModule } from '@progress/kendo-angular-charts';

// MemberJunction
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';
import { DashboardsModule } from '@memberjunction/ng-dashboards';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

// Services
import { RecruitingService } from './services/recruiting.service';

// Forms
import { JobRequisitionFormComponent } from './forms/job-requisition-form.component';
import { CandidateFormComponent } from './forms/candidate-form.component';
import { ApplicationFormComponent } from './forms/application-form.component';
import { InterviewFormComponent } from './forms/interview-form.component';

// Dashboards
import { RecruitingDashboardComponent } from './dashboards/recruiting-dashboard.component';
import { JobPipelineDashboardComponent } from './dashboards/job-pipeline-dashboard.component';

@NgModule({
  declarations: [
    // Forms
    JobRequisitionFormComponent,
    CandidateFormComponent,
    ApplicationFormComponent,
    InterviewFormComponent,

    // Dashboards
    RecruitingDashboardComponent,
    JobPipelineDashboardComponent
  ],
  imports: [
    CommonModule,
    FormsModule,

    // Kendo UI
    ButtonsModule,
    DropDownsModule,
    InputsModule,
    DateInputsModule,
    DialogsModule,
    IndicatorsModule,
    ChartsModule,

    // MemberJunction
    BaseFormsModule,
    FormToolbarModule,
    DashboardsModule,
    ContainerDirectivesModule
  ],
  providers: [
    RecruitingService
  ],
  exports: [
    // Forms
    JobRequisitionFormComponent,
    CandidateFormComponent,
    ApplicationFormComponent,
    InterviewFormComponent,

    // Dashboards
    RecruitingDashboardComponent,
    JobPipelineDashboardComponent
  ]
})
export class RecruitingPipelineModule { }
