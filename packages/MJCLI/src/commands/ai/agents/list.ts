import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import { AI_FORMAT_MAP, CANONICAL_FORMAT_FLAG, resolveLegacyFormat } from '../../../lib/format-compat.js';

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
    const { AgentService, OutputFormatter } = await import('@memberjunction/ai-cli');

    const { flags, metadata } = await this.parse(AgentsList);
    const spinner = ora();

    try {
      spinner.start('Loading available agents...');
      const service = new AgentService();
      const agents = await service.listAgents();
      spinner.stop();

      const formatter = new OutputFormatter(resolveLegacyFormat({
        format: flags.format,
        legacy: flags.output as 'compact' | 'json' | 'table',
        legacyDefault: 'compact' as const,
        legacyWasExplicit: metadata.flags.output?.setFromDefault === false,
        map: AI_FORMAT_MAP,
      }));
      this.log(formatter.formatAgentList(agents));
      
      // Force exit after completion
      process.exit(0);
    } catch (error) {
      spinner.fail('Failed to load agents');
      this.error(error as Error);
    }
  }
}