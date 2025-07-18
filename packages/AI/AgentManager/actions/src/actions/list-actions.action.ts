import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { Metadata, RunView } from "@memberjunction/core";
import { ActionEntity } from "@memberjunction/core-entities";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Lists available actions that can be associated with agents.
 * Used by the Planning Designer Agent to discover available actions.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'List Actions',
 *   Params: [
 *     { Name: 'CategoryID', Value: 'category-id' }, // Optional filter
 *     { Name: 'ExcludeAgentManagement', Value: 'true' } // Optional, default true
 *   ]
 * });
 * // Returns Actions array in output params
 * ```
 */
@RegisterClass(BaseAction, "List Actions")
export class ListActionsAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Note: This action may be called by sub-agents, so we might relax permission check
            // For now, keeping it restricted to Agent Manager ecosystem

            // Extract parameters
            const categoryIDResult = this.getStringParam(params, 'CategoryID', false);
            const excludeAgentMgmtResult = this.getStringParam(params, 'ExcludeAgentManagement', false);
            const excludeAgentMgmt = excludeAgentMgmtResult.value && typeof excludeAgentMgmtResult.value === 'string' 
                ? excludeAgentMgmtResult.value.toLowerCase() !== 'false' 
                : true; // Default true

            // Build filter
            let filters: string[] = ["Status = 'Active'"];
            
            // Add category filter if provided
            if (categoryIDResult.value && 
                typeof categoryIDResult.value === 'string' && 
                categoryIDResult.value !== 'null' &&
                categoryIDResult.value.trim() !== '') {
                filters.push(`CategoryID = '${categoryIDResult.value}'`);
            }

            // Exclude agent management actions by default (to prevent recursion)
            if (excludeAgentMgmt) {
                // Get Entity Info for ActionCategory to ensure we have the correct schema and base view
                const md = new Metadata();
                const actionCategoryInfo = md.EntityByName('Action Categories');
                const baseViewStr = `${actionCategoryInfo.SchemaName}.${actionCategoryInfo.BaseView}`;
                // This assumes Agent Management category has been created
                filters.push(`CategoryID NOT IN (SELECT ID FROM ${baseViewStr} WHERE Name = 'Agent Management')`);
            }

            // Run the view to get actions
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'Actions',
                ExtraFilter: filters.join(' AND '),
                OrderBy: 'Category, Name',
                ResultType: 'simple'
            }, params.ContextUser);

            if (result.Success) {
                // Transform the results to return only necessary fields
                const actions = await Promise.all((result.Results || []).map(async action => ({
                    ID: action.ID,
                    Name: action.Name,
                    Description: action.Description,
                    // Include parameter information for planning
                    Parameters: await this.extractActionParameters(action, params.ContextUser)
                })));

                // Add output parameter
                params.Params.push({
                    Name: 'Actions',
                    Value: actions,
                    Type: 'Output'
                });

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Found ${actions.length} available action${actions.length !== 1 ? 's' : ''}`,
                    Params: params.Params
                };
            } else {
                return {
                    Success: false,
                    ResultCode: 'QUERY_FAILED',
                    Message: result.ErrorMessage || 'Failed to query actions'
                };
            }

        } catch (e) {
            return this.handleError(e, 'list actions');
        }
    }

    /**
     * Extract parameter information from an action entity
     * This loads the Action Params related entities
     */
    private async extractActionParameters(action: ActionEntity, contextUser: any): Promise<any[]> {
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'Action Params',
                ExtraFilter: `ActionID = '${action.ID}'`,
                OrderBy: 'Name',
                ResultType: 'simple'
            }, contextUser);

            if (result.Success) {
                return (result.Results || []).map(param => ({
                    ID: param.ID,
                    Name: param.Name,
                    Type: param.Type,
                    Description: param.Description
                }));
            } else {
                console.error(`Failed to load parameters for action ${action.Name}:`, result.ErrorMessage);
                return [];
            }
        } catch (error) {
            console.error(`Error loading parameters for action ${action.Name}:`, error);
            return [];
        }
    }
}

export function LoadListActionsAction() {
    // This function exists to prevent tree shaking from removing the action class
}