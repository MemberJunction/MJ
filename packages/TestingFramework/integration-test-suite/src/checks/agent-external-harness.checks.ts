/**
 * agent-external-harness.checks.ts — the 'agent-external-harness' bundle (AEH1–AEH7).
 *
 * Proves the External Agent Harness branch of the agent framework wires up correctly against live
 * metadata and a live ClassFactory — the seams that unit tests structurally cannot reach.
 *
 * NOT to be confused with `_it-live-agent-harness.ts`, which is the shared support kit for
 * live-MODEL agent bundles. Unfortunate name collision: that one is a *test* harness, this is the
 * *agent* harness feature (external agent runtimes as an MJ agent's reasoning substrate).
 *
 * ── WHY THESE CHECKS, AND WHY THEY NEED NO HARNESS BINARY ───────────────────────────────────
 * The tempting integration test — "launch Claude Code and watch it complete a task" — needs an
 * external binary, an API credential, and a nondeterministic model. It is worth having, and it
 * belongs in the LIVE suite. But it would not catch the failures that actually break this feature,
 * all of which are wiring failures that surface as a run that dies on turn one:
 *
 *   · The dual ClassFactory registration silently resolving to the wrong half. `'HarnessAgentType'`
 *     is registered under BOTH BaseAgentType and BaseAgent. If the BaseAgent registration is
 *     missing, AgentRunner falls back to plain BaseAgent — which does NOT error, it just runs the
 *     agent as an ordinary prompt agent with no harness at all. Green, and completely wrong.
 *   · A harness row naming a DriverClass no adapter registers, so the run fails at session start.
 *   · CapabilitySettings in metadata drifting from what the adapter actually implements. This is
 *     the worst one: the runtime EMULATES what an adapter lacks, so an over-claim is a silent
 *     behavioural gap, not an error. Metadata saying SessionResume=true for an adapter that cannot
 *     resume means context is never replayed and the harness quietly loses its history each turn.
 *   · The agent type having no system prompt, which is fatal because AIPromptRun.PromptID is NOT
 *     NULL — every harness turn must write one or the run reports zero cost forever.
 *
 * Every one of those is deterministic, needs no binary, and runs in CI. That is why this bundle is
 * in the deterministic suite rather than gated behind a live model.
 *
 * ── TRANSPORT: CLIENT-FIRST ─────────────────────────────────────────────────────────────────
 * All metadata reads go through the provider's entity surface. No server-only catalog access is
 * needed: everything asserted here is ordinary metadata plus in-process class resolution.
 */
import { MJGlobal } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import type { MJAIAgentHarnessEntity_IHarnessCapabilitySettings } from '@memberjunction/core-entities';
import { BaseAgent, BaseAgentType } from '@memberjunction/ai-agents';
import { BaseHarnessAdapter } from '@memberjunction/ai-agent-harness';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';

/** Entity names used throughout, kept in one place so a rename fails loudly in one spot. */
const HARNESS_ENTITY = 'MJ: AI Agent Harnesses';
const AGENT_TYPE_NAME = 'Harness';
const DEMO_AGENT_NAME = 'Demo Harness Agent';

/**
 * The capability names AEH4 accepts — the runtime shadow of
 * `MJAIAgentHarnessEntity_IHarnessCapabilitySettings`, which is a TypeScript interface and therefore
 * erased before this check can enumerate it.
 *
 * Typed as `Record<keyof …, true>` **on purpose**: TypeScript then refuses to compile this file if a
 * capability is added to the interface and not listed here, or listed here and not on the interface.
 * That converts what would otherwise be silent drift into a build error at the moment the interface
 * changes.
 *
 * This is not hypothetical — the hand-maintained list it replaces went stale the first time a
 * capability was added (`PermissionPolicy`), and the failure surfaced as a red integration check
 * accusing correct metadata of a typo. The check was right that something had drifted and wrong
 * about which side.
 */
const KNOWN_CAPABILITIES: Record<keyof MJAIAgentHarnessEntity_IHarnessCapabilitySettings, true> = {
    SessionResume: true,
    MidTurnCancellation: true,
    StructuredOutput: true,
    UsageReporting: true,
    PermissionPolicy: true,
    PermissionHooks: true,
    McpClient: true,
    WorkspaceScoping: true,
    ModelSelection: true,
};

