import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import { ActionEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Gets detailed information about a specific action including all metadata,
 * parameters, and result codes.
 * This action is restricted to the Agent Manager agent only.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Get Action Details',
 *   Params: [
 *     { Name: 'ActionID', Value: 'action-id' }
 *   ]
 * });
 * // Returns ActionDetails object in output params
 * ```
 */
@RegisterClass(BaseAction, "Get Action Details")
export class GetActionDetailsAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) return permissionError;

            // Extract parameters
            const actionIDResult = this.getStringParam(params, 'ActionID');
            if (actionIDResult.error) return actionIDResult.error;

            // Load the action
            const md = this.getMetadata();
            const action = await md.GetEntityObject<ActionEntity>('Actions', params.ContextUser);
            
            if (!action) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: 'Failed to create Action entity object'
                };
            }

            const loadResult = await action.Load(actionIDResult.value!);
            if (!loadResult) {
                return {
                    Success: false,
                    ResultCode: 'NOT_FOUND',
                    Message: `Action with ID '${actionIDResult.value}' not found`
                };
            }

            // Get action parameters and result codes in parallel
            const rv = new RunView();
            const viewsToRun = [
                {
                    EntityName: 'Action Params',
                    ExtraFilter: `ActionID = '${action.ID}'`,
                    OrderBy: 'Sequence, Name',
                    ResultType: 'entity_object' as const
                },
                {
                    EntityName: 'Action Result Codes',
                    ExtraFilter: `ActionID = '${action.ID}'`,
                    OrderBy: 'ResultCode',
                    ResultType: 'entity_object' as const
                }
            ];

            // Run both views in parallel with a single database operation
            const results = await rv.RunViews(viewsToRun, params.ContextUser);

            const paramsResult = results[0];
            const resultCodesResult = results[1];

            const actionParams = paramsResult.Success ? (paramsResult.Results || []) : [];
            const resultCodes = resultCodesResult.Success ? (resultCodesResult.Results || []) : [];

            // Build the action details object
            const actionDetails = {
                ID: action.ID,
                Name: action.Name,
                Description: action.Description,
                Type: action.Type,
                Status: action.Status,
                CategoryID: action.CategoryID,
                Category: action.Category,
                DriverClass: action.DriverClass,
                Parameters: actionParams.map(p => ({
                    ID: p.ID,
                    Name: p.Name,
                    Type: p.Type,
                    ValueType: p.ValueType,
                    IsArray: p.IsArray,
                    Description: p.Description,
                    IsRequired: p.IsRequired,
                    DefaultValue: p.DefaultValue
                })),
                ResultCodes: resultCodes.map(rc => ({
                    ID: rc.ID,
                    ResultCode: rc.ResultCode,
                    IsSuccess: rc.IsSuccess,
                    Description: rc.Description
                }))
            };

            // Add output parameter
            params.Params.push({
                Name: 'ActionDetails',
                Value: actionDetails,
                Type: 'Output'
            });

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved details for action '${action.Name}'`,
                Params: params.Params
            };

        } catch (e) {
            return this.handleError(e, 'get action details');
        }
    }
}

export function LoadGetActionDetailsAction() {
    // This function exists to prevent tree shaking from removing the action class
}