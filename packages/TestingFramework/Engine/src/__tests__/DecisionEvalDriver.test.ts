/**
 * @fileoverview The Decision Eval driver with the runner and the engine faked: what it asks, how it
 * pins the model and turns failover off, what it records, and that it never throws.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIPromptRunEntity, MJTestEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { DecisionResult, type DecisionAnswer } from '@memberjunction/ai';
import type { AIDecisionParams, AIDecisionRunResult, FailoverConfiguration } from '@memberjunction/ai-prompts';
import {
    BuildRoutingQuestions,
    BuildRoutingState,
    BuildRoutingStateStructured,
    type MJAIPromptEntityExtended,
    type RoutingAgent
} from '@memberjunction/ai-core-plus';
import { DecisionEvalDriver, type DecisionEvalEnvironment, type DecisionEvalRunner } from '../drivers/DecisionEvalDriver';
import { PinnedDecisionRunner } from '../drivers/PinnedDecisionRunner';
import { DecisionLabelMatchOracle } from '../oracles/DecisionLabelMatchOracle';
import { ParseDecisionCorpus } from '../decision-eval/corpus';
import { MapPointToRoutingInput } from '../decision-eval/point-mapping';
import { DecisionEvalActualOutputSchema, type DecisionEvalActualOutput, type DecisionEvalConfig, type DecisionEvalLabel } from '../decision-eval/types';
import type { DriverExecutionContext, DriverExecutionResult } from '../types';
import type { IOracle } from '../oracles/IOracle';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/decision-eval');
const POINTS = ParseDecisionCorpus(readFileSync(join(FIXTURE_DIR, 'corpus.jsonl'), 'utf8'));
/** Fixture point 2: the Calendar Coordinator answered last; the Ledger Helper took part earlier. */
const POINT = POINTS[1];

const CALENDAR_ID = 'A1000000-0000-4000-8000-000000000002';
const PINNED_MODEL = '0B000000-0000-4000-8000-000000000001';
const PINNED_VENDOR = '0C000000-0000-4000-8000-000000000001';
const OTHER_MODEL = '0B000000-0000-4000-8000-000000000002';
const SAGE: RoutingAgent = { ID: 'A1000000-0000-4000-8000-0000000000FF', Name: 'Sage', Description: 'Routes each request.' };

const PROMPT = { ID: 'prompt-1', Name: 'Default Decision' } satisfies Pick<MJAIPromptEntityExtended, 'ID' | 'Name'>;
const ENVIRONMENT: DecisionEvalEnvironment = {
    Prompt: PROMPT as MJAIPromptEntityExtended,
    Catalog: { FindAgent: () => undefined, ConversationManager: SAGE }
};

/** A runner that records its calls and answers with a scripted result. */
class FakeRunner implements DecisionEvalRunner {
    public readonly Calls: AIDecisionParams[] = [];
    public Saved = false;

    constructor(private readonly respond: () => Promise<AIDecisionRunResult>) {}

    public async ExecuteDecision(params: AIDecisionParams): Promise<AIDecisionRunResult> {
        this.Calls.push(params);
        return this.respond();
    }

    public async WaitForPendingPromptRunSaves(): Promise<void> {
        this.Saved = true;
    }
}

/** The driver, with the engine and the runner replaced. */
class TestDriver extends DecisionEvalDriver {
    public readonly FailoverRequests: boolean[] = [];

    constructor(public readonly Runner: FakeRunner, private readonly environment: DecisionEvalEnvironment = ENVIRONMENT) {
        super();
    }

    protected override async LoadEnvironment(): Promise<DecisionEvalEnvironment> {
        return this.environment;
    }

    protected override CreateRunner(failoverAllowed: boolean): DecisionEvalRunner {
        this.FailoverRequests.push(failoverAllowed);
        return this.Runner;
    }
}

/** Exposes the runner's failover configuration. */
class PinnedProbe extends PinnedDecisionRunner {
    public Read(prompt: MJAIPromptEntityExtended): FailoverConfiguration {
        return this.getFailoverConfiguration(prompt);
    }
}

