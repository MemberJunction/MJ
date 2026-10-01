/**
 * agent-decisions-switch.checks.ts — the 'agent-decisions-switch' bundle (DS1–DS9): the
 * `decisionsEnabled` master switch, a Loop agent-type prompt param that is off by default and must be
 * `true` before an agent asks a decision model on its own.
 *
 * WHAT IT PROVES, against this database's metadata: the synced Loop schema defaults the switch off;
 * real Loop agents run end to end with it off, on in their own params, and flipped for one run; the
 * five loop uses it governs (inline `decisions`, `finishIf`, decision discovery, catalog narrowing,
 * the payload change check) ask nothing while it is off, whatever their own settings say, and each
 * one an agent turns on asks once while it is on; the Memory Manager's note gate obeys it; and a Flow
 * agent's Decision step, an explicit use, ignores it.
 *
 * NO MODEL CALLS. Every chat call is a scripted reply from `TestLLM`, registered over the chat driver
 * classes, and every decision call a scripted answer from the {@link ScriptedDecision} stand-in,
 * registered over the decision driver classes. Both are registered in the lifecycle Setup and restored
 * in Teardown. The runs pass a placeholder API key for the chat drivers, so model selection accepts
 * the seeded prompt's one binding on a runner with no keys at all; it never reaches a network, because
 * the ClassFactory hands back the scripted driver. Everything else is real: AgentRunner, BaseAgent, the
 * Loop agent type, the prompt merge and rendering, AIPromptRunner, AIDecisionRunner and its candidate
 * selection, the Calculate Expression action, and every run, step and prompt-run row.
 *
 * TRANSPORT: SERVER-ONLY by necessity. The scripted drivers are ClassFactory registrations in this
 * process; an agent run over the wire executes inside MJAPI, which would resolve the real drivers.
 *
 * FIXTURES: the agents are seeded metadata (metadata-optional/integration-test/ai-agents/
 * .it-decisions-switch-agents.json), referenced read-only. Every agent run, step, prompt run and action
 * log the bundle creates is deleted in Teardown, children first.
 */
import { randomUUID } from 'node:crypto';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { MemoryManagerAgent, type FlowAgentExecuteParams } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { TestLLM, RegisterTestLLM, type TestLLMOutcome } from '@memberjunction/unit-testing';
import { Assert, AssertEqual, IntegrationCheckRegistry, Settle } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { DecodeMessages, DeleteById, MakeAIClient, NewMarker, RequireRows, UserTurn } from './agent-live-shared';
import { RegisterScriptedDecision, ScriptedDecision, SCRIPTED_DECISION_DRIVER_CLASSES } from './decision-test-double';

// ─── Constants ───────────────────────────────────────────────────────────────────────────────────

const AGENT_NAMES = {
    Default: 'IT: Decisions Default Agent',
    SubFlags: 'IT: Decisions Sub-Flags Agent',
    Enabled: 'IT: Decisions Enabled Agent',
    Flow: 'IT: Decisions Switch Flow Agent',
    MemoryManager: 'Memory Manager',
} as const;

const DEFAULT_DECISION_PROMPT = 'Default Decision';

/**
 * Every chat driver class a candidate for the seeded prompt's model could resolve to: the binding's
 * own (OpenAI), the model's other vendors (Azure, OpenRouter) and the drivers prompt-eval-harness
 * stands in for. A failover can only ever land on the scripted driver.
 */
const CHAT_DRIVER_CLASSES: readonly string[] = ['OpenAILLM', 'AzureLLM', 'OpenRouterLLM', 'AnthropicLLM', 'GeminiLLM', 'CerebrasLLM', 'GroqLLM'];

/** A placeholder key for each chat driver, so model selection accepts the binding. Never sent anywhere. */
const SCRIPTED_API_KEYS = CHAT_DRIVER_CLASSES.map(driverClass => ({ driverClass, apiKey: 'it-decisions-switch-scripted-no-network' }));

/** How long to let queued step and prompt-run saves land before reading them back. */
const SETTLE_MS = Number(process.env.AGENT_SETTLE_MS ?? 1500);

/** The final messages the script ends a run with, by how it ended. */
const FINISHED_MESSAGE = 'IT-DS-FINISHED';
const COMPLETED_MESSAGE = 'IT-DS-COMPLETED';
const EXHAUSTED_MESSAGE = 'IT-DS-SCRIPT-EXHAUSTED';

/** The inline decision request the first scripted reply sends. Its step is named `Decision: <id>`. */
const DECISION_REQUEST_ID = 'notes_done';

/** The payload every loop run starts with: `notes` is long enough that shortening it is flagged. */
const STARTING_NOTES = 'Packed the order, printed the shipping label, booked the courier for the morning pickup, emailed the customer a tracking link, and logged the shipment in the warehouse system.';

