import { RegisterClass } from '@memberjunction/global';
import { GoogleFormsBaseAction } from '../googleforms-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { FormStatistics } from '../../../base/base-form-builder.action';

/**
 * Action to calculate aggregate statistics from Google Forms responses
 *
 * Security: This action uses secure credential lookup via Company Integrations.
 * API credentials are retrieved from environment variables or the database based on CompanyID.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Google Forms Response Statistics',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'company-uuid-here'
 *   }, {
 *     Name: 'FormID',
 *     Value: '1a2b3c4d5e'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetGoogleFormsStatisticsAction')
export class GetGoogleFormsStatisticsAction extends GoogleFormsBaseAction {

    public get Description(): string {
        return 'Calculates comprehensive statistics from Google Forms responses including completion rates, response trends, popular answers, and time-based analytics. Useful for dashboards and reporting.';
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

            const companyId = this.getParamValue(params.Params, 'CompanyID');

            const formId = this.getParamValue(params.Params, 'FormID');
            if (!formId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_FORM_ID',
                    Message: 'FormID parameter is required'
                };
            }

            const accessToken = await this.getSecureAPIToken(companyId, contextUser);

            const maxResponses = this.getParamValue(params.Params, 'MaxResponses') || 10000;
            const includeTopAnswers = this.getParamValue(params.Params, 'IncludeTopAnswers') !== false;
            const topAnswersLimit = this.getParamValue(params.Params, 'TopAnswersLimit') || 10;

            // Get all responses from Google Forms
            const gfResponses = await this.getAllGoogleFormsResponses(formId, accessToken, {
                maxResponses
            });

            // Normalize responses to common format
            const responses = gfResponses.map(r => this.normalizeGoogleFormsResponse(r));

            // Calculate statistics
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

            // Calculate top answers if requested
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

            // Calculate time-based breakdowns
            const dailyBreakdown = this.calculateDailyBreakdown(responses);
            const hourlyDistribution = this.calculateHourlyDistribution(responses);

            // Build output parameters
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
                Message: `Successfully calculated statistics from ${responses.length} Google Forms responses (${completionRate}% completion rate)`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Google Forms Statistics', errorMessage, error)
            };
        }
    }

    /**
     * Calculate daily breakdown of responses
     */
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

    /**
     * Calculate hourly distribution of responses
     */
    private calculateHourlyDistribution(responses: any[]): Array<{ hour: number; count: number }> {
        const hourly: Record<number, number> = {};

        // Initialize all hours
        for (let i = 0; i < 24; i++) {
            hourly[i] = 0;
        }

        // Count responses by hour
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
                Value: null
            },
            {
                Name: 'FormID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxResponses',
                Type: 'Input',
                Value: 10000
            },
            {
                Name: 'IncludeTopAnswers',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'TopAnswersLimit',
                Type: 'Input',
                Value: 10
            }
        ];
    }
}