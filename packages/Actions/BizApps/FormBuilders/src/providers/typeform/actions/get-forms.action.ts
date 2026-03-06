import { RegisterClass } from '@memberjunction/global';
import { TypeformBaseAction } from '../typeform-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve a list of all TypeForms for a company
 *
 * Security: API credentials are retrieved securely from Company Integrations table or environment variables.
 * Never pass API tokens as action parameters.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Get Typeform Forms',
 *   Params: [{
 *     Name: 'CompanyID',
 *     Value: '12345'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'GetTypeformFormsAction')
export class GetTypeformFormsAction extends TypeformBaseAction {

    public get Description(): string {
        return 'Retrieves a list of all TypeForms for the specified company including form IDs, titles, and basic metadata. Use this to discover available forms before processing submissions.';
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

            // Get secure API token
            const apiToken = await this.getSecureAPIToken(companyId, contextUser);
            if (!apiToken) {
                return {
                    Success: false,
                    ResultCode: 'API_TOKEN_NOT_FOUND',
                    Message: 'Typeform API token not found. Please configure Typeform integration for this company.'
                };
            }

            // Call Typeform API to list forms
            const response = await fetch('https://api.typeform.com/forms', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    Success: false,
                    ResultCode: 'API_ERROR',
                    Message: `Typeform API error: ${response.status} ${response.statusText}. ${errorText}`
                };
            }

            const data = await response.json() as { items?: any[] };
            const forms = data.items || [];

            // Transform to a more user-friendly format
            const transformedForms = forms.map((form: any) => ({
                id: form.id,
                title: form.title,
                description: form.description || '',
                status: form.status,
                lastUpdatedAt: form.last_updated_at ? new Date(form.last_updated_at) : null,
                type: form.type,
                settings: {
                    language: form.settings?.language || 'en',
                    progress_bar: form.settings?.progress_bar || 'show',
                    show_progress_bar: form.settings?.show_progress_bar || false
                },
                statistics: {
                    total_responses: form.statistics?.total_responses || 0,
                    total_conversions: form.statistics?.total_conversions || 0,
                    average_completion_time: form.statistics?.average_completion_time || 0
                }
            }));

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved ${forms.length} TypeForms from Typeform API`,
                Params: [
                    {
                        Name: 'Forms',
                        Type: 'Output',
                        Value: transformedForms
                    },
                    {
                        Name: 'TotalCount',
                        Type: 'Output',
                        Value: forms.length
                    }
                ]
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: this.buildFormErrorMessage('Get Typeform Forms', errorMessage, error)
            };
        }
    }

    public get Params(): ActionParam[] {
        return [
            {
                Name: 'CompanyID',
                Type: 'Input',
                Value: null
            }
        ];
    }

    public get Returns(): ActionParam[] {
        return [
            {
                Name: 'Forms',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TotalCount',
                Type: 'Output', 
                Value: null
            }
        ];
    }
}
