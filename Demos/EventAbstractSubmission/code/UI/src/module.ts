import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

// Angular Material (needed by other components)
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';

// Kendo UI
import { CardModule } from '@progress/kendo-angular-layout';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { LabelModule } from '@progress/kendo-angular-label';
import { NotificationModule } from '@progress/kendo-angular-notification';

// MemberJunction packages
import { BaseFormsModule } from '@memberjunction/ng-base-forms';
import { DashboardsModule } from '@memberjunction/ng-dashboards';
import { MJNotificationService } from '@memberjunction/ng-notifications';

// Local components
import { EventFormComponent } from './forms/event-form/event-form.component';
import { SubmissionFormComponent } from './forms/submission-form/submission-form.component';
import { SpeakerFormComponent } from './forms/speaker-form/speaker-form.component';
import { EventManagementDashboardComponent } from './dashboards/event-management-dashboard/event-management-dashboard.component';
import { AbstractSubmissionDashboardComponent } from './dashboards/abstract-submission-dashboard/abstract-submission-dashboard.component';
import { SubmissionPipelineComponent } from './workflows/submission-pipeline/submission-pipeline.component';
import { ReviewProcessComponent } from './workflows/review-process/review-process.component';

// Local services
import { EventService } from './services/event.service';
import { SubmissionService } from './services/submission.service';
import { SpeakerService } from './services/speaker.service';

@NgModule({
  declarations: [
    // Form Components
    EventFormComponent,
    SubmissionFormComponent,
    SpeakerFormComponent,
    
    // Dashboard Components
    EventManagementDashboardComponent,
    AbstractSubmissionDashboardComponent,
    
    // Workflow Components
    SubmissionPipelineComponent,
    ReviewProcessComponent
  ],
  imports: [
    // Angular Core
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    
    // Angular Material (needed by other components)
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTabsModule,
    MatExpansionModule,
    MatChipsModule,
    MatGridListModule,
    MatToolbarModule,
    MatListModule,
    
    // Kendo UI
    CardModule,
    ButtonsModule,
    InputsModule,
    DropDownsModule,
    LabelModule,
    NotificationModule,
    
    // MemberJunction Modules
    BaseFormsModule,
    DashboardsModule,
  ],
  providers: [
    // Services
    EventService,
    SubmissionService,
    SpeakerService,
    MJNotificationService
  ],
  exports: [
    // Form Components
    EventFormComponent,
    SubmissionFormComponent,
    SpeakerFormComponent,
    
    // Dashboard Components
    EventManagementDashboardComponent,
    AbstractSubmissionDashboardComponent,
    
    // Workflow Components
    SubmissionPipelineComponent,
    ReviewProcessComponent
  ]
})
export class EventAbstractSubmissionModule { }
