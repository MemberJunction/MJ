import { ChatMessage } from '@memberjunction/ai';
import { AIAgentEntity, AIAgentTypeEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { AIPromptRunner, AIPromptParams, ChildPromptParam } from '@memberjunction/ai-prompts';
import { BaseAgentType, BaseAgentNextStep } from './base-agent-type';
import { MJGlobal } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';

export type ExecuteAgentParams = {
    agent: AIAgentEntity;
    conversationMessages: ChatMessage[];
    contextUser?: UserInfo;
}

export type ExecuteAgentResult = {
    nextStep: 'success' | 'failed' | 'subagent' | 'action';
    returnValue?: any;
    rawResult?: string;
    errorMessage?: string;
}

/** 
 * Simple test base class that works as follows:
 * * We get the SystemPromptID from the AgentTypeID from the agent
 * * That system prompt becomes the "parent" prompt for the agent
 * * We get the first prompt within the MJ: AI Agent Prompts entity that is linked to this agent and that becomes the child prompt
 * * The parent prompt has special data context where we pass in the following:
 *  - subAgentCount: number of sub-agents that this agent has
 *  - subAgentDetails: JSON stringified of the sub-agent metadata
 *  - actionCount: number of actions that this agent has access to
 *  - actionDetails: JSON stringified of the action metadata
 * * The system prompt from the agent type controls what the agent does 
 */
export class BaseAgent {
    private _promptRunner: AIPromptRunner = new AIPromptRunner();

    public async Execute(params: ExecuteAgentParams): Promise<ExecuteAgentResult> {
        try {
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, params.contextUser);
            const engine = AIEngine.Instance;

            // Find the agent type using AIEngine
            const agentType = engine.AgentTypes.find(at => at.ID === params.agent.TypeID);
            if (!agentType) {
                return {
                    nextStep: 'failed',
                    errorMessage: `Agent type not found for ID: ${params.agent.TypeID}`
                };
            }

            // Find the system prompt from the agent type
            const systemPrompt = engine.Prompts.find(p => p.ID === agentType.SystemPromptID);
            if (!systemPrompt) {
                return {
                    nextStep: 'failed',
                    errorMessage: `System prompt not found for agent type: ${agentType.Name}`
                };
            }

            // Find the first agent prompt (child prompt)
            const agentPrompt = engine.AgentPrompts
                .filter(ap => ap.AgentID === params.agent.ID && ap.Status === 'Active')
                .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder)[0];
            
            if (!agentPrompt) {
                return {
                    nextStep: 'failed',
                    errorMessage: `No prompts configured for agent: ${params.agent.Name}`
                };
            }

            // Find the actual prompt entity for the agent prompt
            const childPrompt = engine.Prompts.find(p => p.ID === agentPrompt.PromptID);
            if (!childPrompt) {
                return {
                    nextStep: 'failed',
                    errorMessage: `Child prompt not found for ID: ${agentPrompt.PromptID}`
                };
            }

            // Gather context data for the system prompt
            const contextData = await this.gatherContextData(params.agent, params.contextUser);

            // Set up the hierarchical prompt execution
            const promptParams = new AIPromptParams();
            promptParams.prompt = systemPrompt;
            promptParams.data = contextData;
            promptParams.contextUser = params.contextUser;
            promptParams.conversationMessages = params.conversationMessages;
            promptParams.templateMessageRole = 'system';

            // Add the agent prompt as a child prompt
            promptParams.childPrompts = [
                new ChildPromptParam(
                    {
                        prompt: childPrompt,
                        data: contextData,
                        contextUser: params.contextUser,
                        conversationMessages: params.conversationMessages,
                        templateMessageRole: 'user'
                    } as AIPromptParams,
                    'agentResponse'
                )
            ];

            // Execute the prompt
            const result = await this._promptRunner.ExecutePrompt(promptParams);

            if (!result.success) {
                return {
                    nextStep: 'failed',
                    errorMessage: result.errorMessage,
                    rawResult: result.rawResult
                };
            }

            // Get the agent type instance to determine next step
            const agentTypeInstance = await this.getAgentTypeInstance(agentType);
            if (!agentTypeInstance) {
                return {
                    nextStep: 'failed',
                    errorMessage: `Could not instantiate agent type: ${agentType.Name}`
                };
            }

            // Let the agent type determine the next step
            const nextStep = await agentTypeInstance.DetermineNextStep();

            return {
                nextStep: nextStep.step,
                returnValue: nextStep.returnValue || result.result,
                rawResult: result.rawResult
            };

        } catch (error) {
            return {
                nextStep: 'failed',
                errorMessage: error.message,
            };
        }
    }


    private async gatherContextData(agent: AIAgentEntity, contextUser?: UserInfo): Promise<Record<string, any>> {
        try {
            const engine = AIEngine.Instance;
            
            // Find sub-agents using AIEngine
            const subAgents = engine.Agents.filter(a => a.ParentID === agent.ID)
                .sort((a, b) => a.ExecutionOrder - b.ExecutionOrder);
            
            // Load available actions (placeholder for now - would integrate with Actions framework)
            const actions: any[] = []; // TODO: Implement action loading from Actions framework

            return {
                agentName: agent.Name,
                agentDescription: agent.Description,
                subAgentCount: subAgents.length,
                subAgentDetails: JSON.stringify(subAgents.map(sa => ({
                    id: sa.ID,
                    name: sa.Name,
                    description: sa.Description,
                    type: sa.Type
                }))),
                actionCount: actions.length,
                actionDetails: JSON.stringify(actions)
            };
        } catch (error) {
            throw new Error(`Error gathering context data: ${error.message}`);
        }
    }


    private async getAgentTypeInstance(agentType: AIAgentTypeEntity): Promise<BaseAgentType | null> {
        try {
            // Use the class factory to instantiate the agent type based on its name
            const className = `${agentType.Name}AgentType`;
            return MJGlobal.Instance.ClassFactory.CreateInstance<BaseAgentType>(BaseAgentType, className);
        } catch (error) {
            // If specific agent type class doesn't exist, return a default implementation
            return new DefaultAgentType();
        }
    }
}

/**
 * Default agent type implementation for when no specific agent type class is found
 */
class DefaultAgentType extends BaseAgentType {
    public async DetermineNextStep(): Promise<BaseAgentNextStep> {
        // Default behavior - just return success
        return {
            step: 'success'
        };
    }
}