import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import { AI_FORMAT_MAP, CANONICAL_FORMAT_FLAG, ResolveLegacyFormat } from '../../../lib/format-compat.js';
import { CloseAIProvider, EndAICommand, RouteConsoleToStderr } from '../../../lib/ai-command-lifecycle.js';

export default class AgentsList extends Command {
  static description = 'List available AI agents';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --output=table',
    '<%= config.bin %> <%= command.id %> --output=json',
  ];

  static flags = {
    format: CANONICAL_FORMAT_FLAG,
    output: Flags.string({
      char: 'o',
      description:
        "Output format (legacy alias for --format in the 'mj ai' family; elsewhere -o is an output FILE path). "
        + 'Prefer --format.',
      options: ['compact', 'json', 'table'],
      default: 'compact',
    }),
  };

  async run(): Promise<void> {
    // stdout is this command's result; framework logging goes to stderr so --format json parses.
    RouteConsoleToStderr();
    const { AgentService, OutputFormatter, CloseMJProvider } = await import('@memberjunction/ai-cli');

    const { flags, metadata } = await this.parse(AgentsList);
    const spinner = ora();

    try {
      spinner.start('Loading available agents...');
      const service = new AgentService();
      const agents = await service.listAgents();
      spinner.stop();

      const formatter = new OutputFormatter(ResolveLegacyFormat({
        Format: flags.format,
        Legacy: flags.output as 'compact' | 'json' | 'table',
        LegacyDefault: 'compact' as const,
        LegacyWasExplicit: metadata.flags.output?.setFromDefault === false,
        Map: AI_FORMAT_MAP,
      }));
      this.log(formatter.formatAgentList(agents));
    } catch (error) {
      spinner.fail('Failed to load agents');
      await CloseAIProvider(CloseMJProvider);
      this.error(error as Error);
    }

    // Close the pool instead of process.exit(): exiting at once could cut a piped list short.
    await EndAICommand(CloseMJProvider, 0);
  }
}