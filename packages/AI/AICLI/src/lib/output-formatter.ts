import chalk from 'chalk';
import { table } from 'table';

export type OutputFormat = 'compact' | 'json' | 'table';

export interface AgentInfo {
  name: string;
  description?: string;
  status: 'available' | 'disabled';
  lastUsed?: string;
}

export interface ActionInfo {
  name: string;
  description?: string;
  status: 'available' | 'disabled';
  lastUsed?: string;
  parameters?: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
}

export interface ExecutionResult {
  success: boolean;
  entityName: string;
  prompt?: string;
  result?: any;
  error?: string;
  duration: number;
  steps?: number;
  executionId?: string;
  logFilePath?: string;
}

export class OutputFormatter {
  constructor(private format: OutputFormat) {}

  public formatAgentList(agents: AgentInfo[]): string {
    if (agents.length === 0) {
      return chalk.yellow('No agents found.');
    }

    switch (this.format) {
      case 'json':
        return JSON.stringify(agents, null, 2);
      
      case 'table':
        return this.formatAgentTable(agents);
      
      case 'compact':
      default:
        return this.formatAgentCompact(agents);
    }
  }

  public formatActionList(actions: ActionInfo[]): string {
    if (actions.length === 0) {
      return chalk.yellow('No actions found.');
    }

    switch (this.format) {
      case 'json':
        return JSON.stringify(actions, null, 2);
      
      case 'table':
        return this.formatActionTable(actions);
      
      case 'compact':
      default:
        return this.formatActionCompact(actions);
    }
  }

  public formatAgentResult(result: ExecutionResult): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      
      case 'table':
        return this.formatResultTable(result, 'Agent');
      
