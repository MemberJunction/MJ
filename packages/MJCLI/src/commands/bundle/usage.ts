import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `bundle` domain (`mj bundle usage`). */
export default class BundleUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj bundle` command.';
  protected Domain = 'bundle';
}
