import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `sync` domain (`mj sync usage`). */
export default class SyncUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj sync` command.';
  protected Domain = 'sync';
}
