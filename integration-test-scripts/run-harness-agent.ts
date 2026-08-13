/**
 * run-harness-agent.ts — drive a Harness-type MJ agent end to end against a REAL external harness.
 *
 * This is the check the deterministic bundle (agent-external-harness AEH1–AEH7) structurally
 * cannot make. That bundle proves the wiring — registrations resolve, metadata is coherent,
 * capabilities do not drift from what adapters implement. It says nothing about whether a harness
 * actually launches, reasons, and comes back speaking the Loop turn-end contract, because doing so
 * needs an external binary, a credential, and a nondeterministic model.
 *
 * USAGE (from the repository root):
 *
 *   npx tsx integration-test-scripts/run-harness-agent.ts
 *   npx tsx integration-test-scripts/run-harness-agent.ts --agent "Demo Harness Agent"
 *   npx tsx integration-test-scripts/run-harness-agent.ts --task "Create hello.txt containing HELLO"
 *
 * WHAT TO LOOK FOR. A harness agent that "works" can still be silently wrong in two ways this
 * script reports on explicitly:
 *
 *   1. It ran as an ORDINARY prompt agent. If the 'HarnessAgentType' registration under BaseAgent
 *      is missing, AgentRunner falls back to plain BaseAgent — no harness, no sandbox — and the run
 *      still succeeds. The script prints the resolved driver class so that is visible rather than
 *      inferred.
 *   2. It reported no cost. Run totals are derived from AIPromptRun rollups, so a turn that failed
 *      to write one leaves TotalCost at 0 and the MaxCostPerRun ceiling with nothing to compare
 *      against. The script prints the run's token and cost totals for exactly that reason.
 */
import { AgentRunner } from '@memberjunction/ai-agents';
import { LoadAgentHarnessAdapters } from '@memberjunction/ai-agent-harness';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { initializeMJProvider } from '@memberjunction/ai-cli/dist/lib/mj-provider.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

// The adapters register with ClassFactory as a side effect of module load. Without this call a
// bundler — or simply an unused-import elision — can drop them, leaving AIAgentHarness.DriverClass
// resolving to nothing at run time.
LoadAgentHarnessAdapters();

interface ScriptArgs {
    AgentName: string;
    Task: string;
}

function parseArgs(): ScriptArgs {
    const argv = process.argv.slice(2);
    const read = (flag: string, fallback: string): string => {
        const i = argv.indexOf(flag);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
    };
    return {
        AgentName: read('--agent', 'Demo Harness Agent'),
        Task: read(
            '--task',
            'Create a file named harness-proof.txt in your working directory containing exactly the ' +
                'word SUCCESS, then finish. Do not ask any questions.',
        ),
    };
}

async function resolveContextUser(): Promise<UserInfo> {
    // The CLI's SQL provider bootstraps with a null CurrentUser, and an agent run without an
    // explicit contextUser dies deep inside BaseEngine.Load rather than anywhere obviously related
    // (issue #3251). UserCache is the established CLI path for getting a real identity.
    const users = UserCache.Users;
    if (!users || users.length === 0) {
        throw new Error(
            'UserCache is empty — the provider did not finish bootstrapping. Check the DB connection ' +
                'in .env and that setupSQLServerClient completed.',
        );
    }
    const preferred = process.env.MJ_TEST_USER_EMAIL;
    const user = preferred ? users.find((u) => u.Email === preferred) ?? users[0] : users[0];
    console.log(`  context user      : ${user.Email ?? user.Name}`);
    return user as unknown as UserInfo;
}

async function loadAgent(name: string, contextUser: UserInfo): Promise<MJAIAgentEntityExtended> {
    const rv = new RunView();
    const result = await rv.RunView<MJAIAgentEntityExtended>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
            ResultType: 'entity_object',
        },
        contextUser,
    );
    if (!result.Success) {
        throw new Error(`Failed to load agent '${name}': ${result.ErrorMessage}`);
    }
    const agent = result.Results?.[0];
    if (!agent) {
        throw new Error(`Agent '${name}' not found. Push metadata first: mj sync push --dir=metadata`);
    }
    if (agent.Status !== 'Active') {
        throw new Error(`Agent '${name}' is ${agent.Status}, not Active. Activate it before running.`);
    }
    return agent;
}

/** Prints which class actually executed, so a silent fallback to plain BaseAgent is visible. */
function reportResolvedDriver(agent: MJAIAgentEntityExtended): void {
    const md = new Metadata();
    const type = md.AIAgentTypes?.find?.((t: { ID: string }) => t.ID === agent.TypeID);
    const driver = agent.DriverClass || (type as { DriverClass?: string } | undefined)?.DriverClass;
    console.log(`  agent type        : ${(type as { Name?: string } | undefined)?.Name ?? '(unresolved)'}`);
    console.log(`  driver class      : ${driver ?? '(none — would fall back to plain BaseAgent)'}`);
}

async function main(): Promise<void> {
    const args = parseArgs();

    console.log('\n── Harness agent live run ──────────────────────────────────────────');
    await initializeMJProvider();
    const contextUser = await resolveContextUser();

    const agent = await loadAgent(args.AgentName, contextUser);
    console.log(`  agent             : ${agent.Name}`);
    reportResolvedDriver(agent);
    console.log(`  type configuration: ${agent.TypeConfiguration ?? '(none)'}`);
    console.log(`  cost ceiling      : ${agent.MaxCostPerRun ?? '(none)'}`);
    console.log(`  task              : ${args.Task}`);
    console.log('────────────────────────────────────────────────────────────────────\n');

    const runner = new AgentRunner();
    const started = Date.now();
    const result = await runner.RunAgent({
        agent,
        conversationMessages: [{ role: 'user', content: args.Task }],
        contextUser,
        onProgress: (p: { step?: string; message?: string }) => {
            if (p.message) {
                console.log(`  … ${p.step ?? 'progress'}: ${p.message}`);
            }
        },
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log('\n── Result ──────────────────────────────────────────────────────────');
    console.log(`  success           : ${result.success}`);
    console.log(`  elapsed           : ${elapsed}s`);
    if (result.agentRun) {
        const run = result.agentRun as unknown as Record<string, unknown>;
        console.log(`  run id            : ${String(run.ID)}`);
        console.log(`  external session  : ${String(run.ExternalSessionID ?? '(none)')}`);
        console.log(`  iterations        : ${String(run.TotalPromptIterations ?? 0)}`);
        // Zero here means no AIPromptRun was written, so the cost ceiling had nothing to compare
        // against — the single most important number on this report.
        console.log(`  tokens used       : ${String(run.TotalTokensUsed ?? 0)}`);
        console.log(`  total cost        : ${String(run.TotalCost ?? 0)}`);
    }
    if (!result.success) {
        console.log(`  error             : ${result.errorMessage ?? '(none reported)'}`);
    }
    console.log('────────────────────────────────────────────────────────────────────\n');

    process.exit(result.success ? 0 : 1);
}

main().catch((e: unknown) => {
    console.error('\n✗ Harness run script failed:', e instanceof Error ? e.stack ?? e.message : String(e));
    process.exit(1);
});
