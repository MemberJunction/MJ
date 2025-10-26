import { RegisterClass } from '@memberjunction/global';
import { GoogleFormsBaseAction } from '../googleforms-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve a specific response from Google Forms by response ID
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Single Google Forms Response',
 *   Params: [{
 *     Name: 'FormID',
 *     Value: 'abc123xyz'
 *   }, {
 *     Name: 'ResponseID',
 *     Value: 'ACYDBNhVXdW3lFGH...'
 *   }, {
 *     Name: 'AccessToken',
 *     Value: 'ya29.a0AfH6...'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Get Single Google Forms Response')
export class GetSingleGoogleFormsResponseAction extends GoogleFormsBaseAction {

    public get Description(): string {
        return 'Retrieves details of a specific Google Forms response by its unique response ID. Includes all answers, metadata, submission timing information, and respondent email if available.';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'Context user is required for Google Forms API calls'
                };
            }

            const formId = this.getParamValue(params.Params, 'FormID');
            if (!formId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_FORM_ID',
                    Message: 'FormID parameter is required'
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

            const accessToken = this.getParamValue(params.Params, 'AccessToken');
            if (!accessToken) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_ACCESS_TOKEN',
                    Message: 'AccessToken parameter is required'
                };
            }

            const gfResponse = await this.getSingleGoogleFormsResponse(formId, responseId, accessToken);
            const normalizedResponse = this.normalizeGoogleFormsResponse(gfResponse);

            // Build respondent object with email if available
            const respondent: { email?: string } = {};
            if (gfResponse.respondentEmail) {
                respondent.email = gfResponse.respondentEmail;
            }

            const outputParams = [
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
                    Name: 'Respondent',
                    Type: 'Output',
                    Value: respondent
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
                Message: `Successfully retrieved response ${responseId} from Google Forms`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Single Google Forms Response', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'FormID',
                Type: 'Input',
                Value: null,
                Description: 'The Google Forms form ID'
            },
            {
                Name: 'ResponseID',
                Type: 'Input',
                Value: null,
                Description: 'The unique response ID to retrieve'
            },
            {
                Name: 'AccessToken',
                Type: 'Input',
                Value: null,
                Description: 'Google OAuth 2.0 access token with forms.responses.readonly or forms.readonly scope'
            }
        ];
    }
}
