// JotForm Form Actions
export * from './create-form.action';
export * from './get-form.action';
export * from './update-form.action';

// JotForm Submission Actions
export * from './get-submissions.action';
export * from './get-single-submission.action';
export * from './get-statistics.action';
export * from './export-csv.action';
export * from './watch-new-submissions.action';

// Import Load functions
import { LoadCreateJotFormAction } from './create-form.action';
import { LoadGetJotFormAction } from './get-form.action';
import { LoadUpdateJotFormAction } from './update-form.action';
import { LoadGetJotFormSubmissionsAction } from './get-submissions.action';
import { LoadGetSingleJotFormSubmissionAction } from './get-single-submission.action';
import { LoadGetJotFormStatisticsAction } from './get-statistics.action';
import { LoadExportJotFormCSVAction } from './export-csv.action';
import { LoadWatchNewJotFormSubmissionsAction } from './watch-new-submissions.action';

/**
 * Load all JotForm actions to prevent tree shaking.
 * Call this function from consuming packages to ensure all action classes are included in the bundle.
 */
export function LoadAllJotFormActions(): void {
    LoadCreateJotFormAction();
    LoadGetJotFormAction();
    LoadUpdateJotFormAction();
    LoadGetJotFormSubmissionsAction();
    LoadGetSingleJotFormSubmissionAction();
    LoadGetJotFormStatisticsAction();
    LoadExportJotFormCSVAction();
    LoadWatchNewJotFormSubmissionsAction();
}
