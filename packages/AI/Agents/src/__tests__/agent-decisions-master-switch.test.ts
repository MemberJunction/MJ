/**
 * The master switch for decision-model use by an agent: the Loop prompt param `decisionsEnabled`.
 *
 * Six automatic uses ask a decision model on an agent's behalf, each behind its own setting: inline
 * `decisions` (includeDecisionsDocs), finishIf gates (finishIfMode), decision discovery
 * (decisionDiscovery), the payload change check (payloadFeedbackCheck), catalog narrowing
 * (maxActionsInPrompt / maxSubAgentsInPrompt) and the Memory Manager's note gate (enableDecisionGate).
 *
 * Contract pinned:
 *   1. Off by default, and a hard stop: with every one of those settings on, including the
 *      `decisions` and `finishIf` response fields set explicitly, no use calls
 *      `AgentDecisionService.Ask`, and the merged prompt params render a system prompt with neither
 *      the decisions nor the finishIf docs or fields.
 *   2. With `decisionsEnabled: true`, each setting works as it did before the switch: one call per use.
 *
 * Each use is driven through the method that decides whether it runs, with the agent's prompt params
 * merged by the real `buildAgentTypePromptParams` over the Loop type's schema from metadata. The
 * decision boundary is `AgentDecisionService.Ask`, spied on its prototype, so every caller is seen.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';
import { EntityInfo, RunView, UserInfo } from '@memberjunction/core';
import { ChatResult } from '@memberjunction/ai';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import {
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
    type AgentDecisionRequest,
    type AIPromptRunResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
} from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';
import { MemoryManagerAgent } from '../memory-manager-agent';
import { AgentDecisionService } from '../AgentDecisionService';
import { PayloadWarningType, type PayloadAnalysisResult } from '../PayloadChangeAnalyzer';
import type { SubAgentStepResult } from '../finish-if-state';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

// The metadata singleton: the Loop type, and the agents discovery may suggest.
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return engine;
        },
    },
}));

// The permission boundary discovery filters its options through: every agent is runnable and discoverable.
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: async (): Promise<boolean> => true,
        FilterRunnableAgents: async <T>(agents: T[]): Promise<T[]> => agents,
        IsDirectlyDiscoverable: (): boolean => true,
    },
}));

// ============================================================================
// Fixture
// ============================================================================

const LOOP_TYPE_ID = 'dddddddd-0000-4000-8000-000000000001';
const AGENT_ID = 'dddddddd-0000-4000-8000-000000000002';
const USER_ID = 'dddddddd-0000-4000-8000-000000000003';
const OPENING_REQUEST = 'Please invoice Acme for the March consulting work';

// src/__tests__/ → repo root is 5 levels up (Agents → AI → packages → root).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const TEMPLATE_PATH = join(REPO_ROOT, 'metadata/prompts/templates/system/loop-agent-type-system-prompt.template.md');

/** Every automatic use turned on, and both decision response fields set explicitly. No master switch. */
const EVERY_USE_ON: Record<string, unknown> = {
    includeDecisionsDocs: true,
    finishIfMode: 'on',
    includeFinishIfDocs: true,
    includeResponseTypeDefinition: { decisions: true, finishIf: true },
    decisionDiscovery: true,
    payloadFeedbackCheck: true,
    maxActionsInPrompt: 1,
    maxSubAgentsInPrompt: 1,
};

/** The same, with the master switch on. */
const SWITCH_ON: Record<string, unknown> = { ...EVERY_USE_ON, decisionsEnabled: true };

/** An EntityInfo with just the named fields: enough for an entity object to hold them without a database. */
function entityInfo(name: string, fields: string[]): EntityInfo {
    return new EntityInfo({ Name: name, Fields: fields.map(field => ({ Name: field, Type: 'nvarchar', IsPrimaryKey: field === 'ID' })) });
}

