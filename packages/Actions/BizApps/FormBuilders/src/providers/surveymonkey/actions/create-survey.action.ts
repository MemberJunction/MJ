import { RegisterClass } from '@memberjunction/global';
import { SurveyMonkeyBaseAction } from '../surveymonkey-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a new SurveyMonkey survey programmatically
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Create SurveyMonkey',
 *   Params: [{
 *     Name: 'AccessToken',
 *     Value: 'your-access-token'
 *   }, {
 *     Name: 'Title',
 *     Value: 'Customer Satisfaction Survey'
 *   }, {
 *     Name: 'Pages',
 *     Value: [{
 *       title: 'Page 1',
 *       questions: [{
 *         family: 'single_choice',
 *         subtype: 'vertical',
 *         heading: 'How satisfied are you with our service?',
 *         answers: {
 *           choices: [
 *             { text: 'Very Satisfied' },
 *             { text: 'Satisfied' },
 *             { text: 'Neutral' },
 *             { text: 'Dissatisfied' }
 *           ]
 *         }
 *       }]
 *     }]
 *   }, {
 *     Name: 'Language',
 *     Value: 'en'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Create SurveyMonkey')
export class CreateSurveyMonkeyAction extends SurveyMonkeyBaseAction {

    public get Description(): string {
        return 'Creates a new SurveyMonkey survey with specified title, pages, and questions. Supports all question families including single_choice, multiple_choice, matrix, open_ended, demographic, datetime, and presentation. Returns the new survey ID, URLs, and page count.';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'Context user is required for SurveyMonkey API calls'
                };
            }

            const accessToken = this.getParamValue(params.Params, 'AccessToken');
            if (!accessToken) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_ACCESS_TOKEN',
                    Message: 'AccessToken parameter is required'
                };
            }

            const title = this.getParamValue(params.Params, 'Title');
            if (!title) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_TITLE',
                    Message: 'Title parameter is required'
                };
            }

            const pages = this.getParamValue(params.Params, 'Pages');
            if (!pages || !Array.isArray(pages) || pages.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_PAGES',
                    Message: 'Pages parameter is required and must be a non-empty array'
                };
            }

            const surveyData: Record<string, any> = {
                title,
                pages
            };

            const language = this.getParamValue(params.Params, 'Language');
            if (language) {
                surveyData.language = language;
            }

            const buttonsText = this.getParamValue(params.Params, 'ButtonsText');
            if (buttonsText && typeof buttonsText === 'object') {
                surveyData.buttons_text = buttonsText;
            }

            const response = await this.getAxiosInstance(accessToken).post('/surveys', surveyData);
            const createdSurvey = response.data;

            const surveyDetails = await this.getSurveyMonkeyDetails(createdSurvey.id, accessToken);

            const surveyUrl = surveyDetails.collect_url || `https://www.surveymonkey.com/r/${createdSurvey.id}`;
            const editUrl = surveyDetails.edit_url || `https://www.surveymonkey.com/create/?sm=${createdSurvey.id}`;

            const outputParams = [
                {
                    Name: 'Survey',
                    Type: 'Output',
                    Value: surveyDetails
                },
                {
                    Name: 'SurveyID',
                    Type: 'Output',
                    Value: createdSurvey.id
                },
                {
                    Name: 'Title',
                    Type: 'Output',
                    Value: surveyDetails.title
                },
                {
                    Name: 'SurveyURL',
                    Type: 'Output',
                    Value: surveyUrl
                },
                {
                    Name: 'EditURL',
                    Type: 'Output',
                    Value: editUrl
                },
                {
                    Name: 'PageCount',
                    Type: 'Output',
                    Value: surveyDetails.page_count
                }
            ];

            for (const outputParam of outputParams) {
                const existingParam = params.Params.find(p => p.Name === outputParam.Name);
                if (existingParam) {
                    existingParam.Value = outputParam.Value;
                } else {
                    params.Params.push(outputParam);
                }
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created survey "${surveyDetails.title}" (ID: ${createdSurvey.id}). View at: ${surveyUrl}`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Create SurveyMonkey Survey', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'AccessToken',
                Type: 'Input',
                Value: null,
                Description: 'SurveyMonkey OAuth access token with survey creation permissions'
            },
            {
                Name: 'Title',
                Type: 'Input',
                Value: null,
                Description: 'Title of the survey'
            },
            {
                Name: 'Pages',
                Type: 'Input',
                Value: null,
                Description: 'Array of page objects. Each page should have: title (string) and questions (array). Questions need: family (single_choice, multiple_choice, matrix, open_ended, demographic, datetime, presentation), subtype (varies by family), heading (question text), and answers object. Example: [{title: "Page 1", questions: [{family: "single_choice", subtype: "vertical", heading: "Your question?", answers: {choices: [{text: "Option 1"}, {text: "Option 2"}]}}]}]'
            },
            {
                Name: 'Language',
                Type: 'Input',
                Value: null,
                Description: 'Optional survey language code (e.g., "en", "es", "fr", "de"). Defaults to "en" if not specified'
            },
            {
                Name: 'ButtonsText',
                Type: 'Input',
                Value: null,
                Description: 'Optional object to customize button text. Properties: next_button, prev_button, done_button, exit_button. Example: {next_button: "Continue", prev_button: "Back", done_button: "Submit"}'
            }
        ];
    }
}