/** The Loop prompt's decision-model parts: present only when the agent may use them. */
const PROMPT_PARTS = {
    DecisionsDocs: 'You can ask typed decision questions evaluated inline',
    DecisionsField: 'decisions?: AgentDecisionRequest[]',
    FinishIfDocs: '## Finishing after an action or sub-agent',
    FinishIfField: 'finishIf?: AgentFinishIf',
    DecisionTypes: 'interface AgentDecisionRequest',
} as const;

/** The Decision steps each governed loop use records. */
const STEP_NAMES = {
    Discovery: 'Agent discovery',
    Narrowing: 'Catalog narrowing',
    PayloadCheck: 'Payload change check',
    InlineDecision: `Decision: ${DECISION_REQUEST_ID}`,
    FinishCheck: 'Finish check',
} as const;

/**
 * How the prompt's action catalog shows narrowing: each described action is a `### <name>` heading, and
 * a narrowed list starts with a note saying how many are not described.
 */
const CATALOG = {
    CalculateExpression: '### Calculate Expression',
    GetWeather: '### Get Weather',
    NarrowingNote: '1 of your actions is not described below',
} as const;

/** The Decision step a Flow agent records for where it runs. It is routing, not a decision-model call. */
const FLOW_ROUTING_STEP = 'Workflow runs in this run';

/** The step the Memory Manager probe stops its cycle at: the rest of a cycle reads every conversation. */
const MEMORY_CYCLE_STOP_STEP = 'Load Conversations With New Activity';

/** Step types whose `TargetLogID` is an `MJ: AI Prompt Runs` row. */
const PROMPT_RUN_STEP_TYPES: readonly string[] = ['Prompt', 'Compaction', 'Tool', 'Decision'];

// ─── Fixture ─────────────────────────────────────────────────────────────────────────────────────

interface SwitchAgents {
    Default: MJAIAgentEntityExtended;
    SubFlags: MJAIAgentEntityExtended;
    Enabled: MJAIAgentEntityExtended;
    Flow: MJAIAgentEntityExtended;
    MemoryManager: MJAIAgentEntityExtended;
}

interface SwitchFixture {
    Agents: SwitchAgents;
    DefaultDecisionPromptID: string;
    Llm: TestLLM;
    Decider: ScriptedDecision;
    Restores: Array<() => void>;
    RunIDs: string[];
    PromptRunIDs: string[];
}

/** The bundle's state; this bundle adds no slot to IntegrationCheckContext (agent-loop-standin's pattern). */
let switchFixture: SwitchFixture | undefined;

function requireFixture(): SwitchFixture {
    if (!switchFixture) {
        throw new Error('agent-decisions-switch fixture not initialized: the bundle lifecycle Setup must run before its checks.');
    }
    return switchFixture;
}

function requireAgent(name: string): MJAIAgentEntityExtended {
    const agent = AIEngine.Instance.Agents.find(a => a.Name === name);
    if (!agent) {
        throw new Error(`Agent '${name}' is not in this database. Seed it: mj sync push --dir=metadata-optional/integration-test`);
    }
    return agent;
}

function loadAgents(): SwitchAgents {
    return {
        Default: requireAgent(AGENT_NAMES.Default),
        SubFlags: requireAgent(AGENT_NAMES.SubFlags),
        Enabled: requireAgent(AGENT_NAMES.Enabled),
        Flow: requireAgent(AGENT_NAMES.Flow),
        MemoryManager: requireAgent(AGENT_NAMES.MemoryManager),
    };
}

// ─── Reading what a run left behind ──────────────────────────────────────────────────────────────

interface StepRow {
    ID: string;
    StepNumber: number;
    StepType: string;
    StepName: string | null;
    Status: string;
    TargetLogID: string | null;
    ParentID: string | null;
}

interface PromptRunRow {
    ID: string;
    PromptID: string;
    AgentID: string | null;
    Success: boolean | null;
    Messages: string | null;
}

