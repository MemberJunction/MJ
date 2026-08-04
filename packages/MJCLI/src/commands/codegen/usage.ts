import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `codegen` domain (`mj codegen usage`). */
export default class CodeGenUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for `mj codegen`.';
  protected Domain = 'codegen';
}
