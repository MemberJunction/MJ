import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `dbdoc` domain (`mj dbdoc usage`). */
export default class DbdocUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj dbdoc` command.';
  protected Domain = 'dbdoc';
}
