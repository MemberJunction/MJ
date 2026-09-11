import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `standards` domain (`mj standards usage`). */
export default class StandardsUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj standards` command.';
  protected Domain = 'standards';
}
