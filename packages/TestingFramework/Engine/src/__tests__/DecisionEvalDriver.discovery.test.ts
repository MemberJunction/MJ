/**
 * @fileoverview The Decision Eval driver's `agent-discovery` decision, with the runner, the engine
 * and the semantic search faked: it builds the options and questions with production's shared
 * functions, pins the model, records what the brief asks for, applies production's timeout to the
 * whole discovery, runs the `semantic-search` baseline without a decision call, and skips what
 * production would not ask.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { EntitySearchResult, UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity, MJTestEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { DecisionResult, type DecisionAnswer } from '@memberjunction/ai';
import type { AIDecisionParams, AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import {
    BuildDecisionDiscoveryOptionSet,
    BuildDecisionDiscoveryQuestions,
    DECISION_DISCOVERY_MIN_OPTIONS,
    DECISION_DISCOVERY_TIMEOUT_MS,
    type DecisionDiscoveryAgent
} from '@memberjunction/ai-agents';
import {
    DecisionEvalDriver,
    DiscoveryTimedOutReason,
    type DecisionEvalRunner,
    type DiscoveryEvalEnvironment
} from '../drivers/DecisionEvalDriver';
import { DiscoveryLabelMatchOracle } from '../oracles/DiscoveryLabelMatchOracle';
import {
    DiscoveryEvalActualOutputSchema,
    type DiscoveryEvalActualOutput,
    type DiscoveryEvalConfig,
    type DiscoveryEvalExpected
} from '../decision-eval/discovery-types';
import type { DriverExecutionContext, DriverExecutionResult } from '../types';
import type { IOracle } from '../oracles/IOracle';

const PINNED_MODEL = '0B000000-0000-4000-8000-000000000001';
const PINNED_VENDOR = '0C000000-0000-4000-8000-000000000001';
const REQUEST = '  Can you send Acme their invoice for the March consulting hours?  ';
const STATE = REQUEST.trim();

function agent(id: string, name: string, overrides: Partial<DecisionDiscoveryAgent> = {}): DecisionDiscoveryAgent {
    return { ID: id, Name: name, Description: `${name}: handles its own work`, Status: 'Active', InvocationMode: 'Top-Level', ParentID: null, ...overrides };
}

const SAGE = agent('E1000000-0000-4000-8000-0000000000FF', 'Sage');
const RESEARCH = agent('E1000000-0000-4000-8000-000000000001', 'Research Agent');
const BILLING = agent('E1000000-0000-4000-8000-000000000002', 'Billing Agent');
const MARKETING = agent('E1000000-0000-4000-8000-000000000003', 'Marketing Agent');
const HELPER = agent('E1000000-0000-4000-8000-000000000004', 'Helper Sub', { InvocationMode: 'Sub-Agent' });
const RUNNABLE = [SAGE, RESEARCH, BILLING, MARKETING, HELPER];
const LEGAL = agent('E1000000-0000-4000-8000-000000000005', 'Legal Agent');
/** Four discoverable agents: over an option cap of 3, and still at production's floor of 3 once narrowed. */
const WIDE = [...RUNNABLE, LEGAL];

const PROMPT = { ID: 'prompt-1', Name: 'Default Decision' } satisfies Pick<MJAIPromptEntityExtended, 'ID' | 'Name'>;

/** Moves the faked clock on, as if `ms` passed. Only `Date` is faked (see the timeout tests). */
function takes(ms: number): void {
    vi.setSystemTime(Date.now() + ms);
}

/** The search's calls, and a search that ranks `ranked` with the given semantic scores, taking `ms`. */
class FakeSearch {
    public readonly Calls: Array<{ Request: string; TopK: number }> = [];

    constructor(private readonly ranked: Array<{ ID: string; Semantic?: number; Lexical?: number }> = [], private readonly ms: number = 0) {}

