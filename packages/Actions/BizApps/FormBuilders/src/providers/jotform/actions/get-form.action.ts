import { RegisterClass } from '@memberjunction/global';
import { JotFormBaseAction } from '../jotform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve complete details of a JotForm including questions, properties, and settings
 *
 * Security: API credentials are retrieved securely from Company Integrations
 * instead of being passed as parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get JotForm Details',
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
@RegisterClass(BaseAction, 'GetJotFormAction')
export class GetJotFormAction extends JotFormBaseAction {

    public get Description(): string {
        return 'Retrieves complete details of a JotForm including title, status, questions, properties, and settings. Use this to inspect or backup form configurations, analyze form structure, and access form metadata.';
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

            const region = this.getParamValue(params.Params, 'Region') as 'us' | 'eu' | 'hipaa' | undefined;

            // Fetch form details and questions from JotForm API
            const formDetails = await this.getJotFormDetails(formId, apiToken, region);
            const questions = await this.getJotFormQuestions(formId, apiToken, region);

            // Extract comprehensive form information
            const questionCount = Object.keys(questions || {}).length;
            const formUrl = formDetails.url || `https://form.jotform.com/${formId}`;
            const createdAt = formDetails.created_at || '';
            const updatedAt = formDetails.updated_at || '';

            // Build comprehensive form details object
            const formDetailsOutput = {
                id: formDetails.id,
                title: formDetails.title,
                status: formDetails.status,
                questions: questions,
                properties: {
                    height: formDetails.height,
                    slug: formDetails.slug,
                    count: formDetails.count,
                    favorite: formDetails.favorite,
                    archived: formDetails.archived,
                    last: formDetails.last,
                    new: formDetails.new
                },
                settings: {
                    width: formDetails.width,
                    height: formDetails.height,
                    created_at: formDetails.created_at,
                    updated_at: formDetails.updated_at
                }
            };

            // Prepare output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'FormDetails',
                    Type: 'Output',
                    Value: formDetailsOutput
                },
                {
                    Name: 'FormID',
                    Type: 'Output',
                    Value: formDetails.id
                },
                {
                    Name: 'Title',
                    Type: 'Output',
                    Value: formDetails.title
                },
                {
                    Name: 'Status',
                    Type: 'Output',
                    Value: formDetails.status
                },
                {
                    Name: 'FormURL',
                    Type: 'Output',
                    Value: formUrl
                },
                {
                    Name: 'QuestionCount',
                    Type: 'Output',
                    Value: questionCount
                },
                {
                    Name: 'Questions',
                    Type: 'Output',
                    Value: questions
                },
                {
                    Name: 'CreatedAt',
                    Type: 'Output',
                    Value: createdAt
                },
                {
                    Name: 'UpdatedAt',
                    Type: 'Output',
                    Value: updatedAt
                }
            ];

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
                Message: `Successfully retrieved form "${formDetails.title}" with ${questionCount} questions`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get JotForm Details', errorMessage, error)
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
            }
        ];
    }
}