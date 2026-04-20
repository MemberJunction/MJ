import { RegisterClass } from '@memberjunction/global';
import { SurveyMonkeyBaseAction } from '../surveymonkey-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve a specific response from SurveyMonkey by response ID
 *
 * Security: Uses secure credential lookup via CompanyID instead of accepting tokens directly.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Single SurveyMonkey Response',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'SurveyID',
 *     Value: '123456789'
 *   }, {
 *     Name: 'ResponseID',
 *     Value: '987654321'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetSingleSurveyMonkeyResponseAction')
export class GetSingleSurveyMonkeyResponseAction extends SurveyMonkeyBaseAction {

    public get Description(): string {
        return 'Retrieves details of a specific SurveyMonkey response by its unique response ID. Includes all answers, metadata, response status, and submission timing information.';
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

            const responseId = this.getParamValue(params.Params, 'ResponseID');
            if (!responseId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_RESPONSE_ID',
                    Message: 'ResponseID parameter is required'
                };
            }

            const accessToken = await this.getSecureAPIToken(companyId, contextUser);

            const smResponse = await this.getSingleSurveyMonkeyResponse(surveyId, responseId, accessToken);
            const normalizedResponse = this.normalizeSurveyMonkeyResponse(smResponse);

            const outputParams: ActionParam[] = [
                {
                    Name: 'Response',
                    Type: 'Output',
                    Value: normalizedResponse
                },
                {
                    Name: 'ResponseID',
                    Type: 'Output',
                    Value: normalizedResponse.responseId
                },
                {
                    Name: 'Status',
                    Type: 'Output',
                    Value: smResponse.response_status
                },
                {
                    Name: 'SubmittedAt',
                    Type: 'Output',
                    Value: normalizedResponse.submittedAt
                },
                {
                    Name: 'Answers',
                    Type: 'Output',
                    Value: normalizedResponse.answers
                },
                {
                    Name: 'Metadata',
                    Type: 'Output',
                    Value: normalizedResponse.metadata
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
                Message: `Successfully retrieved response ${responseId} from SurveyMonkey`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Single SurveyMonkey Response', errorMessage, error)
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
            },
            {
                Name: 'ResponseID',
                Type: 'Input',
                Value: null
            }
        ];
    }
}