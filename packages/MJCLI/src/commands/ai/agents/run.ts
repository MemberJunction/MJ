import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import chalk from 'chalk';
import { AI_FORMAT_MAP, CANONICAL_FORMAT_FLAG, resolveLegacyFormat } from '../../../lib/format-compat.js';
import { failOnNonInteractive, requireInteractive } from '../../../lib/interactive-guard.js';

export default class AgentsRun extends Command {
  static description = 'Execute an AI agent with a prompt or start interactive chat';

  static examples = [
    '<%= config.bin %> <%= command.id %> -a "Skip: Requirements Expert" -p "Create a dashboard for sales metrics"',
    '<%= config.bin %> <%= command.id %> -a "Child Component Generator Sub-agent" --chat',
    '<%= config.bin %> <%= command.id %> -a "Skip: Technical Design Expert" -p "Build a React component" --verbose --timeout=600000',
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
      description: 'Execution timeout in milliseconds',
      default: 300000, // 5 minutes
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
        failOnNonInteractive(this, error);
      }
    }

    const { AgentService, OutputFormatter, ConversationService } = await import('@memberjunction/ai-cli');

    const service = new AgentService();
    const formatter = new OutputFormatter(resolveLegacyFormat({
        format: flags.format,
        legacy: flags.output as 'compact' | 'json' | 'table',
        legacyDefault: 'compact' as const,
        legacyWasExplicit: metadata.flags.output?.setFromDefault === false,
        map: AI_FORMAT_MAP,
      }));

    try {
      if (flags.chat) {
        const conversationService = new ConversationService();
        await conversationService.startChat(flags.agent, undefined, {
          verbose: flags.verbose,
          timeout: flags.timeout,
        });
      } else {
        // Single prompt execution
        const spinner = ora();
        spinner.start(`Executing agent: ${flags.agent}`);

        const result = await service.executeAgent(flags.agent, flags.prompt!, {
          verbose: flags.verbose,
          timeout: flags.timeout,
        });

        spinner.stop();
        this.log(formatter.formatAgentResult(result));

        if (!result.success) {
          this.exit(1);
        }
      }
    } catch (error) {
      this.error(error as Error);
    }
  }
}