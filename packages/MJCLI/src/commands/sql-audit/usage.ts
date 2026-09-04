import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `sql-audit` domain (`mj sql-audit usage`). */
export default class SqlAuditUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj sql-audit` command.';
  protected Domain = 'sql-audit';
}
