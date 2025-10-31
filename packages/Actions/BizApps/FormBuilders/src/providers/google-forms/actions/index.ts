// Google Forms Response Actions
export * from './get-single-response.action';
export * from './get-statistics.action';
export * from './export-csv.action';

// Google Forms Form Management Actions
export * from './get-form.action';

// Import Load functions
import { LoadGetSingleGoogleFormsResponseAction } from './get-single-response.action';
import { LoadGetGoogleFormsStatisticsAction } from './get-statistics.action';
import { LoadExportGoogleFormsCSVAction } from './export-csv.action';
import { LoadGetGoogleFormAction } from './get-form.action';

/**
 * Load all Google Forms actions to prevent tree shaking.
 * Call this function from consuming packages to ensure all action classes are included in the bundle.
 */
export function LoadAllGoogleFormsActions(): void {
    LoadGetSingleGoogleFormsResponseAction();
    LoadGetGoogleFormsStatisticsAction();
    LoadExportGoogleFormsCSVAction();
    LoadGetGoogleFormAction();
}
