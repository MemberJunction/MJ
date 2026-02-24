import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMMember } from '../types/ym-api-types';

/**
 * Retrieves member data from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMMembersAction')
export class GetYMMembersAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves member data from YourMembership with pagination support';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const maxResults = this.GetNumericParam(params.Params, 'MaxResults', 1000);

            const members = await this.MakeYMPaginatedRequest<YMMember>(
                'MemberList', clientId, apiKey, 200, maxResults
            );

            this.SetOutputParam(params, 'Members', members);
            this.SetOutputParam(params, 'TotalCount', members.length);

            return this.BuildSuccessResult(`Retrieved ${members.length} members from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
