import { Command, Flags } from '@oclif/core';
import { CLIPluginRegistry } from '@memberjunction/cli-core';
import { loadAllCliPlugins } from '../lib/cli-plugins.js';
import { emitUsage, renderDomainMap } from '../lib/usage-render.js';

/**
 * Tier-1 progressive disclosure (plan §5, the linearis model). Returns a compact
 * domain map — each domain + one-line summary + runtime class — so an agent
 * discovers the CLI's surface in ~200 tokens instead of pulling the full ~13k
 * command tree. The guidance string tells the agent to run `mj <domain> usage`
 * before invoking, rather than guessing flags.
 */
export default class Usage extends Command {
  static description = 'List mj command domains (AI-agent-friendly, tier-1 progressive disclosure). Then run `mj <domain> usage`.';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --format=json`,
  ];

  static flags = {
    format: Flags.string({ options: ['text', 'json', 'md'], default: 'text', description: 'Output format' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Usage);
    await loadAllCliPlugins(process.cwd());
    const map = CLIPluginRegistry.BuildDomainMap();
    const result = CLIPluginRegistry.AsResult('usage', { guidance: map.guidance, domains: map.domains });
    emitUsage((m) => this.log(m), flags.format as string, result, renderDomainMap(map));
  }
}