interface AgentTypeRow { ID: string; Name: string; DriverClass: string | null; SystemPromptID: string | null; }
interface AgentRow { ID: string; Name: string; TypeID: string; TypeConfiguration: string | null; MaxCostPerRun: number | null; }

/** Reads the Harness agent type row. */
async function loadHarnessAgentType(ctx: IntegrationCheckContext): Promise<AgentTypeRow | undefined> {
    const rv = new RunView();
    const r = await rv.RunView<AgentTypeRow>({
        EntityName: 'MJ: AI Agent Types',
        Fields: ['ID', 'Name', 'DriverClass', 'SystemPromptID'],
        ExtraFilter: `Name='${AGENT_TYPE_NAME}'`,
        ResultType: 'simple',
    }, ctx.User);
    Assert(r.Success, `Failed to read MJ: AI Agent Types: ${r.ErrorMessage}`);
    return r.Results?.[0];
}

interface HarnessRow {
    ID: string;
    Name: string;
    DriverClass: string;
    Status: string;
    CapabilitySettings: string | null;
    AIVendorID: string | null;
    AIModelID: string | null;
    ExecutablePath: string | null;
}

/** Loads every harness registry row, Active or not — availability is not what this bundle tests. */
async function loadHarnessRows(ctx: IntegrationCheckContext): Promise<HarnessRow[]> {
    const rv = new RunView();
    const result = await rv.RunView<HarnessRow>(
        {
            EntityName: HARNESS_ENTITY,
            Fields: ['ID', 'Name', 'DriverClass', 'Status', 'CapabilitySettings', 'AIVendorID', 'AIModelID', 'ExecutablePath'],
            ResultType: 'simple',
        },
        ctx.User,
    );
    Assert(result.Success, `Failed to read ${HARNESS_ENTITY}: ${result.ErrorMessage}`);
    return result.Results ?? [];
}

