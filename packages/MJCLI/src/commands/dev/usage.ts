import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `dev` domain (`mj dev usage`). */
export default class DevUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj dev` command.';
  protected Domain = 'dev';
}
