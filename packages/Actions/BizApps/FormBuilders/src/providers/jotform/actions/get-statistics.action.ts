import { RegisterClass } from '@memberjunction/global';
import { JotFormBaseAction } from '../jotform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { FormStatistics } from '../../../base/base-form-builder.action';

/**
 * Action to calculate aggregate statistics from JotForm submissions
 *
 * Security: API credentials are retrieved securely from Company Integrations
 * instead of being passed as parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get JotForm Submission Statistics',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'FormID',
 *     Value: '123456789'
 *   }, {
 *     Name: 'Region',
 *     Value: 'us'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetJotFormStatisticsAction')
export class GetJotFormStatisticsAction extends JotFormBaseAction {

    public get Description(): string {
        return 'Calculates comprehensive statistics from JotForm submissions including completion rates, submission trends, popular answers, and time-based analytics. Useful for dashboards and reporting.';
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

            const region = this.getParamValue(params.Params, 'Region') as 'us' | 'eu' | 'hipaa' | undefined;
            const filterParam = this.getParamValue(params.Params, 'Filter');
            const maxSubmissions = this.getParamValue(params.Params, 'MaxSubmissions') || 10000;
            const includeTopAnswers = this.getParamValue(params.Params, 'IncludeTopAnswers') !== false;
            const topAnswersLimit = this.getParamValue(params.Params, 'TopAnswersLimit') || 10;

            // Parse filter if provided as string
            let filter: Record<string, string> | undefined;
            if (filterParam) {
                if (typeof filterParam === 'string') {
                    try {
                        filter = JSON.parse(filterParam);
                    } catch (error) {
                        return {
                            Success: false,
                            ResultCode: 'INVALID_FILTER',
                            Message: 'Filter parameter must be a valid JSON object'
                        };
                    }
                } else {
                    filter = filterParam;
                }
            }

            // Get all submissions from JotForm
            const jfSubmissions = await this.getAllJotFormSubmissions(formId, apiKey, {
                filter,
                maxSubmissions,
                region
            });

            // Normalize submissions to common format
            const submissions = jfSubmissions.map(s => this.normalizeJotFormSubmission(s));

            // Calculate statistics
            const completedSubmissions = submissions.filter(s => s.completed);
            const partialSubmissions = submissions.filter(s => !s.completed);
            const completionRate = this.calculateCompletionRate(
                completedSubmissions.length,
                submissions.length
            );

            const responsesByDate = this.groupResponsesByDate(submissions);

            const statistics: FormStatistics = {
                totalResponses: submissions.length,
                completedResponses: completedSubmissions.length,
                partialResponses: partialSubmissions.length,
                completionRate,
                averageCompletionTime: this.calculateAverageCompletionTime(submissions),
                responsesByDate
            };

            // Calculate top answers if requested
            if (includeTopAnswers && submissions.length > 0) {
                const topAnswers: Record<string, Array<{ answer: string; count: number }>> = {};
                const allFieldIds = new Set<string>();

                for (const submission of submissions) {
                    for (const answer of submission.answerDetails) {
                        allFieldIds.add(answer.fieldId);
                    }
                }

                for (const fieldId of allFieldIds) {
                    const fieldTopAnswers = this.findTopAnswers(submissions, fieldId, topAnswersLimit);
                    if (fieldTopAnswers.length > 0) {
                        topAnswers[fieldId] = fieldTopAnswers;
                    }
                }

                statistics.topAnswers = topAnswers;
            }

            // Calculate time-based breakdowns
            const dailyBreakdown = this.calculateDailyBreakdown(submissions);
            const hourlyDistribution = this.calculateHourlyDistribution(submissions);

            // Build output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'Statistics',
                    Type: 'Output',
                    Value: statistics
                },
                {
                    Name: 'TotalSubmissions',
                    Type: 'Output',
                    Value: statistics.totalResponses
                },
                {
                    Name: 'CompletedSubmissions',
                    Type: 'Output',
                    Value: statistics.completedResponses
                },
                {
                    Name: 'PartialSubmissions',
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
                Message: `Successfully calculated statistics from ${submissions.length} JotForm submissions (${completionRate}% completion rate)`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get JotForm Statistics', errorMessage, error)
            };
        }
    }

    /**
     * Calculate daily breakdown of submissions
     */
    private calculateDailyBreakdown(submissions: any[]): Array<{ date: string; count: number; completed: number; partial: number }> {
        const daily: Record<string, { count: number; completed: number; partial: number }> = {};

        for (const submission of submissions) {
            const dateKey = submission.submittedAt.toISOString().split('T')[0];
            if (!daily[dateKey]) {
                daily[dateKey] = { count: 0, completed: 0, partial: 0 };
            }
            daily[dateKey].count++;
            if (submission.completed) {
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
     * Calculate hourly distribution of submissions
     */
    private calculateHourlyDistribution(submissions: any[]): Array<{ hour: number; count: number }> {
        const hourly: Record<number, number> = {};

        // Initialize all hours
        for (let i = 0; i < 24; i++) {
            hourly[i] = 0;
        }

        // Count submissions by hour
        for (const submission of submissions) {
            const hour = submission.submittedAt.getHours();
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
                Name: 'Region',
                Type: 'Input',
                Value: 'us'
            },
            {
                Name: 'Filter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxSubmissions',
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