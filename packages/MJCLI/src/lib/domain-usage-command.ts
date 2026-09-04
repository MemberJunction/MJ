import { Command, Flags } from '@oclif/core';
import { CLIPluginRegistry, ResolveOutputFormat } from '@memberjunction/cli-core';
import { loadAllCliPlugins } from './cli-plugins.js';
import { emitUsage, renderDomainDetail } from './usage-render.js';
import type { OclifCommandShape } from './derived-usage.js';

/**
 * Shared base for tier-2 usage commands (`mj <domain> usage`). Concrete
 * subclasses under `commands/<domain>/usage.ts` set {@link Domain}. Returns every
 * command in that domain — summary, flags, examples, runtime — composed from the
 * registered plugins' `static Usage` (plan §5).
 */
export abstract class DomainUsageCommand extends Command {
  static flags = {
    // No default: the absence of a value is what lets a piped stdout select json.
    format: Flags.string({
      options: ['text', 'json', 'md'],
      description: 'Output format. Defaults to text on a terminal and json when stdout is piped.',
    }),
  };

  /** The domain this command documents (e.g. 'sync', 'codegen'). */
  protected abstract Domain: string;

  async run(): Promise<void> {
    const { flags } = await this.parse(this.constructor as typeof DomainUsageCommand);
    await loadAllCliPlugins(process.cwd(), this.config.commands as unknown as OclifCommandShape[]);
    const detail = CLIPluginRegistry.BuildDomainDetail(this.Domain);
    const result = CLIPluginRegistry.AsResult(`${this.Domain}:usage`, { domain: detail.domain, commands: detail.commands });
    const { format } = ResolveOutputFormat({ formatFlag: flags.format });
    emitUsage((m) => this.log(m), format, result, renderDomainDetail(detail));
  }
}
