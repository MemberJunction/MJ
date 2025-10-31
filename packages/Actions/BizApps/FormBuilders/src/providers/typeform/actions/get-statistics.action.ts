import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { FormStatistics } from '../../../base/base-form-builder.action';

/**
 * Action to calculate aggregate statistics from Typeform responses
 *
 * Security: API credentials are retrieved securely from Company Integrations table or environment variables.
 * Never pass API tokens as action parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Typeform Response Statistics',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: '12345'
 *   }, {
 *     Name: 'FormID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'Since',
 *     Value: '2024-01-01T00:00:00Z'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetTypeformStatisticsAction')
export class GetTypeformStatisticsAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Calculates comprehensive statistics from Typeform responses including completion rates, response trends, popular answers, and time-based analytics. Useful for dashboards and reporting.';
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

            const since = this.getParamValue(params.Params, 'Since');
            const until = this.getParamValue(params.Params, 'Until');
            const maxResponses = this.getParamValue(params.Params, 'MaxResponses') || 10000;
            const includeTopAnswers = this.getParamValue(params.Params, 'IncludeTopAnswers') !== false;
            const topAnswersLimit = this.getParamValue(params.Params, 'TopAnswersLimit') || 10;

            const tfResponses = await this.getAllTypeformResponses(formId, apiToken, {
                since,
                until,
                maxResponses
            });

            const responses = tfResponses.map(r => this.normalizeTypeformResponse(r));

            const completedResponses = responses.filter(r => r.completed);
            const partialResponses = responses.filter(r => !r.completed);
            const completionRate = this.calculateCompletionRate(
                completedResponses.length,
                responses.length
            );

            const responsesByDate = this.groupResponsesByDate(responses);

            const statistics: FormStatistics = {
                totalResponses: responses.length,
                completedResponses: completedResponses.length,
                partialResponses: partialResponses.length,
                completionRate,
                averageCompletionTime: this.calculateAverageCompletionTime(responses),
                responsesByDate
            };

            if (includeTopAnswers && responses.length > 0) {
                const topAnswers: Record<string, Array<{ answer: string; count: number }>> = {};
                const allFieldIds = new Set<string>();

                for (const response of responses) {
                    for (const answer of response.answerDetails) {
                        allFieldIds.add(answer.fieldId);
                    }
                }

                for (const fieldId of allFieldIds) {
                    const fieldTopAnswers = this.findTopAnswers(responses, fieldId, topAnswersLimit);
                    if (fieldTopAnswers.length > 0) {
                        topAnswers[fieldId] = fieldTopAnswers;
                    }
                }

                statistics.topAnswers = topAnswers;
            }

            const dailyBreakdown = this.calculateDailyBreakdown(responses);
            const hourlyDistribution = this.calculateHourlyDistribution(responses);

            const outputParams: ActionParam[] = [
                {
                    Name: 'Statistics',
                    Type: 'Output',
                    Value: statistics
                },
                {
                    Name: 'TotalResponses',
                    Type: 'Output',
                    Value: statistics.totalResponses
                },
                {
                    Name: 'CompletedResponses',
                    Type: 'Output',
                    Value: statistics.completedResponses
                },
                {
                    Name: 'PartialResponses',
                    Type: 'Output',
                    Value: statistics.partialResponses
                },
                {
                    Name: 'CompletionRate',
                    Type: 'Output',
                    Value: statistics.completionRate
                },
                {
                    Name: 'AverageCompletionTime',
                    Type: 'Output',
                    Value: statistics.averageCompletionTime
                },
                {
                    Name: 'ResponsesByDate',
                    Type: 'Output',
                    Value: statistics.responsesByDate
                },
                {
                    Name: 'DailyBreakdown',
                    Type: 'Output',
                    Value: dailyBreakdown
                },
                {
                    Name: 'HourlyDistribution',
                    Type: 'Output',
                    Value: hourlyDistribution
                }
            ];

            if (includeTopAnswers) {
                outputParams.push({
                    Name: 'TopAnswers',
                    Type: 'Output',
                    Value: statistics.topAnswers
                });
            }

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
                Message: `Successfully calculated statistics from ${responses.length} Typeform responses (${completionRate}% completion rate)`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Typeform Statistics', errorMessage, error)
            };
        }
    }

    private calculateDailyBreakdown(responses: any[]): Array<{ date: string; count: number; completed: number; partial: number }> {
        const daily: Record<string, { count: number; completed: number; partial: number }> = {};

        for (const response of responses) {
            const dateKey = response.submittedAt.toISOString().split('T')[0];
            if (!daily[dateKey]) {
                daily[dateKey] = { count: 0, completed: 0, partial: 0 };
            }
            daily[dateKey].count++;
            if (response.completed) {
                daily[dateKey].completed++;
            } else {
                daily[dateKey].partial++;
            }
        }

        return Object.entries(daily)
            .map(([date, stats]) => ({ date, ...stats }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    private calculateHourlyDistribution(responses: any[]): Array<{ hour: number; count: number }> {
        const hourly: Record<number, number> = {};

        for (let i = 0; i < 24; i++) {
            hourly[i] = 0;
        }

        for (const response of responses) {
            const hour = response.submittedAt.getHours();
            hourly[hour]++;
        }

        return Object.entries(hourly).map(([hour, count]) => ({
            hour: parseInt(hour),
            count
        }));
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
                Name: 'MaxResponses',
                Type: 'Input',
                Value: 10000,
            },
            {
                Name: 'IncludeTopAnswers',
                Type: 'Input',
                Value: true,
            },
            {
                Name: 'TopAnswersLimit',
                Type: 'Input',
                Value: 10,
            }
        ];
    }
}

/**
 * Load function to prevent tree shaking
 */
export function LoadGetTypeformStatisticsAction(): void {
    // Empty function to create static code path and prevent tree shaking
}
