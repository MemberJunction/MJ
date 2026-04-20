import { RegisterClass } from '@memberjunction/global';
import { SurveyMonkeyBaseAction } from '../surveymonkey-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { FormResponse } from '../../../base/base-form-builder.action';

/**
 * Action to retrieve responses from a SurveyMonkey survey with comprehensive filtering options
 *
 * Security: Uses secure credential lookup via CompanyID instead of accepting tokens directly.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get SurveyMonkey Responses',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'SurveyID',
 *     Value: '12345678'
 *   }, {
 *     Name: 'StartCreatedAt',
 *     Value: '2024-01-01T00:00:00Z'
 *   }, {
 *     Name: 'Status',
 *     Value: 'completed'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetSurveyMonkeyResponsesAction')
export class GetSurveyMonkeyResponsesAction extends SurveyMonkeyBaseAction {

    public get Description(): string {
        return 'Retrieves responses from a SurveyMonkey survey with filtering, pagination, and sorting capabilities. Supports date ranges, completion status, and response status filtering.';
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

            const pageSize = this.getParamValue(params.Params, 'PageSize') || 100;
            const page = this.getParamValue(params.Params, 'Page');
            const startCreatedAt = this.getParamValue(params.Params, 'StartCreatedAt');
            const endCreatedAt = this.getParamValue(params.Params, 'EndCreatedAt');
            const startModifiedAt = this.getParamValue(params.Params, 'StartModifiedAt');
            const endModifiedAt = this.getParamValue(params.Params, 'EndModifiedAt');
            const sortOrder = this.getParamValue(params.Params, 'SortOrder') as 'ASC' | 'DESC' | undefined;
            const sortBy = this.getParamValue(params.Params, 'SortBy') as 'date_modified' | 'date_created' | undefined;
            const status = this.getParamValue(params.Params, 'Status') as 'completed' | 'partial' | 'overquota' | 'disqualified' | undefined;
            const getAllPages = this.getParamValue(params.Params, 'GetAllPages') === true;

            let responses: FormResponse[];
            let totalResponses: number;
            let currentPage: number;
            let totalPages: number;
            let hasMore: boolean;

            if (getAllPages) {
                const maxResponses = this.getParamValue(params.Params, 'MaxResponses') || 10000;
                const smResponses = await this.getAllSurveyMonkeyResponses(surveyId, accessToken, {
                    start_created_at: startCreatedAt,
                    end_created_at: endCreatedAt,
                    start_modified_at: startModifiedAt,
                    end_modified_at: endModifiedAt,
                    sort_order: sortOrder,
                    sort_by: sortBy,
                    status,
                    maxResponses
                });

                responses = smResponses.map(r => this.normalizeSurveyMonkeyResponse(r));
                totalResponses = responses.length;
                currentPage = 1;
                totalPages = 1;
                hasMore = false;
            } else {
                const result = await this.getSurveyMonkeyResponses(surveyId, accessToken, {
                    per_page: Math.min(pageSize, 100),
                    page,
                    start_created_at: startCreatedAt,
                    end_created_at: endCreatedAt,
                    start_modified_at: startModifiedAt,
                    end_modified_at: endModifiedAt,
                    sort_order: sortOrder,
                    sort_by: sortBy,
                    status
                });

                responses = result.data.map(r => this.normalizeSurveyMonkeyResponse(r));
                totalResponses = result.total;
                currentPage = result.page;
                totalPages = Math.ceil(result.total / result.per_page);
                hasMore = !!result.links.next;
            }

            const outputParams: ActionParam[] = [
                {
                    Name: 'Responses',
                    Type: 'Output',
                    Value: responses
                },
                {
                    Name: 'TotalResponses',
                    Type: 'Output',
                    Value: totalResponses
                },
                {
                    Name: 'Count',
                    Type: 'Output',
                    Value: responses.length
                },
                {
                    Name: 'CurrentPage',
                    Type: 'Output',
                    Value: currentPage
                },
                {
                    Name: 'TotalPages',
                    Type: 'Output',
                    Value: totalPages
                },
                {
                    Name: 'HasMore',
                    Type: 'Output',
                    Value: hasMore
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
                Message: `Successfully retrieved ${responses.length} responses from SurveyMonkey${getAllPages ? '' : ` (page ${currentPage} of ${totalPages}, ${totalResponses} total)`}`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get SurveyMonkey Responses', errorMessage, error)
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
                Name: 'PageSize',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'Page',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'StartCreatedAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EndCreatedAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'StartModifiedAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EndModifiedAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Status',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'GetAllPages',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'MaxResponses',
                Type: 'Input',
                Value: 10000
            }
        ];
    }
}