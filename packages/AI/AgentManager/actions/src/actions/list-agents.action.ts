import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { RunView } from "@memberjunction/core";
import { AIAgentEntityExtended } from "@memberjunction/core-entities";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Lists AI agents with optional filtering.
 * This action is restricted to the Agent Manager agent only.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'List Agents',
 *   Params: [
 *     { Name: 'IncludeInactive', Value: 'false' }, // Optional, default false
 *     { Name: 'ParentID', Value: 'parent-agent-id' }, // Optional filter
 *     { Name: 'TypeID', Value: 'agent-type-id' } // Optional filter
 *   ]
 * });
 * // Returns Agents array in output params
 * ```
 */
@RegisterClass(BaseAction, "List Agents")
export class ListAgentsAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) return permissionError;

            // Extract parameters
            const includeInactiveResult = this.getStringParam(params, 'IncludeInactive', false);
            const parentIDResult = this.getStringParam(params, 'ParentID', false);
            const typeIDResult = this.getStringParam(params, 'TypeID', false);

            // Build filter
            let filters: string[] = [];
            
            // By default, only show active agents unless specified
            const includeInactive = includeInactiveResult.value?.toLowerCase() === 'true';
            if (!includeInactive) {
                filters.push("Status = 'Active'");
            }

            // Add parent filter if provided
            if (parentIDResult.value) {
                filters.push(`ParentID = '${parentIDResult.value}'`);
            }

            // Add type filter if provided
            if (typeIDResult.value) {
                filters.push(`TypeID = '${typeIDResult.value}'`);
            }

            // Run the view to get agents
            const rv = new RunView();
            const result = await rv.RunView<AIAgentEntityExtended>({
                EntityName: 'AI Agents',
                ExtraFilter: filters.length > 0 ? filters.join(' AND ') : '',
                OrderBy: 'Name',
                ResultType: 'entity_object'
            }, params.ContextUser);

            if (result.Success) {
                // Transform the results to return only necessary fields
                const agents = (result.Results || []).map(agent => ({
                    ID: agent.ID,
                    Name: agent.Name,
                    Description: agent.Description,
                    TypeID: agent.TypeID,
                    Type: agent.Type,
                    ParentID: agent.ParentID,
                    Parent: agent.Parent,
                    Status: agent.Status,
                    ExecutionOrder: agent.ExecutionOrder,
                    ExposeAsAction: agent.ExposeAsAction,
                    __mj_CreatedAt: agent.__mj_CreatedAt,
                    __mj_UpdatedAt: agent.__mj_UpdatedAt
                }));

                // Add output parameter
                params.Params.push({
                    Name: 'Agents',
                    Value: agents,
                    Type: 'Output'
                });

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Found ${agents.length} agent${agents.length !== 1 ? 's' : ''}. Details are in the output parameter 'Agents'.`,
                    Params: params.Params
                };
            } else {
                return {
                    Success: false,
                    ResultCode: 'QUERY_FAILED',
                    Message: result.ErrorMessage || 'Failed to query agents'
                };
            }

        } catch (e) {
            return this.handleError(e, 'list agents');
        }
    }
}

export function LoadListAgentsAction() {
    // This function exists to prevent tree shaking from removing the action class
}