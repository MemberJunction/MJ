import { AgentRunner } from '@memberjunction/ai-agents';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { AIAgentEntity } from '@memberjunction/core-entities';
import { ExecutionLogger } from '../lib/execution-logger';
import { initializeMJProvider } from '../lib/mj-provider';
import { AgentInfo, ExecutionResult } from '../lib/output-formatter';
import { ConsoleManager } from '../lib/console-manager';

export interface AgentExecutionOptions {
  verbose?: boolean;
  timeout?: number;
  conversationMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export class AgentService {
  private initialized = false;
  private contextUser?: UserInfo;
  private metadata?: Metadata;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await initializeMJProvider();
      this.metadata = new Metadata();
      this.contextUser = await this.getContextUser();
      this.initialized = true;
    } catch (error: any) {
      throw new Error(`Failed to initialize Agent Service: ${error?.message || 'Unknown error'}`);
    }
  }

  async listAgents(): Promise<AgentInfo[]> {
    await this.ensureInitialized();

    try {
      const rv = new RunView();
      const result = await rv.RunView<AIAgentEntity>({
        EntityName: 'AI Agents',
        ExtraFilter: '',
        OrderBy: 'Name',
        ResultType: 'entity_object'
      }, this.contextUser);

      if (!result.Success) {
        throw new Error(`Failed to load agents: ${result.ErrorMessage}`);
      }

      const agents = result.Results || [];
      return agents
        .filter(agent => agent.Name) // Filter out agents without names
        .map(agent => ({
          name: agent.Name!,
          description: agent.Description || undefined,
          status: 'available' as const, // For now, assume all agents are available
          lastUsed: undefined // We could track this in the future
        }));

    } catch (error: any) {
      throw new Error(`❌ Failed to list agents

Problem: ${error?.message || 'Unknown error'}
Context: Loading AI agents from database

Next steps:
1. Verify AI Agents entity exists in your database
2. Check user permissions to access AI Agents
3. Ensure @memberjunction/ai-agents package is built

For help with agent configuration, see the MJ documentation.`);
    }
  }

  async findAgent(agentName: string): Promise<AIAgentEntity | null> {
    await this.ensureInitialized();

    try {
      const rv = new RunView();
      const result = await rv.RunView<AIAgentEntity>({
        EntityName: 'AI Agents',
        ExtraFilter: `Name = '${agentName.replace(/'/g, "''")}'`,
        ResultType: 'entity_object'
      }, this.contextUser);

      if (!result.Success) {
        throw new Error(result.ErrorMessage || 'Unknown error');
      }

      return result.Results && result.Results.length > 0 ? result.Results[0] : null;

    } catch (error: any) {
      throw new Error(`Failed to find agent "${agentName}": ${error?.message || 'Unknown error'}`);
    }
  }

  async executeAgent(
    agentName: string, 
    prompt: string, 
    options: AgentExecutionOptions = {}
  ): Promise<ExecutionResult> {
    await this.ensureInitialized();

    const startTime = Date.now();
    const logger = new ExecutionLogger(`agents:run`, agentName, undefined, prompt);
    
    try {
      // Find the agent
      logger.logStep('INFO', 'SYSTEM', 'Finding agent', { agentName });
      const agent = await this.findAgent(agentName);
      
      if (!agent) {
        const suggestions = await this.getSimilarAgentNames(agentName);
        const suggestionText = suggestions.length > 0 
          ? `\n\nDid you mean one of these?\n${suggestions.map(s => `  - ${s}`).join('\n')}`
          : '';
        
        throw new Error(`❌ Agent not found: "${agentName}"

Problem: No agent exists with the specified name
Available agents: Use 'mj-ai agents:list' to see all agents${suggestionText}

Next steps:
1. Check the agent name spelling
2. Use 'mj-ai agents:list' to see available agents
3. Verify the agent is deployed and enabled`);
      }

      logger.logStep('SUCCESS', 'SYSTEM', 'Agent found', { 
        agentId: agent.ID, 
        agentName: agent.Name 
      });

      // Execute the agent
      logger.logStep('INFO', 'AGENT', 'Starting agent execution', { 
        prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '')
      });

      const agentRunner = new AgentRunner();
      
      // Build conversation messages - use provided history or create new conversation
      const conversationMessages = options.conversationMessages || [{ 
        role: 'user', 
        content: prompt
      }];

      // If we have conversation history, append the current prompt
      if (options.conversationMessages && options.conversationMessages.length > 0) {
        conversationMessages.push({ 
          role: 'user', 
          content: prompt
        });
      }
      
      // Suppress console output during agent execution unless verbose
      let executionResult;
      if (options.verbose) {
        executionResult = await agentRunner.RunAgent({
          agent: agent,
          conversationMessages,
          contextUser: this.contextUser!
        });
      } else {
        executionResult = await ConsoleManager.withSuppressedOutput(async () => {
          return await agentRunner.RunAgent({
            agent: agent,
            conversationMessages,
            contextUser: this.contextUser!
          });
        });
      }

      const duration = Date.now() - startTime;

      if (executionResult && executionResult.success) {
        logger.logStep('SUCCESS', 'AGENT', 'Agent execution completed', {
          result: typeof executionResult.returnValue === 'string' 
            ? executionResult.returnValue.substring(0, 200) + (executionResult.returnValue.length > 200 ? '...' : '')
            : executionResult.returnValue
        });

        const result: ExecutionResult = {
          success: true,
          entityName: agentName,
          prompt,
          result: executionResult.returnValue,
          duration,
          executionId: logger.getExecutionId(),
          logFilePath: logger.getLogFilePath()
        };

        logger.finalize('SUCCESS', executionResult.returnValue);
        return result;

      } else {
        const errorMessage = executionResult?.errorMessage || 'Unknown execution error';
        logger.logError(errorMessage, 'AGENT');

        const result: ExecutionResult = {
          success: false,
          entityName: agentName,
          prompt,
          error: errorMessage,
          duration,
          executionId: logger.getExecutionId(),
          logFilePath: logger.getLogFilePath()
        };

        logger.finalize('FAILED', undefined, errorMessage);
        return result;
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error?.message || 'Unknown error';
      
      logger.logError(error, 'SYSTEM');

      const result: ExecutionResult = {
        success: false,
        entityName: agentName,
        prompt,
        error: errorMessage,
        duration,
        executionId: logger.getExecutionId(),
        logFilePath: logger.getLogFilePath()
      };

      logger.finalize('FAILED', undefined, errorMessage);

      // If it's already a formatted error, re-throw as is
      if (errorMessage.startsWith('❌')) {
        throw error;
      } else {
        throw new Error(`❌ Agent execution failed

Problem: ${errorMessage}
Agent: ${agentName}
Context: Running agent with user prompt

Next steps:
1. Check the agent configuration and parameters
2. Verify required AI models are available
3. Review execution logs for detailed error information
4. Try with a simpler prompt to test basic functionality

Log file: ${logger.getLogFilePath()}`);
      }
    }
  }

  private async getSimilarAgentNames(searchName: string): Promise<string[]> {
    try {
      const agents = await this.listAgents();
      const searchLower = searchName.toLowerCase();
      
      return agents
        .filter(agent => 
          agent.name.toLowerCase().includes(searchLower) ||
          searchLower.includes(agent.name.toLowerCase()) ||
          this.calculateSimilarity(agent.name.toLowerCase(), searchLower) > 0.6
        )
        .map(agent => agent.name)
        .slice(0, 3); // Limit to 3 suggestions
    } catch {
      return [];
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private async getContextUser(): Promise<UserInfo> {
    const { UserCache } = await import('@memberjunction/sqlserver-dataprovider');
    
    if (!UserCache.Users || UserCache.Users.length === 0) {
      throw new Error(`❌ No users found in UserCache

Problem: UserCache is empty or not properly initialized
Likely cause: Database connection or UserCache refresh issue

Next steps:
1. Verify database connection is working
2. Check that Users table has data
3. Ensure UserCache.Refresh() was called during initialization

This is typically a configuration or database setup issue.`);
    }

    // For CLI usage, we'll use the first available user
    // In a real application, you might want to configure which user to use
    const user = UserCache.Users[0];
    
    if (!user) {
      throw new Error('No valid user found for execution context');
    }

    return user;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}