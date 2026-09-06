import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `artifacts` domain (`mj artifacts usage`). */
export default class ArtifactsUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj artifacts` command.';
  protected Domain = 'artifacts';
}
