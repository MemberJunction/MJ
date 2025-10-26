import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve a specific response from Typeform by response token
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Single Typeform Response',
 *   Params: [{
 *     Name: 'FormID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'ResponseToken',
 *     Value: 'xyz789'
 *   }, {
 *     Name: 'APIToken',
 *     Value: 'tfp_...'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Get Single Typeform Response')
export class GetSingleTypeformResponseAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Retrieves details of a specific Typeform response by its unique response token. Includes all answers, metadata, hidden fields, and calculated values.';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'Context user is required for Typeform API calls'
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

            const responseToken = this.getParamValue(params.Params, 'ResponseToken');
            if (!responseToken) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_RESPONSE_TOKEN',
                    Message: 'ResponseToken parameter is required'
                };
            }

            const apiToken = this.getParamValue(params.Params, 'APIToken');
            if (!apiToken) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_API_TOKEN',
                    Message: 'APIToken parameter is required'
                };
            }

            const tfResponse = await this.getSingleTypeformResponse(formId, responseToken, apiToken);
            const normalizedResponse = this.normalizeTypeformResponse(tfResponse);

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
                    Name: 'Completed',
                    Type: 'Output',
                    Value: normalizedResponse.completed
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
                },
                {
                    Name: 'HiddenFields',
                    Type: 'Output',
                    Value: normalizedResponse.hiddenFields
                },
                {
                    Name: 'CalculatedFields',
                    Type: 'Output',
                    Value: normalizedResponse.calculatedFields
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
                Message: `Successfully retrieved response ${responseToken} from Typeform`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Single Typeform Response', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'FormID',
                Type: 'Input',
                Value: null,
                Description: 'The Typeform form ID'
            },
            {
                Name: 'ResponseToken',
                Type: 'Input',
                Value: null,
                Description: 'The unique response token to retrieve'
            },
            {
                Name: 'APIToken',
                Type: 'Input',
                Value: null,
                Description: 'Typeform API access token'
            }
        ];
    }
}
