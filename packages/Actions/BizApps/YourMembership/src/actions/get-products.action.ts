import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseYMAction } from '../base/base-ym-action';
import type { YMProduct } from '../types/ym-api-types';

/**
 * Retrieves product catalog data from the YourMembership API.
 */
@RegisterClass(BaseAction, 'GetYMProductsAction')
export class GetYMProductsAction extends BaseYMAction {
    public get Description(): string {
        return 'Retrieves product catalog from YourMembership with pagination support';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const clientId = this.GetClientID(params.Params);
            const apiKey = this.GetAPIKey(params.Params, clientId);
            const maxResults = this.GetNumericParam(params.Params, 'MaxResults', 1000);

            const products = await this.MakeYMPaginatedRequest<YMProduct>(
                'Products', clientId, apiKey, 200, maxResults
            );

            this.SetOutputParam(params, 'Products', products);
            this.SetOutputParam(params, 'TotalCount', products.length);

            return this.BuildSuccessResult(`Retrieved ${products.length} products from YourMembership`);
        } catch (error) {
            return this.BuildErrorResult(
                error instanceof Error ? error.message : String(error),
                'YM_API_ERROR'
            );
        }
    }
}
