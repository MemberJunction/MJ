import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `querygen` domain (`mj querygen usage`). */
export default class QuerygenUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj querygen` command.';
  protected Domain = 'querygen';
}
