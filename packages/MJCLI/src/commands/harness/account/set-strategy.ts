import { Args, Command, Flags } from '@oclif/core';
import {
    HARNESS_ACCOUNT_SELECTION_STRATEGIES,
    HarnessAccountPoolService,
} from '@memberjunction/ai-agent-harness';
import { BuildPoolOptionsFromFlag, RequireHarnessStrategy } from '../../../lib/harness-account.js';

export default class HarnessAccountSetStrategy extends Command {
    static description = 'Set the default multi-account CLI pool balancing strategy';

    static examples = [
        '<%= config.bin %> <%= command.id %> least-in-flight',
        '<%= config.bin %> <%= command.id %> round-robin',
        '<%= config.bin %> <%= command.id %> weighted',
        '<%= config.bin %> <%= command.id %> priority-failover',
    ];

    static args = {
        strategy: Args.string({
            description: `Selection strategy (${HARNESS_ACCOUNT_SELECTION_STRATEGIES.join(', ')})`,
            required: true,
        }),
    };

    static flags = {
        'pool-dir': Flags.string({
            description: 'Override account pool storage directory',
        }),
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(HarnessAccountSetStrategy);
        const poolOpts = BuildPoolOptionsFromFlag(flags['pool-dir']);

        let strategy;
        try {
            strategy = RequireHarnessStrategy(args.strategy);
        } catch (err) {
            this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
        }

        const service = HarnessAccountPoolService.Instance;
        service.SetStrategy(strategy, poolOpts);
        this.log(`Harness account pool default strategy set to '${strategy}'.`);
    }
}
