import { Command, Flags } from '@oclif/core';
import { CLIPluginRegistry } from '@memberjunction/cli-core';
import { loadAllCliPlugins } from './cli-plugins.js';
import { emitUsage, renderDomainDetail } from './usage-render.js';

/**
 * Shared base for tier-2 usage commands (`mj <domain> usage`). Concrete
 * subclasses under `commands/<domain>/usage.ts` set {@link Domain}. Returns every
 * command in that domain — summary, flags, examples, runtime — composed from the
 * registered plugins' `static Usage` (plan §5).
 */
export abstract class DomainUsageCommand extends Command {
  static flags = {
    format: Flags.string({ options: ['text', 'json', 'md'], default: 'text', description: 'Output format' }),
  };

  /** The domain this command documents (e.g. 'sync', 'codegen'). */
  protected abstract Domain: string;

  async run(): Promise<void> {
    const { flags } = await this.parse(this.constructor as typeof DomainUsageCommand);
    await loadAllCliPlugins(process.cwd());
    const detail = CLIPluginRegistry.BuildDomainDetail(this.Domain);
    const result = CLIPluginRegistry.AsResult(`${this.Domain}:usage`, { domain: detail.domain, commands: detail.commands });
    emitUsage((m) => this.log(m), flags.format as string, result, renderDomainDetail(detail));
  }
}
