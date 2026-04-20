import { RegisterClass } from '@memberjunction/global';
import { SurveyMonkeyBaseAction } from '../surveymonkey-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a new SurveyMonkey survey programmatically
 *
 * Security: Uses secure credential lookup via CompanyID instead of accepting tokens directly.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Create SurveyMonkey',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
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
@RegisterClass(BaseAction, 'CreateSurveyMonkeyAction')
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

            const companyId = this.getParamValue(params.Params, 'CompanyID');

            const accessToken = await this.getSecureAPIToken(companyId, contextUser);

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

            const outputParams: ActionParam[] = [
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
                Name: 'CompanyID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Title',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Pages',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Language',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ButtonsText',
                Type: 'Input',
                Value: null
            }
        ];
    }
}