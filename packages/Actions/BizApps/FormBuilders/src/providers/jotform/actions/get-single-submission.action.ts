import { RegisterClass } from '@memberjunction/global';
import { JotFormBaseAction } from '../jotform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve a specific submission from JotForm by submission ID
 *
 * Security: API credentials are retrieved securely from Company Integrations
 * instead of being passed as parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Single JotForm Submission',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'your-company-id'
 *   }, {
 *     Name: 'SubmissionID',
 *     Value: '1234567890'
 *   }, {
 *     Name: 'Region',
 *     Value: 'us'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetSingleJotFormSubmissionAction')
export class GetSingleJotFormSubmissionAction extends JotFormBaseAction {

    public get Description(): string {
        return 'Retrieves details of a specific JotForm submission by its unique submission ID. Includes all answers, metadata, IP address, and submission status.';
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

            const submissionId = this.getParamValue(params.Params, 'SubmissionID');
            if (!submissionId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_SUBMISSION_ID',
                    Message: 'SubmissionID parameter is required'
                };
            }

            const apiKey = await this.getSecureAPIToken(companyId, contextUser);

            const region = this.getParamValue(params.Params, 'Region') as 'us' | 'eu' | 'hipaa' | undefined;

            const jfSubmission = await this.getSingleJotFormSubmission(submissionId, apiKey, region);
            const normalizedSubmission = this.normalizeJotFormSubmission(jfSubmission);

            const outputParams: ActionParam[] = [
                {
                    Name: 'Submission',
                    Type: 'Output',
                    Value: normalizedSubmission
                },
                {
                    Name: 'SubmissionID',
                    Type: 'Output',
                    Value: normalizedSubmission.responseId
                },
                {
                    Name: 'SubmittedAt',
                    Type: 'Output',
                    Value: normalizedSubmission.submittedAt
                },
                {
                    Name: 'Status',
                    Type: 'Output',
                    Value: jfSubmission.status
                },
                {
                    Name: 'Answers',
                    Type: 'Output',
                    Value: normalizedSubmission.answers
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
                Message: `Successfully retrieved submission ${submissionId} from JotForm`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Single JotForm Submission', errorMessage, error)
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
                Name: 'SubmissionID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Region',
                Type: 'Input',
                Value: null
            }
        ];
    }
}