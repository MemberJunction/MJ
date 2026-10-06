import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `clean` domain (`mj clean usage`). */
export default class CleanUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj clean` command.';
  protected Domain = 'clean';
}