/** The Loop agent type, with the PromptParamsSchema the metadata ships (and so its defaults). */
function loopAgentType(): MJAIAgentTypeEntity {
    const agentTypes: Array<{ fields: { Name: string; PromptParamsSchema?: Record<string, unknown> } }> =
        JSON.parse(readFileSync(join(REPO_ROOT, 'metadata/agent-types/.agent-types.json'), 'utf8'));
    const schema = agentTypes.find(t => t.fields.Name === 'Loop')?.fields.PromptParamsSchema;
    if (!schema) {
        throw new Error('The Loop agent type in metadata has no PromptParamsSchema');
    }
    const loop = new MJAIAgentTypeEntity(entityInfo('MJ: AI Agent Types', ['ID', 'Name', 'PromptParamsSchema']));
    loop.ID = LOOP_TYPE_ID;
    loop.Name = 'Loop';
    loop.PromptParamsSchema = JSON.stringify(schema);
    return loop;
}

const LOOP_TYPE = loopAgentType();

/** A Loop agent whose own AgentTypePromptParams are `promptParams`. */
function agentRow(id: string, name: string, promptParams?: Record<string, unknown>): MJAIAgentEntityExtended {
    const agent = new MJAIAgentEntityExtended(entityInfo('MJ: AI Agents', ['ID', 'Name', 'Description', 'TypeID', 'Status', 'AgentTypePromptParams']));
    agent.ID = id;
    agent.Name = name;
    agent.Description = `${name}: handles its own kind of request`;
    agent.TypeID = LOOP_TYPE_ID;
    agent.Status = 'Active';
    agent.AgentTypePromptParams = promptParams ? JSON.stringify(promptParams) : null;
    return agent;
}

/** Three agents discovery can choose between, the fewest that make it ask. */
const CANDIDATES = [
    { ID: 'dddddddd-1000-4000-8000-000000000001', Name: 'Research Agent', Description: 'Researches a topic', Status: 'Active', InvocationMode: 'Any', ParentID: null },
    { ID: 'dddddddd-1000-4000-8000-000000000002', Name: 'Billing Agent', Description: 'Creates and sends invoices', Status: 'Active', InvocationMode: 'Any', ParentID: null },
    { ID: 'dddddddd-1000-4000-8000-000000000003', Name: 'Marketing Agent', Description: 'Writes campaigns', Status: 'Active', InvocationMode: 'Any', ParentID: null },
];

/** Two sub-agents: one more than `maxSubAgentsInPrompt`, so narrowing has something to hide. */
const SUB_AGENTS = [
    agentRow('dddddddd-2000-4000-8000-000000000001', 'Invoice Writer'),
    agentRow('dddddddd-2000-4000-8000-000000000002', 'Report Writer'),
];

/** What the mocked AIEngine.Instance serves. */
const engine = {
    Agents: CANDIDATES,
    AgentTypes: [LOOP_TYPE],
    AgentActions: [],
    Prompts: [],
    PromptModels: [],
    ModelVendors: [],
    GetEffectiveModelConfiguration: (): undefined => undefined,
    GetAgentBaseCatalog: (): undefined => undefined,
};

const USER = new UserInfo(null, { ID: USER_ID, Name: 'Switch Tester', Email: 'switch@test.mj' });

/** A decision request a model sent on its turn. */
const TRIAGE: AgentDecisionRequest = { id: 'triage', state: 'The printer is on fire.', questions: { urgent: { kind: 'Likelihood', instructions: 'Is this urgent?' } } };

/** A step that does not end the run, so a turn reads what the uses add. */
const RETRY_STEP: BaseAgentNextStep = { step: 'Retry', terminate: false };

/** A single Sub-Agent step carrying a finishIf gate, and the sub-agent's successful result. */
const GATED_SUB_AGENT_STEP: BaseAgentNextStep = {
    step: 'Sub-Agent',
    terminate: false,
    subAgent: { name: 'Invoice Writer', message: 'Write the invoice', terminateAfter: false },
    finishIf: { questions: ['The results show the invoice was written.'], message: 'Done: the invoice is written.' },
};
const SUB_AGENT_SUCCEEDED: SubAgentStepResult<Record<string, unknown>> = { step: 'Success', terminate: false, message: 'Invoice written.', newPayload: {} };

