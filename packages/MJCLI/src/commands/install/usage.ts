import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `install` domain (`mj install usage`). */
export default class InstallUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj install` command.';
  protected Domain = 'install';
}
