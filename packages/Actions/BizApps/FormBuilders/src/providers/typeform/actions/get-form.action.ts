import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve details of a Typeform including all fields, settings, and logic
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Typeform Details',
 *   Params: [{
 *     Name: 'FormID',
 *     Value: 'abc123'
 *   }, {
 *     Name: 'APIToken',
 *     Value: 'tfp_...'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Get Typeform Details')
export class GetTypeformAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Retrieves complete details of a Typeform including title, fields, logic jumps, settings, theme, and metadata. Use this to inspect or backup form configurations.';
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

            const response = await this.getAxiosInstance(apiToken).get(`/forms/${formId}`);
            const form = response.data;

            const fieldCount = form.fields?.length || 0;
            const fieldTypes = form.fields?.map((f: any) => f.type) || [];
            const uniqueFieldTypes = [...new Set(fieldTypes)];

            const hasLogic = form.logic && form.logic.length > 0;
            const hasHiddenFields = form.hidden && form.hidden.length > 0;

            const summary = {
                id: form.id,
                title: form.title,
                fieldCount,
                uniqueFieldTypes,
                hasLogic,
                hasHiddenFields,
                theme: form.theme_id || form.theme?.name,
                workspace: form.workspace?.href,
                createdAt: form._links?.display ? new Date() : undefined,
                lastUpdated: form.last_updated_at ? new Date(form.last_updated_at) : undefined
            };

            const outputParams: ActionParam[] = [
                {
                    Name: 'Form',
                    Type: 'Output',
                    Value: form
                },
                {
                    Name: 'FormID',
                    Type: 'Output',
                    Value: form.id
                },
                {
                    Name: 'Title',
                    Type: 'Output',
                    Value: form.title
                },
                {
                    Name: 'Fields',
                    Type: 'Output',
                    Value: form.fields
                },
                {
                    Name: 'FieldCount',
                    Type: 'Output',
                    Value: fieldCount
                },
                {
                    Name: 'Settings',
                    Type: 'Output',
                    Value: form.settings
                },
                {
                    Name: 'Logic',
                    Type: 'Output',
                    Value: form.logic
                },
                {
                    Name: 'Theme',
                    Type: 'Output',
                    Value: form.theme
                },
                {
                    Name: 'HiddenFields',
                    Type: 'Output',
                    Value: form.hidden
                },
                {
                    Name: 'Summary',
                    Type: 'Output',
                    Value: summary
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
                Message: `Successfully retrieved form "${form.title}" with ${fieldCount} fields`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Typeform Details', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'FormID',
                Type: 'Input',
                Value: null 
            },
            {
                Name: 'APIToken',
                Type: 'Input',
                Value: null, 
            }
        ];
    }
}
