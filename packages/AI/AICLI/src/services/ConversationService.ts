import readline from 'readline';
import chalk from 'chalk';
import { AgentService } from './AgentService';
import { ExecutionLogger } from '../lib/execution-logger';
import { ConsoleManager } from '../lib/console-manager';

export interface ConversationOptions {
  verbose?: boolean;
  timeout?: number;
  historyLimit?: number;
}

export interface ConversationTurn {
  userMessage: string;
  agentResponse?: string;
  timestamp: string;
  success: boolean;
  error?: string;
}

export class ConversationService {
  private agentService = new AgentService();
  private conversationHistory: ConversationTurn[] = [];
  private conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  private rl?: readline.Interface;

  async startChat(
    agentName: string, 
    initialPrompt?: string, 
    options: ConversationOptions = {}
  ): Promise<void> {
    const logger = new ExecutionLogger(`agents:chat`, agentName, undefined, initialPrompt);
    
    try {
      await this.agentService.initialize();
      
      // Verify agent exists
      const agent = await this.agentService.findAgent(agentName);
      if (!agent) {
        throw new Error(`❌ Agent not found: "${agentName}"

Use 'mj-ai agents:list' to see available agents.`);
      }

      console.log(chalk.cyan(`\n🤖 Starting conversation with: ${chalk.bold(agentName)}`));
      console.log(chalk.dim('Type "exit", "/exit", "quit", or press Ctrl+C to end the conversation\n'));

      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: chalk.blue('You: ')
      });

      // Handle initial prompt if provided
      if (initialPrompt) {
        console.log(chalk.blue('You: ') + initialPrompt);
        await this.processUserMessage(agentName, initialPrompt, logger, options);
      }

