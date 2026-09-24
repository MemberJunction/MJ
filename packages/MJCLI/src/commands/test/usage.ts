import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `test` domain (`mj test usage`). */
export default class TestUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj test` command.';
  protected Domain = 'test';
}
