import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to watch for new Typeform responses since last check
 * Useful for workflow automation and real-time notifications
 *
 * Security: API credentials are retrieved securely from Company Integrations table or environment variables.
 * Never pass API tokens as action parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Watch for New Typeform Responses',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: '12345'
 *   }, {
 *     Name: 'FormID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'LastCheckedTimestamp',
 *     Value: '2024-01-01T12:00:00Z'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'WatchNewTypeformResponsesAction')
export class WatchNewTypeformResponsesAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Polls Typeform for new responses since the last check. Returns only new submissions and updates the last checked timestamp. Perfect for triggering workflows, sending notifications, or syncing data to other systems.';
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

            let lastChecked = this.getParamValue(params.Params, 'LastCheckedTimestamp');
            const onlyCompleted = this.getParamValue(params.Params, 'OnlyCompleted') === true;
            const maxResponses = this.getParamValue(params.Params, 'MaxResponses') || 1000;

            if (!lastChecked) {
                const defaultLookback = this.getParamValue(params.Params, 'DefaultLookbackMinutes') || 60;
                const lookbackDate = new Date();
                lookbackDate.setMinutes(lookbackDate.getMinutes() - defaultLookback);
                lastChecked = lookbackDate.toISOString();
            }

            const currentTimestamp = new Date().toISOString();

            const tfResponses = await this.getAllTypeformResponses(formId, apiToken, {
                since: lastChecked,
                completed: onlyCompleted ? true : undefined,
                sort: 'submitted_at,asc',
                maxResponses
            });

            const newResponses = tfResponses.map(r => this.normalizeTypeformResponse(r));

            const completedCount = newResponses.filter(r => r.completed).length;
            const partialCount = newResponses.filter(r => !r.completed).length;

            const responsesByType: Record<string, any[]> = {};
            if (newResponses.length > 0) {
                const firstResponse = newResponses[0];
                for (const answer of firstResponse.answerDetails) {
                    responsesByType[answer.fieldType] = [];
                }

                for (const response of newResponses) {
                    for (const answer of response.answerDetails) {
                        if (!responsesByType[answer.fieldType]) {
                            responsesByType[answer.fieldType] = [];
                        }
                        responsesByType[answer.fieldType].push({
                            responseId: response.responseId,
                            question: answer.question,
                            answer: answer.answer,
                            submittedAt: response.submittedAt
                        });
                    }
                }
            }

            const emails = this.extractEmailFromResponses(newResponses);

            const outputParams: ActionParam[] = [
                {
                    Name: 'NewResponses',
                    Type: 'Output',
                    Value: newResponses
                },
                {
                    Name: 'NewResponseCount',
                    Type: 'Output',
                    Value: newResponses.length
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
                    Name: 'ResponsesByType',
                    Type: 'Output',
                    Value: responsesByType
                },
                {
                    Name: 'ExtractedEmails',
                    Type: 'Output',
                    Value: emails
                },
                {
                    Name: 'HasNewResponses',
                    Type: 'Output',
                    Value: newResponses.length > 0
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

            const message = newResponses.length > 0
                ? `Found ${newResponses.length} new responses (${completedCount} completed, ${partialCount} partial) since ${new Date(lastChecked).toLocaleString()}`
                : `No new responses since ${new Date(lastChecked).toLocaleString()}`;

            return {
                Success: true,
                ResultCode: newResponses.length > 0 ? 'NEW_RESPONSES' : 'NO_NEW_RESPONSES',
                Message: message
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Watch New Typeform Responses', errorMessage, error)
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
                Name: 'LastCheckedTimestamp',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'DefaultLookbackMinutes',
                Type: 'Input',
                Value: 60,
            },
            {
                Name: 'OnlyCompleted',
                Type: 'Input',
                Value: false,
            },
            {
                Name: 'MaxResponses',
                Type: 'Input',
                Value: 1000,
            }
        ];
    }
}
