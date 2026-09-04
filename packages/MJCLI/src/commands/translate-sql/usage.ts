import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `translate-sql` domain (`mj translate-sql usage`). */
export default class TranslateSqlUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj translate-sql` command.';
  protected Domain = 'translate-sql';
}
