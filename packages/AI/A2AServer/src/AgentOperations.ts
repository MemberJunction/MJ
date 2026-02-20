import { Metadata, UserInfo } from "@memberjunction/core";
import { AIEngine } from "@memberjunction/aiengine";
import { MJAIAgentEntityExtended, MJAIAgentRunEntityExtended } from "@memberjunction/ai-core-plus";
import { AgentRunner } from "@memberjunction/ai-agents";
import { ChatMessage } from "@memberjunction/ai";

export interface OperationResult {
    success: boolean;
    result?: any;
    errorMessage?: string;
}

export interface OperationParameters {
    [key: string]: any;
}

/**
 * Handles agent-related operations for the A2A server
 */
export class AgentOperations {
    private contextUser: UserInfo;

    constructor(contextUser: UserInfo) {
        this.contextUser = contextUser;
    }

    /**
     * Discovers available agents based on pattern
     * @param parameters Parameters containing the pattern
     * @returns The operation result with list of agents
     */
    public async discoverAgents(parameters: OperationParameters): Promise<OperationResult> {
        try {
            const pattern = parameters.pattern || '*';
            
            // Ensure AIEngine is configured
            const aiEngine = AIEngine.Instance;
            await aiEngine.Config(false, this.contextUser);
            
            const allAgents = aiEngine.Agents;
            let agents: MJAIAgentEntityExtended[] = [];
            
            if (pattern === '*') {
                agents = allAgents;
            } else {
                const isWildcardPattern = pattern.includes('*');
                if (!isWildcardPattern) {
                    // Exact match
                    agents = allAgents.filter(a => a.Name === pattern);
                } else {
                    // Convert wildcard pattern to regex
                    const regexPattern = pattern
                        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
                        .replace(/\*/g, '.*'); // Convert * to .*
                    
                    const regex = new RegExp(`^${regexPattern}$`, 'i');
                    agents = allAgents.filter(a => a.Name && regex.test(a.Name));
                }
            }
            
            return { 
                success: true, 
                result: agents.map(agent => ({
                    id: agent.ID,
                    name: agent.Name,
                    description: agent.Description || '',
                    typeID: agent.TypeID,
                    parentID: agent.ParentID
                }))
            };
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Executes an agent
     * @param parameters Parameters containing agent ID/name and execution params
     * @returns The operation result with run info
     */
    public async executeAgent(parameters: OperationParameters): Promise<OperationResult> {
        try {
            // Find the agent
            const aiEngine = AIEngine.Instance;
            await aiEngine.Config(false, this.contextUser);
            
            let agent: MJAIAgentEntityExtended | null = null;
            
            if (parameters.agentId) {
                agent = aiEngine.Agents.find(a => a.ID === parameters.agentId) || null;
                if (!agent) {
                    throw new Error(`Agent not found with ID: ${parameters.agentId}`);
                }
            } else if (parameters.agentName) {
                agent = aiEngine.Agents.find(a => a.Name?.toLowerCase() === parameters.agentName.toLowerCase()) || null;
                if (!agent) {
                    throw new Error(`Agent not found with name: ${parameters.agentName}`);
                }
            } else {
                throw new Error('Either agentId or agentName must be provided');
            }
            
            // Convert conversation history
            const messages: ChatMessage[] = parameters.conversationHistory as ChatMessage[] || [];
            
            // Execute the agent
            const agentRunner = new AgentRunner();
            const result = await agentRunner.RunAgent({
                agent,
                conversationMessages: messages,
                contextUser: this.contextUser,
                data: parameters.data || {}
            });
            
            return { 
                success: result.success, 
                result: {
                    runId: result.agentRun?.ID,
                    agentName: agent.Name,
                    status: result.agentRun?.Status || (result.success ? 'Completed' : 'Failed'),
                    startTime: result.agentRun?.StartedAt,
                    endTime: result.agentRun?.CompletedAt,
                    errorMessage: result.agentRun?.ErrorMessage,
                    finalStep: result.agentRun?.FinalStep,
                    result: result.payload
                }
            };
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Gets the status of an agent run
     * @param parameters Parameters containing the run ID
     * @returns The operation result with run status
     */
    public async getAgentRunStatus(parameters: OperationParameters): Promise<OperationResult> {
        try {
            const runId = parameters.runId;
            
            if (!runId) {
                return { 
                    success: false, 
                    errorMessage: 'Run ID is required' 
                };
            }
            
            // Load the agent run from database
            const md = new Metadata();
            const agentRun = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', this.contextUser);
            const loaded = await agentRun.Load(runId);
            
            if (!loaded) {
                return { 
                    success: false, 
                    errorMessage: `Run not found: ${runId}` 
                };
            }
            
            return { 
                success: true, 
                result: {
                    runId: agentRun.ID,
                    agentName: agentRun.Agent,
                    status: agentRun.Status,
                    startTime: agentRun.StartedAt,
                    endTime: agentRun.CompletedAt,
                    errorMessage: agentRun.ErrorMessage,
                    totalTokens: agentRun.TotalTokensUsed
                }
            };
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Cancels an agent run
     * @param parameters Parameters containing the run ID
     * @returns The operation result
     */
    public async cancelAgentRun(parameters: OperationParameters): Promise<OperationResult> {
        try {
            const runId = parameters.runId;
            
            if (!runId) {
                return { 
                    success: false, 
                    errorMessage: 'Run ID is required' 
                };
            }
            
            // Load the agent run from database
            const md = new Metadata();
            const agentRun = await md.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', this.contextUser);
            const loaded = await agentRun.Load(runId);
            
            if (!loaded) {
                return { 
                    success: false, 
                    errorMessage: `Run not found: ${runId}` 
                };
            }
            
            if (agentRun.Status !== 'Running') {
                return { 
                    success: false,
                    errorMessage: `Cannot cancel run with status: ${agentRun.Status}`
                };
            }
            
            // Update status to cancelled
            agentRun.Status = 'Cancelled';
            agentRun.CompletedAt = new Date();
            const saved = await agentRun.Save();
            
            return { 
                success: saved,
                result: { cancelled: saved },
                errorMessage: saved ? undefined : 'Failed to update run status'
            };
        } catch (error) {
            return { 
                success: false, 
                errorMessage: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * Processes an agent operation
     * @param operation The operation to perform
     * @param parameters The operation parameters
     * @returns The operation result
     */
    public async processOperation(operation: string, parameters: OperationParameters): Promise<OperationResult> {
        switch(operation) {
            case 'discoverAgents':
                return await this.discoverAgents(parameters);
                
            case 'executeAgent':
                return await this.executeAgent(parameters);
                
            case 'getAgentRunStatus':
                return await this.getAgentRunStatus(parameters);
                
            case 'cancelAgentRun':
                return await this.cancelAgentRun(parameters);
                
            default:
                return { 
                    success: false, 
                    errorMessage: `Unsupported agent operation: ${operation}` 
                };
        }
    }
}