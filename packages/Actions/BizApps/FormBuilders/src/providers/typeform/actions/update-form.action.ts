import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to update an existing Typeform
 *
 * IMPORTANT: This uses PUT which replaces the entire form. If you only provide some fields,
 * the rest will be deleted. Use the MergeWithExisting parameter to automatically fetch
 * the current form and merge your changes.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Update Typeform',
 *   Params: [{
 *     Name: 'FormID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'APIToken',
 *     Value: 'tfp_...'
 *   }, {
 *     Name: 'Title',
 *     Value: 'Updated Survey Title'
 *   }, {
 *     Name: 'MergeWithExisting',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Update Typeform')
export class UpdateTypeformAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Updates an existing Typeform. WARNING: Uses PUT which replaces all form data - fields not included will be deleted. Set MergeWithExisting=true to safely update only specified properties while preserving others.';
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

            const formId = this.getParamValue(params.Params, 'FormID');
            if (!formId) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_FORM_ID',
                    Message: 'FormID parameter is required'
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

            const mergeWithExisting = this.getParamValue(params.Params, 'MergeWithExisting') !== false;

            let formData: any = {};

            if (mergeWithExisting) {
                const existingResponse = await this.getAxiosInstance(apiToken).get(`/forms/${formId}`);
                formData = existingResponse.data;

                delete formData.id;
                delete formData._links;
                delete formData.created_at;
                delete formData.last_updated_at;
                delete formData.self;
            }

            const title = this.getParamValue(params.Params, 'Title');
            if (title) {
                formData.title = title;
            }

            const fields = this.getParamValue(params.Params, 'Fields');
            if (fields && Array.isArray(fields)) {
                formData.fields = fields;
            } else if (!mergeWithExisting) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_FIELDS',
                    Message: 'Fields parameter is required when MergeWithExisting is false'
                };
            }

            const settings = this.getParamValue(params.Params, 'Settings');
            if (settings) {
                if (mergeWithExisting && formData.settings) {
                    formData.settings = { ...formData.settings, ...settings };
                } else {
                    formData.settings = settings;
                }
            }

            const logic = this.getParamValue(params.Params, 'Logic');
            if (logic !== undefined) {
                formData.logic = logic;
            }

            const hiddenFields = this.getParamValue(params.Params, 'HiddenFields');
            if (hiddenFields !== undefined) {
                formData.hidden = hiddenFields;
            }

            const themeId = this.getParamValue(params.Params, 'ThemeID');
            if (themeId) {
                formData.theme = { href: `https://api.typeform.com/themes/${themeId}` };
            }

            const response = await this.getAxiosInstance(apiToken).put(`/forms/${formId}`, formData);
            const updatedForm = response.data;

            const formUrl = updatedForm._links?.display || `https://form.typeform.com/to/${updatedForm.id}`;

            const outputParams = [
                {
                    Name: 'Form',
                    Type: 'Output',
                    Value: updatedForm
                },
                {
                    Name: 'FormID',
                    Type: 'Output',
                    Value: updatedForm.id
                },
                {
                    Name: 'FormURL',
                    Type: 'Output',
                    Value: formUrl
                },
                {
                    Name: 'Title',
                    Type: 'Output',
                    Value: updatedForm.title
                },
                {
                    Name: 'FieldCount',
                    Type: 'Output',
                    Value: updatedForm.fields?.length || 0
                },
                {
                    Name: 'LastUpdated',
                    Type: 'Output',
                    Value: updatedForm.last_updated_at ? new Date(updatedForm.last_updated_at) : new Date()
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
                Message: `Successfully updated form "${updatedForm.title}" (ID: ${updatedForm.id})`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Update Typeform', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'FormID',
                Type: 'Input',
                Value: null,
                Description: 'The Typeform form ID to update'
            },
            {
                Name: 'APIToken',
                Type: 'Input',
                Value: null,
                Description: 'Typeform API access token with write permissions'
            },
            {
                Name: 'MergeWithExisting',
                Type: 'Input',
                Value: true,
                Description: 'If true (default), fetches existing form and merges your changes. If false, replaces entire form with your data (DANGEROUS - will delete unspecified fields)'
            },
            {
                Name: 'Title',
                Type: 'Input',
                Value: null,
                Description: 'New title for the form (optional if MergeWithExisting=true)'
            },
            {
                Name: 'Fields',
                Type: 'Input',
                Value: null,
                Description: 'Array of field objects to replace all fields (required if MergeWithExisting=false)'
            },
            {
                Name: 'Settings',
                Type: 'Input',
                Value: null,
                Description: 'Form settings to update (merged with existing if MergeWithExisting=true)'
            },
            {
                Name: 'Logic',
                Type: 'Input',
                Value: null,
                Description: 'Array of logic jump rules (replaces existing logic)'
            },
            {
                Name: 'HiddenFields',
                Type: 'Input',
                Value: null,
                Description: 'Array of hidden field names (replaces existing hidden fields)'
            },
            {
                Name: 'ThemeID',
                Type: 'Input',
                Value: null,
                Description: 'Theme ID to apply to the form'
            }
        ];
    }
}
