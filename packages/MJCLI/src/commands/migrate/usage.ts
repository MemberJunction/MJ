import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `migrate` domain (`mj migrate usage`). */
export default class MigrateUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj migrate` command.';
  protected Domain = 'migrate';
}
