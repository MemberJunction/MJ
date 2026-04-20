import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a new Typeform programmatically
 *
 * Security: API credentials are retrieved securely from Company Integrations table or environment variables.
 * Never pass API tokens as action parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Create Typeform',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: '12345'
 *   }, {
 *     Name: 'Title',
 *     Value: 'Customer Feedback Survey'
 *   }, {
 *     Name: 'Fields',
 *     Value: [{
 *       type: 'short_text',
 *       title: 'What is your name?',
 *       ref: 'name'
 *     }, {
 *       type: 'email',
 *       title: 'What is your email?',
 *       ref: 'email',
 *       validations: { required: true }
 *     }]
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'CreateTypeformAction')
export class CreateTypeformAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Creates a new Typeform with specified title, fields, and settings. Supports all field types including text, email, multiple choice, rating, and more. Returns the new form ID and shareable link.';
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

            const title = this.getParamValue(params.Params, 'Title');
            if (!title) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_TITLE',
                    Message: 'Title parameter is required'
                };
            }

            const fields = this.getParamValue(params.Params, 'Fields');
            if (!fields || !Array.isArray(fields) || fields.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_FIELDS',
                    Message: 'Fields parameter is required and must be a non-empty array'
                };
            }

            // Securely retrieve API token using company integration
            const apiToken = await this.getSecureAPIToken(companyId, contextUser);

            const formData: any = {
                title,
                fields
            };

            const settings = this.getParamValue(params.Params, 'Settings');
            if (settings) {
                formData.settings = settings;
            }

            const logic = this.getParamValue(params.Params, 'Logic');
            if (logic && Array.isArray(logic)) {
                formData.logic = logic;
            }

            const hiddenFields = this.getParamValue(params.Params, 'HiddenFields');
            if (hiddenFields && Array.isArray(hiddenFields)) {
                formData.hidden = hiddenFields;
            }

            const themeId = this.getParamValue(params.Params, 'ThemeID');
            if (themeId) {
                formData.theme = { href: `https://api.typeform.com/themes/${themeId}` };
            }

            const workspaceId = this.getParamValue(params.Params, 'WorkspaceID');
            if (workspaceId) {
                formData.workspace = { href: `https://api.typeform.com/workspaces/${workspaceId}` };
            }

            const response = await this.getAxiosInstance(apiToken).post('/forms', formData);
            const createdForm = response.data;

            const formUrl = createdForm._links?.display || `https://form.typeform.com/to/${createdForm.id}`;

            const outputParams: ActionParam[] = [
                {
                    Name: 'Form',
                    Type: 'Output',
                    Value: createdForm
                },
                {
                    Name: 'FormID',
                    Type: 'Output',
                    Value: createdForm.id
                },
                {
                    Name: 'FormURL',
                    Type: 'Output',
                    Value: formUrl
                },
                {
                    Name: 'Title',
                    Type: 'Output',
                    Value: createdForm.title
                },
                {
                    Name: 'FieldCount',
                    Type: 'Output',
                    Value: createdForm.fields?.length || 0
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
                Message: `Successfully created form "${createdForm.title}" (ID: ${createdForm.id}). View at: ${formUrl}`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Create Typeform', errorMessage, error)
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
                Name: 'Title',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'Fields',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'Settings',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'Logic',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'HiddenFields',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'ThemeID',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'WorkspaceID',
                Type: 'Input',
                Value: null,
            }
        ];
    }
}
