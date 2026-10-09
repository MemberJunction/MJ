import chalk from 'chalk';
import { table } from 'table';
import type { JSONValue } from '@memberjunction/ai';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { TextFormatter } from './text-formatter';

export type OutputFormat = 'compact' | 'json' | 'table';

export interface AgentInfo {
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  description?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  status: 'available' | 'disabled';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  lastUsed?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface ActionInfo {
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  description?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  status: 'available' | 'disabled';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  lastUsed?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  parameters?: Array<{  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
}

export interface ExecutionResult {
  success: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  entityName: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  prompt?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  result?: any;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  error?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  duration: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  steps?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  executionId?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  logFilePath?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /**
   * The `MJ: AI Agent Runs` record this execution produced: the ID `mj ai audit agent-run` takes.
   * Set for agent runs once the run record exists; never set for actions or prompts.
   */
  AgentRunID?: string;
  /**
   * The agent run's status when the command returned. `Paused` means the run handed its workflow to
   * the task-graph dispatcher and is waiting on it; `Running` means the command stopped waiting
   * before the run ended.
   */
  AgentRunStatus?: MJAIAgentRunEntity['Status'];
  /**
   * The run's final payload, when it produced one and {@link result} carries the agent's message
   * instead. A Flow agent's output is its payload, so this is where that output appears.
   */
  FinalPayload?: JSONValue;
  /** True when the command stopped waiting because its timeout elapsed. */
  TimedOut?: boolean;
}

/** Longest final payload the human renderings print in full; `--format json` always carries all of it. */
const MAX_RENDERED_PAYLOAD_CHARS = 4000;

export class OutputFormatter {
  constructor(private format: OutputFormat) {}

  public FormatAgentList(agents: AgentInfo[]): string {
    // The empty case is still a RESULT, not a message. Answering it above the switch
    // meant `--format=json` returned the prose "No agents found." — unparseable, and
    // indistinguishable to a caller from the command having failed. An empty list is
    // `[]`; only the human renderings get a sentence.
    switch (this.format) {
      case 'json':
        return JSON.stringify(agents, null, 2);

      case 'table':
        return agents.length === 0 ? chalk.yellow('No agents found.') : this.formatAgentTable(agents);

      case 'compact':
      default:
        return agents.length === 0 ? chalk.yellow('No agents found.') : this.formatAgentCompact(agents);
    }
  }

  /** @deprecated Use {@link FormatAgentList}. */
  public formatAgentList(agents: AgentInfo[]): string {
    return this.FormatAgentList(agents);
  }

  /**
   * Renders what `mj ai actions run --dry-run` *would* execute.
   *
   * A dry run is the one place a caller is most likely to be a program — it exists to
   * be inspected before committing — so it has to honour the resolved format like every
   * other output path. Printing coloured prose here regardless of `--format=json` put a
   * banner and ANSI codes into what an agent was parsing.
   */
  public FormatActionDryRun(actionName: string, parameters: Record<string, string>): string {
    if (this.format === 'json') {
      return JSON.stringify({ dryRun: true, action: actionName, parameters }, null, 2);
    }

    const lines = [
      chalk.yellow('Dry-run mode: Action would be executed with these parameters:'),
      chalk.cyan(`Action: ${actionName}`),
    ];

    const entries = Object.entries(parameters);
    if (entries.length === 0) {
      lines.push(chalk.gray('No parameters provided'));
    } else {
      lines.push(chalk.cyan('Parameters:'));
      for (const [key, value] of entries) {
        lines.push(`  ${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }

  /** @deprecated Use {@link FormatActionDryRun}. */
  public formatActionDryRun(actionName: string, parameters: Record<string, string>): string {
    return this.FormatActionDryRun(actionName, parameters);
  }

  public FormatActionList(actions: ActionInfo[]): string {
    // See formatAgentList: an empty result must stay machine-readable in json mode.
    switch (this.format) {
      case 'json':
        return JSON.stringify(actions, null, 2);

      case 'table':
        return actions.length === 0 ? chalk.yellow('No actions found.') : this.formatActionTable(actions);

      case 'compact':
      default:
        return actions.length === 0 ? chalk.yellow('No actions found.') : this.formatActionCompact(actions);
    }
  }

  /** @deprecated Use {@link FormatActionList}. */
  public formatActionList(actions: ActionInfo[]): string {
    return this.FormatActionList(actions);
  }

  public FormatAgentResult(result: ExecutionResult): string {
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

  /** @deprecated Use {@link FormatAgentResult}. */
  public formatAgentResult(result: ExecutionResult): string {
    return this.FormatAgentResult(result);
  }

  public FormatActionResult(result: ExecutionResult): string {
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

  /** @deprecated Use {@link FormatActionResult}. */
  public formatActionResult(result: ExecutionResult): string {
    return this.FormatActionResult(result);
  }

  public FormatPromptResult(result: ExecutionResult): string {
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

  /** @deprecated Use {@link FormatPromptResult}. */
  public formatPromptResult(result: ExecutionResult): string {
    return this.FormatPromptResult(result);
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

    if (result.AgentRunID) {
      tableData.push(['Run ID', result.AgentRunID]);
    }

    if (result.AgentRunStatus) {
      tableData.push(['Run Status', result.AgentRunStatus]);
    }

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
    return result.success
      ? this.formatSuccessCompact(result, type)
      : this.formatFailureCompact(result, type);
  }

  private formatSuccessCompact(result: ExecutionResult, type: string): string {
    let output = chalk.green(`✓ ${this.successHeadline(result, type)}\n`);
    output += this.formatRunHeaderCompact(result, type);

    if (result.steps) {
      output += chalk.bold('Steps:') + ` ${result.steps}\n`;
    }

    if (result.result) {
      output += chalk.bold('Result:') + '\n';
      output += this.formatResultBody(result.result) + '\n';
    }

    output += this.formatFinalPayloadCompact(result.FinalPayload);

    if (result.logFilePath) {
      output += chalk.dim(`\nDetailed logs: ${result.logFilePath}\n`);
    }
    output += this.formatAuditHint(result);

    return output;
  }

  private formatFailureCompact(result: ExecutionResult, type: string): string {
    let output = chalk.red(`✗ ${result.TimedOut ? `${type} execution timed out` : `${type} execution failed`}\n`);
    output += this.formatRunHeaderCompact(result, type);

    if (result.error) {
      output += chalk.bold('Error:') + ` ${chalk.red(result.error)}\n`;
    }

    if (result.logFilePath) {
      output += chalk.dim(`\nError logs: ${result.logFilePath}\n`);
    }
    output += this.formatAuditHint(result);

    return output;
  }

  /**
   * A run that handed its workflow to the task-graph dispatcher (`--background`) has started the
   * work, not finished it, and the headline must not claim otherwise.
   */
  private successHeadline(result: ExecutionResult, type: string): string {
    return result.AgentRunStatus === 'Paused'
      ? 'Agent run started — its workflow continues on the task-graph dispatcher'
      : `${type} execution completed successfully`;
  }

  /** The lines every compact rendering starts with: what ran, which run it was, and how long it took. */
  private formatRunHeaderCompact(result: ExecutionResult, type: string): string {
    let output = chalk.bold(`${type}:`) + ` ${result.entityName}\n`;

    if (result.AgentRunID) {
      output += chalk.bold('Run ID:') + ` ${result.AgentRunID}\n`;
    }
    if (result.AgentRunStatus) {
      output += chalk.bold('Run status:') + ` ${result.AgentRunStatus}\n`;
    }
    if (result.prompt) {
      output += chalk.bold('Prompt:') + ` ${result.prompt}\n`;
    }

    output += chalk.bold('Duration:') + ` ${result.duration}ms\n`;
    return output;
  }

  private formatResultBody(content: ExecutionResult['result']): string {
    if (typeof content === 'string') {
      return TextFormatter.FormatText(content, {
        MaxWidth: 80,
        Indent: 2,
        PreserveParagraphs: true
      });
    }
    return TextFormatter.FormatJSON(content, 2);
  }

  /**
   * Prints the final payload, cut at {@link MAX_RENDERED_PAYLOAD_CHARS} so a large one cannot bury
   * the rest of the output. An empty object is a payload in name only and is skipped.
   */
  private formatFinalPayloadCompact(payload: JSONValue | undefined): string {
    if (payload === undefined || payload === null || this.isEmptyObject(payload)) {
      return '';
    }

    const json = JSON.stringify(payload, null, 2);
    const shown = json.length > MAX_RENDERED_PAYLOAD_CHARS ? json.slice(0, MAX_RENDERED_PAYLOAD_CHARS) : json;
    let output = chalk.bold('Final payload:') + '\n';
    output += shown.split('\n').map((line) => `  ${line}`).join('\n') + '\n';
    if (shown.length < json.length) {
      output += chalk.dim(`  … ${json.length - shown.length} more characters. Use --format json for the whole payload.\n`);
    }
    return output;
  }

  private isEmptyObject(value: JSONValue): boolean {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
  }

  /** Tells the reader how to follow up on a run: the audit command, pointed at its errors when it failed. */
  private formatAuditHint(result: ExecutionResult): string {
    if (!result.AgentRunID) {
      return '';
    }
    const errorsFlag = result.success ? '' : ' --errors';
    return chalk.dim(`Audit this run: mj ai audit agent-run ${result.AgentRunID}${errorsFlag}\n`);
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