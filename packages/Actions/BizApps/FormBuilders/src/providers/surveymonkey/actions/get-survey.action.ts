import { RegisterClass } from '@memberjunction/global';
import { SurveyMonkeyBaseAction } from '../surveymonkey-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve complete details of a SurveyMonkey survey including pages, questions, and settings
 *
 * Security: Uses secure credential lookup via CompanyID instead of accepting tokens directly.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get SurveyMonkey Details',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'SurveyID',
 *     Value: '123456789'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetSurveyMonkeyAction')
export class GetSurveyMonkeyDetailsAction extends SurveyMonkeyBaseAction {

    public get Description(): string {
        return 'Retrieves complete details of a SurveyMonkey survey including title, pages, questions, settings, and metadata. Use this to inspect or backup survey configurations, analyze survey structure, and access survey metadata.';
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

            const surveyId = this.getParamValue(params.Params, 'SurveyID');
            if (!surveyId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_SURVEY_ID',
                    Message: 'SurveyID parameter is required'
                };
            }

            const accessToken = await this.getSecureAPIToken(companyId, contextUser);

            // Fetch complete survey details from SurveyMonkey API
            const response = await this.getAxiosInstance(accessToken).get(`/surveys/${surveyId}/details`);
            const survey = response.data;

            // Extract comprehensive survey information
            const questionCount = survey.question_count || 0;
            const pageCount = survey.page_count || 0;
            const createdAt = survey.date_created || '';
            const updatedAt = survey.date_modified || '';

            // Determine survey status (active if response count exists, otherwise draft)
            const status = survey.response_count > 0 ? 'active' : 'draft';

            // Build comprehensive survey details object
            const surveyOutput = {
                id: survey.id,
                title: survey.title,
                nickname: survey.nickname,
                href: survey.href,
                language: survey.language,
                questionCount,
                pageCount,
                responseCount: survey.response_count,
                createdAt,
                updatedAt,
                status,
                pages: survey.pages || [],
                settings: {
                    buttons_text: survey.buttons_text || {},
                    custom_variables: survey.custom_variables || {},
                    folder_id: survey.folder_id,
                    category: survey.category,
                    quiz_options: survey.quiz_options,
                    preview: survey.preview,
                    edit_url: survey.edit_url,
                    collect_url: survey.collect_url,
                    analyze_url: survey.analyze_url,
                    summary_url: survey.summary_url
                }
            };

            // Prepare output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'Survey',
                    Type: 'Output',
                    Value: surveyOutput
                },
                {
                    Name: 'SurveyID',
                    Type: 'Output',
                    Value: survey.id
                },
                {
                    Name: 'Title',
                    Type: 'Output',
                    Value: survey.title
                },
                {
                    Name: 'QuestionCount',
                    Type: 'Output',
                    Value: questionCount
                },
                {
                    Name: 'PageCount',
                    Type: 'Output',
                    Value: pageCount
                },
                {
                    Name: 'CreatedAt',
                    Type: 'Output',
                    Value: createdAt
                },
                {
                    Name: 'UpdatedAt',
                    Type: 'Output',
                    Value: updatedAt
                },
                {
                    Name: 'Status',
                    Type: 'Output',
                    Value: status
                }
            ];

            // Update params with output values
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
                Message: `Successfully retrieved survey "${survey.title}" with ${questionCount} questions across ${pageCount} pages`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get SurveyMonkey Details', errorMessage, error)
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
                Name: 'SurveyID',
                Type: 'Input',
                Value: null
            }
        ];
    }
}