      // Start interactive conversation loop
      await this.conversationLoop(agentName, logger, options);

    } catch (error: any) {
      logger.logError(error, 'SYSTEM');
      logger.finalize('FAILED', undefined, error.message);
      
      if (error.message.startsWith('❌')) {
        throw error;
      } else {
        throw new Error(`❌ Failed to start conversation

Problem: ${error.message}
Agent: ${agentName}

Next steps:
1. Verify the agent exists and is configured correctly
2. Check database connection and MJ infrastructure
3. Try with a different agent

Log file: ${logger.getLogFilePath()}`);
      }
    }
  }

  private async conversationLoop(
    agentName: string, 
    logger: ExecutionLogger, 
    options: ConversationOptions
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const handleInput = async (input: string) => {
        const trimmedInput = input.trim();
        
        // Check for exit commands
        if (this.isExitCommand(trimmedInput)) {
          console.log(chalk.yellow('\n👋 Goodbye!'));
          this.rl?.close();
          logger.finalize('SUCCESS', this.conversationHistory);
          resolve();
          // Force process exit
          setImmediate(() => process.exit(0));
          return;
        }

        // Ignore empty input
        if (!trimmedInput) {
          this.rl?.prompt();
          return;
        }

        try {
          await this.processUserMessage(agentName, trimmedInput, logger, options);
        } catch (error: any) {
          console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
          logger.logError(error, 'SYSTEM');
        }

        this.rl?.prompt();
      };

      this.rl?.on('line', handleInput);
      
      this.rl?.on('SIGINT', () => {
        console.log(chalk.yellow('\n👋 Goodbye!'));
        this.rl?.close();
        logger.finalize('CANCELLED', this.conversationHistory);
        resolve();
        // Force process exit
        setImmediate(() => process.exit(0));
      });

      this.rl?.on('close', () => {
        resolve();
        // Force process exit
        setImmediate(() => process.exit(0));
      });

      this.rl?.on('error', (error) => {
        logger.logError(error, 'SYSTEM');
        reject(error);
      });

      // Start the conversation
      this.rl?.prompt();
    });
  }

  private async processUserMessage(
    agentName: string,
    userMessage: string,
    logger: ExecutionLogger,
    options: ConversationOptions
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.logStep('INFO', 'USER', 'Processing user message', { 
        message: userMessage.substring(0, 100) + (userMessage.length > 100 ? '...' : '')
      });

      // Show thinking indicator
      console.log(chalk.dim('\n🤔 Agent is thinking...'));

      // Suppress console output during agent execution unless verbose
      let result;
      const executionOptions = {
        ...options,
        conversationMessages: [...this.conversationMessages] // Pass current conversation history
      };

      if (options.verbose) {
        result = await this.agentService.executeAgent(agentName, userMessage, executionOptions);
      } else {
        result = await ConsoleManager.withSuppressedOutput(async () => {
          return await this.agentService.executeAgent(agentName, userMessage, executionOptions);
        });
      }
      const duration = Date.now() - startTime;

      if (result.success) {
        // Display agent response
        const agentMessage = this.extractAgentResponse(result.result);
        console.log(chalk.green(`\n🤖 ${agentName}: `) + agentMessage);
        
        if (options.verbose) {
          console.log(chalk.dim(`\n⏱️  Response time: ${duration}ms`));
          if (result.executionId) {
            console.log(chalk.dim(`📋 Execution ID: ${result.executionId}`));
          }
        }

        // Add messages to conversation context
        this.conversationMessages.push({ role: 'user', content: userMessage });
        this.conversationMessages.push({ role: 'assistant', content: agentMessage });

        // Add to conversation history
        this.conversationHistory.push({
          userMessage,
          agentResponse: agentMessage,
          timestamp: new Date().toISOString(),
          success: true
        });

        logger.logStep('SUCCESS', 'AGENT', 'User message processed successfully', {
          responseLength: result.result?.length || 0,
          duration
        });

      } else {
        console.log(chalk.red(`\n❌ ${agentName}: Error occurred`));
        if (result.error) {
          console.log(chalk.red(result.error));
        }

        // Add user message to conversation context even if agent failed
        this.conversationMessages.push({ role: 'user', content: userMessage });

        // Add failed turn to history
        this.conversationHistory.push({
          userMessage,
          timestamp: new Date().toISOString(),
          success: false,
          error: result.error
        });

        logger.logStep('ERROR', 'AGENT', 'User message processing failed', {
          error: result.error,
          duration
        });
      }

      // Manage conversation history size
      if (options.historyLimit && this.conversationHistory.length > options.historyLimit) {
        this.conversationHistory = this.conversationHistory.slice(-options.historyLimit);
        // Also trim conversation messages (keep last N pairs, each pair = user + assistant)
        const maxMessages = options.historyLimit * 2;
        if (this.conversationMessages.length > maxMessages) {
          this.conversationMessages = this.conversationMessages.slice(-maxMessages);
        }
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      console.log(chalk.red(`\n❌ Failed to process message: ${error.message}`));
      
      // Add user message to conversation context even on system error
      this.conversationMessages.push({ role: 'user', content: userMessage });
      
      this.conversationHistory.push({
        userMessage,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });

      logger.logStep('ERROR', 'SYSTEM', 'Message processing error', {
        error: error.message,
        duration
      });

      throw error;
    }
  }

  private isExitCommand(input: string): boolean {
    const exitCommands = ['exit', 'quit', 'bye', 'goodbye', 'stop', '/exit'];
    return exitCommands.includes(input.toLowerCase());
  }

  public getConversationHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }

  public clearHistory(): void {
    this.conversationHistory = [];
  }

  public async exportConversation(filePath?: string): Promise<string> {
    const exportData = {
      timestamp: new Date().toISOString(),
      totalTurns: this.conversationHistory.length,
      successfulTurns: this.conversationHistory.filter(t => t.success).length,
      failedTurns: this.conversationHistory.filter(t => !t.success).length,
      conversation: this.conversationHistory
    };

    const exportJson = JSON.stringify(exportData, null, 2);
    
    if (filePath) {
      const fs = await import('fs');
      fs.writeFileSync(filePath, exportJson, 'utf8');
      return filePath;
    }

    return exportJson;
  }

  private extractAgentResponse(result: any): string {
    if (typeof result === 'string') {
      return result;
    } else if (typeof result === 'object' && result) {
      // For chat mode, prioritize actual user-facing messages
      if (result.message) {
        return result.message;
      } else if (result.userMessage) {
        return result.userMessage;
      } else if (result.nextStep && result.nextStep.userMessage) {
        return result.nextStep.userMessage;
      } else if (result.returnValue) {
        return typeof result.returnValue === 'string' ? result.returnValue : JSON.stringify(result.returnValue);
      } else {
        // Fallback to JSON representation
        return JSON.stringify(result, null, 2);
      }
    }
    return JSON.stringify(result);
  }
}