      case 'compact':
      default:
        return this.formatResultCompact(result, 'Agent');
    }
  }

  public formatActionResult(result: ExecutionResult): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      
      case 'table':
        return this.formatResultTable(result, 'Action');
      
      case 'compact':
      default:
        return this.formatResultCompact(result, 'Action');
    }
  }

  public formatPromptResult(result: ExecutionResult): string {
    switch (this.format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      
      case 'table':
        return this.formatResultTable(result, 'Prompt');
      
      case 'compact':
      default:
        return this.formatPromptResultCompact(result);
    }
  }

  private formatAgentTable(agents: AgentInfo[]): string {
    const tableData = [
      [chalk.bold('Name'), chalk.bold('Status'), chalk.bold('Description'), chalk.bold('Last Used')]
    ];

    agents.forEach(agent => {
      const status = agent.status === 'available' 
        ? chalk.green('available') 
        : chalk.red('disabled');
      
      tableData.push([
        agent.name,
        status,
        agent.description || '',
        agent.lastUsed || 'Never'
      ]);
    });

    return table(tableData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼'
      }
    });
  }

  private formatActionTable(actions: ActionInfo[]): string {
    const tableData = [
      [chalk.bold('Name'), chalk.bold('Status'), chalk.bold('Parameters'), chalk.bold('Description')]
    ];

    actions.forEach(action => {
      const status = action.status === 'available' 
        ? chalk.green('available') 
        : chalk.red('disabled');
      
      const params = action.parameters 
        ? action.parameters.map(p => `${p.name}${p.required ? '*' : ''}`).join(', ')
        : 'None';

      tableData.push([
        action.name,
        status,
        params,
        action.description || ''
      ]);
    });

    return table(tableData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼'
      }
    });
  }

  private formatAgentCompact(agents: AgentInfo[]): string {
    let output = chalk.bold(`Found ${agents.length} agent(s):\n\n`);
    
    agents.forEach(agent => {
      const status = agent.status === 'available' 
        ? chalk.green('✓') 
        : chalk.red('✗');
      
      output += `${status} ${chalk.cyan(agent.name)}`;
      if (agent.description) {
        output += ` - ${agent.description}`;
      }
      output += '\n';
    });

    return output;
  }

  private formatActionCompact(actions: ActionInfo[]): string {
    let output = chalk.bold(`Found ${actions.length} action(s):\n\n`);
    
    actions.forEach(action => {
      const status = action.status === 'available' 
        ? chalk.green('✓') 
        : chalk.red('✗');
      
      output += `${status} ${chalk.cyan(action.name)}`;
      if (action.description) {
        output += ` - ${action.description}`;
      }
      
      if (action.parameters && action.parameters.length > 0) {
        const params = action.parameters
          .map(p => `${p.name}${p.required ? '*' : ''}`)
          .join(', ');
        output += chalk.dim(` (${params})`);
      }
      output += '\n';
    });

    return output;
  }

  private formatResultTable(result: ExecutionResult, type: string): string {
    const tableData = [
      [chalk.bold('Property'), chalk.bold('Value')]
    ];

    tableData.push(['Status', result.success ? chalk.green('Success') : chalk.red('Failed')]);
    tableData.push([type, result.entityName]);
    
    if (result.prompt) {
      tableData.push(['Prompt', result.prompt.length > 50 ? result.prompt.substring(0, 50) + '...' : result.prompt]);
    }
    
    tableData.push(['Duration', `${result.duration}ms`]);
    
    if (result.steps) {
      tableData.push(['Steps', result.steps.toString()]);
    }
    
    if (result.executionId) {
      tableData.push(['Execution ID', result.executionId]);
    }
    
    if (result.logFilePath) {
      tableData.push(['Log File', result.logFilePath]);
    }
    
    if (result.error) {
      tableData.push(['Error', chalk.red(result.error)]);
    }

    return table(tableData);
  }

  private formatResultCompact(result: ExecutionResult, type: string): string {
    let output = '';

    if (result.success) {
      output += chalk.green(`✓ ${type} execution completed successfully\n`);
      output += chalk.bold(`${type}:`) + ` ${result.entityName}\n`;
      
      if (result.prompt) {
        output += chalk.bold('Prompt:') + ` ${result.prompt}\n`;
      }
      
      output += chalk.bold('Duration:') + ` ${result.duration}ms\n`;
      
      if (result.steps) {
        output += chalk.bold('Steps:') + ` ${result.steps}\n`;
      }

      if (result.result) {
        output += chalk.bold('Result:') + '\n';
        if (typeof result.result === 'string') {
          output += result.result + '\n';
        } else {
          output += JSON.stringify(result.result, null, 2) + '\n';
        }
      }

      if (result.logFilePath) {
        output += chalk.dim(`\nDetailed logs: ${result.logFilePath}\n`);
      }

    } else {
      output += chalk.red(`✗ ${type} execution failed\n`);
      output += chalk.bold(`${type}:`) + ` ${result.entityName}\n`;
      
      if (result.prompt) {
        output += chalk.bold('Prompt:') + ` ${result.prompt}\n`;
      }
      
      output += chalk.bold('Duration:') + ` ${result.duration}ms\n`;
      
      if (result.error) {
        output += chalk.bold('Error:') + ` ${chalk.red(result.error)}\n`;
      }

      if (result.logFilePath) {
        output += chalk.dim(`\nError logs: ${result.logFilePath}\n`);
      }
    }

    return output;
  }

  private formatPromptResultCompact(result: ExecutionResult): string {
    let output = '';

    if (result.success) {
      output += chalk.green('✓ Prompt executed successfully\n\n');
      
      // If result has structure with model selection info
      if (result.result && typeof result.result === 'object' && 'response' in result.result) {
        // Show the response
        output += chalk.bold('Response:\n');
        output += result.result.response + '\n';
        
        // Show model selection info if available
        if (result.result.modelSelection) {
          output += '\n' + chalk.bold('Model Information:\n');
          const ms = result.result.modelSelection;
          output += chalk.gray(`• Model: ${ms.modelUsed || 'Default'}\n`);
          output += chalk.gray(`• Vendor: ${ms.vendorUsed || 'Default'}\n`);
          if (ms.configurationUsed) {
            output += chalk.gray(`• Configuration: ${ms.configurationUsed}\n`);
          }
          if (ms.selectionStrategy) {
            output += chalk.gray(`• Selection Strategy: ${ms.selectionStrategy}\n`);
          }
          if (ms.modelsConsidered) {
            output += chalk.gray(`• Models Considered: ${ms.modelsConsidered}\n`);
          }
        }
        
        // Show usage info if available
        if (result.result.usage) {
          output += '\n' + chalk.bold('Token Usage:\n');
          const usage = result.result.usage;
          if (usage.promptTokens) output += chalk.gray(`• Prompt Tokens: ${usage.promptTokens}\n`);
          if (usage.completionTokens) output += chalk.gray(`• Completion Tokens: ${usage.completionTokens}\n`);
          if (usage.totalTokens) output += chalk.gray(`• Total Tokens: ${usage.totalTokens}\n`);
        }
      } else {
        // Simple string response
        output += chalk.bold('Response:\n');
        output += (typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)) + '\n';
      }
      
      output += '\n' + chalk.gray(`Duration: ${result.duration}ms`);
      
      if (result.logFilePath) {
        output += chalk.dim(`\nDetailed logs: ${result.logFilePath}`);
      }

    } else {
      output += chalk.red('✗ Prompt execution failed\n\n');
      
      if (result.error) {
        output += chalk.bold('Error:') + ` ${chalk.red(result.error)}\n`;
      }
      
      output += chalk.gray(`Duration: ${result.duration}ms`);
      
      if (result.logFilePath) {
        output += chalk.dim(`\nError logs: ${result.logFilePath}`);
      }
    }

    return output;
  }
}