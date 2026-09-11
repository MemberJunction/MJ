import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `ai` domain (`mj ai usage`). */
export default class AiUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj ai` command.';
  protected Domain = 'ai';
}