async function readSteps(provider: IMetadataProvider, user: UserInfo, runId: string): Promise<StepRow[]> {
    const result = await RunView.FromMetadataProvider(provider).RunView<StepRow>({
        EntityName: 'MJ: AI Agent Run Steps',
        ExtraFilter: `AgentRunID='${EscapeSQLString(runId)}'`,
        OrderBy: 'StepNumber ASC',
        Fields: ['ID', 'StepNumber', 'StepType', 'StepName', 'Status', 'TargetLogID', 'ParentID'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return RequireRows(result, `step read for run ${runId}`);
}

async function readPromptRuns(provider: IMetadataProvider, user: UserInfo, filter: string): Promise<PromptRunRow[]> {
    const result = await RunView.FromMetadataProvider(provider).RunView<PromptRunRow>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: filter,
        Fields: ['ID', 'PromptID', 'AgentID', 'Success', 'Messages'],
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return RequireRows(result, `prompt-run read (${filter})`);
}

/** Every message of the run's first prompt, joined: the rendered system prompt and the opening request. */
async function firstPromptText(provider: IMetadataProvider, user: UserInfo, steps: StepRow[]): Promise<string> {
    const first = steps.find(s => s.StepType === 'Prompt' && s.TargetLogID);
    Assert(!!first?.TargetLogID, 'The run has no Prompt step linked to a prompt run');
    const [row] = await readPromptRuns(provider, user, `ID='${EscapeSQLString(first!.TargetLogID!)}'`);
    Assert(!!row, `The first Prompt step's prompt run ${first!.TargetLogID} was not found`);
    return DecodeMessages(row.Messages).map(m => m.content).join('\n');
}

/** How many Default Decision prompt runs name this agent: the before/after count says whether a run asked. */
async function countDecisionPromptRuns(ctx: IntegrationCheckContext, agentId: string): Promise<number> {
    const f = requireFixture();
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `PromptID='${EscapeSQLString(f.DefaultDecisionPromptID)}' AND AgentID='${EscapeSQLString(agentId)}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    return RequireRows(result, `Default Decision prompt-run count for agent ${agentId}`).length;
}

// ─── Running a scripted loop agent ───────────────────────────────────────────────────────────────

/**
 * The script every loop run follows. The first reply sends an inline decision request and shortens
 * `notes` (a change the payload analyzer flags); the second puts a finishIf gate on its action. With
 * the switch off the gate is ignored and the third reply ends the run; with finishIf on, the gate ends
 * it after the second.
 */
function scriptedReplies(): string[] {
    const firstReply = {
        taskComplete: false,
        message: 'Calculating the first total.',
        payloadChangeRequest: { updateElements: { notes: 'short' } },
        decisions: [{
            id: DECISION_REQUEST_ID,
            state: 'payload.notes',
            questions: { done: { kind: 'Likelihood', instructions: 'These notes describe work that is finished.' } },
        }],
        nextStep: { type: 'Actions', actions: [{ name: 'Calculate Expression', params: { expression: '6*7' } }] },
    };
    const secondReply = {
        taskComplete: false,
        message: 'Calculating the second total.',
        nextStep: {
            type: 'Actions',
            actions: [{ name: 'Calculate Expression', params: { expression: '6*8' } }],
            finishIf: { questions: ['The results show the expression was calculated.'], message: FINISHED_MESSAGE },
        },
    };
    const thirdReply = { taskComplete: true, message: COMPLETED_MESSAGE };
    return [firstReply, secondReply, thirdReply].map(reply => JSON.stringify(reply));
}

/** Arms both doubles for one run: the chat script, and decision answers that are a confident yes. */
function armDoubles(f: SwitchFixture): void {
    f.Llm.Reset();
    f.Llm.SetDefaultOutcome({ kind: 'succeed', content: JSON.stringify({ taskComplete: true, message: EXHAUSTED_MESSAGE }) });
    const replies: TestLLMOutcome[] = scriptedReplies().map(content => ({ kind: 'succeed', content }));
    f.Llm.Script(...replies);
    f.Decider.Reset();
    // Catalog narrowing asks one Likelihood per action; a low one for Get Weather hides it, so a prompt
    // that still lists it shows narrowing did not run.
    f.Decider.LikelihoodFor = instructions => instructions.includes('Get Weather') ? 0.05 : 0.97;
}

/** What one scripted run did, read back from the database and the two doubles. */
interface RunObservation {
    Result: ExecuteAgentResult;
    RunID: string;
    Steps: StepRow[];
    DecisionSteps: StepRow[];
    ChatCalls: number;
    DecisionCalls: number;
    NewDecisionPromptRuns: number;
    FirstPrompt: string;
}

/**
 * Runs `agent` through AgentRunner on the scripted replies, with one opening user message and a payload
 * whose `notes` the script shortens. `data` carries any per-run override and the host's agent list.
 */
async function runScripted(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, data?: Record<string, unknown>): Promise<RunObservation> {
    const f = requireFixture();
    armDoubles(f);
    const before = await countDecisionPromptRuns(ctx, agent.ID);
    const result = await MakeAIClient(ctx.Provider, ctx.User).RunAIAgent({
        agent,
        conversationMessages: UserTurn('Work out 6*7 and then 6*8 for the order totals.'),
        payload: { notes: STARTING_NOTES },
        data: { ...(data ?? {}), ALL_AVAILABLE_AGENTS: hostAgents(f) },
        apiKeys: SCRIPTED_API_KEYS,
    });
    return observeRun(ctx, agent, result, before);
}

/** The host's agent list for decision discovery: three seeded agents, so discovery has enough to ask about and searches nothing. */
function hostAgents(f: SwitchFixture): Array<{ ID: string }> {
    return [f.Agents.Default, f.Agents.Enabled, f.Agents.Flow].map(a => ({ ID: a.ID }));
}

async function observeRun(ctx: IntegrationCheckContext, agent: MJAIAgentEntityExtended, result: ExecuteAgentResult, decisionRunsBefore: number): Promise<RunObservation> {
    const f = requireFixture();
    const runId = result.agentRun?.ID;
    Assert(!!runId, `${agent.Name}: AgentRunner returned no run (${result.errorMessage ?? 'no error message'})`);
    f.RunIDs.push(runId!);
    await Settle(SETTLE_MS);
    const steps = await readSteps(ctx.Provider, ctx.User, runId!);
    return {
        Result: result,
        RunID: runId!,
        Steps: steps,
        DecisionSteps: steps.filter(s => s.StepType === 'Decision'),
        ChatCalls: f.Llm.CallCount,
        DecisionCalls: f.Decider.Calls.length,
        NewDecisionPromptRuns: (await countDecisionPromptRuns(ctx, agent.ID)) - decisionRunsBefore,
        FirstPrompt: steps.some(s => s.StepType === 'Prompt') ? await firstPromptText(ctx.Provider, ctx.User, steps) : '',
    };
}

// ─── Assertions shared by the loop checks ────────────────────────────────────────────────────────

/** The run finished as a normal success, with `message` as its final message. */
function assertCompleted(obs: RunObservation, message: string, label: string): void {
    const run = obs.Result.agentRun;
    AssertEqual(run.Status, 'Completed', `${label}: run status (${run.ErrorMessage ?? 'no error'})`);
    AssertEqual(run.FinalStep, 'Success', `${label}: final step`);
    AssertEqual(run.Message, message, `${label}: final message`);
    const actionSteps = obs.Steps.filter(s => s.StepType === 'Actions');
    Assert(actionSteps.length === 2 && actionSteps.every(s => s.Status === 'Completed'),
        `${label}: expected both scripted Calculate Expression steps to complete, got ${actionSteps.map(s => s.Status).join(', ') || 'none'}`);
}

/** Nothing asked a decision model: no call, no Decision step, no Default Decision prompt run. */
function assertNothingAsked(obs: RunObservation, label: string): void {
    AssertEqual(obs.DecisionCalls, 0, `${label}: decision calls`);
    AssertEqual(obs.DecisionSteps.length, 0,
        `${label}: Decision steps (${obs.DecisionSteps.map(s => s.StepName).join(', ')})`);
    AssertEqual(obs.NewDecisionPromptRuns, 0, `${label}: new Default Decision prompt runs for the agent`);
}

/** The prompt carries none of the decisions or finishIf docs, fields or types. */
function assertPromptOffersNoDecisions(obs: RunObservation, label: string): void {
    Assert(obs.FirstPrompt.length > 0, `${label}: the first prompt's messages were empty`);
    for (const [part, text] of Object.entries(PROMPT_PARTS)) {
        Assert(!obs.FirstPrompt.includes(text), `${label}: the prompt still carries ${part} ("${text}")`);
    }
}

/**
 * Exactly the `expected` Decision steps ran, each asked once through the Default Decision prompt: the
 * step completed and links a prompt run on that prompt that names the agent. `decisionSteps` defaults to
 * every Decision step of the run.
 */
async function assertAsked(
    ctx: IntegrationCheckContext,
    obs: RunObservation,
    agent: MJAIAgentEntityExtended,
    expected: string[],
    label: string,
    decisionSteps: StepRow[] = obs.DecisionSteps
): Promise<void> {
    const f = requireFixture();
    const names = decisionSteps.map(s => s.StepName ?? '').sort();
    AssertEqual(names.join(' | '), [...expected].sort().join(' | '), `${label}: Decision steps`);
    AssertEqual(obs.DecisionCalls, expected.length, `${label}: decision calls`);
    AssertEqual(obs.NewDecisionPromptRuns, expected.length, `${label}: new Default Decision prompt runs for the agent`);
    for (const step of decisionSteps) {
        AssertEqual(step.Status, 'Completed', `${label}: status of the '${step.StepName}' step`);
        Assert(!!step.TargetLogID, `${label}: the '${step.StepName}' step links no prompt run`);
        const [run] = await readPromptRuns(ctx.Provider, ctx.User, `ID='${EscapeSQLString(step.TargetLogID!)}'`);
        Assert(!!run && UUIDsEqual(run.PromptID, f.DefaultDecisionPromptID) && UUIDsEqual(run.AgentID ?? '', agent.ID),
            `${label}: the '${step.StepName}' step's prompt run is not a Default Decision run for ${agent.Name}`);
    }
}

/** The prompt carries the decisions and finishIf docs, fields and types. */
function assertPromptOffersDecisions(obs: RunObservation, label: string): void {
    for (const [part, text] of Object.entries(PROMPT_PARTS)) {
        Assert(obs.FirstPrompt.includes(text), `${label}: the prompt is missing ${part} ("${text}")`);
    }
}

/** Every check that runs the script with the switch off ends the same way: three turns, nothing asked. */
function assertSwitchOffRun(obs: RunObservation, label: string): void {
    assertCompleted(obs, COMPLETED_MESSAGE, label);
    AssertEqual(obs.ChatCalls, 3, `${label}: chat calls (the finishIf gate must not end the run)`);
    assertNothingAsked(obs, label);
    assertPromptOffersNoDecisions(obs, label);
}

// ─── The Memory Manager probe ────────────────────────────────────────────────────────────────────

/** A candidate note, in the shape the extraction prompt returns it. */
interface GateNote {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    content: string;
    confidence: number;
    sourceConversationId?: string;
}

/** A conversation thread, in the shape extraction reads it. */
interface GateThread {
    conversationId: string;
    messages: Array<{ id: string; role: string; message: string; createdAt: Date; rating: number | null; ratingComment: string | null }>;
}

/**
 * The real Memory Manager, with two seams opened, the ones its own unit tests use. `StartCycle` runs the
 * start of a cycle, which reads the run's params (the gate flag, and the merged prompt params that carry
 * the switch), and stops it at the step that would load every conversation in the database. The stop
 * is a thrown error the cycle catches, so the log shows "Memory Manager execution failed" once per
 * cycle; that is the probe, not a defect. `RunGate` runs the note gate on candidate notes, as extraction does.
 */
class MemoryGateProbe extends MemoryManagerAgent {
    protected override async createRunStep(
        stepType: 'Prompt' | 'Decision' | 'Validation',
        stepName: string,
        inputData?: Record<string, unknown>,
        targetId?: string
    ): Promise<MJAIAgentRunStepEntityExtended | null> {
        if (stepName === MEMORY_CYCLE_STOP_STEP) {
            throw new Error('[IT probe] the cycle stops here, once it has read its params: the rest of a cycle reads every conversation in the database');
        }
        return super.createRunStep(stepType, stepName, inputData, targetId);
    }

    public async StartCycle(params: ExecuteAgentParams): Promise<BaseAgentNextStep<Record<string, unknown>>> {
        const config: AgentConfiguration = { success: true };
        const { finalStep } = await this.executeAgentInternal<Record<string, unknown>>(params, config);
        return finalStep;
    }

    public RunGate(notes: GateNote[], threads: GateThread[], user: UserInfo): Promise<GateNote[]> {
        return this.filterCandidateNotes(notes, threads, user, true);
    }
}

interface GateObservation {
    GateFlag: boolean;
    Kept: string[];
    DecisionCalls: number;
    PromptRuns: PromptRunRow[];
}

/** One cycle start and one gate pass over two notes from one conversation, both marked so their decision prompt run can be found. */
async function runMemoryGate(ctx: IntegrationCheckContext, data: Record<string, unknown>): Promise<GateObservation> {
    const f = requireFixture();
    f.Decider.Reset();
    const marker = NewMarker('it-ds-memory');
    const conversationId = randomUUID();
    const notes: GateNote[] = [
        { type: 'Preference', content: `Prefers metric units in every report (${marker})`, confidence: 95, sourceConversationId: conversationId },
        { type: 'Context', content: `Works from the Denver office this quarter (${marker})`, confidence: 60, sourceConversationId: conversationId },
    ];
    const thread: GateThread = {
        conversationId,
        messages: [{ id: randomUUID(), role: 'user', message: 'Please use metric units. I am in the Denver office this quarter.', createdAt: new Date(), rating: null, ratingComment: null }],
    };
    const probe = new MemoryGateProbe();
    await probe.StartCycle({ agent: f.Agents.MemoryManager, conversationMessages: [], contextUser: ctx.User, data });
    const kept = await probe.RunGate(notes, [thread], ctx.User);
    await Settle(SETTLE_MS);
    const promptRuns = await readPromptRuns(ctx.Provider, ctx.User,
        `PromptID='${EscapeSQLString(f.DefaultDecisionPromptID)}' AND Messages LIKE '%${EscapeSQLString(marker)}%'`);
    f.PromptRunIDs.push(...promptRuns.map(r => r.ID));
    return { GateFlag: probe.EnableDecisionGate, Kept: kept.map(n => n.content), DecisionCalls: f.Decider.Calls.length, PromptRuns: promptRuns };
}

// ─── Small parsing helpers (no casts) ────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An agent's own AgentTypePromptParams as an object; an empty one when it has none. */
function agentParams(agent: MJAIAgentEntityExtended): Record<string, unknown> {
    if (!agent.AgentTypePromptParams) {
        return {};
    }
    const parsed: unknown = JSON.parse(agent.AgentTypePromptParams);
    Assert(isRecord(parsed), `${agent.Name}: AgentTypePromptParams is not a JSON object`);
    return isRecord(parsed) ? parsed : {};
}

/** The `decisionsEnabled` entry of the synced Loop agent type's PromptParamsSchema. */
function loopSchemaSwitch(): Record<string, unknown> {
    const loop = AIEngine.Instance.AgentTypes.find(t => t.Name === 'Loop');
    Assert(!!loop?.PromptParamsSchema, 'The Loop agent type has no PromptParamsSchema in this database');
    const schema: unknown = JSON.parse(loop!.PromptParamsSchema!);
    const properties = isRecord(schema) ? schema.properties : undefined;
    const entry = isRecord(properties) ? properties.decisionsEnabled : undefined;
    Assert(isRecord(entry), 'The Loop PromptParamsSchema declares no decisionsEnabled property: sync the metadata (mj sync push --dir=metadata)');
    return isRecord(entry) ? entry : {};
}

// ─── The checks ──────────────────────────────────────────────────────────────────────────────────

export const AgentDecisionsSwitchChecks: NamedCheck[] = [
    {
        Id: 'agent-decisions-switch.DS1',
        Name: 'DS1: the synced Loop schema declares decisionsEnabled off by default, and the seeded agents carry the params the bundle relies on',
        Fn: async (): Promise<void> => {
            const entry = loopSchemaSwitch();
            AssertEqual(entry.type, 'boolean', 'decisionsEnabled schema type');
            AssertEqual(entry.default, false, 'decisionsEnabled schema default');

            const { Agents } = requireFixture();
            for (const agent of [Agents.Default, Agents.SubFlags, Agents.MemoryManager]) {
                Assert(!('decisionsEnabled' in agentParams(agent)), `${agent.Name} must not set decisionsEnabled: its checks test the default`);
            }
            const subFlags = agentParams(Agents.SubFlags);
            for (const [key, value] of Object.entries({ includeDecisionsDocs: true, finishIfMode: 'on', decisionDiscovery: true, payloadFeedbackCheck: true, maxActionsInPrompt: 1 })) {
                AssertEqual(subFlags[key], value, `${Agents.SubFlags.Name}: ${key}`);
            }
            const explicitFields = subFlags.includeResponseTypeDefinition;
            Assert(isRecord(explicitFields) && explicitFields.decisions === true && explicitFields.finishIf === true,
                `${Agents.SubFlags.Name}: includeResponseTypeDefinition must set decisions and finishIf to true explicitly`);
            AssertEqual(agentParams(Agents.Enabled).decisionsEnabled, true, `${Agents.Enabled.Name}: decisionsEnabled`);
        },
    },
    {
        Id: 'agent-decisions-switch.DS2',
        Name: 'DS2: with the switch left at its default, a loop agent whose run turns inline decisions and finishIf on, and whose replies request both, asks nothing and completes normally',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            // The run turns both uses on but never mentions the switch, so only the Loop type's default
            // for it stands between the replies and a decision model.
            const obs = await runScripted(ctx, requireFixture().Agents.Default, { __agentTypePromptParams: { includeDecisionsDocs: true, finishIfMode: 'on' } });
            assertSwitchOffRun(obs, 'DS2');
        },
    },
    {
        Id: 'agent-decisions-switch.DS3',
        Name: 'DS3: with every governed setting on but not the switch, nothing is asked, the prompt has no decisions or finishIf docs, and it lists every action',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const obs = await runScripted(ctx, requireFixture().Agents.SubFlags);
            assertSwitchOffRun(obs, 'DS3');
            for (const shown of [CATALOG.CalculateExpression, CATALOG.GetWeather]) {
                Assert(obs.FirstPrompt.includes(shown), `DS3: the prompt does not describe every action ("${shown}" is missing)`);
            }
            Assert(!obs.FirstPrompt.includes(CATALOG.NarrowingNote), 'DS3: the prompt says catalog narrowing hid an action');
            const payload = obs.Result.payload;
            AssertEqual(isRecord(payload) ? payload.notes : undefined, 'short', 'DS3: the shortened notes are kept unchecked');
        },
    },
    {
        Id: 'agent-decisions-switch.DS4',
        Name: 'DS4: an agent whose own params turn the switch on asks for its inline decision and its finishIf gate, and the passing gate ends the run',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const agent = requireFixture().Agents.Enabled;
            const obs = await runScripted(ctx, agent);
            assertCompleted(obs, FINISHED_MESSAGE, 'DS4');
            AssertEqual(obs.ChatCalls, 2, 'DS4: chat calls (the passing gate ends the run without a third turn)');
            // Discovery, narrowing and the payload check stay off: the switch only lets each use its own setting.
            await assertAsked(ctx, obs, agent, [STEP_NAMES.InlineDecision, STEP_NAMES.FinishCheck], 'DS4');
            assertPromptOffersDecisions(obs, 'DS4');
        },
    },
    {
        Id: 'agent-decisions-switch.DS5',
        Name: 'DS5: the per-run override decisionsEnabled true turns all five governed loop uses on for that run',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const agent = requireFixture().Agents.SubFlags;
            const obs = await runScripted(ctx, agent, { __agentTypePromptParams: { decisionsEnabled: true } });
            assertCompleted(obs, FINISHED_MESSAGE, 'DS5');
            AssertEqual(obs.ChatCalls, 2, 'DS5: chat calls (the passing gate ends the run without a third turn)');
            await assertAsked(ctx, obs, agent, Object.values(STEP_NAMES), 'DS5');
            assertPromptOffersDecisions(obs, 'DS5');
            // The narrowing decision judged Get Weather not useful (the stand-in's low Likelihood), so at a limit of one it is hidden.
            Assert(obs.FirstPrompt.includes(CATALOG.CalculateExpression), 'DS5: catalog narrowing hid Calculate Expression, which the decision judged useful');
            Assert(!obs.FirstPrompt.includes(CATALOG.GetWeather), 'DS5: catalog narrowing still describes Get Weather, which the decision judged not useful');
            Assert(obs.FirstPrompt.includes(CATALOG.NarrowingNote), 'DS5: the narrowed action list does not say an action is hidden');
        },
    },
    {
        Id: 'agent-decisions-switch.DS6',
        Name: 'DS6: the override lasts one run: the same agent run again without it asks nothing',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            // AIEngine now holds this agent's base params from DS3 and DS5, so discovery reads the warm cache.
            const obs = await runScripted(ctx, requireFixture().Agents.SubFlags);
            assertSwitchOffRun(obs, 'DS6');
        },
    },
    {
        Id: 'agent-decisions-switch.DS7',
        Name: 'DS7: the per-run override decisionsEnabled false turns the switch off for an agent configured on',
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const obs = await runScripted(ctx, requireFixture().Agents.Enabled, { __agentTypePromptParams: { decisionsEnabled: false } });
            assertSwitchOffRun(obs, 'DS7');
        },
    },
    {
        Id: 'agent-decisions-switch.DS8',
        Name: "DS8: the Memory Manager's note gate asks nothing with enableDecisionGate on and the switch off, and asks once with the switch on for the run",
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const off = await runMemoryGate(ctx, { enableDecisionGate: true });
            AssertEqual(off.GateFlag, true, 'DS8 off: the run turned the gate flag on');
            AssertEqual(off.DecisionCalls, 0, 'DS8 off: decision calls');
            AssertEqual(off.PromptRuns.length, 0, 'DS8 off: Default Decision prompt runs about the notes');
            AssertEqual(off.Kept.length, 1, 'DS8 off: the confidence filter keeps only the confident note');

            const on = await runMemoryGate(ctx, { enableDecisionGate: true, __agentTypePromptParams: { decisionsEnabled: true } });
            AssertEqual(on.GateFlag, true, 'DS8 on: the run turned the gate flag on');
            AssertEqual(on.DecisionCalls, 1, 'DS8 on: decision calls');
            AssertEqual(on.PromptRuns.length, 1, 'DS8 on: Default Decision prompt runs about the notes');
            AssertEqual(on.PromptRuns[0].Success, true, 'DS8 on: the decision prompt run succeeded');
        },
    },
    {
        Id: 'agent-decisions-switch.DS9',
        Name: "DS9: a Flow agent's Decision step runs with the switch off: an explicit use is not gated",
        Fn: async (ctx: IntegrationCheckContext): Promise<void> => {
            const f = requireFixture();
            armDoubles(f);
            const agent = f.Agents.Flow;
            const before = await countDecisionPromptRuns(ctx, agent.ID);
            // In this run, through BaseAgent's own Decision step, the path that sits beside the gated
            // uses. A top-level flow otherwise goes to the task-graph dispatcher, which this process does not run.
            const flowParams: FlowAgentExecuteParams = { executionMode: 'inRun' };
            const result = await MakeAIClient(ctx.Provider, ctx.User).RunAIAgent({
                agent,
                conversationMessages: UserTurn('Is the order ready to ship?'),
                payload: { order: { number: 'IT-DS9', status: 'packed and labelled' } },
                data: { __agentTypePromptParams: { decisionsEnabled: false } },
                agentTypeParams: flowParams,
                apiKeys: SCRIPTED_API_KEYS,
            });
            const obs = await observeRun(ctx, agent, result, before);
            AssertEqual(obs.Result.agentRun.Status, 'Completed', `DS9: run status (${obs.Result.agentRun.ErrorMessage ?? 'no error'})`);
            AssertEqual(obs.ChatCalls, 0, 'DS9: chat calls (a Decision step makes none)');
            // A flow records where it runs as a Decision step too; it asks no model.
            const routing = obs.DecisionSteps.filter(s => s.StepName === FLOW_ROUTING_STEP);
            AssertEqual(routing.length, 1, `DS9: '${FLOW_ROUTING_STEP}' steps`);
            Assert(!routing[0].TargetLogID, 'DS9: the routing step links a prompt run');
            const modelSteps = obs.DecisionSteps.filter(s => s.StepName !== FLOW_ROUTING_STEP);
            await assertAsked(ctx, obs, agent, ['Decision: ready_check'], 'DS9', modelSteps);
        },
    },
];

for (const check of AgentDecisionsSwitchChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────────

IntegrationCheckRegistry.Instance.RegisterLifecycle('agent-decisions-switch', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        await AIEngine.Instance.Config(false, ctx.User);
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name === DEFAULT_DECISION_PROMPT);
        if (!prompt) {
            throw new Error(`The '${DEFAULT_DECISION_PROMPT}' prompt is not in this database: sync the metadata (mj sync push --dir=metadata)`);
        }
        const llm = new TestLLM();
        const decider = new ScriptedDecision();
        decider.Arm();
        switchFixture = {
            Agents: loadAgents(),
            DefaultDecisionPromptID: prompt.ID,
            Llm: llm,
            Decider: decider,
            Restores: [RegisterTestLLM(llm, [...CHAT_DRIVER_CLASSES]), RegisterScriptedDecision(decider, SCRIPTED_DECISION_DRIVER_CLASSES)],
            RunIDs: [],
            PromptRunIDs: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const f = switchFixture;
        switchFixture = undefined;
        if (!f) {
            return;
        }
        f.Decider.Disarm();
        for (const restore of f.Restores) {
            restore();
        }
        for (const runId of f.RunIDs) {
            await purgeRun(ctx, runId).catch(err => console.error(`[agent-decisions-switch] cleanup of run ${runId} failed:`, err));
        }
        for (const promptRunId of f.PromptRunIDs) {
            await deletePromptRunTree(ctx, promptRunId).catch(err => console.error(`[agent-decisions-switch] cleanup of prompt run ${promptRunId} failed:`, err));
        }
    },
});