/** A payload change the analyzer flags for feedback: a summary cut to one line. */
const FLAGGED_CHANGE: { requiresFeedback: boolean; analysis: PayloadAnalysisResult } = {
    requiresFeedback: true,
    analysis: {
        warnings: [{
            type: PayloadWarningType.ContentTruncation,
            severity: 'high',
            path: 'summary',
            message: 'Content reduced by 98%',
            requiresFeedback: true,
            details: { originalLength: 300, newLength: 6, reductionPercentage: 98 },
        }],
        criticalWarnings: [],
        requiresFeedback: true,
        summary: {
            totalWarnings: 1,
            warningsByType: {
                [PayloadWarningType.ContentTruncation]: 1,
                [PayloadWarningType.KeyRemoval]: 0,
                [PayloadWarningType.TypeChange]: 0,
                [PayloadWarningType.PatternAnomaly]: 0,
                [PayloadWarningType.UnintendedOverwrite]: 0,
            },
            suspiciousChanges: 0,
        },
    },
};

/** The prompt result that carried the payload change. */
const PROMPT_RESULT: AIPromptRunResult = { success: true, result: '{}', chatResult: new ChatResult(true, new Date(0), new Date(0)) };

/** What the spied decision service answers: nothing usable, which every use already handles. */
const UNANSWERED: AIDecisionRunResult = { success: false, errorMessage: 'not answered in this test', Answers: {} };

/** A step entity that saves nowhere. */
class UnsavedStep extends MJAIAgentRunStepEntityExtended {
    public override async Save(): Promise<boolean> {
        return true;
    }
}

/**
 * A Loop agent that reaches each use through the method that decides whether it runs. The run state
 * `Execute()` sets first, and the private methods, are reached through bracket access.
 */
class SwitchAgent extends BaseAgent {
    /** Merges the prompt params as a run of `agent` does: the Loop type's defaults, the agent's own, then `overrides`. */
    public MergePromptParams(agent: MJAIAgentEntityExtended, overrides?: Record<string, unknown>): Record<string, unknown> {
        return this.buildAgentTypePromptParams(LOOP_TYPE, agent, overrides);
    }

    /** The run state `Execute()` and the turn's prompt set before these uses run. */
    public StartTurn(promptParams: Record<string, unknown>): void {
        this['_openingRequest'] = OPENING_REQUEST;
        this['_isOpeningTurn'] = true;
        this['_agentTypePromptParams'] = promptParams;
    }

    /** Inline `decisions`: the requests a model sent on its turn. */
    public AnswerTurnDecisions(promptParams: Record<string, unknown>, params: ExecuteAgentParams): Promise<void> {
        return this['processTurnDecisions']([TRIAGE], RETRY_STEP, {}, promptParams, params);
    }

    /** A finishIf gate, after the sub-agent its step ran succeeded. Reads the turn's prompt params. */
    public RunFinishIfGate(params: ExecuteAgentParams): Promise<BaseAgentNextStep | undefined> {
        return this['finishAfterSubAgent'](params, GATED_SUB_AGENT_STEP, SUB_AGENT_SUCCEEDED);
    }

    /** Decision discovery, before the first prompt. Reads the agent's prompt params and the run's overrides. */
    public Discover(params: ExecuteAgentParams): Promise<void> {
        return this.InjectDecisionDiscovery(params.agent, params.contextUser, params.conversationMessages, params.data);
    }

    /** The payload change check, on a change the analyzer flagged. */
    public CheckPayloadChange(promptParams: Record<string, unknown>, params: ExecuteAgentParams): Promise<void> {
        return this['checkPayloadChangesWhenOn'](FLAGGED_CHANGE, RETRY_STEP, PROMPT_RESULT, promptParams, params);
    }

    /** Catalog narrowing, on the first prompt, over two sub-agents. */
    public NarrowCatalog(promptParams: Record<string, unknown>, params: ExecuteAgentParams): Promise<void> {
        return this['ensureCatalogNarrowing'](params.agent, params.contextUser, promptParams, [], SUB_AGENTS, []);
    }

    protected override async createStepEntity(params: { stepType: MJAIAgentRunStepEntityExtended['StepType']; stepName: string }): Promise<MJAIAgentRunStepEntityExtended> {
        const step = new UnsavedStep(entityInfo('MJ: AI Agent Run Steps', ['ID', 'StepType', 'StepName', 'TargetLogID']));
        step.StepType = params.stepType;
        step.StepName = params.stepName;
        return step;
    }

