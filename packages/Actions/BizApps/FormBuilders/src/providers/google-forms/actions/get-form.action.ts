import { RegisterClass } from '@memberjunction/global';
import { GoogleFormsBaseAction } from '../googleforms-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve complete details of a Google Form including all questions, settings, and configuration
 *
 * Security: This action uses secure credential lookup via Company Integrations.
 * API credentials are retrieved from environment variables or the database based on CompanyID.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Google Forms Details',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: 'company-uuid-here'
 *   }, {
 *     Name: 'FormID',
 *     Value: '1FAIpQLSe...'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetGoogleFormAction')
export class GetGoogleFormAction extends GoogleFormsBaseAction {

    public get Description(): string {
        return 'Retrieves complete details of a Google Form including title, questions, logic, settings, and metadata. Use this to inspect form configurations, analyze form structure, and backup form data.';
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

            // Fetch form details from Google Forms API
            const form = await this.getGoogleFormsDetails(formId, accessToken);

            // Extract form information
            const questionCount = form.items?.filter(item => item.questionItem).length || 0;
            const title = form.info.title || '';
            const description = form.info.description || '';
            const documentTitle = form.info.documentTitle || title;

            // Build comprehensive form details object
            const formOutput = {
                formId: form.formId,
                info: form.info,
                items: form.items,
                settings: form.settings,
                revisionId: form.revisionId,
                responderUri: form.responderUri,
                linkedSheetId: form.linkedSheetId
            };

            // Prepare output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'Form',
                    Type: 'Output',
                    Value: formOutput
                },
                {
                    Name: 'FormID',
                    Type: 'Output',
                    Value: form.formId
                },
                {
                    Name: 'Title',
                    Type: 'Output',
                    Value: title
                },
                {
                    Name: 'Description',
                    Type: 'Output',
                    Value: description
                },
                {
                    Name: 'QuestionCount',
                    Type: 'Output',
                    Value: questionCount
                },
                {
                    Name: 'DocumentTitle',
                    Type: 'Output',
                    Value: documentTitle
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
                Message: `Successfully retrieved Google Form "${title}" with ${questionCount} questions`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Google Forms Details', errorMessage, error)
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
            }
        ];
    }
}