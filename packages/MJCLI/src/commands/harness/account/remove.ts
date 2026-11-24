import { Args, Command, Flags } from '@oclif/core';
import { HarnessAccountPoolService } from '@memberjunction/ai-agent-harness';
import { BuildPoolOptionsFromFlag } from '../../../lib/harness-account.js';

export default class HarnessAccountRemove extends Command {
    static description = 'Remove an enrolled CLI subscription account slot from the pool';

    static examples = [
        '<%= config.bin %> <%= command.id %> claude-pro-2',
        '<%= config.bin %> <%= command.id %> claude-pro-2 --purge-files',
    ];

    static args = {
        slotId: Args.string({
            description: 'Enrolled slot ID to remove',
            required: true,
        }),
    };

    static flags = {
        'purge-files': Flags.boolean({
            description: 'Also delete the isolated slot directory under the pool root',
            default: false,
        }),
        'pool-dir': Flags.string({
            description: 'Override account pool storage directory',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(HarnessAccountRemove);
        const poolOpts = BuildPoolOptionsFromFlag(flags['pool-dir']);
        const service = HarnessAccountPoolService.Instance;

        let removed: boolean;
        try {
            removed = service.RemoveSlot(
                args.slotId,
                { purgeFiles: flags['purge-files'] },
                poolOpts,
            );
        } catch (err) {
            this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
        }

        if (!removed) {
            this.error(`Account slot '${args.slotId}' not found.`, { exit: 1 });
        }

        this.log(
            `Removed slot '${args.slotId}' from ${service.GetPoolFilePath(poolOpts)}` +
                (flags['purge-files'] ? ' and purged its isolated slot directory.' : '.'),
        );
    }
}
