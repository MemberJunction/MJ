import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `sql-convert` domain (`mj sql-convert usage`). */
export default class SqlConvertUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj sql-convert` command.';
  protected Domain = 'sql-convert';
}
