import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { MJButtonDirective, MJEmptyStateComponent, MJAlertComponent, MJAccordionModule } from '@memberjunction/ng-ui-components';


// MemberJunction Modules
import { ContainerDirectivesModule } from '@memberjunction/ng-container-directives';

// Components
import { TestFeedbackDialogComponent } from './components/test-feedback-dialog.component';
import { TestRunDialogComponent } from './components/test-run-dialog.component';
import { TestStatusBadgeComponent } from './components/widgets/test-status-badge.component';
import { ScoreIndicatorComponent } from './components/widgets/score-indicator.component';
import { CostDisplayComponent } from './components/widgets/cost-display.component';
import { TestResultsMatrixComponent } from './components/widgets/test-results-matrix.component';
import { EvaluationBadgeComponent } from './components/widgets/evaluation-badge.component';
import { EvaluationModeToggleComponent } from './components/widgets/evaluation-mode-toggle.component';
import { ReviewStatusIndicatorComponent } from './components/widgets/review-status-indicator.component';
import { ExecutionContextComponent } from './components/widgets/execution-context.component';

@NgModule({
  declarations: [
    TestFeedbackDialogComponent,
    TestRunDialogComponent,
    TestStatusBadgeComponent,
    ScoreIndicatorComponent,
    CostDisplayComponent,
    TestResultsMatrixComponent,
    EvaluationBadgeComponent,
    EvaluationModeToggleComponent,
    ReviewStatusIndicatorComponent,
    ExecutionContextComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MJButtonDirective,
    MJEmptyStateComponent,
    MJAlertComponent,
    MJAccordionModule,
    ContainerDirectivesModule
  ],
  exports: [
    TestFeedbackDialogComponent,
    TestRunDialogComponent,
    TestStatusBadgeComponent,
    ScoreIndicatorComponent,
    CostDisplayComponent,
    TestResultsMatrixComponent,
    EvaluationBadgeComponent,
    EvaluationModeToggleComponent,
    ReviewStatusIndicatorComponent,
    ExecutionContextComponent
  ],
  providers: [
    // TestingDialogService, TestingExecutionService, and EvaluationPreferencesService
    // use providedIn: 'root' — do NOT re-provide here or it creates duplicate instances
  ]
})
export class TestingModule { }