    protected override async finalizeStepEntity(): Promise<void> {
        // The steps save nowhere.
    }
}

/** A candidate memory note, in the shape the extraction prompt returns it. */
interface NoteShape {
    type: 'Preference' | 'Constraint' | 'Context' | 'Example' | 'Issue';
    content: string;
    confidence: number;
}

/** A conversation thread, in the shape extraction reads it. */
interface ThreadShape {
    conversationId: string;
    messages: Array<{ id: string; role: string; message: string; createdAt: Date; rating: number | null; ratingComment: string | null }>;
}

const NOTES: NoteShape[] = [{ type: 'Preference', content: 'Prefers dark mode theme', confidence: 95 }];
const THREADS: ThreadShape[] = [{
    conversationId: 'dddddddd-3000-4000-8000-000000000001',
    messages: [{ id: 'm1', role: 'user', message: 'I prefer dark mode', createdAt: new Date(0), rating: null, ratingComment: null }],
}];

/** The Memory Manager, run as a scheduled run starts it, then its note gate as extraction runs it. */
class SwitchMemoryManager extends MemoryManagerAgent {
    public RunExecute(params: ExecuteAgentParams): Promise<{ finalStep: BaseAgentNextStep<Record<string, unknown>>; stepCount: number }> {
        return this.executeAgentInternal<Record<string, unknown>>(params, { success: true });
    }

    public RunGate(): Promise<NoteShape[]> {
        return this.filterCandidateNotes(NOTES, THREADS, USER, true);
    }
}

/** A run of an agent whose own prompt params are `agentPromptParams`, on its conversation's opening request. */
function runParams(agentPromptParams: Record<string, unknown>, data?: Record<string, unknown>): ExecuteAgentParams {
    return {
        agent: agentRow(AGENT_ID, 'Switch Agent', agentPromptParams),
        conversationMessages: [{ role: 'user', content: OPENING_REQUEST }],
        contextUser: USER,
        data,
    };
}

/** The real Loop system prompt template, rendered with `promptParams`. */
function renderSystemPrompt(promptParams: Record<string, unknown>): string {
    const env = new nunjucks.Environment(null, { autoescape: false, throwOnUndefined: false });
    return env.renderString(readFileSync(TEMPLATE_PATH, 'utf8'), { __agentTypePromptParams: promptParams, agentName: 'Switch Agent' });
}

/** What the template renders for the decisions and finishIf docs and fields. */
const DECISION_PROMPT_PARTS = [
    'decisions?: AgentDecisionRequest[];',
    '## Decisions',
    'finishIf?: AgentFinishIf;',
    '## Finishing after an action or sub-agent',
    'agent-decisions.ts.generated-for-prompt.md',
];

/** One automatic use, as the agent configured with `promptParams` runs it. */
type DecisionUse = (agentPromptParams: Record<string, unknown>) => Promise<void>;

/**
 * Each automatic use, run for an agent whose own prompt params are `agentPromptParams`. The turn-time
 * uses read the params as the turn's prompt merged them.
 */
const USES: Array<[string, DecisionUse]> = [
    ['inline decisions', async (agentPromptParams) => {
        const agent = new SwitchAgent();
        const params = runParams(agentPromptParams);
        await agent.AnswerTurnDecisions(agent.MergePromptParams(params.agent), params);
    }],
    ['a finishIf gate', async (agentPromptParams) => {
        const agent = new SwitchAgent();
        const params = runParams(agentPromptParams);
        agent.StartTurn(agent.MergePromptParams(params.agent));
        await agent.RunFinishIfGate(params);
    }],
    ['decision discovery', async (agentPromptParams) => {
        const agent = new SwitchAgent();
        agent.StartTurn({});
        await agent.Discover(runParams(agentPromptParams));
    }],
    ['the payload change check', async (agentPromptParams) => {
        const agent = new SwitchAgent();
        const params = runParams(agentPromptParams);
        await agent.CheckPayloadChange(agent.MergePromptParams(params.agent), params);
    }],
    ['catalog narrowing', async (agentPromptParams) => {
        const agent = new SwitchAgent();
        const params = runParams(agentPromptParams);
        agent.StartTurn({});
        await agent.NarrowCatalog(agent.MergePromptParams(params.agent), params);
    }],
    ["the Memory Manager's note gate", async (agentPromptParams) => {
        const memoryManager = new SwitchMemoryManager();
        await memoryManager.RunExecute(runParams(agentPromptParams, { enableDecisionGate: true }));
        await memoryManager.RunGate();
    }],
];

