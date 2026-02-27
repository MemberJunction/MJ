import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView } from "@memberjunction/core";

/**
 * Generic action for retrieving multiple records from any entity with filtering and sorting capabilities.
 * This action provides a flexible way to fetch filtered and sorted datasets for any entity type
 * by accepting the entity name, optional filter clause, and ordering parameters.
 * 
 * @example
 * ```typescript
 * // Get all active events sorted by start date
 * await runAction({
 *   ActionName: 'Get Records',
 *   Params: [
 *     {
 *       Name: 'EntityName',
 *       Value: 'Events'
 *     }, {
 *       Name: 'Filter',
 *       Value: 'Status = 'Active' AND StartDate >= GETDATE()'
 *     }, {
 *       Name: 'OrderBy',
 *       Value: 'StartDate ASC'
 *     }, {
 *       Name: 'MaxRows',
 *       Value: 100
 *     }
 *   ]
 * });
 * 
 * // Get recent submissions for a specific event
 * await runAction({
 *   ActionName: 'Get Records',
 *   Params: [
 *     {
 *       Name: 'EntityName',
 *       Value: 'Submissions'
 *     }, {
 *       Name: 'Filter',
 *       Value: 'EventID = '123e4567-e89b-12d3-a456-426614174000' AND CreatedAt >= DATEADD(day, -30, GETDATE())'
 *     }, {
 *       Name: 'OrderBy',
 *       Value: 'CreatedAt DESC'
 *     }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "GetRecordsAction")
export class GetRecordsAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const entityName = this.getStringParam(params, "EntityName");
            if (!entityName) {
                return {
                    Success: false,
                    ResultCode: "MISSING_ENTITY_NAME",
                    Message: "EntityName parameter is required"
                };
            }

            const filter = this.getStringParam(params, "Filter");
            const orderBy = this.getStringParam(params, "OrderBy");
            const maxRows = this.getNumericParam(params, "MaxRows", 100);
            const includeCount = this.getBooleanParam(params, "IncludeCount", true);

            // Validate parameters
            if (maxRows && (maxRows < 1 || maxRows > 10000)) {
                return {
                    Success: false,
                    ResultCode: "INVALID_MAX_ROWS",
                    Message: "MaxRows must be between 1 and 10000"
                };
            }

            // Use RunView to execute the query
            const rv = new RunView();
            const runViewParams: any = {
                EntityName: entityName,
                MaxRows: maxRows,
                ResultType: 'simple'
            };

            // Add filter if provided
            if (filter) {
                runViewParams.Filter = filter;
            }

            // Add ordering if provided
            if (orderBy) {
                runViewParams.OrderBy = orderBy;
            }

            const result = await rv.RunView(runViewParams, params.ContextUser);

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: "QUERY_FAILED",
                    Message: `Failed to retrieve records: ${result.ErrorMessage}`
                };
            }

            const records = result.Results || [];
            const totalCount = result.TotalRowCount || records.length;

            // Build success message
            let message = `Successfully retrieved ${records.length} records`;
            if (includeCount && totalCount > records.length) {
                message += ` (showing ${records.length} of ${totalCount} total)`;
            }
            if (filter) {
                message += ` with filter: ${filter}`;
            }
            if (orderBy) {
                message += ` ordered by: ${orderBy}`;
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: message,
                Params: [
                    {
                        Name: 'Records',
                        Type: 'Output',
                        Value: records
                    },
                    {
                        Name: 'TotalCount',
                        Type: 'Output', 
                        Value: totalCount
                    },
                    {
                        Name: 'EntityName',
                        Type: 'Output',
                        Value: entityName
                    },
                    {
                        Name: 'Filter',
                        Type: 'Output',
                        Value: filter
                    },
                    {
                        Name: 'OrderBy',
                        Type: 'Output',
                        Value: orderBy
                    }
                ]
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: "ERROR",
                Message: `Error retrieving records: ${errorMessage}`
            };
        }
    }

    public get Params(): any[] {
        return [
            {
                Name: 'EntityName',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Filter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OrderBy',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxRows',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeCount',
                Type: 'Input',
                Value: null
            }
        ];
    }

    public get Returns(): any[] {
        return [
            {
                Name: 'Records',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TotalCount',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'EntityName',
                Type: 'Output',
                Value: null
            }
        ];
    }

    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        return param?.Value ? String(param.Value) : undefined;
    }

    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number): number {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        if (param?.Value != null) {
            const num = Number(param.Value);
            return isNaN(num) ? defaultValue : num;
        }
        return defaultValue;
    }

    private getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean): boolean {
        const param = params.Params.find(p =>
            p.Name.toLowerCase() === paramName.toLowerCase() &&
            p.Type === 'Input'
        );
        if (param?.Value != null) {
            const val = String(param.Value).toLowerCase();
            if (val === 'true' || val === '1' || val === 'yes') return true;
            if (val === 'false' || val === '0' || val === 'no') return false;
        }
        return defaultValue;
    }
}
