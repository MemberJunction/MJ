import { Args, Command, Flags } from '@oclif/core';
import { HarnessAccountPoolService } from '@memberjunction/ai-agent-harness';
import {
    BuildInteractiveLoginEnv,
    BuildPoolOptionsFromFlag,
    FormatSlotIsolationInstructions,
    RunInteractiveCliLogin,
    type InteractiveLoginRunner,
} from '../../../lib/harness-account.js';

export default class HarnessAccountLogin extends Command {
    static description =
        'Re-run interactive CLI login for an existing account slot and clear any active quota cooldown';

    static examples = [
        '<%= config.bin %> <%= command.id %> claude-pro-2',
        '<%= config.bin %> <%= command.id %> os-default-agy',
    ];

    static args = {
        slotId: Args.string({
            description: 'Slot ID to authenticate (see `mj harness account list`)',
            required: true,
        }),
    };

    static flags = {
        'pool-dir': Flags.string({
            description: 'Override account pool storage directory',
        }),
    };

    /** Overridable runner hook for deterministic unit tests. */
    public static LoginRunner: InteractiveLoginRunner = RunInteractiveCliLogin;

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(HarnessAccountLogin);
        const poolOpts = BuildPoolOptionsFromFlag(flags['pool-dir']);
        const service = HarnessAccountPoolService.Instance;

        const slot = service.GetSlot(args.slotId, poolOpts);
        if (!slot) {
            this.error(
                `Account slot '${args.slotId}' not found. Run \`mj harness account list\` to inspect available slots.`,
                { exit: 1 },
            );
        }

        const envOverrides = service.BuildSlotEnvOverrides(slot, poolOpts, true);
        for (const line of FormatSlotIsolationInstructions(slot.vendor, slot.slotId, slot.slotDir, envOverrides)) {
            this.log(line);
        }

        const loginSpec = service.GetInteractiveLoginCommand(slot.vendor);
        this.log(`\nLaunching interactive login: ${loginSpec.displayCommand}\n`);
        const loginEnv = BuildInteractiveLoginEnv(envOverrides);
        const outcome = HarnessAccountLogin.LoginRunner(loginSpec, loginEnv);
        if (outcome.Error) {
            this.error(`Failed to launch '${loginSpec.command}': ${outcome.Error.message}`, { exit: 1 });
        }
        if (outcome.Status !== 0) {
            this.error(`Interactive login exited with status ${outcome.Status ?? 'unknown'}.`, { exit: 1 });
        }

        service.ClearSlotCooldown(slot.slotId, poolOpts);
        const auth = service.ProbeSlotAuthStatus(slot, poolOpts);
        this.log(
            `Slot '${slot.slotId}' login completed (auth: ${auth.statusLabel}${
                auth.indicatorPath ? `, indicator: ${auth.indicatorPath}` : ''
            }); cooldown cleared.`,
        );
    }
}