function answers(probability: number): Record<string, DecisionAnswer> {
    return {
        route: { Kind: 'Choice', Value: CALENDAR_ID, Confidence: 0.85, Probabilities: { [CALENDAR_ID]: 0.85, [SAGE.ID]: 0.15 } },
        continues: { Kind: 'Likelihood', Probability: probability }
    };
}

function decided(probability: number, answeredModel: string = PINNED_MODEL): AIDecisionRunResult {
    const driverResult = new DecisionResult(true, new Date(0), new Date(1));
    driverResult.ResolvedModel = 'jev-2026-09-01';
    const promptRun = { ID: 'prun-1', TotalCost: 0.002, Cost: 0.002 } satisfies Pick<MJAIPromptRunEntity, 'ID' | 'TotalCost' | 'Cost'>;
    return {
        success: true,
        status: 'Completed',
        promptRun: promptRun as MJAIPromptRunEntity,
        executionTimeMS: 120,
        cost: 0.002,
        modelInfo: { modelId: answeredModel, modelName: answeredModel === PINNED_MODEL ? 'Jev' : 'Other Decision Model', vendorId: PINNED_VENDOR, vendorName: 'Relay' },
        Answers: answers(probability),
        DecisionResult: driverResult,
        DriverClass: 'JevDecision'
    };
}

function testEntity(config: Partial<DecisionEvalConfig>, label: DecisionEvalLabel = 'switch', configurationText?: string): MJTestEntity {
    const configuration: DecisionEvalConfig = {
        decision: 'conversation-routing',
        stateLayout: 'production',
        oracles: [{ type: 'decision-label-match', weight: 1, config: { question: 'continues', positiveLabel: 'continue', threshold: 0.5 } }],
        ...config
    };
    const test = {
        Name: `${POINT.id} [cell]`,
        Configuration: configurationText ?? JSON.stringify(configuration),
        InputDefinition: JSON.stringify({ point: POINT }),
        ExpectedOutcomes: JSON.stringify({ label, labelSource: 'construction' }),
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
        oracleRegistry: new Map<string, IOracle>([['decision-label-match', new DecisionLabelMatchOracle()]])
    };
}

function actualOf(result: DriverExecutionResult): DecisionEvalActualOutput {
    return DecisionEvalActualOutputSchema.parse(result.actualOutput);
}

async function run(config: Partial<DecisionEvalConfig>, respond: () => Promise<AIDecisionRunResult>, label: DecisionEvalLabel = 'switch') {
    const driver = new TestDriver(new FakeRunner(respond));
    const result = await driver.Execute(context(testEntity(config, label)));
    return { driver, result };
}

