import { Args, Command, Flags } from '@oclif/core';
import { HarnessAccountPoolService } from '@memberjunction/ai-agent-harness';
import { BuildPoolOptionsFromFlag } from '../../../lib/harness-account.js';

export default class HarnessAccountDisable extends Command {
    static description = 'Disable a CLI subscription account slot without deleting its credentials';

    static examples = [
        '<%= config.bin %> <%= command.id %> claude-pro-2',
        '<%= config.bin %> <%= command.id %> os-default-claude',
    ];

    static args = {
        slotId: Args.string({
            description: 'Slot ID to disable',
            required: true,
        }),
    };

    static flags = {
        'pool-dir': Flags.string({
            description: 'Override account pool storage directory',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(HarnessAccountDisable);
        const poolOpts = BuildPoolOptionsFromFlag(flags['pool-dir']);
        const service = HarnessAccountPoolService.Instance;

        try {
            const slot = service.SetSlotEnabled(args.slotId, false, poolOpts);
            this.log(`Disabled slot '${slot.slotId}' (${slot.vendor}).`);
        } catch (err) {
            this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
        }
    }
}
