import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { FormResponse } from '../../../base/base-form-builder.action';

/**
 * Action to retrieve responses from a Typeform with comprehensive filtering options
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Typeform Responses',
 *   Params: [{
 *     Name: 'FormID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'APIToken',
 *     Value: 'tfp_...'
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
@RegisterClass(BaseAction, 'Get Typeform Responses')
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

            const formId = this.getParamValue(params.Params, 'FormID');
            if (!formId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_FORM_ID',
                    Message: 'FormID parameter is required'
                };
            }

            const apiToken = this.getParamValue(params.Params, 'APIToken');
            if (!apiToken) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_API_TOKEN',
                    Message: 'APIToken parameter is required. Get your token from https://admin.typeform.com/account#/section/tokens'
                };
            }

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

                responses = tfResponses.map(r => this.normalizeTypeformResponse(r));
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

                responses = result.items.map(r => this.normalizeTypeformResponse(r));
                totalItems = result.total_items;
                pageCount = result.page_count;

                if (result.items.length > 0) {
                    responseTokens.after = result.items[result.items.length - 1].token;
                    responseTokens.before = result.items[0].token;
                }
            }

            const outputParams = [
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
                Name: 'FormID',
                Type: 'Input',
                Value: null,
                Description: 'The Typeform form ID (found in the form URL)'
            },
            {
                Name: 'APIToken',
                Type: 'Input',
                Value: null,
                Description: 'Typeform API access token (get from https://admin.typeform.com/account#/section/tokens)'
            },
            {
                Name: 'PageSize',
                Type: 'Input',
                Value: 25,
                Description: 'Number of responses per page (1-1000, default 25)'
            },
            {
                Name: 'Since',
                Type: 'Input',
                Value: null,
                Description: 'Filter responses submitted since this date (ISO 8601 format or Unix timestamp)'
            },
            {
                Name: 'Until',
                Type: 'Input',
                Value: null,
                Description: 'Filter responses submitted until this date (ISO 8601 format or Unix timestamp)'
            },
            {
                Name: 'After',
                Type: 'Input',
                Value: null,
                Description: 'Response token for pagination - get next page after this token'
            },
            {
                Name: 'Before',
                Type: 'Input',
                Value: null,
                Description: 'Response token for pagination - get page before this token'
            },
            {
                Name: 'Completed',
                Type: 'Input',
                Value: null,
                Description: 'Filter by completion status (true=completed only, false=partial only, null=all)'
            },
            {
                Name: 'Sort',
                Type: 'Input',
                Value: 'submitted_at,desc',
                Description: 'Sort order: "submitted_at,asc" or "submitted_at,desc" (default: submitted_at,desc)'
            },
            {
                Name: 'Query',
                Type: 'Input',
                Value: null,
                Description: 'Text search across all response answers'
            },
            {
                Name: 'Fields',
                Type: 'Input',
                Value: null,
                Description: 'Comma-separated list of field IDs to include (returns only these fields)'
            },
            {
                Name: 'GetAllPages',
                Type: 'Input',
                Value: false,
                Description: 'If true, automatically fetch all pages of responses (up to MaxResponses)'
            },
            {
                Name: 'MaxResponses',
                Type: 'Input',
                Value: 10000,
                Description: 'Maximum number of responses to retrieve when GetAllPages is true (default 10000)'
            }
        ];
    }
}
