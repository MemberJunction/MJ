import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMEventRegistration } from '../types/ym-api-types';

/**
 * Retrieves event registration data from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMEventRegistrationsAction')
export class GetYMEventRegistrationsAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves event registration data from YourMembership with pagination support';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const maxResults = this.GetNumericParam(params.Params, 'MaxResults', 1000);

            const registrations = await this.MakeYMPaginatedRequest<YMEventRegistration>(
                'EventRegistrations', clientId, apiKey, 200, maxResults
            );

            this.SetOutputParam(params, 'EventRegistrations', registrations);
            this.SetOutputParam(params, 'TotalCount', registrations.length);

            return this.BuildSuccessResult(`Retrieved ${registrations.length} event registrations from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
