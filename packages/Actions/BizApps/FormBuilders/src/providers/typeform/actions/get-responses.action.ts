import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { FormResponse } from '../../../base/base-form-builder.action';
import { LogStatus } from '@memberjunction/core';

/**
 * Action to retrieve responses from a Typeform with comprehensive filtering options
 *
 * Security: API credentials are retrieved securely from Company Integrations table or environment variables.
 * Never pass API tokens as action parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Typeform Responses',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: '12345'
 *   }, {
 *     Name: 'FormID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'Since',
 *     Value: '2024-01-01T00:00:00Z'
 *   }, {
 *     Name: 'Completed',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetTypeformResponsesAction')
export class GetTypeformResponsesAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Retrieves responses from a Typeform with filtering, pagination, and search capabilities. Supports date ranges, completion status, and text search across answers.';
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

            // Securely retrieve API token using company integration
            const apiToken = await this.getSecureAPIToken(companyId, contextUser);

            const pageSize = this.getParamValue(params.Params, 'PageSize') || 25;
            const since = this.getParamValue(params.Params, 'Since');
            const until = this.getParamValue(params.Params, 'Until');
            const after = this.getParamValue(params.Params, 'After');
            const before = this.getParamValue(params.Params, 'Before');
            const completed = this.getParamValue(params.Params, 'Completed');
            const sort = this.getParamValue(params.Params, 'Sort') || 'submitted_at,desc';
            const query = this.getParamValue(params.Params, 'Query');
            const fields = this.getParamValue(params.Params, 'Fields');
            const getAllPages = this.getParamValue(params.Params, 'GetAllPages') === true;

            let responses: FormResponse[];
            let totalItems: number;
            let pageCount: number;
            let responseTokens: { before?: string; after?: string } = {};

            // Get form details to fetch field titles for simpleAnswers
            let formFields: any[] = [];
            try {
                const formDetails = await this.getFormDetails(formId, apiToken);
                formFields = formDetails.fields || [];
            } catch (formError) {
                LogStatus(`Warning: Could not fetch form details for simpleAnswers generation: ${formError.message}`);
                // Continue without simpleAnswers - this is not a critical failure
            }

            if (getAllPages) {
                const maxResponses = this.getParamValue(params.Params, 'MaxResponses') || 10000;
                const tfResponses = await this.getAllTypeformResponses(formId, apiToken, {
                    since,
                    until,
                    completed,
                    sort,
                    query,
                    maxResponses
                });

                responses = tfResponses.map(r => this.normalizeTypeformResponse(r, formFields));
                totalItems = responses.length;
                pageCount = 1;
            } else {
                const fieldsArray = fields ? String(fields).split(',').map((f: string) => f.trim()) : undefined;

                const result = await this.getTypeformResponses(formId, apiToken, {
                    pageSize: Math.min(pageSize, 1000),
                    since,
                    until,
                    after,
                    before,
                    completed,
                    sort,
                    query,
                    fields: fieldsArray
                });

                responses = result.items.map(r => this.normalizeTypeformResponse(r, formFields));
                totalItems = result.total_items;
                pageCount = result.page_count;

                if (result.items.length > 0) {
                    responseTokens.after = result.items[result.items.length - 1].token;
                    responseTokens.before = result.items[0].token;
                }
            }

            const outputParams: ActionParam[] = [
                {
                    Name: 'Responses',
                    Type: 'Output',
                    Value: responses
                },
                {
                    Name: 'TotalItems',
                    Type: 'Output',
                    Value: totalItems
                },
                {
                    Name: 'PageCount',
                    Type: 'Output',
                    Value: pageCount
                },
                {
                    Name: 'ResponseTokens',
                    Type: 'Output',
                    Value: responseTokens
                },
                {
                    Name: 'Count',
                    Type: 'Output',
                    Value: responses.length
                },
                {
                    Name: 'AnswerDetails',
                    Type: 'Output',
                    Value: responses.map(r => r.answerDetails)
                },
                {
                    Name: 'Answers',
                    Type: 'Output',
                    Value: responses.map(r => r.answers)
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
                Message: `Successfully retrieved ${responses.length} responses from Typeform (${totalItems} total available)`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Typeform Responses', errorMessage, error)
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
                Name: 'PageSize',
                Type: 'Input',
                Value: 25,
            },
            {
                Name: 'Since',
                Type: 'Input',
                Value: null, 
            },
            {
                Name: 'Until',
                Type: 'Input',
                Value: null, 
            },
            {
                Name: 'After',
                Type: 'Input',
                Value: null, 
            },
            {
                Name: 'Before',
                Type: 'Input',
                Value: null, 
            },
            {
                Name: 'Completed',
                Type: 'Input',
                Value: null, 
            },
            {
                Name: 'Sort',
                Type: 'Input',
                Value: 'submitted_at,desc', 
            },
            {
                Name: 'Query',
                Type: 'Input',
                Value: null, 
            },
            {
                Name: 'Fields',
                Type: 'Input',
                Value: null, 
            },
            {
                Name: 'GetAllPages',
                Type: 'Input',
                Value: false, 
            },
            {
                Name: 'MaxResponses',
                Type: 'Input',
                Value: 10000, 
            }
        ];
    }
}
