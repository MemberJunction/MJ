import { Args, Command, Flags } from '@oclif/core';
import { HarnessAccountPoolService } from '@memberjunction/ai-agent-harness';
import {
    BuildInteractiveLoginEnv,
    BuildPoolOptionsFromFlag,
    FormatSlotIsolationInstructions,
    RequireHarnessVendor,
    RunInteractiveCliLogin,
    type InteractiveLoginRunner,
} from '../../../lib/harness-account.js';

export default class HarnessAccountAdd extends Command {
    static description =
        'Enroll a new isolated CLI subscription account slot and optionally run its interactive login flow';

    static examples = [
        '<%= config.bin %> <%= command.id %> claude --label "Pro #2" --weight 2 --priority 50',
        '<%= config.bin %> <%= command.id %> agy --label "Team Seat"',
        '<%= config.bin %> <%= command.id %> codex --label "Codex #2" --no-login',
        '<%= config.bin %> <%= command.id %> gemini --label "Gemini Alt"',
    ];

    static args = {
        vendor: Args.string({
            description: 'CLI vendor (claude, agy, codex, gemini; aliases: claude-code, antigravity, openai-codex, gemini-cli)',
            required: true,
        }),
    };

    static flags = {
        label: Flags.string({
            char: 'l',
            description: 'Human-friendly label for this account slot',
        }),
        'slot-id': Flags.string({
            description: 'Optional explicit slot ID (auto-generated from vendor + label when omitted)',
        }),
        weight: Flags.integer({
            char: 'w',
            description: 'Relative balancing weight (>= 1, default 1)',
            default: 1,
        }),
        priority: Flags.integer({
            char: 'p',
            description: 'Failover priority (lower number = higher priority, default 100)',
            default: 100,
        }),
        'no-login': Flags.boolean({
            description: 'Create the isolated slot directory and register it without launching interactive login',
            default: false,
        }),
        'oauth-token': Flags.string({
            description: 'Optional OAuth setup token value (e.g. CLAUDE_CODE_OAUTH_TOKEN) stored on the slot',
        }),
        'pool-dir': Flags.string({
            description: 'Override account pool storage directory',
        }),
    };

    /** Overridable runner hook for deterministic unit tests. */
    public static LoginRunner: InteractiveLoginRunner = RunInteractiveCliLogin;

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(HarnessAccountAdd);
        const poolOpts = BuildPoolOptionsFromFlag(flags['pool-dir']);
        const service = HarnessAccountPoolService.Instance;

        let vendor;
        try {
            vendor = RequireHarnessVendor(args.vendor);
        } catch (err) {
            this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
        }

        if (flags.weight < 1) {
            this.error('--weight must be an integer >= 1.', { exit: 1 });
        }

        let slot;
        try {
            slot = service.AddSlot(
                {
                    vendor,
                    label: flags.label,
                    slotId: flags['slot-id'],
                    weight: flags.weight,
                    priority: flags.priority,
                    oauthTokenEnvValue: flags['oauth-token'],
                },
                poolOpts,
            );
        } catch (err) {
            this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
        }

        const envOverrides = service.BuildSlotEnvOverrides(slot, poolOpts, true);
        for (const line of FormatSlotIsolationInstructions(vendor, slot.slotId, slot.slotDir, envOverrides)) {
            this.log(line);
        }

        if (!flags['no-login']) {
            const loginSpec = service.GetInteractiveLoginCommand(vendor);
            this.log(`\nLaunching interactive login: ${loginSpec.displayCommand}\n`);
            const loginEnv = BuildInteractiveLoginEnv(envOverrides);
            const outcome = HarnessAccountAdd.LoginRunner(loginSpec, loginEnv);
            if (outcome.Error) {
                this.warn(
                    `Could not launch '${loginSpec.command}': ${outcome.Error.message}. ` +
                        `Run \`mj harness account login ${slot.slotId}\` once the CLI is installed.`,
                );
            } else if (outcome.Status !== 0) {
                this.warn(
                    `Interactive login command exited with status ${outcome.Status ?? 'unknown'}. ` +
                        `You can retry with \`mj harness account login ${slot.slotId}\`.`,
                );
            }
        }

        const auth = service.ProbeSlotAuthStatus(slot, poolOpts);
        this.log(
            `\nSlot '${slot.slotId}' saved in ${service.GetPoolFilePath(poolOpts)} ` +
                `(auth: ${auth.statusLabel}${auth.indicatorPath ? `, indicator: ${auth.indicatorPath}` : ''}).`,
        );
    }
}
