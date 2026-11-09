import { ActionParam, ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { Metadata, RunView, RunViewParams } from "@memberjunction/core";
import { AgentDataPolicyGuard } from "./agent-data-policy-guard";

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
            const alternateBaseView = this.getStringParam(params, "AlternateBaseView");
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

            const md = params.Provider ?? Metadata.Provider;
            const entityInfo = md?.EntityByName ? md.EntityByName(entityName) : undefined;
            const callingAgentId = AgentDataPolicyGuard.GetCallingAgentID(params);
            let policyState: Awaited<ReturnType<typeof AgentDataPolicyGuard.EvaluateRecordOperation>> = {
                allowed: { active: false },
            };
            if (callingAgentId) {
                if (!entityInfo) {
                    return {
                        Success: false,
                        ResultCode: "ENTITY_NOT_FOUND",
                        Message: `Entity "${entityName}" not found in metadata; refusing agent read.`
                    };
                }
                policyState = await AgentDataPolicyGuard.EvaluateRecordOperation({
                    params,
                    entityInfo,
                    operation: 'Read',
                });
                if ('blocked' in policyState) {
                    return policyState.blocked;
                }
                const clauseError = AgentDataPolicyGuard.ScreenGetRecordsClauses({
                    params,
                    entityInfo,
                    evalState: policyState.allowed,
                    filter,
                    orderBy,
                    alternateBaseView,
                });
                if (clauseError) {
                    return clauseError;
                }
            }

            // Use RunView to execute the query.
            //
            // Typed as RunViewParams rather than `any` on purpose: the filter used to be assigned to
            // a `Filter` property, which RunView does not have. `any` accepted it silently, so the
            // filter was dropped and EVERY caller asking for a filtered set quietly received the
            // whole entity instead — capped only by MaxRows. The field is `ExtraFilter`, and the
            // type now says so.
            const rv = params.Provider ? RunView.FromMetadataProvider(params.Provider) : new RunView();
            const runViewParams: RunViewParams = {
                EntityName: entityName,
                MaxRows: maxRows,
                ResultType: 'simple'
            };

            const effectiveFilter = policyState.allowed.active
                ? AgentDataPolicyGuard.CombineExtraFilters(
                      filter,
                      policyState.allowed.effectiveWhereClause,
                      params.Provider
                  )
                : filter;
            if (effectiveFilter) {
                runViewParams.ExtraFilter = effectiveFilter;
            }

            // Add ordering if provided
            if (orderBy) {
                runViewParams.OrderBy = orderBy;
            }

            // Add alternate base view if provided
            if (alternateBaseView) {
                runViewParams.AlternateBaseView = alternateBaseView;
            }

            const result = await rv.RunView<Record<string, unknown>>(runViewParams, params.ContextUser);

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: "QUERY_FAILED",
                    Message: `Failed to retrieve records: ${result.ErrorMessage}`
                };
            }

            const rawRecords = result.Results || [];
            const records = AgentDataPolicyGuard.FilterAndMaskRows({
                rows: rawRecords,
                evalState: policyState.allowed,
                entityInfo,
                contextUser: params.ContextUser,
                provider: params.Provider,
            });
            const wasConditionFiltered =
                policyState.allowed.active &&
                policyState.allowed.hasRecordConditionRules &&
                records.length !== rawRecords.length;
            const totalCount = wasConditionFiltered
                ? records.length
                : (result.TotalRowCount || records.length);

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
                    },
                    ...(alternateBaseView
                        ? [{
                            Name: 'AlternateBaseView',
                            Type: 'Output' as const,
                            Value: alternateBaseView
                        }]
                        : [])
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

    public get Params(): ActionParam[] {
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
            },
            {
                Name: 'AlternateBaseView',
                Type: 'Input',
                Value: null
            }
        ];
    }

    public get Returns(): ActionParam[] {
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