    public For(request: string) {
        return async (topK: number): Promise<EntitySearchResult[]> => {
            this.Calls.push({ Request: request, TopK: topK });
            if (this.ms > 0) {
                takes(this.ms);
            }
            return this.ranked.map((r, i) => ({
                entityRecordDocumentId: null, recordId: r.ID, score: 1 / (60 + i), matchType: 'hybrid',
                components: { semantic: r.Semantic, lexical: r.Lexical }
            }));
        };
    }
}

function environment(search: FakeSearch | null, overrides: Partial<DiscoveryEvalEnvironment> = {}): DiscoveryEvalEnvironment {
    return {
        Prompt: PROMPT as MJAIPromptEntityExtended,
        ConversationManager: SAGE,
        AllAgents: RUNNABLE,
        RunnableAgents: RUNNABLE,
        SearchFor: search ? (request: string) => search.For(request) : undefined,
        ...overrides
    };
}

/** A runner that records its calls and answers with a scripted result. */
class FakeRunner implements DecisionEvalRunner {
    public readonly Calls: AIDecisionParams[] = [];

    constructor(private readonly respond: () => Promise<AIDecisionRunResult>) {}

    public async ExecuteDecision(params: AIDecisionParams): Promise<AIDecisionRunResult> {
        this.Calls.push(params);
        return this.respond();
    }

    public async WaitForPendingPromptRunSaves(): Promise<void> {
        return;
    }
}

/** The driver, with the engine, the search and the runner replaced. */
class TestDriver extends DecisionEvalDriver {
    public readonly FailoverRequests: boolean[] = [];

    constructor(public readonly Runner: FakeRunner, private readonly environment: DiscoveryEvalEnvironment) {
        super();
    }

    protected override async LoadDiscoveryEnvironment(): Promise<DiscoveryEvalEnvironment> {
        return this.environment;
    }

    protected override CreateRunner(failoverAllowed: boolean): DecisionEvalRunner {
        this.FailoverRequests.push(failoverAllowed);
        return this.Runner;
    }
}

/** A successful call choosing `choice` with `confidence`, and saying a specialist applies with `applies`. */
function decided(choice: string, confidence: number, applies: number): AIDecisionRunResult {
    const answers: Record<string, DecisionAnswer> = {
        agent: { Kind: 'Choice', Value: choice, Confidence: confidence, Probabilities: { [choice]: confidence, [RESEARCH.ID]: 1 - confidence } },
        anyApplies: { Kind: 'Likelihood', Probability: applies }
    };
    const driverResult = new DecisionResult(true, new Date(0), new Date(1));
    driverResult.ResolvedModel = 'jev-2026-09-01';
    const promptRun = { ID: 'prun-1', TotalCost: 0.002, Cost: 0.002 } satisfies Pick<MJAIPromptRunEntity, 'ID' | 'TotalCost' | 'Cost'>;
    return {
        success: true,
        promptRun: promptRun as MJAIPromptRunEntity,
        cost: 0.002,
        modelInfo: { modelId: PINNED_MODEL, modelName: 'Jev', vendorId: PINNED_VENDOR, vendorName: 'Relay' },
        Answers: answers,
        DecisionResult: driverResult,
        DriverClass: 'JevDecision'
    };
}

const AGENT_LABEL: DiscoveryEvalExpected = { label: 'agent', agentId: BILLING.ID, labelSource: 'construction' };
const NONE_LABEL: DiscoveryEvalExpected = { label: 'none', kind: 'chat', labelSource: 'construction' };

function testEntity(config: Partial<DiscoveryEvalConfig>, expected: DiscoveryEvalExpected = AGENT_LABEL, request: string = REQUEST): MJTestEntity {
    const configuration: DiscoveryEvalConfig = { decision: 'agent-discovery', oracles: [{ type: 'discovery-label-match', weight: 1 }], ...config };
    const test = {
        Name: 'F1000000-0000-4000-8000-000000000001 [cell]',
        Configuration: JSON.stringify(configuration),
        InputDefinition: JSON.stringify({ request }),
        ExpectedOutcomes: JSON.stringify(expected),
        MaxExecutionTimeMS: null
    } satisfies Pick<MJTestEntity, 'Name' | 'Configuration' | 'InputDefinition' | 'ExpectedOutcomes' | 'MaxExecutionTimeMS'>;
    return test as MJTestEntity;
}

