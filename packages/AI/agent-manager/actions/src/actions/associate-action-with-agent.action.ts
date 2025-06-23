import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { AIAgentActionEntity } from "@memberjunction/core-entities";
import { BaseAgentManagementAction } from "./base-agent-management.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Associates an action with an agent.
 * This action is restricted to the Agent Manager agent only.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Associate Action With Agent',
 *   Params: [
 *     { Name: 'AgentID', Value: 'agent-id' },
 *     { Name: 'ActionID', Value: 'action-id' },
 *     { Name: 'Status', Value: 'Active' } // Optional, default 'Active'
 *   ]
 * });
 * // Returns AgentActionID in output params
 * ```
 */
@RegisterClass(BaseAction, "Associate Action With Agent")
export class AssociateActionWithAgentAction extends BaseAgentManagementAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Validate permission
            const permissionError = await this.validateAgentManagerPermission(params);
            if (permissionError) return permissionError;

            // Extract parameters
            const agentIDResult = this.getStringParam(params, 'AgentID');
            if (agentIDResult.error) return agentIDResult.error;

            const actionIDResult = this.getStringParam(params, 'ActionID');
            if (actionIDResult.error) return actionIDResult.error;

            const statusResult = this.getStringParam(params, 'Status', false);
            const status = statusResult.value || 'Active';

            // Validate agent exists
            const agentValidation = await this.loadAgent(agentIDResult.value!, params.ContextUser);
            if (agentValidation.error) return agentValidation.error;

            // TODO: Validate action exists
            // This would require loading the Action entity to ensure it's valid

            // Create the association
            const md = this.getMetadata();
            const agentAction = await md.GetEntityObject<AIAgentActionEntity>('AI Agent Actions', params.ContextUser);
            
            if (!agentAction) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: 'Failed to create AI Agent Action entity object'
                };
            }

            // Set properties
            agentAction.NewRecord();
            agentAction.AgentID = agentIDResult.value!;
            agentAction.ActionID = actionIDResult.value!;
            switch (status.toLowerCase()) {
                case 'active':
                    agentAction.Status = 'Active';
                    break;          
                case 'revoked':
                    agentAction.Status = 'Revoked';
                    break;
                case 'pending':
                default:
                    agentAction.Status = 'Pending';
                    break;
            }

            // Save the association
            const saveResult = await agentAction.Save();
            
            if (saveResult) {
                // Add output parameter
                params.Params.push({
                    Name: 'AgentActionID',
                    Value: agentAction.ID,
                    Type: 'Output'
                });

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Successfully associated action with agent`,
                    Params: params.Params
                };
            } else {
                const latestResult = agentAction.LatestResult;
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: latestResult?.Message || 'Failed to save agent action association'
                };
            }

        } catch (e) {
            return this.handleError(e, 'associate action with agent');
        }
    }
}

export function LoadAssociateActionWithAgentAction() {
    // This function exists to prevent tree shaking from removing the action class
}