import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `query` domain (`mj query usage`). */
export default class QueryUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj query` command.';
  protected Domain = 'query';
}
