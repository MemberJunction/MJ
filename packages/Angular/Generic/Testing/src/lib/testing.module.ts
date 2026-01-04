import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// Kendo UI modules
import { DialogModule } from '@progress/kendo-angular-dialog';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { LayoutModule } from '@progress/kendo-angular-layout';

// MemberJunction Modules
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

// Components
import { TestFeedbackDialogComponent } from './components/test-feedback-dialog.component';
import { TestRunDialogComponent } from './components/test-run-dialog.component';
import { TestStatusBadgeComponent } from './components/widgets/test-status-badge.component';
import { ScoreIndicatorComponent } from './components/widgets/score-indicator.component';
import { CostDisplayComponent } from './components/widgets/cost-display.component';
import { TestResultsMatrixComponent } from './components/widgets/test-results-matrix.component';

// Services
import { TestingDialogService } from './services/testing-dialog.service';
import { TestingExecutionService } from './services/testing-execution.service';

@NgModule({
  declarations: [
    TestFeedbackDialogComponent,
    TestRunDialogComponent,
    TestStatusBadgeComponent,
    ScoreIndicatorComponent,
    CostDisplayComponent,
    TestResultsMatrixComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DialogModule,
    ButtonsModule,
    InputsModule,
    DropDownsModule,
    IndicatorsModule,
    LayoutModule,
    ContainerDirectivesModule
  ],
  exports: [
    TestFeedbackDialogComponent,
    TestRunDialogComponent,
    TestStatusBadgeComponent,
    ScoreIndicatorComponent,
    CostDisplayComponent,
    TestResultsMatrixComponent
  ],
  providers: [
    TestingDialogService,
    TestingExecutionService
  ]
})
export class TestingModule { }