// ─── Teardown helpers ────────────────────────────────────────────────────────────────────────────

/** Deletes a prompt run after its children (a hierarchical prompt's child runs point at their parent). */
async function deletePromptRunTree(ctx: IntegrationCheckContext, promptRunId: string): Promise<void> {
    const children = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: 'MJ: AI Prompt Runs',
        ExtraFilter: `ParentID='${EscapeSQLString(promptRunId)}'`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    for (const child of children.Success ? children.Results : []) {
        await deletePromptRunTree(ctx, child.ID);
    }
    await DeleteById('MJ: AI Prompt Runs', promptRunId, ctx.Provider, ctx.User);
}

/**
 * Deletes one run and everything it wrote: its steps (a child step before its parent), then what the
 * steps point at (prompt runs, and the action execution logs of Actions steps), then the run.
 */
async function purgeRun(ctx: IntegrationCheckContext, runId: string): Promise<void> {
    const steps = await readSteps(ctx.Provider, ctx.User, runId);
    let remaining = [...steps];
    while (remaining.length > 0) {
        const parents = new Set(remaining.map(s => s.ParentID).filter((id): id is string => !!id));
        const leaves = remaining.filter(s => !parents.has(s.ID));
        for (const step of leaves.length > 0 ? leaves : remaining) {
            await DeleteById('MJ: AI Agent Run Steps', step.ID, ctx.Provider, ctx.User);
        }
        remaining = leaves.length > 0 ? remaining.filter(s => !leaves.includes(s)) : [];
    }
    for (const step of steps.filter(s => s.TargetLogID)) {
        if (PROMPT_RUN_STEP_TYPES.includes(step.StepType)) {
            await deletePromptRunTree(ctx, step.TargetLogID!);
        } else if (step.StepType === 'Actions') {
            await DeleteById('MJ: Action Execution Logs', step.TargetLogID!, ctx.Provider, ctx.User);
        }
    }
    await DeleteById('MJ: AI Agent Runs', runId, ctx.Provider, ctx.User);
}
