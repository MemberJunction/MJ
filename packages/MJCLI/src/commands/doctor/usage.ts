import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `doctor` domain (`mj doctor usage`). */
export default class DoctorUsage extends DomainUsageCommand {
  static description = 'Show usage, flags, examples, and runtime hints for every `mj doctor` command.';
  protected Domain = 'doctor';
}
