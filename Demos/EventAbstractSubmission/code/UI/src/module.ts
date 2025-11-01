import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


// MemberJunction
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { FormToolbarModule } from '@memberjunction/ng-form-toolbar';
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

// Dashboards - temporarily disabled due to Kendo dependencies
// import { EventManagementDashboardComponent } from './dashboards/event-management/event-management-dashboard.component';
// import { AbstractSubmissionDashboardComponent } from './dashboards/abstract-submission/abstract-submission-dashboard.component';

// Forms
import { EventFormComponent } from './forms/event-form/event-form.component';
import { SubmissionFormComponent } from './forms/submission-form/submission-form.component';
import { SpeakerFormComponent } from './forms/speaker-form/speaker-form.component';

// Shared Components - temporarily disabled due to Kendo dependencies
// import { KpiCardComponent } from './dashboards/components/kpi-card.component';
// import { StatusBadgeComponent } from './dashboards/components/status-badge.component';
// import { SubmissionListComponent } from './dashboards/components/submission-list.component';
// import { SpeakerListComponent } from './dashboards/components/speaker-list.component';

// Services
import { EventService } from './services/event.service';
import { SubmissionService } from './services/submission.service';
import { SpeakerService } from './services/speaker.service';

@NgModule({
  declarations: [
    // Dashboards - temporarily disabled due to Kendo dependencies
    // EventManagementDashboardComponent,
    // AbstractSubmissionDashboardComponent,

    // Forms
    EventFormComponent,
    SubmissionFormComponent,
    SpeakerFormComponent,

    // Shared Components - temporarily disabled due to Kendo dependencies
    // KpiCardComponent,
    // StatusBadgeComponent,
    // SubmissionListComponent,
    // SpeakerListComponent
  ],
  imports: [
    CommonModule,
    FormsModule,

    // MemberJunction
    BaseFormsModule,
    FormToolbarModule,
    ContainerDirectivesModule
  ],
  providers: [
    EventService,
    SubmissionService,
    SpeakerService
  ],
  exports: [
    // Dashboards - temporarily disabled due to Kendo dependencies
    // EventManagementDashboardComponent,
    // AbstractSubmissionDashboardComponent,

    // Forms
    EventFormComponent,
    SubmissionFormComponent,
    SpeakerFormComponent
  ]
})
export class EventAbstractSubmissionModule { }
