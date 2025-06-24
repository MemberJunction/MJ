import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { CreateAgentAction } from "./create-agent.action";
import { BaseAction } from "@memberjunction/actions";

/**
 * Creates a new agent as a child of another agent.
 * This action is restricted to the Agent Manager agent only.
 * Extends CreateAgentAction but makes ParentID required.
 * 
 * @example
 * ```typescript
 * const result = await runAction({
 *   ActionName: 'Create Sub Agent',
 *   Params: [
 *     { Name: 'ParentAgentID', Value: 'parent-agent-id' }, // Required
 *     { Name: 'Name', Value: 'Data Collector Agent' },
 *     { Name: 'Description', Value: 'Collects data from various sources' },
 *     { Name: 'Type', Value: 'Loop' }, // Optional, use Type OR TypeID
 *     { Name: 'TypeID', Value: 'loop-agent-type-id' }, // Optional, use Type OR TypeID
 *     { Name: 'PromptText', Value: 'You are a data collector...' } // Optional
 *   ]
 * });
 * // Returns AgentID and optionally PromptID in output params
 * ```
 */
@RegisterClass(BaseAction, "Create Sub Agent")
export class CreateSubAgentAction extends CreateAgentAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // First check for ParentAgentID parameter (required for sub-agents)
        const parentAgentIDParam = params.Params.find(p => p.Name === 'ParentAgentID');
        if (!parentAgentIDParam || !parentAgentIDParam.Value) {
            return {
                Success: false,
                ResultCode: 'MISSING_PARAMETER',
                Message: 'ParentAgentID parameter is required for creating sub-agents'
            };
        }

        // Map ParentAgentID to ParentID for the base class
        const mappedParams = {
            ...params,
            Params: params.Params.map(p => {
                if (p.Name === 'ParentAgentID') {
                    return { ...p, Name: 'ParentID' };
                }
                return p;
            })
        };

        // Call the parent class implementation with mapped parameters
        return super.InternalRunAction(mappedParams);
    }
}

export function LoadCreateSubAgentAction() {
    // This function exists to prevent tree shaking from removing the action class
}