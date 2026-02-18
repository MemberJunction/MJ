import { RegisterClass } from '@memberjunction/global';
import { JotFormBaseAction } from '../jotform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to watch for new JotForm submissions since last check
 * Useful for workflow automation and real-time notifications
 *
 * Security: API credentials are retrieved securely from Company Integrations
 * instead of being passed as parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Watch for New JotForm Submissions',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'FormID',
 *     Value: '123456789'
 *   }, {
 *     Name: 'LastCheckedTimestamp',
 *     Value: '2024-01-01T12:00:00Z'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'WatchNewJotFormSubmissionsAction')
export class WatchNewJotFormSubmissionsAction extends JotFormBaseAction {

    public get Description(): string {
        return 'Polls JotForm for new submissions since the last check. Returns only new submissions and updates the last checked timestamp. Perfect for triggering workflows, sending notifications, or syncing data to other systems.';
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

            const apiToken = await this.getSecureAPIToken(companyId, contextUser);

            let lastChecked = this.getParamValue(params.Params, 'LastCheckedTimestamp');
            const onlyCompleted = this.getParamValue(params.Params, 'OnlyCompleted') === true;
            const region = this.getParamValue(params.Params, 'Region') as 'us' | 'eu' | 'hipaa' | undefined;
            const maxSubmissions = this.getParamValue(params.Params, 'MaxSubmissions') || 1000;

            if (!lastChecked) {
                const defaultLookback = this.getParamValue(params.Params, 'DefaultLookbackMinutes') || 60;
                const lookbackDate = new Date();
                lookbackDate.setMinutes(lookbackDate.getMinutes() - defaultLookback);
                lastChecked = lookbackDate.toISOString();
            }

            const currentTimestamp = new Date().toISOString();

            // Build filter for JotForm API
            // JotForm uses created_at field with "gt:" prefix for greater than
            const filter: Record<string, string> = {
                created_at: `gt:${lastChecked}`
            };

            if (onlyCompleted) {
                filter.status = 'ACTIVE';
            }

            const jfSubmissions = await this.getAllJotFormSubmissions(formId, apiToken, {
                filter,
                orderby: 'created_at',
                maxSubmissions,
                region
            });

            const newSubmissions = jfSubmissions.map(s => this.normalizeJotFormSubmission(s));

            const completedCount = newSubmissions.filter(s => s.completed).length;
            const partialCount = newSubmissions.filter(s => !s.completed).length;

            // Group submissions by field type for analysis
            const submissionsByType: Record<string, any[]> = {};
            if (newSubmissions.length > 0) {
                const firstSubmission = newSubmissions[0];
                for (const answer of firstSubmission.answerDetails) {
                    submissionsByType[answer.fieldType] = [];
                }

                for (const submission of newSubmissions) {
                    for (const answer of submission.answerDetails) {
                        if (!submissionsByType[answer.fieldType]) {
                            submissionsByType[answer.fieldType] = [];
                        }
                        submissionsByType[answer.fieldType].push({
                            submissionId: submission.responseId,
                            question: answer.question,
                            answer: answer.answer,
                            submittedAt: submission.submittedAt
                        });
                    }
                }
            }

            const emails = this.extractEmailFromResponses(newSubmissions);

            const outputParams: ActionParam[] = [
                {
                    Name: 'NewSubmissions',
                    Type: 'Output',
                    Value: newSubmissions
                },
                {
                    Name: 'Count',
                    Type: 'Output',
                    Value: newSubmissions.length
                },
                {
                    Name: 'CompletedCount',
                    Type: 'Output',
                    Value: completedCount
                },
                {
                    Name: 'PartialCount',
                    Type: 'Output',
                    Value: partialCount
                },
                {
                    Name: 'LastChecked',
                    Type: 'Output',
                    Value: currentTimestamp
                },
                {
                    Name: 'PreviouslyChecked',
                    Type: 'Output',
                    Value: lastChecked
                },
                {
                    Name: 'SubmissionsByType',
                    Type: 'Output',
                    Value: submissionsByType
                },
                {
                    Name: 'ExtractedEmails',
                    Type: 'Output',
                    Value: emails
                },
                {
                    Name: 'HasNewSubmissions',
                    Type: 'Output',
                    Value: newSubmissions.length > 0
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

            const message = newSubmissions.length > 0
                ? `Found ${newSubmissions.length} new submissions (${completedCount} completed, ${partialCount} partial) since ${new Date(lastChecked).toLocaleString()}`
                : `No new submissions since ${new Date(lastChecked).toLocaleString()}`;

            return {
                Success: true,
                ResultCode: newSubmissions.length > 0 ? 'NEW_SUBMISSIONS' : 'NO_NEW_SUBMISSIONS',
                Message: message
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Watch New JotForm Submissions', errorMessage, error)
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
                Name: 'LastCheckedTimestamp',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DefaultLookbackMinutes',
                Type: 'Input',
                Value: 60
            },
            {
                Name: 'OnlyCompleted',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'Region',
                Type: 'Input',
                Value: 'us'
            },
            {
                Name: 'MaxSubmissions',
                Type: 'Input',
                Value: 1000
            }
        ];
    }
}