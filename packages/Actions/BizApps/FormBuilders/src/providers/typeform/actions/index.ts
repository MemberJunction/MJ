// Typeform Response Actions
export * from './get-responses.action';
export * from './get-single-response.action';
export * from './get-statistics.action';
export * from './export-csv.action';
export * from './watch-new-responses.action';

// Typeform Form Management Actions
export * from './get-form.action';
export * from './get-forms.action';
export * from './create-form.action';
export * from './update-form.action';

// Import Load functions
import { LoadGetTypeformResponsesAction } from './get-responses.action';
import { LoadGetSingleTypeformResponseAction } from './get-single-response.action';
import { LoadGetTypeformStatisticsAction } from './get-statistics.action';
import { LoadExportTypeformCSVAction } from './export-csv.action';
import { LoadWatchNewTypeformResponsesAction } from './watch-new-responses.action';
import { LoadGetTypeformAction } from './get-form.action';
import { LoadGetTypeformFormsAction } from './get-forms.action';
import { LoadCreateTypeformAction } from './create-form.action';
import { LoadUpdateTypeformAction } from './update-form.action';

/**
 * Load all Typeform actions to prevent tree shaking.
 * Call this function from consuming packages to ensure all action classes are included in the bundle.
 */
export function LoadAllTypeformActions(): void {
    LoadGetTypeformResponsesAction();
    LoadGetSingleTypeformResponseAction();
    LoadGetTypeformStatisticsAction();
    LoadExportTypeformCSVAction();
    LoadWatchNewTypeformResponsesAction();
    LoadGetTypeformAction();
    LoadGetTypeformFormsAction();
    LoadCreateTypeformAction();
    LoadUpdateTypeformAction();
}