describe('DecisionEvalDriver', () => {
    describe('pinning and failover', () => {
        it('pins the cell\'s model and vendor through the runner\'s override, with failover off', async () => {
            const { driver, result } = await run({ modelId: PINNED_MODEL, vendorId: PINNED_VENDOR }, async () => decided(0.2));
            expect(driver.FailoverRequests).toEqual([false]);
            expect(driver.Runner.Calls).toHaveLength(1);
            expect(driver.Runner.Calls[0].override).toEqual({ modelId: PINNED_MODEL, vendorId: PINNED_VENDOR });
            expect(driver.Runner.Saved).toBe(true);
            expect(actualOf(result).Model).toMatchObject({ PinnedModelId: PINNED_MODEL, AnsweredModelId: PINNED_MODEL, AnsweredByPinned: true, FailedOver: false, FailoverAllowed: false });
        });

        it('lets a pinned cell fail over only when it says so', async () => {
            const { driver } = await run({ modelId: PINNED_MODEL, failover: true }, async () => decided(0.2));
            expect(driver.FailoverRequests).toEqual([true]);
        });

        it('keeps the prompt\'s own selection and failover when nothing is pinned', async () => {
            const { driver, result } = await run({}, async () => decided(0.2));
            expect(driver.FailoverRequests).toEqual([true]);
            expect(driver.Runner.Calls[0].override).toBeUndefined();
            expect(actualOf(result).Model.AnsweredByPinned).toBeNull();
        });

        it('flags a run another model answered, and with failover off makes it an Error, not a data point', async () => {
            const { result } = await run({ modelId: PINNED_MODEL }, async () => decided(0.2, OTHER_MODEL));
            expect(actualOf(result).Model).toMatchObject({ AnsweredModelId: OTHER_MODEL, AnsweredByPinned: false, FailedOver: true });
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toContain('Other Decision Model');
            expect(result.errorMessage).toContain(PINNED_MODEL);
        });

        it('still flags it, but scores it, when the cell allowed failover', async () => {
            const { result } = await run({ modelId: PINNED_MODEL, failover: true }, async () => decided(0.2, OTHER_MODEL));
            expect(actualOf(result).Model.FailedOver).toBe(true);
            expect(result.status).toBe('Passed');
        });

        it('PinnedDecisionRunner turns the prompt\'s failover strategy off', () => {
            const prompt = { FailoverStrategy: 'NextBestModel', FailoverMaxAttempts: 3 } satisfies Pick<MJAIPromptEntityExtended, 'FailoverStrategy' | 'FailoverMaxAttempts'>;
            expect(new PinnedProbe().Read(prompt as MJAIPromptEntityExtended).strategy).toBe('None');
        });
    });

    describe('what it asks', () => {
        const input = MapPointToRoutingInput(POINT, ENVIRONMENT.Catalog);

        it('sends the production state and the shared questions, with the prompt and user', async () => {
            const { driver } = await run({}, async () => decided(0.2));
            const params = driver.Runner.Calls[0];
            expect(params.prompt).toBe(ENVIRONMENT.Prompt);
            expect(params.contextUser?.ID).toBe('user-1');
            expect(params.State).toBe(BuildRoutingState(input));
            expect(params.Questions).toEqual(BuildRoutingQuestions(input));
            expect(params.timeoutMS).toBeGreaterThan(0);
        });

        it('sends the structured state on a structured cell', async () => {
            const { driver } = await run({ stateLayout: 'structured' }, async () => decided(0.2));
            expect(driver.Runner.Calls[0].State).toEqual(BuildRoutingStateStructured(input));
        });
    });

    describe('what it records', () => {
        it('records the answers, the probability, the choice, the verdict, the model, the latency and the prompt run', async () => {
            const { result } = await run({ modelId: PINNED_MODEL }, async () => decided(0.2));
            const actual = actualOf(result);
            expect(actual.ContinuesProbability).toBe(0.2);
            expect(actual.Route).toEqual({ Value: CALENDAR_ID, Confidence: 0.85 });
            expect(actual.Answers.route).toEqual({ Kind: 'Choice', Value: CALENDAR_ID, Confidence: 0.85, Probabilities: { [CALENDAR_ID]: 0.85, [SAGE.ID]: 0.15 } });
            expect(actual.Answers.continues).toEqual({ Kind: 'Likelihood', Probability: 0.2 });
            expect(actual.RoutingVerdict).toBe('KeptContinuity');
            expect(actual.Model).toMatchObject({ AnsweredModelName: 'Jev', ResolvedModel: 'jev-2026-09-01', DriverClass: 'JevDecision' });
            expect(actual.LatencyMs).toBeGreaterThanOrEqual(0);
            expect(actual).toMatchObject({ PromptRunId: 'prun-1', CostUSD: 0.002, Error: null, StateLayout: 'production', PromptName: 'Default Decision' });
        });

        it('links the prompt run as the target, so cost comes from it', async () => {
            const { result } = await run({}, async () => decided(0.2));
            expect(result).toMatchObject({ targetType: 'AI Prompt', targetLogId: 'prun-1', totalCost: 0.002 });
        });

        it('records a requested temperature and seed as not applied, and says why', async () => {
            const { driver, result } = await run({ temperature: 0, seed: 7 }, async () => decided(0.2));
            const sampling = actualOf(result).Sampling;
            expect(sampling).toMatchObject({ RequestedTemperature: 0, RequestedSeed: 7, Applied: false });
            expect(sampling.Note).toContain('no sampling parameters');
            expect(driver.Runner.Calls[0].additionalParameters).toBeUndefined();
        });

        it('says nothing about sampling a cell did not ask for', async () => {
            const { result } = await run({}, async () => decided(0.2));
            expect(actualOf(result).Sampling).toEqual({ RequestedTemperature: null, RequestedSeed: null, Applied: false, Note: null });
        });
    });

    describe('scoring', () => {
        it('passes when the probability agrees with the label', async () => {
            const { result } = await run({}, async () => decided(0.2), 'switch');
            expect(result).toMatchObject({ status: 'Passed', score: 1, passedChecks: 1, failedChecks: 0, totalChecks: 1, skippedChecks: 0 });
        });

        it('fails when it disagrees', async () => {
            const { result } = await run({}, async () => decided(0.9), 'switch');
            expect(result).toMatchObject({ status: 'Failed', score: 0, failedChecks: 1 });
        });

        it('does not score an ambiguous label: the run is Skipped, with the advisory result kept', async () => {
            const { result } = await run({}, async () => decided(0.9), 'ambiguous');
            expect(result).toMatchObject({ status: 'Skipped', totalChecks: 0, skippedChecks: 1 });
            expect(result.oracleResults[0]).toMatchObject({ advisory: true });
        });

        it('fails a missing oracle rather than skipping its weight', async () => {
            const { result } = await run({ oracles: [{ type: 'no-such-oracle' }] }, async () => decided(0.2));
            expect(result.status).toBe('Failed');
            expect(result.oracleResults[0].message).toContain("'no-such-oracle' is not registered");
        });
    });

    describe('never throws', () => {
        it('makes a failed decision an Error run with the reason', async () => {
            const { result } = await run({}, async () => ({ success: false, errorMessage: 'model unavailable', Answers: {} }));
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toBe('The decision failed: model unavailable');
            expect(actualOf(result)).toMatchObject({ Error: 'model unavailable', ContinuesProbability: null, RoutingVerdict: null });
        });

        it('makes a runner that throws an Error run', async () => {
            const { result } = await run({}, async () => { throw new Error('socket closed'); });
            expect(result).toMatchObject({ status: 'Error', errorMessage: 'socket closed' });
        });

        it('makes an invalid configuration an Error run naming the column', async () => {
            const driver = new TestDriver(new FakeRunner(async () => decided(0.2)));
            const result = await driver.Execute(context(testEntity({}, 'switch', JSON.stringify({ decision: 'something-else', stateLayout: 'production', oracles: [] }))));
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toMatch(/^Configuration: decision/);
            expect(driver.Runner.Calls).toHaveLength(0);
        });

        it('makes no call when the point has nothing to decide', async () => {
            const lonely: DecisionEvalEnvironment = { ...ENVIRONMENT, Catalog: { FindAgent: () => undefined, ConversationManager: null } };
            const driver = new TestDriver(new FakeRunner(async () => decided(0.2)), lonely);
            const onlyOneAgent = testEntity({});
            const single = { ...POINTS[0] };
            onlyOneAgent.InputDefinition = JSON.stringify({ point: single });
            const result = await driver.Execute(context(onlyOneAgent));
            expect(result.status).toBe('Error');
            expect(result.errorMessage).toContain('Nothing to decide');
            expect(driver.Runner.Calls).toHaveLength(0);
        });
    });

    describe('Validate', () => {
        it('accepts a good test and names the problem in a bad one', async () => {
            const driver = new TestDriver(new FakeRunner(async () => decided(0.2)));
            expect((await driver.Validate(testEntity({}))).valid).toBe(true);
            const bad = await driver.Validate(testEntity({}, 'switch', JSON.stringify({ decision: 'conversation-routing', stateLayout: 'sideways', oracles: [{ type: 'x' }] })));
            expect(bad.valid).toBe(false);
            expect(bad.errors[0].message).toMatch(/^Configuration: stateLayout/);
        });
    });
});
