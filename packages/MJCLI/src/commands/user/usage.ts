import { DomainUsageCommand } from '../../lib/domain-usage-command.js';

/** Tier-2 usage for the `user` domain (`mj user usage`). */
export default class UserUsage extends DomainUsageCommand {
    static description = 'Show usage, flags, examples, and runtime hints for every `mj user` command.';
    protected Domain = 'user';
}
