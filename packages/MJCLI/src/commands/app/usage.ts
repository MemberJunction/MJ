import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `app` domain (`mj app usage`). */
export default class AppUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj app` command.';
  protected Domain = 'app';
}
