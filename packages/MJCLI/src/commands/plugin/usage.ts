import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `plugin` domain (`mj plugin usage`). */
export default class PluginUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj plugin` command.';
  protected Domain = 'plugin';
}