export const AgentExternalHarnessChecks: NamedCheck[] = [
    {
        Id: 'agent-external-harness.AEH1',
        Name: 'AEH1: the Harness agent type exists and declares the dual-registry DriverClass',
        Fn: async (ctx): Promise<void> => {
            const type = await loadHarnessAgentType(ctx);
            Assert(!!type, `Agent type '${AGENT_TYPE_NAME}' not found in metadata — the migration or metadata sync did not land`);
            AssertEqual(
                type!.DriverClass,
                'HarnessAgentType',
                "Harness agent type must declare DriverClass 'HarnessAgentType' — the SAME string is " +
                    'registered under both BaseAgentType (protocol) and BaseAgent (driver), so one column selects both halves',
            );
            Assert(
                !!type!.SystemPromptID,
                'Harness agent type must have a SystemPromptID. AIPromptRun.PromptID is NOT NULL, so every ' +
                    'harness turn needs a real prompt row to attribute its usage to — without one the run ' +
                    'records no cost and its cost guardrail has nothing to compare against',
            );
        },
    },
    {
        Id: 'agent-external-harness.AEH2',
        Name: 'AEH2: BOTH halves of the dual registration resolve — protocol AND execution driver',
        Fn: async (_ctx): Promise<void> => {
            // This is the check that matters most, because its failure mode is invisible.
            // AgentRunner resolves the agent type's DriverClass against the BaseAgent registry and
            // FALLS BACK to plain BaseAgent when unregistered. A missing driver registration
            // therefore does not throw — it silently runs a harness agent as an ordinary prompt
            // agent, with no harness, no sandbox, and no credentials. Everything looks green.
            const factory = MJGlobal.Instance.ClassFactory;

            const protocol = factory.GetRegistration(BaseAgentType, 'HarnessAgentType');
            const driver = factory.GetRegistration(BaseAgent, 'HarnessAgentType');

            Assert(
                !!protocol,
                "'HarnessAgentType' is not registered under BaseAgentType — GetAgentTypeInstance would not " +
                    'resolve the turn protocol.',
            );
            Assert(
                !!driver,
                "'HarnessAgentType' is not registered under BaseAgent — AgentRunner would SILENTLY fall back " +
                    'to plain BaseAgent, running the agent as an ordinary prompt agent with no harness, no ' +
                    'sandbox and no credentials. Nothing errors; it is simply not a harness run.',
            );
            const keys = [protocol ? 'BaseAgentType' : '', driver ? 'BaseAgent' : ''].filter(Boolean);
            console.log(`      → 'HarnessAgentType' registered under: ${keys.join(', ')}`);
        },
    },
    {
        Id: 'agent-external-harness.AEH3',
        Name: 'AEH3: every harness row names a DriverClass that actually resolves to an adapter',
        Fn: async (ctx): Promise<void> => {
            const rows = await loadHarnessRows(ctx);
            Assert(rows.length > 0, `${HARNESS_ENTITY} is empty — the harness registry metadata did not sync`);

            const factory = MJGlobal.Instance.ClassFactory;
            for (const row of rows) {
                Assert(
                    !!row.DriverClass && row.DriverClass.trim().length > 0,
                    `Harness '${row.Name}' has no DriverClass — nothing could launch it`,
                );
                const registration = factory.GetRegistration(BaseHarnessAdapter, row.DriverClass);
                Assert(
                    !!registration,
                    `Harness '${row.Name}' names DriverClass '${row.DriverClass}', which no adapter registers. ` +
                        `The run would fail at session start. Ensure the adapter package is loaded ` +
                        `(LoadAgentHarnessAdapters).`,
                );
            }
            console.log(`      → ${rows.length} harness row(s), all DriverClass values resolve`);
        },
    },
    {
        Id: 'agent-external-harness.AEH4',
        Name: 'AEH4: CapabilitySettings parse and declare only known capabilities',
        Fn: async (ctx): Promise<void> => {
            const known = new Set(Object.keys(KNOWN_CAPABILITIES));

            const rows = await loadHarnessRows(ctx);
            for (const row of rows) {
                if (!row.CapabilitySettings) {
                    continue; // NULL is legal — every flag then reads as unsupported, the safe default.
                }
                let parsed: Record<string, unknown>;
                try {
                    parsed = JSON.parse(row.CapabilitySettings) as Record<string, unknown>;
                } catch (e) {
                    throw new Error(
                        `Harness '${row.Name}' has unparseable CapabilitySettings. The runtime gates emulation ` +
                            `on these flags, so a malformed blob silently reads as "nothing supported": ${String(e)}`,
                    );
                }
                for (const [key, value] of Object.entries(parsed)) {
                    Assert(
                        known.has(key),
                        `Harness '${row.Name}' declares unknown capability '${key}'. A typo here reads as ` +
                            `"unsupported" and the runtime silently emulates a capability the adapter actually has.`,
                    );
                    Assert(
                        typeof value === 'boolean',
                        `Harness '${row.Name}' capability '${key}' must be boolean, got ${typeof value}`,
                    );
                }
            }
        },
    },
    {
        Id: 'agent-external-harness.AEH5',
        Name: 'AEH5: metadata capabilities agree with what each adapter actually implements',
        Fn: async (ctx): Promise<void> => {
            // Drift between these two is the feature's nastiest failure mode: the runtime EMULATES
            // what an adapter lacks, so metadata over-claiming a capability produces a silent
            // behavioural gap rather than an error. Metadata saying SessionResume=true for an
            // adapter that cannot resume means context is never replayed and the harness quietly
            // loses its history every turn.
            const rows = await loadHarnessRows(ctx);
            const factory = MJGlobal.Instance.ClassFactory;
            let compared = 0;

            for (const row of rows) {
                if (!row.CapabilitySettings) continue;

                const adapter = factory.CreateInstance<BaseHarnessAdapter>(BaseHarnessAdapter, row.DriverClass);
                if (!adapter?.Capabilities) continue;
                const implemented = adapter.Capabilities as unknown as Record<string, boolean | undefined>;

                const declared = JSON.parse(row.CapabilitySettings) as Record<string, boolean>;
                for (const [key, metadataValue] of Object.entries(declared)) {
                    const codeValue = implemented[key];
                    if (codeValue === undefined) continue;
                    AssertEqual(
                        metadataValue,
                        codeValue,
                        `Harness '${row.Name}' capability '${key}': metadata says ${metadataValue}, adapter ` +
                            `${row.DriverClass} implements ${codeValue}. Over-claiming is a SILENT behavioural ` +
                            `gap — the runtime will stop emulating something the adapter cannot do.`,
                    );
                    compared++;
                }
            }
            console.log(`      → ${compared} capability flag(s) compared against adapter implementations`);
        },
    },
    {
        Id: 'agent-external-harness.AEH6',
        Name: 'AEH6: harness rows carry the accounting anchors their turns will need',
        Fn: async (ctx): Promise<void> => {
            // AIPromptRun.ModelID and .VendorID are NOT NULL. A harness row without them cannot
            // record a turn's usage, so the run reports zero tokens and zero cost forever and its
            // MaxCostPerRun ceiling never fires. Warn rather than fail for Inactive rows, which are
            // legitimately unconfigured until someone turns them on.
            const rows = await loadHarnessRows(ctx);
            const active = rows.filter((r) => r.Status === 'Active');

            for (const row of active) {
                Assert(
                    !!row.AIModelID && !!row.AIVendorID,
                    `Active harness '${row.Name}' must set AIModelID and AIVendorID. Without them a turn cannot ` +
                        `write an AIPromptRun, so the run under-reports cost and its guardrail goes blind.`,
                );
            }

            const unconfigured = rows.filter((r) => r.Status !== 'Active' && (!r.AIModelID || !r.AIVendorID));
            if (unconfigured.length > 0) {
                console.log(
                    `      → note: ${unconfigured.length} Inactive harness row(s) lack accounting anchors ` +
                        `(${unconfigured.map((r) => r.Name).join(', ')}) — set AIModelID/AIVendorID before activating`,
                );
            }
            console.log(`      → ${active.length} active harness row(s) checked`);
        },
    },
    {
        Id: 'agent-external-harness.AEH7',
        Name: 'AEH7: Demo Harness Agent is coherent — type, harness reference, and cost ceiling',
        Fn: async (ctx): Promise<void> => {
            const rvAgent = new RunView();
            const agentResult = await rvAgent.RunView<AgentRow>({
                EntityName: 'MJ: AI Agents',
                Fields: ['ID', 'Name', 'TypeID', 'TypeConfiguration', 'MaxCostPerRun'],
                ExtraFilter: `Name='${DEMO_AGENT_NAME}'`,
                ResultType: 'simple',
            }, ctx.User);
            Assert(agentResult.Success, `Failed to read MJ: AI Agents: ${agentResult.ErrorMessage}`);
            const agent = agentResult.Results?.[0];
            if (!agent) {
                console.log(`      → SKIP: '${DEMO_AGENT_NAME}' not present; demo metadata has not been synced`);
                return;
            }

            const harnessType = await loadHarnessAgentType(ctx);
            AssertEqual(agent.TypeID, harnessType?.ID, `${DEMO_AGENT_NAME} must be of the '${AGENT_TYPE_NAME}' type`);

            Assert(
                !!agent.TypeConfiguration,
                `${DEMO_AGENT_NAME} must have TypeConfiguration naming a harness — without it the run cannot ` +
                    `resolve which harness to launch`,
            );

            const config = JSON.parse(agent.TypeConfiguration!) as { harnessName?: string };
            Assert(!!config.harnessName, `${DEMO_AGENT_NAME}'s TypeConfiguration must set harnessName`);

            const rows = await loadHarnessRows(ctx);
            Assert(
                rows.some((r) => r.Name === config.harnessName),
                `${DEMO_AGENT_NAME} names harness '${config.harnessName}', which is not in ${HARNESS_ENTITY}. ` +
                    `harnessName is an exact lookup key, not a label.`,
            );

            // A harness agent is built for long autonomous runs against a vendor key injected into a
            // sandbox. Shipping a demo without a ceiling would model exactly the wrong habit.
            Assert(
                !!agent.MaxCostPerRun && agent.MaxCostPerRun > 0,
                `${DEMO_AGENT_NAME} must set MaxCostPerRun — a harness demo without a cost ceiling teaches the ` +
                    `wrong default for the one agent type most able to run away`,
            );
        },
    },
];

for (const check of AgentExternalHarnessChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
