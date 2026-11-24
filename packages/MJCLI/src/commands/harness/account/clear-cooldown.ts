import { Args, Command, Flags } from '@oclif/core';
import { HarnessAccountPoolService } from '@memberjunction/ai-agent-harness';
import { BuildPoolOptionsFromFlag } from '../../../lib/harness-account.js';

export default class HarnessAccountClearCooldown extends Command {
    static description = 'Clear active quota/rate-limit cooldown state on a CLI account slot';

    static examples = [
        '<%= config.bin %> <%= command.id %> claude-pro-2',
        '<%= config.bin %> <%= command.id %> os-default-claude',
    ];

    static args = {
        slotId: Args.string({
            description: 'Slot ID whose cooldown should be cleared',
            required: true,
        }),
    };

    static flags = {
        'pool-dir': Flags.string({
            description: 'Override account pool storage directory',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(HarnessAccountClearCooldown);
        const poolOpts = BuildPoolOptionsFromFlag(flags['pool-dir']);
        const service = HarnessAccountPoolService.Instance;

        const updated = service.ClearSlotCooldown(args.slotId, poolOpts);
        if (!updated) {
            this.error(`Account slot '${args.slotId}' not found.`, { exit: 1 });
        }
        this.log(`Cleared cooldown on slot '${updated.slotId}' (${updated.vendor}).`);
    }
}