// ============================================================================
// Specs
// ============================================================================

describe('decisionsEnabled, the master switch for decision-model use', () => {
    let ask: MockInstance<AgentDecisionService['Ask']>;

    beforeEach(() => {
        ask = vi.spyOn(AgentDecisionService.prototype, 'Ask').mockResolvedValue(UNANSWERED);
        // The Memory Manager's run start: no agent injects memory and there is no earlier run.
        vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
            Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: ''
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is declared off by default in the Loop agent type, so an agent that sets nothing has it off', () => {
        const merged = new SwitchAgent().MergePromptParams(agentRow(AGENT_ID, 'Switch Agent'));
        expect(merged.decisionsEnabled).toBe(false);
    });

    describe('off (the default), with every automatic use turned on', () => {
        it.each(USES)('%s never asks a decision model', async (_label, use) => {
            await use(EVERY_USE_ON);

            expect(ask).not.toHaveBeenCalled();
        });

        it('skips inline decisions at runtime even when the response field is set explicitly', async () => {
            const agent = new SwitchAgent();
            const params = runParams(EVERY_USE_ON);

            // The prompt params as written, with no merge to turn the field off first.
            await agent.AnswerTurnDecisions({ includeDecisionsDocs: true, includeResponseTypeDefinition: { decisions: true } }, params);

            expect(ask).not.toHaveBeenCalled();
            expect(params.conversationMessages).toHaveLength(1);
        });

        it('never evaluates a finishIf gate, whatever finishIfMode and the response field say', async () => {
            const agent = new SwitchAgent();
            agent.StartTurn({ finishIfMode: 'on', includeResponseTypeDefinition: { finishIf: true } });

            const ended = await agent.RunFinishIfGate(runParams(EVERY_USE_ON));

            expect(ended).toBeUndefined();
            expect(ask).not.toHaveBeenCalled();
        });

        it('leaves the decisions and finishIf docs and response fields out of the prompt', () => {
            const merged = new SwitchAgent().MergePromptParams(agentRow(AGENT_ID, 'Switch Agent', EVERY_USE_ON));

            expect(merged).toMatchObject({
                includeDecisionsDocs: false,
                includeFinishIfDocs: false,
                includeResponseTypeDefinition: { decisions: false, finishIf: false },
            });
            const prompt = renderSystemPrompt(merged);
            for (const part of DECISION_PROMPT_PARTS) {
                expect(prompt).not.toContain(part);
            }
        });

        it('is turned off for one run by a per-run override, over an agent that turns it on', async () => {
            const agent = new SwitchAgent();
            agent.StartTurn({});

            await agent.Discover(runParams(SWITCH_ON, { __agentTypePromptParams: { decisionsEnabled: false } }));

            expect(ask).not.toHaveBeenCalled();
        });
    });

    describe('with decisionsEnabled: true, each setting works as it did before the switch', () => {
        it.each(USES)('%s asks one decision', async (_label, use) => {
            await use(SWITCH_ON);

            expect(ask).toHaveBeenCalledTimes(1);
        });

        it('puts the decisions and finishIf docs and response fields in the prompt', () => {
            const merged = new SwitchAgent().MergePromptParams(agentRow(AGENT_ID, 'Switch Agent', SWITCH_ON));

            const prompt = renderSystemPrompt(merged);
            for (const part of DECISION_PROMPT_PARTS) {
                expect(prompt).toContain(part);
            }
        });

        it('is turned on for one run by a per-run override', async () => {
            const agent = new SwitchAgent();
            agent.StartTurn({});

            await agent.Discover(runParams(EVERY_USE_ON, { __agentTypePromptParams: { decisionsEnabled: true } }));

            expect(ask).toHaveBeenCalledTimes(1);
        });
    });
});
