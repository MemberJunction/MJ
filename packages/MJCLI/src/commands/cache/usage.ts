import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `cache` domain (`mj cache usage`). */
export default class CacheUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj cache` command.';
  protected Domain = 'cache';
}