function context(test: MJTestEntity): DriverExecutionContext {
    const run = { ID: 'test-run-1' } satisfies Pick<MJTestRunEntity, 'ID'>;
    const user = { ID: 'user-1' } satisfies Pick<UserInfo, 'ID'>;
    return {
        test,
        testRun: run as MJTestRunEntity,
        contextUser: user as UserInfo,
        options: {},
        oracleRegistry: new Map<string, IOracle>([['discovery-label-match', new DiscoveryLabelMatchOracle()]])
    };
}

function actualOf(result: DriverExecutionResult): DiscoveryEvalActualOutput {
    return DiscoveryEvalActualOutputSchema.parse(result.actualOutput);
}

interface RunOptions {
    config?: Partial<DiscoveryEvalConfig>;
    expected?: DiscoveryEvalExpected;
    request?: string;
    environment?: DiscoveryEvalEnvironment;
    respond?: () => Promise<AIDecisionRunResult>;
}

async function run(options: RunOptions = {}) {
    const driver = new TestDriver(new FakeRunner(options.respond ?? (async () => decided(BILLING.ID, 0.9, 0.9))), options.environment ?? environment(new FakeSearch()));
    const result = await driver.Execute(context(testEntity(options.config ?? {}, options.expected, options.request)));
    return { driver, result };
}

