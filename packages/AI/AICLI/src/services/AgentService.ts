import { AgentRunner, type FlowAgentExecuteParams } from '@memberjunction/ai-agents';
import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import type { ExecuteAgentParams, ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { ExecutionLogger } from '../lib/execution-logger';
import { InitializeMJProvider } from '../lib/mj-provider';
import { AgentInfo, ExecutionResult } from '../lib/output-formatter';
import { ConsoleManager } from '../lib/console-manager';
import { AgentProgressRenderer } from '../lib/progress-renderer';
import { AwaitWithDeadline, CANCELLATION_GRACE_MS, DeadlineOutcome } from '../lib/run-deadline';
import { AgentExecutionFacts, BuildAgentRunResult, BuildTimedOutResult } from '../lib/agent-run-result';

export interface AgentExecutionOptions {
  verbose?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /**
   * Stop waiting after this many milliseconds. The run is cancelled and the result is a failure
   * with `TimedOut` set, naming the run. Omit to wait for the agent framework's own limit.
   */
  timeout?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  conversationMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /**
   * Leave a Flow agent's workflow to the task-graph dispatcher instead of running its steps in this
   * process. The run returns as soon as the workflow is submitted, with status `Paused`, and the
   * workflow's output arrives later. Off by default. Other agent types ignore it.
   */
  Background?: boolean;
}

/** What a run reported about itself before it returned. */
interface RunTracking {
  /** Set when the runner reports the `MJ: AI Agent Runs` record it created. */
  AgentRunID?: string;
}

/** Everything about one execution that its outcome is reported against. */
interface ExecutionContext {
  AgentName: string;
  Prompt: string;
  StartTime: number;
  Logger: ExecutionLogger;
  Tracking: RunTracking;
  TimeoutMs?: number;
  Verbose: boolean;
}

export class AgentService {
  private initialized = false;
  private contextUser?: UserInfo;
  private metadata?: Metadata;

  async Initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await InitializeMJProvider();
      this.metadata = new Metadata(); // global-provider-ok: CLI tool, single-provider context
      this.contextUser = await this.getContextUser();
      this.initialized = true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // An already-formatted error (missing database settings, unreachable server) says what to
      // fix; prefixing it would bury that under a second headline.
      if (message.startsWith('❌')) {
        throw error instanceof Error ? error : new Error(message);
      }
      throw new Error(`Failed to initialize Agent Service: ${message || 'Unknown error'}`);
    }
  }

  /** @deprecated Use {@link Initialize}. */
  async initialize(): Promise<void> {
    return this.Initialize();
  }

  async ListAgents(): Promise<AgentInfo[]> {
    await this.ensureInitialized();

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJAIAgentEntityExtended>({
        EntityName: 'MJ: AI Agents',
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

  /** @deprecated Use {@link ListAgents}. */
  async listAgents(): Promise<AgentInfo[]> {
    return this.ListAgents();
  }

  async FindAgent(agentName: string): Promise<MJAIAgentEntityExtended | null> {
    await this.ensureInitialized();

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJAIAgentEntityExtended>({
        EntityName: 'MJ: AI Agents',
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

  /** @deprecated Use {@link FindAgent}. */
  async findAgent(agentName: string): Promise<MJAIAgentEntityExtended | null> {
    return this.FindAgent(agentName);
  }

  /**
   * Runs an agent once and reports the outcome.
   *
   * A Flow agent runs its steps in this process and returns its final output, as a Loop agent does,
   * unless `options.Background` asks for the task-graph dispatcher. The result names the agent run
   * (`AgentRunID`) and its final status, so `mj ai audit agent-run` can follow up.
   *
   * Nothing is written to stdout while the run executes: progress goes to stderr, and console output
   * from the framework is dropped (or, with `verbose`, sent to stderr). That keeps stdout for the
   * caller's rendering of the result, which under `--format json` must parse. A run abandoned after
   * a timeout can still log once this returns; a command that owns its process's stdout should route
   * `console` to stderr for good, as `mj ai agents run` does.
   *
   * @throws when the agent cannot be found or started. A run that starts and fails, or times out,
   *   is returned as a failed result rather than thrown.
   */
  async ExecuteAgent(
    agentName: string,
    prompt: string,
    options: AgentExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const context: ExecutionContext = {
      AgentName: agentName,
      Prompt: prompt,
      StartTime: Date.now(),
      Logger: new ExecutionLogger(`agents:run`, agentName, undefined, prompt),
      Tracking: {},
      TimeoutMs: options.timeout,
      Verbose: options.verbose === true,
    };
    const progress = new AgentProgressRenderer({ Verbose: context.Verbose });

    if (context.Verbose) {
      ConsoleManager.RedirectOutputToStderr();
    } else {
      ConsoleManager.SuppressOutput();
    }
    try {
      return await this.executeAgentWithLogging(options, progress, context);
    } finally {
      progress.Stop();
      ConsoleManager.RestoreOutput();
    }
  }

  private async executeAgentWithLogging(
    options: AgentExecutionOptions,
    progress: AgentProgressRenderer,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    try {
      if (!this.initialized) {
        progress.Status('Connecting to MemberJunction...');
      }
      await this.ensureInitialized();
      const agent = await this.findAgentOrThrow(context.AgentName, context.Logger);
      const outcome = await this.runAgentWithinTimeout(agent, context.Prompt, options, progress, context);
      progress.Finish();
      return this.reportOutcome(outcome, context);
    } catch (error: unknown) {
      progress.Finish();
      throw this.describeExecutionFailure(error, context);
    }
  }

  private async findAgentOrThrow(agentName: string, logger: ExecutionLogger): Promise<MJAIAgentEntityExtended> {
    logger.LogStep('INFO', 'SYSTEM', 'Finding agent', { agentName });
    const agent = await this.FindAgent(agentName);

    if (!agent) {
      const suggestions = await this.getSimilarAgentNames(agentName);
      const suggestionText = suggestions.length > 0
        ? `\n\nDid you mean one of these?\n${suggestions.map(s => `  - ${s}`).join('\n')}`
        : '';

      throw new Error(`❌ Agent not found: "${agentName}"

Problem: No agent exists with the specified name
Available agents: Use 'mj ai agents list' to see all agents${suggestionText}

Next steps:
1. Check the agent name spelling
2. Use 'mj ai agents list' to see available agents
3. Verify the agent is deployed and enabled`);
    }

    logger.LogStep('SUCCESS', 'SYSTEM', 'Agent found', { agentId: agent.ID, agentName: agent.Name });
    return agent;
  }

  /**
   * Starts the run and waits for it — for no longer than `options.timeout`, when one is set. On
   * the deadline the run is cancelled through the runner's cancellation token and given
   * {@link CANCELLATION_GRACE_MS} to stop and record that it was cancelled.
   */
  private async runAgentWithinTimeout(
    agent: MJAIAgentEntityExtended,
    prompt: string,
    options: AgentExecutionOptions,
    progress: AgentProgressRenderer,
    context: ExecutionContext
  ): Promise<DeadlineOutcome<ExecuteAgentResult>> {
    context.Logger.LogStep('INFO', 'AGENT', 'Starting agent execution', {
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      background: options.Background === true,
    });

    const cancellation = new AbortController();
    const run = new AgentRunner().RunAgent(
      this.buildRunParams(agent, prompt, options, progress, context.Tracking, cancellation.signal)
    );

    if (!options.timeout || options.timeout <= 0) {
      return { Kind: 'Finished', Value: await run };
    }

    const outcome = await AwaitWithDeadline(run, options.timeout, () =>
      cancellation.abort(`--timeout of ${options.timeout}ms elapsed`)
    );
    if (outcome.Kind === 'StillRunning') {
      this.reportLateFailure(run, context.Tracking);
    }
    return outcome;
  }

  private buildRunParams(
    agent: MJAIAgentEntityExtended,
    prompt: string,
    options: AgentExecutionOptions,
    progress: AgentProgressRenderer,
    tracking: RunTracking,
    cancellationToken: AbortSignal
  ): ExecuteAgentParams {
    return {
      agent,
      conversationMessages: this.buildConversationMessages(prompt, options.conversationMessages),
      contextUser: this.contextUser!,
      onProgress: (update) => progress.Update(update),
      onAgentRunCreated: (agentRunID: string) => {
        tracking.AgentRunID = agentRunID;
        progress.Status(`Agent run ${agentRunID} started`);
      },
      cancellationToken,
      // The framework's own wall-clock limit (two hours by default) would cut a longer --timeout
      // short. It is set just past ours, so ours fires first and names the timeout as the reason.
      maxExecutionTimeMs: options.timeout ? options.timeout + CANCELLATION_GRACE_MS : undefined,
      agentTypeParams: this.buildAgentTypeParams(options),
    };
  }

  /**
   * Asks a Flow agent to run its steps in this process.
   *
   * A top-level Flow run otherwise defaults to the task-graph dispatcher: it submits the workflow
   * and returns before any step has run, so the CLI printed "Started … I'll follow up when it
   * finishes" and nothing else. In-run execution walks the same graph, choosing paths with the same
   * engine, and returns the final payload. Only the Flow agent type reads `agentTypeParams`.
   * `dispatch` is never sent explicitly: leaving it out is how a top-level run gets it, and a
   * sub-agent asked for it is refused.
   */
  private buildAgentTypeParams(options: AgentExecutionOptions): FlowAgentExecuteParams | undefined {
    return options.Background ? undefined : { executionMode: 'inRun' };
  }

  /** The conversation so far (chat mode), with the new prompt as the last user message. */
  private buildConversationMessages(
    prompt: string,
    history: AgentExecutionOptions['conversationMessages']
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    return [...(history ?? []), { role: 'user' as const, content: prompt }];
  }

  /**
   * The run is still going after the command stopped waiting for it. If it fails before the
   * process exits, say so rather than losing the error.
   */
  private reportLateFailure(run: Promise<ExecuteAgentResult>, tracking: RunTracking): void {
    run.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Agent run ${tracking.AgentRunID ?? '(not recorded)'} failed after the command stopped waiting for it: ${message}\n`);
    });
  }

  /** Builds the result for a run that returned or timed out, and closes the execution log. */
  private reportOutcome(outcome: DeadlineOutcome<ExecuteAgentResult>, context: ExecutionContext): ExecutionResult {
    const facts: AgentExecutionFacts = {
      AgentName: context.AgentName,
      Prompt: context.Prompt,
      DurationMs: Date.now() - context.StartTime,
      ExecutionID: context.Logger.GetExecutionId(),
      LogFilePath: context.Logger.GetLogFilePath(),
    };

    const result = outcome.Kind === 'Finished'
      ? BuildAgentRunResult(outcome.Value, facts)
      : BuildTimedOutResult({
          TimeoutMs: context.TimeoutMs ?? 0,
          Run: outcome.Kind === 'StoppedAfterDeadline' ? outcome.Value : undefined,
          AgentRunID: context.Tracking.AgentRunID,
        }, facts);

    this.logOutcome(result, context.Logger);
    return result;
  }

  private logOutcome(result: ExecutionResult, logger: ExecutionLogger): void {
    if (result.success) {
      const resultContent = result.result;
      logger.LogStep('SUCCESS', 'AGENT', 'Agent execution completed', {
        agentRunId: result.AgentRunID,
        status: result.AgentRunStatus,
        result: typeof resultContent === 'string'
          ? resultContent.substring(0, 200) + (resultContent.length > 200 ? '...' : '')
          : resultContent,
      });
      logger.Finalize('SUCCESS', resultContent);
      return;
    }

    const errorMessage = result.error || 'Unknown execution error';
    logger.LogError(errorMessage, 'AGENT');
    logger.Finalize(result.TimedOut ? 'CANCELLED' : 'FAILED', undefined, errorMessage);
  }

  /**
   * Turns an error thrown while finding or starting the agent into the error the CLI shows. An
   * already-formatted error (it starts with ❌) is passed through unchanged.
   */
  private describeExecutionFailure(error: unknown, context: ExecutionContext): Error {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    context.Logger.LogError(error instanceof Error ? error : errorMessage, 'SYSTEM');
    context.Logger.Finalize('FAILED', undefined, errorMessage);

    if (errorMessage.startsWith('❌')) {
      return error instanceof Error ? error : new Error(errorMessage);
    }

    const runLine = context.Tracking.AgentRunID
      ? `\nAgent run: ${context.Tracking.AgentRunID} (inspect it with: mj ai audit agent-run ${context.Tracking.AgentRunID} --errors)`
      : '';
    const stackInfo = context.Verbose && stack ? `\n\nStack trace:\n${stack}` : '';

    return new Error(`❌ Agent execution failed

Problem: ${errorMessage}
Agent: ${context.AgentName}${runLine}
Context: Running agent with user prompt

Next steps:
1. Check the agent configuration and parameters
2. Verify required AI models are available
3. Review execution logs for detailed error information
4. Try with a simpler prompt to test basic functionality

Log file: ${context.Logger.GetLogFilePath()}${stackInfo}`);
  }

  /** @deprecated Use {@link ExecuteAgent}. */
  async executeAgent(
    agentName: string, 
    prompt: string, 
    options: AgentExecutionOptions = {}
  ): Promise<ExecutionResult> {
    return this.ExecuteAgent(agentName, prompt, options);
  }

  private async getSimilarAgentNames(searchName: string): Promise<string[]> {
    try {
      const agents = await this.ListAgents();
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
    const { UserCache } = await import('@memberjunction/generic-database-provider');
    
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
      await this.Initialize();
    }
  }
}