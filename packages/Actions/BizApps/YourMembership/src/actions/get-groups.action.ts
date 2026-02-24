import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMGroup } from '../types/ym-api-types';

/**
 * Retrieves group/community data from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMGroupsAction')
export class GetYMGroupsAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves groups from YourMembership with pagination support';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const maxResults = this.GetNumericParam(params.Params, 'MaxResults', 1000);

            const groups = await this.MakeYMPaginatedRequest<YMGroup>(
                'Groups', clientId, apiKey, 200, maxResults
            );

            this.SetOutputParam(params, 'Groups', groups);
            this.SetOutputParam(params, 'TotalCount', groups.length);

            return this.BuildSuccessResult(`Retrieved ${groups.length} groups from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
