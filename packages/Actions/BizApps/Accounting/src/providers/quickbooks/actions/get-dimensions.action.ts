import { RegisterClass } from '@memberjunction/global';
import { QuickBooksBaseAction } from '../quickbooks-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS, ERP_INTEGRATION, erpPluginKey } from '../../../constants';
import { Dimension, DimensionValue } from '../../../types';

/**
 * QuickBooks Online has no first-class dimensions API. Classes and Departments
 * are mapped as two dimensions named `Class` and `Department`. Either (or both)
 * may be an empty values array if the company does not use that list or the
 * query is not available.
 */
@RegisterClass(BaseAction, erpPluginKey(ACCOUNTING_VERBS.GetDimensions, ERP_INTEGRATION.QuickBooksOnline))
export class GetQuickBooksDimensionsAction extends QuickBooksBaseAction {

    public get Description(): string {
        return 'Retrieves Class and Department lists from QuickBooks Online as dimensions';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                throw new Error('Context user is required for QuickBooks API calls');
            }

            (this as any)._params = params.Params;

            const classValues = await this.queryDimensionValues('Class', contextUser);
            const departmentValues = await this.queryDimensionValues('Department', contextUser);

            const dimensions: Dimension[] = [
                { code: 'Class', displayName: 'Class', values: classValues },
                { code: 'Department', displayName: 'Department', values: departmentValues }
            ];

            const outputParams: ActionParam[] = [
                { Name: 'Dimensions', Value: dimensions, Type: 'Output' }
            ];

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Params: [...params.Params, ...outputParams],
                Message: 'Successfully retrieved Class and Department dimensions from QuickBooks'
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

    private async queryDimensionValues(
        entity: 'Class' | 'Department',
        contextUser: NonNullable<RunActionParams['ContextUser']>
    ): Promise<DimensionValue[]> {
        try {
            const response = await this.queryQBO<{ QueryResponse: Record<string, any[]> }>(
                `SELECT * FROM ${entity}`,
                contextUser
            );
            const rows = response.QueryResponse?.[entity] || [];
            return rows.map((row: any) => ({
                code: row.FullyQualifiedName || row.Name || row.Id,
                displayName: row.Name || row.FullyQualifiedName || row.Id
            }));
        } catch {
            return [];
        }
    }
}
