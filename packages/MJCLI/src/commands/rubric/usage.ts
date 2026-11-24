import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `rubric` domain (`mj rubric usage`). */
export default class RubricUsage extends DomainUsageCommand {
    static description = 'Show usage, flags, examples, and runtime hints for every `mj rubric` command.';
    protected Domain = 'rubric';
}
