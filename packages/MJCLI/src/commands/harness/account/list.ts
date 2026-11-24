import { Command, Flags } from '@oclif/core';
import { HarnessAccountPoolService } from '@memberjunction/ai-agent-harness';
import {
    BuildPoolOptionsFromFlag,
    FormatHarnessAccountTable,
    RequireHarnessVendor,
    type HarnessAccountListJsonOutput,
} from '../../../lib/harness-account.js';

export default class HarnessAccountList extends Command {
    static description =
        'List enrolled and OS-default CLI subscription account slots, auth status, active leases, cooldowns, and balancing strategy';

    static examples = [
        '<%= config.bin %> <%= command.id %>',
        '<%= config.bin %> <%= command.id %> --vendor claude',
        '<%= config.bin %> <%= command.id %> --json',
    ];

    static flags = {
        vendor: Flags.string({
            char: 'v',
            description: 'Filter by vendor (claude, agy, codex, gemini)',
        }),
        json: Flags.boolean({
            description: 'Print machine-readable JSON instead of a table',
            default: false,
        }),
        'pool-dir': Flags.string({
            description: 'Override account pool storage directory (default: MJ_HARNESS_ACCOUNT_POOL_DIR or ~/.mj/harness-accounts)',
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(HarnessAccountList);
        const poolOpts = BuildPoolOptionsFromFlag(flags['pool-dir']);
        const service = HarnessAccountPoolService.Instance;

        let vendorFilter: string | undefined;
        if (flags.vendor) {
            try {
                vendorFilter = RequireHarnessVendor(flags.vendor);
            } catch (err) {
                this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
            }
        }

        const pool = service.LoadPool(poolOpts);
        const slots = service.ListSlots({ vendor: vendorFilter }, poolOpts);
        const poolDir = service.GetPoolDir(poolOpts);

        if (flags.json) {
            const payload: HarnessAccountListJsonOutput = {
                PoolDir: poolDir,
                Strategy: pool.strategy,
                IncludeOsDefaultLogin: pool.includeOsDefaultLogin,
                Slots: slots,
            };
            this.log(JSON.stringify(payload, null, 2));
            return;
        }

        this.log(
            FormatHarnessAccountTable(poolDir, pool.strategy, pool.includeOsDefaultLogin, slots),
        );
    }
}
