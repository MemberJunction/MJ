import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMDonation } from '../types/ym-api-types';

/**
 * Retrieves donation history from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMDonationsAction')
export class GetYMDonationsAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves donation history from YourMembership with pagination support';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const maxResults = this.GetNumericParam(params.Params, 'MaxResults', 1000);

            const donations = await this.MakeYMPaginatedRequest<YMDonation>(
                'DonationHistory', clientId, apiKey, 200, maxResults
            );

            this.SetOutputParam(params, 'Donations', donations);
            this.SetOutputParam(params, 'TotalCount', donations.length);

            return this.BuildSuccessResult(`Retrieved ${donations.length} donations from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
