import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `bump` domain (`mj bump usage`). */
export default class BumpUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj bump` command.';
  protected Domain = 'bump';
}
