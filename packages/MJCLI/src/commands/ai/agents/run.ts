import type { AgentService, ConversationService, ExecutionResult, OutputFormatter } from '@memberjunction/ai-cli';
import { Command, Flags } from '@oclif/core';
import { AI_FORMAT_MAP, CANONICAL_FORMAT_FLAG, ResolveLegacyFormat } from '../../../lib/format-compat.js';
import { FailOnNonInteractive, requireInteractive } from '../../../lib/interactive-guard.js';
import { CloseAIProvider, EndAICommand, RouteConsoleToStderr } from '../../../lib/ai-command-lifecycle.js';

export default class AgentsRun extends Command {
  static description = 'Execute an AI agent with a prompt or start interactive chat';

  static examples = [
    '<%= config.bin %> <%= command.id %> -a "Skip: Requirements Expert" -p "Create a dashboard for sales metrics"',
    '<%= config.bin %> <%= command.id %> -a "Child Component Generator Sub-agent" --chat',
    '<%= config.bin %> <%= command.id %> -a "Skip: Technical Design Expert" -p "Build a React component" --verbose --timeout=600000',
    '<%= config.bin %> <%= command.id %> -a "Lead Intake Flow" -p "Process the new leads" --format json',
    '<%= config.bin %> <%= command.id %> -a "Lead Intake Flow" -p "Process the new leads" --background',
  ];

  static flags = {
    agent: Flags.string({
      char: 'a',
      description: 'Agent name',
      required: true,
    }),
    prompt: Flags.string({
      char: 'p',
      description: 'Prompt to execute',
      exclusive: ['chat'],
    }),
    chat: Flags.boolean({
      char: 'c',
      description: 'Start interactive chat mode',
      exclusive: ['prompt'],
    }),
    format: CANONICAL_FORMAT_FLAG,
    output: Flags.string({
      char: 'o',
      description:
        "Output format (legacy alias for --format in the 'mj ai' family; elsewhere -o is an output FILE path). "
        + 'Prefer --format.',
      options: ['compact', 'json', 'table'],
      default: 'compact',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show detailed execution information',
    }),
    timeout: Flags.integer({
      description:
        'How long to wait for the run, in milliseconds. When it elapses the run is cancelled and the command '
        + 'fails, naming the run ID so you can inspect it with `mj ai audit agent-run`.',
      default: 300000, // 5 minutes
      min: 1000,
    }),
    background: Flags.boolean({
      description:
        "For a Flow agent: submit its workflow to the task-graph dispatcher and return at once (the run stays "
        + "'Paused' until the dispatcher finishes it) instead of running every step here and printing the final "
        + 'output. Other agent types are unaffected.',
      default: false,
      exclusive: ['chat'],
    }),
  };

  async run(): Promise<void> {
    const { flags, metadata } = await this.parse(AgentsRun);

    if (!flags.prompt && !flags.chat) {
      this.error('Either --prompt or --chat flag is required');
    }

    // --chat is a REPL that reads stdin turn by turn: interactive by nature, with no
    // flag that could stand in for the conversation. Spawned or piped it would sit on
    // stdin forever, so refuse before loading anything and name the flag that does work
    // headlessly. Checked here — ahead of the service import — so the refusal costs
    // nothing and cannot be mistaken for a startup failure.
    if (flags.chat) {
      try {
        requireInteractive(
          'Interactive chat mode',
          'Use --prompt "<your prompt>" for a single non-interactive execution, or re-run --chat at an interactive terminal.'
        );
      } catch (error) {
        FailOnNonInteractive(this, error);
      }
    } else {
      // stdout is this command's result. Framework logging — including from a run abandoned after
      // --timeout — goes to stderr, so --format json stays parseable.
      RouteConsoleToStderr();
    }

    // Deferred: @memberjunction/ai-cli loads every AI provider and the agent framework, a cost only
    // the `mj ai` commands should pay (category 3 of the dynamic-import rule).
    const aiCli = await import('@memberjunction/ai-cli');
    const outputFormat = ResolveLegacyFormat({
      Format: flags.format,
      Legacy: flags.output as 'compact' | 'json' | 'table',
      LegacyDefault: 'compact' as const,
      LegacyWasExplicit: metadata.flags.output?.setFromDefault === false,
      Map: AI_FORMAT_MAP,
    });
    const formatter = new aiCli.OutputFormatter(outputFormat);
    const startTime = Date.now();
    // oclif leaves a boolean flag without a default undefined when it is not passed.
    const verbose = flags.verbose === true;

    let exitCode: number;
    try {
      exitCode = flags.chat
        ? await this.runChat(new aiCli.ConversationService(), flags.agent, verbose, flags.timeout)
        : await this.runOnce(new aiCli.AgentService(), formatter, flags.agent, flags.prompt!, {
            verbose,
            timeout: flags.timeout,
            Background: flags.background,
          });
    } catch (error) {
      await CloseAIProvider(aiCli.CloseMJProvider);
      if (outputFormat !== 'json') {
        this.error(error as Error);
      }
      // A caller asking for JSON parses stdout, so a failure has to arrive there as JSON too. The
      // exit code is the 2 that `this.error` gives the same failure outside --format json; a run
      // that returned a failed result exits 1.
      this.log(formatter.FormatAgentResult(this.describeThrownFailure(error, flags.agent, flags.prompt, startTime)));
      exitCode = 2;
    }

    await EndAICommand(aiCli.CloseMJProvider, exitCode);
  }

  /** Runs the agent once and prints the result. Returns the exit code. */
  private async runOnce(
    service: AgentService,
    formatter: OutputFormatter,
    agentName: string,
    prompt: string,
    options: { verbose: boolean; timeout: number; Background: boolean }
  ): Promise<number> {
    // No spinner: the service draws its own progress line on stderr, and two animations on one
    // terminal line garble each other.
    const result = await service.ExecuteAgent(agentName, prompt, options);
    this.log(formatter.FormatAgentResult(result));
    return result.success ? 0 : 1;
  }

  private async runChat(service: ConversationService, agentName: string, verbose: boolean, timeout: number): Promise<number> {
    await service.StartChat(agentName, undefined, { verbose, timeout });
    return 0;
  }

  /** The `--format json` rendering of an error thrown before the run produced a result. */
  private describeThrownFailure(error: unknown, agentName: string, prompt: string | undefined, startTime: number): ExecutionResult {
    return {
      success: false,
      entityName: agentName,
      prompt,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}
