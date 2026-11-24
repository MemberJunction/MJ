import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `harness` domain (`mj harness usage`). */
export default class HarnessUsage extends DomainUsageCommand {
    static description = 'Show usage, flags, examples, and runtime hints for every `mj harness` command.';
    protected Domain = 'harness';
}
