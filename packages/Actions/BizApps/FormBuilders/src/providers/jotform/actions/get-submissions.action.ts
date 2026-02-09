import { RegisterClass } from '@memberjunction/global';
import { JotFormBaseAction } from '../jotform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { FormResponse } from '../../../base/base-form-builder.action';

/**
 * Action to retrieve submissions from a JotForm with comprehensive filtering options
 *
 * Security: API credentials are retrieved securely from Company Integrations
 * instead of being passed as parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get JotForm Submissions',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'FormID',
 *     Value: '123456789'
 *   }, {
 *     Name: 'Filter',
 *     Value: JSON.stringify({ status: 'ACTIVE', created_at: 'gt:2024-01-01' })
 *   }, {
 *     Name: 'GetAllPages',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetJotFormSubmissionsAction')
export class GetJotFormSubmissionsAction extends JotFormBaseAction {

    public get Description(): string {
        return 'Retrieves submissions from a JotForm with filtering, pagination, and ordering capabilities. Supports date ranges, status filtering, and custom field filters.';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_CONTEXT_USER',
                    Message: 'Context user is required for JotForm API calls'
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

            const apiKey = await this.getSecureAPIToken(companyId, contextUser);

            const limit = this.getParamValue(params.Params, 'Limit') || 100;
            const offset = this.getParamValue(params.Params, 'Offset') || 0;
            const filterParam = this.getParamValue(params.Params, 'Filter');
            const orderby = this.getParamValue(params.Params, 'OrderBy');
            const region = this.getParamValue(params.Params, 'Region') as 'us' | 'eu' | 'hipaa' | undefined;
            const getAllPages = this.getParamValue(params.Params, 'GetAllPages') === true;

            // Parse filter if provided (expects JSON string)
            let filter: Record<string, string> | undefined;
            if (filterParam) {
                try {
                    filter = typeof filterParam === 'string' ? JSON.parse(filterParam) : filterParam;
                } catch (error) {
                    return {
                        Success: false,
                        ResultCode: 'INVALID_FILTER',
                        Message: 'Filter parameter must be a valid JSON object'
                    };
                }
            }

            let submissions: FormResponse[];
            let totalCount: number;
            let actualLimit: number;
            let actualOffset: number;

            if (getAllPages) {
                const maxSubmissions = this.getParamValue(params.Params, 'MaxSubmissions') || 10000;
                const jfSubmissions = await this.getAllJotFormSubmissions(formId, apiKey, {
                    filter,
                    orderby,
                    maxSubmissions,
                    region
                });

                submissions = jfSubmissions.map(s => this.normalizeJotFormSubmission(s));
                totalCount = submissions.length;
                actualLimit = submissions.length;
                actualOffset = 0;
            } else {
                const result = await this.getJotFormSubmissions(formId, apiKey, {
                    limit: Math.min(limit, 1000),
                    offset,
                    filter,
                    orderby,
                    region
                });

                submissions = result.content.map(s => this.normalizeJotFormSubmission(s));
                totalCount = submissions.length; // JotForm doesn't return total count in API
                actualLimit = result.limit;
                actualOffset = result.offset;
            }

            const outputParams: ActionParam[] = [
                {
                    Name: 'Submissions',
                    Type: 'Output',
                    Value: submissions
                },
                {
                    Name: 'TotalCount',
                    Type: 'Output',
                    Value: totalCount
                },
                {
                    Name: 'Limit',
                    Type: 'Output',
                    Value: actualLimit
                },
                {
                    Name: 'Offset',
                    Type: 'Output',
                    Value: actualOffset
                },
                {
                    Name: 'Count',
                    Type: 'Output',
                    Value: submissions.length
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
                Message: `Successfully retrieved ${submissions.length} submissions from JotForm${getAllPages ? '' : ` (offset: ${actualOffset}, limit: ${actualLimit})`}`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get JotForm Submissions', errorMessage, error)
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
                Name: 'FormID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Region',
                Type: 'Input',
                Value: 'us'
            },
            {
                Name: 'Limit',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'Offset',
                Type: 'Input',
                Value: 0
            },
            {
                Name: 'Filter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OrderBy',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'GetAllPages',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'MaxSubmissions',
                Type: 'Input',
                Value: 10000
            }
        ];
    }
}