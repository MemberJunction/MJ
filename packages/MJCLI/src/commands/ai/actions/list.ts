import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import { AI_FORMAT_MAP, CANONICAL_FORMAT_FLAG, resolveLegacyFormat } from '../../../lib/format-compat.js';

export default class ActionsList extends Command {
  static description = 'List available AI actions';

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
    const { ActionService, OutputFormatter } = await import('@memberjunction/ai-cli');

    const { flags, metadata } = await this.parse(ActionsList);
    const spinner = ora();

    try {
      spinner.start('Loading available actions...');
      const service = new ActionService();
      const actions = await service.listActions();
      spinner.stop();

      const formatter = new OutputFormatter(resolveLegacyFormat({
        format: flags.format,
        legacy: flags.output as 'compact' | 'json' | 'table',
        legacyDefault: 'compact' as const,
        legacyWasExplicit: metadata.flags.output?.setFromDefault === false,
        map: AI_FORMAT_MAP,
      }));
      this.log(formatter.formatActionList(actions));
      
      // Force exit after completion
      process.exit(0);
    } catch (error) {
      spinner.fail('Failed to load actions');
      this.error(error as Error);
    }
  }
}