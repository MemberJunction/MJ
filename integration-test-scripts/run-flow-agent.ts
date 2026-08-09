/**
 * run-flow-agent.ts — drive a Flow-type MJ agent and watch it execute on the task-graph dispatcher.
 *
 * This is the check no unit test can make. The compiler has property tests, the loop executor has
 * semantics tests, and the pure graph layer has algorithm tests — but none of them prove that a
 * workflow, started the way a person starts one, actually compiles, submits, gets claimed, runs its
 * steps in the right order, takes the right branch, and finishes. That path crosses four packages
 * and a database, so it can only be checked by doing it.
 *
 * USAGE (from the repository root, with MJAPI running so a dispatcher exists):
 *
 *   npx tsx integration-test-scripts/run-flow-agent.ts
 *   npx tsx integration-test-scripts/run-flow-agent.ts --agent "Demo Flow Agent"
 *
 * WHAT TO LOOK FOR. A workflow that "works" can still be silently wrong in ways this script reports
 * on explicitly, because each one looks like success from the outside:
 *
 *   1. It ran on the OLD in-run walker. Then no Task rows appear at all and the run still succeeds.
 *      The script fails outright if the graph produced no tasks, because a green run with an empty
 *      Task table means the thing being tested did not happen.
 *   2. It took BOTH branches of an exclusive fork. A flow picks one route; a plain fan-out runs
 *      every route. Both finish, both report success, and the only difference is that the workflow
 *      called two APIs where its author drew one. The script prints each task's final status so a
 *      Skipped branch is visible rather than assumed.
 *   3. Its branch condition read `undefined`. If a step's output mapping never reached the payload,
 *      `payload.stockPrice > 500` is false rather than unevaluable, so the workflow takes the other
 *      branch and finishes cleanly. The script prints the payload each step handed on.
 */
import { AgentRunner } from '@memberjunction/ai-agents';
import { RunView, UserInfo } from '@memberjunction/core';
import { MJAIAgentEntityExtended, MJTaskEntity } from '@memberjunction/core-entities';
import { initializeMJProvider } from '@memberjunction/ai-cli/dist/lib/mj-provider.js';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

interface ScriptArgs {
    AgentName: string;
    Task: string;
    TimeoutSeconds: number;
}

function parseArgs(): ScriptArgs {
    const argv = process.argv.slice(2);
    const read = (flag: string, fallback: string): string => {
        const i = argv.indexOf(flag);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
    };
    return {
        AgentName: read('--agent', 'Demo Flow Agent'),
        Task: read('--task', 'Run the workflow.'),
        TimeoutSeconds: Number(read('--timeout', '300')),
    };
}

async function resolveContextUser(): Promise<UserInfo> {
    // The CLI's SQL provider bootstraps with a null CurrentUser, and an agent run without an
    // explicit contextUser dies deep inside BaseEngine.Load rather than anywhere obviously related.
    const users = UserCache.Users;
    if (!users || users.length === 0) {
        throw new Error('UserCache is empty — the provider did not finish bootstrapping. Check .env.');
    }
    const preferred = process.env.MJ_TEST_USER_EMAIL;
    const user = preferred ? users.find((u) => u.Email === preferred) ?? users[0] : users[0];
    console.log(`  context user      : ${user.Email ?? user.Name}`);
    return user as unknown as UserInfo;
}

async function loadAgent(name: string, contextUser: UserInfo): Promise<MJAIAgentEntityExtended> {
    const result = await new RunView().RunView<MJAIAgentEntityExtended>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Name='${name.replace(/'/g, "''")}'`,
            ResultType: 'entity_object',
        },
        contextUser,
    );
    if (!result.Success) throw new Error(`Failed to load agent '${name}': ${result.ErrorMessage}`);
    const agent = result.Results?.[0];
    if (!agent) throw new Error(`Agent '${name}' not found on this database.`);
    return agent;
}