describe('DecisionEvalDriver — agent discovery', () => {
    describe('what it asks', () => {
        it("asks one decision over production's options for the run's user, with production's state and questions", async () => {
            const search = new FakeSearch();
            const { driver } = await run({ environment: environment(search) });
            expect(driver.Runner.Calls).toHaveLength(1);
            const params = driver.Runner.Calls[0];
            const production = await BuildDecisionDiscoveryOptionSet({ Agents: RUNNABLE, RunningAgentID: SAGE.ID });
            expect(production.Options.map(o => o.Name)).toEqual(['Research Agent', 'Billing Agent', 'Marketing Agent']);
            expect(params.Questions).toEqual(BuildDecisionDiscoveryQuestions(production.Options));
            expect(params.State).toBe(STATE);
            expect(params.prompt).toBe(PROMPT);
            expect(params.contextUser?.ID).toBe('user-1');
            expect(params.agentId).toBeUndefined();
            expect(params.timeoutMS).toBeGreaterThan(0);
            // The options fit the limit, so the search does not run.
            expect(search.Calls).toEqual([]);
        });

        it("pins the cell's model with failover off, and keeps the prompt's own selection when nothing is pinned", async () => {
            const pinned = await run({ config: { modelId: PINNED_MODEL, vendorId: PINNED_VENDOR } });
            expect(pinned.driver.FailoverRequests).toEqual([false]);
            expect(pinned.driver.Runner.Calls[0].override).toEqual({ modelId: PINNED_MODEL, vendorId: PINNED_VENDOR });
            const unpinned = await run();
            expect(unpinned.driver.FailoverRequests).toEqual([true]);
            expect(unpinned.driver.Runner.Calls[0].override).toBeUndefined();
        });

        it("narrows a catalog over the prompt's option cap with the real search, and records it", async () => {
            const search = new FakeSearch([{ ID: SAGE.ID }, { ID: MARKETING.ID }, { ID: BILLING.ID }, { ID: LEGAL.ID }, { ID: RESEARCH.ID }]);
            const { driver, result } = await run({ environment: environment(search, { DeclaredCap: 3, RunnableAgents: WIDE, AllAgents: WIDE }) });
            expect(search.Calls).toEqual([{ Request: STATE, TopK: 9 }]);
            const choice = driver.Runner.Calls[0].Questions.agent;
            expect(choice.Kind === 'Choice' ? choice.Options.map(o => o.Value) : []).toEqual([MARKETING.ID, BILLING.ID, LEGAL.ID]);
            expect(actualOf(result).Options).toEqual({ Count: 3, Limit: 3, CatalogSize: 4, WithoutDescription: 0, DeclaredCap: 3, NarrowedFrom: 4 });
        });
    });

    describe('what it records', () => {
        it('records the chosen agent, its confidence and distribution, anyApplies, the verdict, the options, the model and the latency', async () => {
            const { result } = await run({ config: { modelId: PINNED_MODEL } });
            const actual = actualOf(result);
            expect(actual).toMatchObject({
                Decision: 'agent-discovery', Arm: 'decision', PromptName: 'Default Decision',
                ChosenAgentId: BILLING.ID, ChosenAgentName: 'Billing Agent', Confidence: 0.9, AnyApplies: 0.9,
                WouldInject: true, MinConfidence: 0.7, VerdictReason: null, LabelledAgentOffered: true,
                Options: { Count: 3, Limit: 25, CatalogSize: 3, WithoutDescription: 0, DeclaredCap: null, NarrowedFrom: null },
                Baseline: null, PromptRunId: 'prun-1', CostUSD: 0.002, Error: null, WithinProductionTimeout: true
            });
            expect(actual.Answers.agent).toEqual({ Kind: 'Choice', Value: BILLING.ID, Confidence: 0.9, Probabilities: { [BILLING.ID]: 0.9, [RESEARCH.ID]: expect.closeTo(0.1, 10) } });
            expect(actual.Answers.anyApplies).toEqual({ Kind: 'Likelihood', Probability: 0.9 });
            expect(actual.Model).toMatchObject({ PinnedModelId: PINNED_MODEL, AnsweredModelName: 'Jev', ResolvedModel: 'jev-2026-09-01', FailedOver: false });
            expect(actual.LatencyMs).toBeGreaterThanOrEqual(0);
            expect(actual.DiscoveryLatencyMs).toBeGreaterThanOrEqual(actual.LatencyMs ?? 0);
            expect(result).toMatchObject({ status: 'Passed', targetType: 'AI Prompt', targetLogId: 'prun-1', totalCost: 0.002 });
        });

        it("judges an unsure answer as production would: no injection, and why", async () => {
            const { result } = await run({ respond: async () => decided(BILLING.ID, 0.6, 0.9) });
            expect(actualOf(result)).toMatchObject({ WouldInject: false, Confidence: 0.6 });
            expect(actualOf(result).VerdictReason).toContain('below 0.7');
            // The agent label is still right: top-1 is the Choice, whatever its confidence.
            expect(result.status).toBe('Passed');
        });

        it('records whether the labelled agent could be chosen at all', async () => {
            const { result } = await run({ expected: { label: 'agent', agentId: HELPER.ID, labelSource: 'construction' } });
            expect(actualOf(result).LabelledAgentOffered).toBe(false);
            expect(result.status).toBe('Failed');
        });
    });

    describe("production's timeout", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        /** A catalog over the option cap, so the semantic search runs, taking `searchMs`; the call takes `callMs`. */
        async function timed(searchMs: number, callMs: number, expected: DiscoveryEvalExpected = AGENT_LABEL) {
            vi.useFakeTimers({ toFake: ['Date'] });
            const search = new FakeSearch([{ ID: BILLING.ID }, { ID: MARKETING.ID }, { ID: RESEARCH.ID }, { ID: LEGAL.ID }], searchMs);
            return run({
                expected,
                environment: environment(search, { DeclaredCap: 3, RunnableAgents: WIDE, AllAgents: WIDE }),
                respond: async () => {
                    takes(callMs);
                    return decided(BILLING.ID, 0.9, 0.9);
                }
            });
        }

        it('times the whole discovery, the semantic search included, as production does', async () => {
            const { result } = await timed(400, 700);
            expect(actualOf(result)).toMatchObject({ LatencyMs: 700, DiscoveryLatencyMs: 1100, WithinProductionTimeout: true, WouldInject: true });
        });

        it('records an answer that came after the timeout as not injected, with why, though the call alone was quick enough', async () => {
            const { result } = await timed(900, 700);
            const actual = actualOf(result);
            expect(actual).toMatchObject({
                LatencyMs: 700, DiscoveryLatencyMs: 1600, WithinProductionTimeout: false, WouldInject: false,
                // The answer is still recorded, for calibration and top-1.
                ChosenAgentId: BILLING.ID, Confidence: 0.9, AnyApplies: 0.9
            });
            expect(actual.VerdictReason).toBe(DiscoveryTimedOutReason(1600));
            expect(actual.VerdictReason).toMatch(/^timed out/);
            expect(result.status).toBe('Passed');
        });

        it('counts a discovery that took exactly the timeout as on time', async () => {
            const { result } = await timed(DECISION_DISCOVERY_TIMEOUT_MS - 500, 500);
            expect(actualOf(result)).toMatchObject({ DiscoveryLatencyMs: DECISION_DISCOVERY_TIMEOUT_MS, WithinProductionTimeout: true, WouldInject: true });
        });

        it('passes a none label when the suggestion would have come too late', async () => {
            const { result } = await timed(1000, 1000, NONE_LABEL);
            expect(actualOf(result).WouldInject).toBe(false);
            expect(result.status).toBe('Passed');
        });
    });

    describe('scoring', () => {
        it('fails an agent label when another agent was chosen', async () => {
            const { result } = await run({ respond: async () => decided(MARKETING.ID, 0.9, 0.9) });
            expect(result).toMatchObject({ status: 'Failed', score: 0, failedChecks: 1 });
        });

        it('passes a none label when discovery would not inject, and fails it when it would', async () => {
            expect((await run({ expected: NONE_LABEL, respond: async () => decided(BILLING.ID, 0.9, 0.3) })).result.status).toBe('Passed');
            expect((await run({ expected: NONE_LABEL, respond: async () => decided(BILLING.ID, 0.9, 0.8) })).result.status).toBe('Failed');
        });

        it('fails, without an answer to score, when the Choice names no option', async () => {
            const { result } = await run({ respond: async () => decided('E1000000-0000-4000-8000-000000000099', 0.9, 0.9) });
            expect(result.status).toBe('Failed');
            expect(actualOf(result)).toMatchObject({ ChosenAgentId: null, WouldInject: null, Error: null });
            expect(result.oracleResults[0].message).toContain('No usable answer');
        });
    });

    describe('what production would not ask', () => {
        it('skips a blank request and one that @mentions an agent, without a call', async () => {
            const blank = await run({ request: '   ' });
            expect(blank.result.status).toBe('Skipped');
            expect(blank.result.errorMessage).toContain('empty');
            const mention = await run({ request: '@Billing Agent please invoice Acme' });
            expect(mention.result.status).toBe('Skipped');
            expect(mention.result.errorMessage).toContain('@mentions');
            expect(blank.driver.Runner.Calls).toHaveLength(0);
            expect(mention.driver.Runner.Calls).toHaveLength(0);
        });

        it(`skips when fewer than production's ${DECISION_DISCOVERY_MIN_OPTIONS} agents are left to choose from, and asks at ${DECISION_DISCOVERY_MIN_OPTIONS}`, async () => {
            const { driver, result } = await run({ environment: environment(new FakeSearch(), { RunnableAgents: [SAGE, BILLING, MARKETING, HELPER] }) });
            expect(result.status).toBe('Skipped');
            expect(result.errorMessage).toContain(`2 agents to choose from, fewer than the ${DECISION_DISCOVERY_MIN_OPTIONS}`);
            expect(driver.Runner.Calls).toHaveLength(0);
            // The default catalog has exactly three options.
            expect((await run()).driver.Runner.Calls).toHaveLength(1);
        });
    });

    describe('never throws', () => {
        it('makes options that cannot be built an Error run', async () => {
            const { driver, result } = await run({ environment: environment(null, { DeclaredCap: 2 }) });
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toContain('The options could not be built');
            expect(result.errorMessage).toContain('semantic search');
            expect(driver.Runner.Calls).toHaveLength(0);
        });

        it('makes a failed decision an Error run with the reason recorded', async () => {
            const { result } = await run({ respond: async () => ({ success: false, errorMessage: 'model unavailable', Answers: {} }) });
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toBe('The decision failed: model unavailable');
            expect(actualOf(result)).toMatchObject({ Error: 'model unavailable', ChosenAgentId: null, WouldInject: null, WithinProductionTimeout: null });
        });

        it('makes an invalid discovery configuration an Error run naming the column', async () => {
            const driver = new TestDriver(new FakeRunner(async () => decided(BILLING.ID, 0.9, 0.9)), environment(new FakeSearch()));
            const bad = testEntity({});
            bad.Configuration = JSON.stringify({ decision: 'agent-discovery', baseline: 'keyword', oracles: [{ type: 'x' }] });
            const result = await driver.Execute(context(bad));
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toMatch(/^Configuration: baseline/);
        });
    });

    describe('the semantic-search baseline', () => {
        const ranked = [{ ID: SAGE.ID, Semantic: 0.9 }, { ID: MARKETING.ID, Semantic: 0.3 }, { ID: BILLING.ID, Semantic: 0.66 }];

        it("makes no decision call, and records Find Candidate Agents' first row from the shared search", async () => {
            const search = new FakeSearch(ranked);
            const { driver, result } = await run({ config: { baseline: 'semantic-search' }, environment: environment(search, { Prompt: null }) });
            expect(driver.Runner.Calls).toHaveLength(0);
            expect(driver.FailoverRequests).toHaveLength(0);
            expect(search.Calls).toEqual([{ Request: STATE, TopK: 15 }]);
            const actual = actualOf(result);
            expect(actual).toMatchObject({
                Arm: 'semantic-search', PromptName: null, Options: null, Model: null, Confidence: null, AnyApplies: null,
                ChosenAgentId: BILLING.ID, WouldInject: true, LabelledAgentOffered: true, CostUSD: null
            });
            expect(actual.Baseline).toMatchObject({ Floor: 0.5, TopK: 15, Results: 3 });
            expect(actual.Baseline?.TopRanked).toMatchObject({ AgentId: MARKETING.ID, Rank: 2, PassesFloor: false });
            expect(actual.Baseline?.TopMatch).toMatchObject({ AgentId: BILLING.ID, Rank: 3, Score: 0.66, PassesFloor: true });
            expect(result).toMatchObject({ status: 'Passed', targetLogId: '' });
        });

        it('passes a none label when nothing reaches the floor', async () => {
            const { result } = await run({
                config: { baseline: 'semantic-search' }, expected: NONE_LABEL,
                environment: environment(new FakeSearch([{ ID: BILLING.ID, Semantic: 0.2 }]), { Prompt: null })
            });
            expect(actualOf(result)).toMatchObject({ ChosenAgentId: null, WouldInject: false });
            expect(result.status).toBe('Passed');
        });

        it('is an Error run when the provider cannot search', async () => {
            const { result } = await run({ config: { baseline: 'semantic-search' }, environment: environment(null, { Prompt: null }) });
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toContain('cannot run the semantic search');
        });
    });

    describe('Validate', () => {
        it('accepts a good discovery test and names the problem in a bad one', async () => {
            const driver = new TestDriver(new FakeRunner(async () => decided(BILLING.ID, 0.9, 0.9)), environment(new FakeSearch()));
            expect((await driver.Validate(testEntity({}))).valid).toBe(true);
            const bad = testEntity({});
            bad.ExpectedOutcomes = JSON.stringify({ label: 'agent', labelSource: 'construction' });
            const validation = await driver.Validate(bad);
            expect(validation.valid).toBe(false);
            expect(validation.errors[0].message).toMatch(/^ExpectedOutcomes: agentId/);
        });
    });
});
