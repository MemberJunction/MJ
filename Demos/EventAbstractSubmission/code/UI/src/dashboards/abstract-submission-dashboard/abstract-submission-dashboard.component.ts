import { Component } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-dashboards';
import { RegisterClass } from '@memberjunction/global';

/**
 * Abstract Submission Dashboard Component - Placeholder
 * TODO: Implement with Angular Material components
 */
@Component({
  selector: 'mj-abstract-submission-dashboard',
  template: '<div>Abstract Submission Dashboard Component - To be implemented</div>',
  styles: ['div { padding: 20px; text-align: center; color: #666; }']
})
@RegisterClass(BaseDashboard, 'AbstractSubmission')
export class AbstractSubmissionDashboardComponent extends BaseDashboard {
  
  constructor() {
    super();
  }
  
  protected initDashboard(): void {
    // TODO: Initialize dashboard
  }
  
  protected loadData(): void {
    // TODO: Implement data loading
  }
}

/**
 * Tree shaking prevention function
 */
export function LoadAbstractSubmissionDashboard() {
  return AbstractSubmissionDashboardComponent;
}