/** Every task in the graph, parent first, in creation order. */
async function loadGraphTasks(parentTaskID: string, contextUser: UserInfo): Promise<MJTaskEntity[]> {
    const result = await new RunView().RunView<MJTaskEntity>(
        {
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ID='${parentTaskID}' OR ParentID='${parentTaskID}'`,
            OrderBy: '__mj_CreatedAt ASC',
            ResultType: 'entity_object',
            BypassCache: true,
        },
        contextUser,
    );
    return (result.Success ? result.Results : []) ?? [];
}

/**
 * The graph this run submitted, found by the run that produced it.
 *
 * Matched against `InputPayload`, which is where the parent row keeps its durable metadata —
 * including `submittedByAgentRunID`. The Description holds the graph's reasoning, not its
 * provenance, so looking there finds nothing and makes a successful submission read as "no graph".
 */
async function findParentTask(agentRunID: string, contextUser: UserInfo): Promise<string | null> {
    const result = await new RunView().RunView<{ ID: string }>(
        {
            EntityName: 'MJ: Tasks',
            ExtraFilter: `ParentID IS NULL AND InputPayload LIKE '%${agentRunID}%'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true,
        },
        contextUser,
    );
    return result.Results?.[0]?.ID ?? null;
}

const TERMINAL = new Set(['Complete', 'Failed', 'Cancelled', 'Skipped']);

async function waitForSettlement(
    parentTaskID: string,
    contextUser: UserInfo,
    timeoutSeconds: number,
): Promise<MJTaskEntity[]> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    let lastPrinted = '';

    while (Date.now() < deadline) {
        const tasks = await loadGraphTasks(parentTaskID, contextUser);
        const children = tasks.filter((t) => t.ParentID === parentTaskID);

        const summary = children.map((t) => `${t.Name}=${t.Status}`).join(' | ');
        if (summary !== lastPrinted) {
            console.log(`  … ${summary}`);
            lastPrinted = summary;
        }

        if (children.length > 0 && children.every((t) => TERMINAL.has(t.Status))) return tasks;
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Workflow did not settle within ${timeoutSeconds}s. A step is stuck or nothing is dispatching.`);
}

async function main(): Promise<void> {
    const args = parseArgs();

    console.log('\n── Flow agent live run (dispatched) ────────────────────────────────');
    await initializeMJProvider();
    const contextUser = await resolveContextUser();

    const agent = await loadAgent(args.AgentName, contextUser);
    console.log(`  agent             : ${agent.Name}`);
    console.log('────────────────────────────────────────────────────────────────────\n');

    const started = Date.now();
    const result = await new AgentRunner().RunAgent({
        agent,
        conversationMessages: [{ role: 'user', content: args.Task }],
        contextUser,
    });

    console.log('\n── Submission ──────────────────────────────────────────────────────');
    console.log(`  run success       : ${result.success}`);
    console.log(`  message           : ${result.agentRun?.Message ?? '(none)'}`);
    if (!result.success) {
        console.log(`  error             : ${result.agentRun?.ErrorMessage ?? '(none)'}`);
        process.exitCode = 1;
        return;
    }

    const parentTaskID = await findParentTask(result.agentRun!.ID, contextUser);
    if (!parentTaskID) {
        // The failure this whole script exists to catch: a green run that produced no durable work.
        console.log('\n  ✖ NO TASK GRAPH WAS CREATED — the workflow did not run on the dispatcher.');
        process.exitCode = 1;
        return;
    }
    console.log(`  parent task       : ${parentTaskID}`);

    console.log('\n── Execution ───────────────────────────────────────────────────────');
    const tasks = await waitForSettlement(parentTaskID, contextUser, args.TimeoutSeconds);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    const parent = tasks.find((t) => t.ID === parentTaskID);
    const children = tasks.filter((t) => t.ParentID === parentTaskID);

    console.log('\n── Result ──────────────────────────────────────────────────────────');
    console.log(`  elapsed           : ${elapsed}s`);
    console.log(`  parent status     : ${parent?.Status}`);
    for (const t of children) {
        console.log(`\n  • ${t.Name}`);
        console.log(`      step type     : ${t.StepType ?? '(none)'}`);
        console.log(`      status        : ${t.Status}`);
        if (t.ErrorMessage) console.log(`      error         : ${t.ErrorMessage}`);
        const payload = t.OutputPayload ? t.OutputPayload.slice(0, 400) : '(none)';
        console.log(`      output payload: ${payload}`);
    }

    const failed = children.filter((t) => t.Status === 'Failed');
    const skipped = children.filter((t) => t.Status === 'Skipped');
    console.log('\n── Summary ─────────────────────────────────────────────────────────');
    console.log(`  tasks             : ${children.length}`);
    console.log(`  complete          : ${children.filter((t) => t.Status === 'Complete').length}`);
    console.log(`  skipped (branch not taken): ${skipped.length}`);
    console.log(`  failed            : ${failed.length}`);
    console.log('────────────────────────────────────────────────────────────────────\n');

    if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
    console.error(`\n✖ ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    process.exit(1);
});
