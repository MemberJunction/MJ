import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMEvent } from '../types/ym-api-types';

/**
 * Retrieves event data from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMEventsAction')
export class GetYMEventsAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves event data from YourMembership with pagination support';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const maxResults = this.GetNumericParam(params.Params, 'MaxResults', 1000);

            const events = await this.MakeYMPaginatedRequest<YMEvent>(
                'Events', clientId, apiKey, 200, maxResults
            );

            this.SetOutputParam(params, 'Events', events);
            this.SetOutputParam(params, 'TotalCount', events.length);

            return this.BuildSuccessResult(`Retrieved ${events.length} events from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
