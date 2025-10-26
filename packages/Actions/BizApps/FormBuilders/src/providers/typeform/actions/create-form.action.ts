import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a new Typeform programmatically
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Create Typeform',
 *   Params: [{
 *     Name: 'APIToken',
 *     Value: 'tfp_...'
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
@RegisterClass(BaseAction, 'Create Typeform')
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

            const apiToken = this.getParamValue(params.Params, 'APIToken');
            if (!apiToken) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_API_TOKEN',
                    Message: 'APIToken parameter is required'
                };
            }

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

            const outputParams = [
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
                Name: 'APIToken',
                Type: 'Input',
                Value: null,
                Description: 'Typeform API access token with create permissions'
            },
            {
                Name: 'Title',
                Type: 'Input',
                Value: null,
                Description: 'Title of the form'
            },
            {
                Name: 'Fields',
                Type: 'Input',
                Value: null,
                Description: 'Array of field objects. Each field needs: type, title, and optional ref. Types: short_text, long_text, email, number, dropdown, multiple_choice, yes_no, rating, opinion_scale, date, phone_number, website, file_upload, payment, legal, matrix, ranking, picture_choice'
            },
            {
                Name: 'Settings',
                Type: 'Input',
                Value: null,
                Description: 'Optional form settings object (e.g., {is_public: true, show_progress_bar: true})'
            },
            {
                Name: 'Logic',
                Type: 'Input',
                Value: null,
                Description: 'Optional array of logic jump rules for conditional field display'
            },
            {
                Name: 'HiddenFields',
                Type: 'Input',
                Value: null,
                Description: 'Optional array of hidden field names for URL parameters'
            },
            {
                Name: 'ThemeID',
                Type: 'Input',
                Value: null,
                Description: 'Optional theme ID to apply to the form'
            },
            {
                Name: 'WorkspaceID',
                Type: 'Input',
                Value: null,
                Description: 'Optional workspace ID where form should be created'
            }
        ];
    }
}
