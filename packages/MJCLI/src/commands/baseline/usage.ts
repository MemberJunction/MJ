import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `baseline` domain (`mj baseline usage`). */
export default class BaselineUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj baseline` command.';
  protected Domain = 'baseline';
}
