import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { LogStatus } from '@memberjunction/core';

/**
 * Action to retrieve a specific response from Typeform by response token
 *
 * Security: API credentials are retrieved securely from Company Integrations table or environment variables.
 * Never pass API tokens as action parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Single Typeform Response',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: '12345'
 *   }, {
 *     Name: 'FormID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'ResponseToken',
 *     Value: 'xyz789'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetSingleTypeformResponseAction')
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

            const companyId = this.getParamValue(params.Params, 'CompanyID');

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

            // Securely retrieve API token using company integration
            const apiToken = await this.getSecureAPIToken(companyId, contextUser);

            // Get form details to fetch field titles for simpleAnswers
            let formFields: any[] = [];
            try {
                const formDetails = await this.getFormDetails(formId, apiToken);
                formFields = formDetails.fields || [];
            } catch (formError) {
                LogStatus(`Warning: Could not fetch form details for simpleAnswers generation: ${formError.message}`);
                // Continue without simpleAnswers - this is not a critical failure
            }

            const tfResponse = await this.getSingleTypeformResponse(formId, responseToken, apiToken);
            const normalizedResponse = this.normalizeTypeformResponse(tfResponse, formFields);

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
                    Name: 'AnswerDetails',
                    Type: 'Output',
                    Value: normalizedResponse.answerDetails
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
                Name: 'CompanyID',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'FormID',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'ResponseToken',
                Type: 'Input',
                Value: null,
            }
        ];
    }
}
