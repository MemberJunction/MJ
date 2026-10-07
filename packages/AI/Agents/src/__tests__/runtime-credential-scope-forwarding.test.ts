/**
 * The run's execution scope — configuration, runtime API keys and credential scope — has to reach
 * every piece of model work a run starts outside the agent's own turn. A path that drops it runs on
 * the platform's keys inside a customer's run, and under `'RuntimeOnly'` bypasses the scope silently.
 *
 * Each test here guards ONE forwarding point, and fails when that point stops forwarding:
 *   - AgentDecisionService.Ask copies ExecutionScope onto the AIDecisionParams;
 *   - BaseAgent's summarize-range sub-call builds its prompt params from the run's scope;
 *   - BaseAgent's self-check hands the run's scope to ProviderRubricEngine;
 *   - the rubric evaluation agent runner forwards that scope into RunAgent;
 *   - AgentRunner's conversation naming prompt runs on the run's credentials.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { AIDecisionRunner, AIPromptRunner } from '@memberjunction/ai-prompts';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type {
    AIPromptExecutionScope,
    AIPromptParams,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { SelfCheckLinkRow } from '../self-check';
import type { ConversationToolSummaryHost } from '../ConversationToolManager';

const hoisted = vi.hoisted(() => {
    const state: {
        prompts: Array<{ ID: string; Name: string }>;
        agentRunnerFactory: ((provider: unknown, user: unknown, scope?: unknown) => { Run(input: Record<string, unknown>): Promise<unknown> }) | undefined;
    } = { prompts: [], agentRunnerFactory: undefined };
    return state;
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: async (): Promise<void> => undefined,
                get Prompts() {
                    return hoisted.prompts;
                },
                Agents: [],
                AgentRelationships: [],
                AgentActions: [],
                GetSubAgents: (): unknown[] => [],
            };
        },
    },
}));

vi.mock('@memberjunction/rubrics', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        ProviderRubricEngine: vi.fn(() => ({})),
        RegisterRubricAgentRunner: (factory: typeof hoisted.agentRunnerFactory): void => {
            hoisted.agentRunnerFactory = factory;
        },
    };
});

vi.mock('../self-check', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        ExecuteSelfCheck: vi.fn(async () => ({ step: 'Success' })),
    };
});

// Imported after the mocks are declared (vi.mock is hoisted regardless; this keeps the order readable).
import { ProviderRubricEngine } from '@memberjunction/rubrics';
import { AgentDecisionService } from '../AgentDecisionService';
import { BaseAgent } from '../base-agent';
import { AgentRunner } from '../AgentRunner';
// Side effect: registers the rubric evaluation agent runner through the mocked RegisterRubricAgentRunner.
import '../rubric-evaluation-agent-runner';

const USER = { ID: 'aaaaaaaa-0000-4000-8000-0000000000aa', Name: 'Scope Tester', Email: 'scope@test.mj' } as unknown as UserInfo;
const PROVIDER = { tag: 'isolated-provider' } as unknown as IMetadataProvider;
const KEYS = [{ driverClass: 'GeminiLLM', apiKey: 'sk-gemini' }];
const CONFIGURATION_ID = 'aaaaaaaa-0000-4000-8000-0000000000cc';
const AGENT = { ID: 'aaaaaaaa-0000-4000-8000-0000000000dd', Name: 'Scoped Agent' } as unknown as MJAIAgentEntityExtended;

/** The run params of a customer run that may spend only its own keys. */
function runtimeOnlyParams(): ExecuteAgentParams {
    return {
        agent: AGENT,
        conversationMessages: [],
        contextUser: USER,
        provider: PROVIDER,
        apiKeys: KEYS,
        configurationId: CONFIGURATION_ID,
        CredentialScope: 'RuntimeOnly',
    };
}

/** Records every prompt it is asked to run and answers with a plain summary. */
class CapturingPromptRunner {
    public readonly Calls: AIPromptParams[] = [];
    public async ExecutePrompt(params: AIPromptParams): Promise<AIPromptRunResult> {
        this.Calls.push(params);
        return { success: true, result: 'A short summary.', chatResult: {} as AIPromptRunResult['chatResult'] };
    }
}

/** The BaseAgent members these tests reach, narrowed from their real types. */
interface ScopedAgentInternals {
    _promptRunner: CapturingPromptRunner;
    _selfCheckLinkByAgent: Map<string, SelfCheckLinkRow | null>;
    applySelfCheck(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep,
        agentRun: MJAIAgentRunEntityExtended,
        currentPayload: Record<string, unknown>
    ): Promise<BaseAgentNextStep | null>;
}

class ScopedAgent extends BaseAgent {
    public SummaryHost(params: ExecuteAgentParams): ConversationToolSummaryHost {
        return this.buildConversationSummaryHost(params);
    }
}

/** The AgentRunner member the naming test reaches. */
interface AgentRunnerInternals {
    generateConversationName(
        userMessage: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        credentials?: Pick<ExecuteAgentParams, 'configurationId' | 'apiKeys' | 'CredentialScope'>
    ): Promise<{ name: string; description: string } | null>;
}

