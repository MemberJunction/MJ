import { Args, Command, Flags } from '@oclif/core';
import { HarnessAccountPoolService } from '@memberjunction/ai-agent-harness';
import { BuildPoolOptionsFromFlag } from '../../../lib/harness-account.js';

export default class HarnessAccountEnable extends Command {
    static description = 'Enable a CLI subscription account slot for automatic balancing';

    static examples = [
        '<%= config.bin %> <%= command.id %> claude-pro-2',
        '<%= config.bin %> <%= command.id %> os-default-claude',
    ];

    static args = {
        slotId: Args.string({
            description: 'Slot ID to enable',
            required: true,
        }),
    };

    static flags = {
        'pool-dir': Flags.string({
            description: 'Override account pool storage directory',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(HarnessAccountEnable);
        const poolOpts = BuildPoolOptionsFromFlag(flags['pool-dir']);
        const service = HarnessAccountPoolService.Instance;

        try {
            const slot = service.SetSlotEnabled(args.slotId, true, poolOpts);
            this.log(`Enabled slot '${slot.slotId}' (${slot.vendor}).`);
        } catch (err) {
            this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
        }
    }
}
