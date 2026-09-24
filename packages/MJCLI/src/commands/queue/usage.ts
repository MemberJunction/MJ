import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `queue` domain (`mj queue usage`). */
export default class QueueUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj queue` command.';
  protected Domain = 'queue';
}
