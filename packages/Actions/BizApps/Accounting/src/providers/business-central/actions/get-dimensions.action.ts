import { RegisterClass } from '@memberjunction/global';
import { BusinessCentralBaseAction } from '../business-central-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS, ERP_INTEGRATION, erpPluginKey } from '../../../constants';
import { Dimension } from '../../../types';

interface BCDimension {
    id: string;
    code: string;
    displayName?: string;
}

interface BCDimensionValue {
    id?: string;
    code: string;
    displayName?: string;
    dimensionId: string;
}

/**
 * Dimensions + dimension values from Business Central OData v2.0.
 */
@RegisterClass(BaseAction, erpPluginKey(ACCOUNTING_VERBS.GetDimensions, ERP_INTEGRATION.BusinessCentral))
export class GetBusinessCentralDimensionsAction extends BusinessCentralBaseAction {

    public get Description(): string {
        return 'Retrieves dimensions and dimension values from Microsoft Dynamics 365 Business Central';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: 'Context user is required for Business Central API calls',
                    Params: params.Params
                };
            }

            this.params = params.Params;

            const dimsResponse = await this.makeBCRequest<{ value: BCDimension[] }>(
                'dimensions',
                'GET',
                undefined,
                contextUser
            );
            const valuesResponse = await this.makeBCRequest<{ value: BCDimensionValue[] }>(
                'dimensionValues',
                'GET',
                undefined,
                contextUser
            );

            const valuesByDimension = new Map<string, BCDimensionValue[]>();
            for (const value of valuesResponse?.value || []) {
                const list = valuesByDimension.get(value.dimensionId) || [];
                list.push(value);
                valuesByDimension.set(value.dimensionId, list);
            }

            const dimensions: Dimension[] = (dimsResponse?.value || []).map(dim => ({
                code: dim.code,
                displayName: dim.displayName || dim.code,
                values: (valuesByDimension.get(dim.id) || []).map(v => ({
                    code: v.code,
                    displayName: v.displayName || v.code
                }))
            }));

            const outputParams: ActionParam[] = [
                { Name: 'Dimensions', Value: dimensions, Type: 'Output' }
            ];

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Params: [...params.Params, ...outputParams],
                Message: `Successfully retrieved ${dimensions.length} dimensions from Business Central`
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: errorMessage,
                Params: params.Params
            };
        }
    }

    public get Params(): ActionParam[] {
        return this.getCommonAccountingParams();
    }
}
