import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `update` domain (`mj update usage`). */
export default class UpdateUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj update` command.';
  protected Domain = 'update';
}
