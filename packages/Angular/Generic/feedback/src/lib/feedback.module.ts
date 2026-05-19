import { NgModule, ModuleWithProviders } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// MemberJunction modules
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

// Components
import { FeedbackFormComponent } from './components/feedback-form.component';
import { FeedbackButtonComponent } from './components/feedback-button.component';

// Config
import { FeedbackConfig, FEEDBACK_CONFIG } from './feedback.config';

/**
 * MemberJunction Feedback Module
 *
 * Provides feedback collection and bug reporting functionality for Angular applications.
 * Feedback is submitted via GraphQL mutation to the standard MJ GraphQL endpoint.
 *
 * @example
 * ```typescript
 * import { FeedbackModule } from '@memberjunction/ng-feedback';
 *
 * @NgModule({
 *   imports: [
 *     FeedbackModule.forRoot({
 *       appName: 'MemberJunction Explorer',
 *       appVersion: '1.0.0',
 *       fields: {
 *         showSeverity: true,
 *         showEnvironment: true,
 *         affectedAreas: ['Entities', 'Views', 'Reports', 'Dashboards']
 *       }
 *     })
 *   ]
 * })
 * export class AppModule { }
 * ```
 *
 * Then add the floating button to your template:
 * ```html
 * <mj-feedback-button Position="bottom-right"></mj-feedback-button>
 * ```
 *
 * Or open the dialog programmatically:
 * ```typescript
 * constructor(private feedbackDialog: FeedbackDialogService) {}
 *
 * reportBug() {
 *   this.feedbackDialog.OpenBugReportDialog();
 * }
 * ```
 */
@NgModule({
  declarations: [
    FeedbackButtonComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    SharedGenericModule,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJButtonDirective,
    FeedbackFormComponent
  ],
  exports: [
    FeedbackFormComponent,
    FeedbackButtonComponent
  ]
})
export class FeedbackModule {
  /**
   * Configure the feedback module with application settings
   *
   * @param config - Configuration for the feedback module
   * @returns ModuleWithProviders with configuration
   *
   * @example
   * ```typescript
   * FeedbackModule.forRoot({
   *   appName: 'My Application',
   *   appVersion: environment.version,
   *   title: 'Report an Issue',
   *   subtitle: 'Help us improve your experience',
   *   fields: {
   *     showSeverity: true,
   *     showEnvironment: true,
   *     affectedAreas: ['Dashboard', 'Reports', 'Settings']
   *   }
   * })
   * ```
   */
  static forRoot(config: FeedbackConfig): ModuleWithProviders<FeedbackModule> {
    return {
      ngModule: FeedbackModule,
      providers: [
        { provide: FEEDBACK_CONFIG, useValue: config }
      ]
    };
  }
}
