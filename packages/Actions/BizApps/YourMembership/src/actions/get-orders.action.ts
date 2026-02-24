import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMOrder } from '../types/ym-api-types';

/**
 * Retrieves store order data from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMOrdersAction')
export class GetYMOrdersAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves store orders from YourMembership with pagination support';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const maxResults = this.GetNumericParam(params.Params, 'MaxResults', 1000);

            const orders = await this.MakeYMPaginatedRequest<YMOrder>(
                'StoreOrders', clientId, apiKey, 200, maxResults
            );

            this.SetOutputParam(params, 'Orders', orders);
            this.SetOutputParam(params, 'TotalCount', orders.length);

            return this.BuildSuccessResult(`Retrieved ${orders.length} orders from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