beforeEach(() => {
    hoisted.prompts = [];
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AgentDecisionService.Ask — a decision call spends the asking run\'s credentials', () => {
    it('copies ExecutionScope onto the decision params, and still names the asking user', async () => {
        hoisted.prompts = [{ ID: 'prompt-decision', Name: 'Default Decision' }];
        const execute = vi.spyOn(AIDecisionRunner.prototype, 'ExecuteDecision')
            .mockResolvedValue({ success: true, Answers: {} } as AIDecisionRunResult);
        const scope: AIPromptExecutionScope = {
            contextUser: { ID: 'someone-else' } as unknown as UserInfo,
            apiKeys: KEYS,
            configurationId: CONFIGURATION_ID,
            CredentialScope: 'RuntimeOnly',
        };

        const result = await new AgentDecisionService().Ask({ State: 's', Questions: {}, ContextUser: USER, ExecutionScope: scope });

        expect(result.success).toBe(true);
        expect(execute).toHaveBeenCalledOnce();
        const sent: AIDecisionParams = execute.mock.calls[0][0];
        expect(sent.apiKeys).toBe(KEYS);
        expect(sent.configurationId).toBe(CONFIGURATION_ID);
        expect(sent.CredentialScope).toBe('RuntimeOnly');
        expect(sent.contextUser).toBe(USER); // ContextUser wins over the scope's
    });
});

describe('BaseAgent summarize-range sub-call — runs on the run\'s execution scope', () => {
    it('the summarize prompt carries the run\'s keys, configuration and RuntimeOnly scope', async () => {
        hoisted.prompts = [{ ID: 'prompt-summarize', Name: BaseAgent.SummarizeRangePromptName }];
        const agent = new ScopedAgent();
        const runner = new CapturingPromptRunner();
        (agent as unknown as ScopedAgentInternals)._promptRunner = runner;

        const out = await agent.SummaryHost(runtimeOnlyParams()).RunSummaryPrompt('[1] user: hi', 'facts');

        expect(out.text).toBe('A short summary.');
        expect(runner.Calls).toHaveLength(1);
        const sent = runner.Calls[0];
        expect(sent.apiKeys).toBe(KEYS);
        expect(sent.configurationId).toBe(CONFIGURATION_ID);
        expect(sent.CredentialScope).toBe('RuntimeOnly');
        expect(sent.provider).toBe(PROVIDER);
    });
});

describe('BaseAgent self-check — the rubric engine judges on the run\'s execution scope', () => {
    it('hands ProviderRubricEngine the run\'s keys, configuration and RuntimeOnly scope', async () => {
        const agent = new ScopedAgent();
        const internals = agent as unknown as ScopedAgentInternals;
        const agentRun = { ID: 'run-1', AgentID: AGENT.ID } as unknown as MJAIAgentRunEntityExtended;
        // A cached link, so the self-check does not read the database for it.
        internals._selfCheckLinkByAgent.set(AGENT.ID, { RubricID: 'rubric-1', Purpose: 'SelfCheck', Status: 'Active' } as SelfCheckLinkRow);

        const outcome = await internals.applySelfCheck(runtimeOnlyParams(), { terminate: true, step: 'Success' }, agentRun, {});

        expect(outcome).toBeNull();
        const engine = vi.mocked(ProviderRubricEngine);
        expect(engine).toHaveBeenCalled();
        const [provider, user, scope] = engine.mock.calls[engine.mock.calls.length - 1];
        expect(provider).toBe(PROVIDER);
        expect(user).toBe(USER);
        expect(scope?.apiKeys).toBe(KEYS);
        expect(scope?.configurationId).toBe(CONFIGURATION_ID);
        expect(scope?.CredentialScope).toBe('RuntimeOnly');
    });
});

describe('Rubric evaluation agent runner — the evaluation agent runs on the evaluating run\'s scope', () => {
    it('forwards configurationId, apiKeys and CredentialScope into RunAgent', async () => {
        const evaluationAgent = { ID: 'eval-agent', Name: 'Rubric Evaluation Agent' };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: async () => ({ Success: true, Results: [evaluationAgent] }),
        } as unknown as RunView);
        const runAgent = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockResolvedValue({
            success: true,
            payload: { decisions: [] },
            agentRun: { ID: 'eval-run' },
        } as unknown as ExecuteAgentResult);
        const scope: AIPromptExecutionScope = { apiKeys: KEYS, configurationId: CONFIGURATION_ID, CredentialScope: 'RuntimeOnly' };

        expect(hoisted.agentRunnerFactory).toBeDefined();
        await hoisted.agentRunnerFactory?.(PROVIDER, USER, scope).Run({ version: {}, content: 'c', subject: {} });

        expect(runAgent).toHaveBeenCalledOnce();
        const sent = runAgent.mock.calls[0][0];
        expect(sent.agent).toBe(evaluationAgent);
        expect(sent.apiKeys).toBe(KEYS);
        expect(sent.configurationId).toBe(CONFIGURATION_ID);
        expect(sent.CredentialScope).toBe('RuntimeOnly');
    });
});

describe('AgentRunner conversation naming — runs on the credentials of the run it names', () => {
    it('the Name Conversation prompt carries the run\'s keys, configuration and RuntimeOnly scope', async () => {
        hoisted.prompts = [{ ID: 'prompt-name', Name: 'Name Conversation' }];
        const execute = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockResolvedValue({
            success: true,
            result: JSON.stringify({ name: 'Quarterly numbers', description: 'About the quarter' }),
        } as AIPromptRunResult);
        const runner = new AgentRunner(PROVIDER) as unknown as AgentRunnerInternals;

        const named = await runner.generateConversationName('How did Q3 go?', USER, PROVIDER, {
            apiKeys: KEYS,
            configurationId: CONFIGURATION_ID,
            CredentialScope: 'RuntimeOnly',
        });

        expect(named).toEqual({ name: 'Quarterly numbers', description: 'About the quarter' });
        expect(execute).toHaveBeenCalledOnce();
        const sent = execute.mock.calls[0][0];
        expect(sent.apiKeys).toBe(KEYS);
        expect(sent.configurationId).toBe(CONFIGURATION_ID);
        expect(sent.CredentialScope).toBe('RuntimeOnly');
    });
});
