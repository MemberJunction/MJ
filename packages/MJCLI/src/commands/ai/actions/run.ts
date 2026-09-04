import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import { AI_FORMAT_MAP, CANONICAL_FORMAT_FLAG, resolveLegacyFormat } from '../../../lib/format-compat.js';

export default class ActionsRun extends Command {
  static description = 'Execute an AI action with parameters';

  static examples = [
    '<%= config.bin %> <%= command.id %> -n "Get Weather" --param "Location=Boston"',
    '<%= config.bin %> <%= command.id %> -n "Get Stock Price" --param "Ticker=AAPL"',
    '<%= config.bin %> <%= command.id %> -n "Send Single Message" --param "To=user@example.com" --param "Subject=Test" --param "Body=Hello" --param "MessageType=Email" --param "Provider=SendGrid"',
    '<%= config.bin %> <%= command.id %> -n "Calculate Expression" --param "Expression=2+2*3" --dry-run',
  ];

  static flags = {
    name: Flags.string({
      char: 'n',
      description: 'Action name',
      required: true,
    }),
    param: Flags.string({
      char: 'p',
      description: 'Action parameters in key=value format',
      multiple: true,
    }),
    'dry-run': Flags.boolean({
      description: 'Validate without executing',
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
    const { ActionService, OutputFormatter } = await import('@memberjunction/ai-cli');

    const { flags, metadata } = await this.parse(ActionsRun);
    const service = new ActionService();
    const formatter = new OutputFormatter(resolveLegacyFormat({
        format: flags.format,
        legacy: flags.output as 'compact' | 'json' | 'table',
        legacyDefault: 'compact' as const,
        legacyWasExplicit: metadata.flags.output?.setFromDefault === false,
        map: AI_FORMAT_MAP,
      }));

    // Parse parameters
    const params: Record<string, string> = {};
    if (flags.param) {
      for (const param of flags.param) {
        const [key, ...valueParts] = param.split('=');
        if (!key || valueParts.length === 0) {
          this.error(`Invalid parameter format: "${param}". Use key=value format.`);
        }
        params[key] = valueParts.join('='); // Handle values with = in them
      }
    }

    try {
      if (flags['dry-run']) {
        // Route the dry run through the same formatter as a real run, so --format=json
        // describes the planned execution as data instead of a coloured paragraph.
        this.log(formatter.formatActionDryRun(flags.name, params));
      } else {
        // Execute action
        const spinner = ora();
        spinner.start(`Executing action: ${flags.name}`);

        const result = await service.executeAction(flags.name, {
          parameters: params,
          verbose: flags.verbose,
          timeout: flags.timeout
        });

        spinner.stop();
        this.log(formatter.formatActionResult(result));

        if (!result.success) {
          this.exit(1);
        }
      }
    } catch (error) {
      this.error(error as Error);
    }
  }
}