// SurveyMonkey Response Actions
export * from './get-responses.action';
export * from './get-single-response.action';
export * from './get-statistics.action';
export * from './export-csv.action';
export * from './watch-new-responses.action';

// SurveyMonkey Survey Management Actions
export * from './get-survey.action';
export * from './create-survey.action';
export * from './update-survey.action';

// Import Load functions
import { LoadGetSurveyMonkeyResponsesAction } from './get-responses.action';
import { LoadGetSingleSurveyMonkeyResponseAction } from './get-single-response.action';
import { LoadGetSurveyMonkeyStatisticsAction } from './get-statistics.action';
import { LoadExportSurveyMonkeyCSVAction } from './export-csv.action';
import { LoadWatchNewSurveyMonkeyResponsesAction } from './watch-new-responses.action';
import { LoadGetSurveyMonkeyAction } from './get-survey.action';
import { LoadCreateSurveyMonkeyAction } from './create-survey.action';
import { LoadUpdateSurveyMonkeyAction } from './update-survey.action';

/**
 * Load all SurveyMonkey actions to prevent tree shaking.
 * Call this function from consuming packages to ensure all action classes are included in the bundle.
 */
export function LoadAllSurveyMonkeyActions(): void {
    LoadGetSurveyMonkeyResponsesAction();
    LoadGetSingleSurveyMonkeyResponseAction();
    LoadGetSurveyMonkeyStatisticsAction();
    LoadExportSurveyMonkeyCSVAction();
    LoadWatchNewSurveyMonkeyResponsesAction();
    LoadGetSurveyMonkeyAction();
    LoadCreateSurveyMonkeyAction();
    LoadUpdateSurveyMonkeyAction();
}
