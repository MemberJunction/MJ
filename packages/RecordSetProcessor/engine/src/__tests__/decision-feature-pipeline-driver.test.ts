import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseEntity,
    EntityInfo,
    ProviderBase,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type EntityRecordNameResult,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PotentialDuplicateResponse,
    type ProviderType,
    type RecordDependency,
    type RecordMergeResult,
    type RunQueryResult,
    type RunViewResult,
    type ScoredCandidate,
    type TransactionGroupBase,
} from '@memberjunction/core';
import { MJGlobal, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    KnowledgeHubMetadataEngine,
    MJAIModelTypeEntity,
    MJAIPromptModelEntity,
    MJAIPromptRunEntity,
    MJFeaturePipelineTypeEntity,
    MJFeatureValueCacheEntity,
} from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AIDecisionRunner, type AIDecisionParams, type AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { AIModelConfiguration, ChoiceAnswer, DecisionAnswer, LikelihoodAnswer, ScoreAnswer } from '@memberjunction/ai';
import { MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import {
    DECISION_FEATURE_PIPELINE_CAPABILITIES,
    FeatureValueCacheService,
    type DataFeatureOutput,
    type DataFeatureSpec,
} from '@memberjunction/feature-pipelines';
import { InferProcessor } from '../processors/InferProcessor';
import {
    BaseFeaturePipelineDriver,
    type FeaturePipelineComputeHooks,
    type FeaturePipelineComputeRequest,
} from '../feature-pipeline-drivers/BaseFeaturePipelineDriver';
import { DecisionFeaturePipelineDriver } from '../feature-pipeline-drivers/DecisionFeaturePipelineDriver';

// ---------------------------------------------------------------------------
// Metadata: real EntityInfo and entity objects, holding only the fields a test sets
// ---------------------------------------------------------------------------

interface EntityFieldSeed {
    Name: string;
    TSType?: string;
    EntityFieldValues?: Array<{ Value: string; Description?: string }>;
}

/** Metadata for an entity whose primary key is ID, with the given fields. */
function entityInfo(id: string, name: string, fields: EntityFieldSeed[] = []): EntityInfo {
    return new EntityInfo({ ID: id, Name: name, Fields: [{ Name: 'ID', IsPrimaryKey: true, TSType: 'string' }, ...fields] });
}

/** A new entity object whose metadata names only the fields a test sets. */
function newEntity<T extends BaseEntity>(ctor: new (entity: EntityInfo) => T, entityName: string, fields: string[]): T {
    return new ctor(entityInfo(`${entityName} entity`, entityName, fields.map((field) => ({ Name: field }))));
}

function notUsed(): Error {
    return new Error('not used by these tests');
}

/** A metadata provider that knows only the entities it is given. */
class EntitiesOnlyProvider extends ProviderBase {
    constructor(private readonly entityList: EntityInfo[]) {
        super();
    }
    public override get Entities(): EntityInfo[] {
        return this.entityList;
    }
    public override EntityByID(entityID: string): EntityInfo | undefined {
        return this.entityList.find((entity) => UUIDsEqual(entity.ID, entityID));
    }
    public get ProviderType(): ProviderType {
        return 'Database';
    }
    public get DatabaseConnection(): null {
        return null;
    }
    public get InstanceConnectionString(): string {
        return '';
    }
    public get LocalStorageProvider(): ILocalStorageProvider {
        throw notUsed();
    }
    protected get AllowRefresh(): boolean {
        return false;
    }
    protected get Metadata(): IMetadataProvider {
        return this;
    }
    protected InternalGetEntityRecordName(): Promise<string> {
        throw notUsed();
    }
    protected InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> {
        throw notUsed();
    }
    public GetRecordFavoriteStatus(): Promise<boolean> {
        throw notUsed();
    }
    public SetRecordFavoriteStatus(): Promise<void> {
        throw notUsed();
    }
    protected InternalRunView<T>(): Promise<RunViewResult<T>> {
        throw notUsed();
    }
    protected InternalRunViews<T>(): Promise<RunViewResult<T>[]> {
        throw notUsed();
    }
    protected InternalRunQuery(): Promise<RunQueryResult> {
        throw notUsed();
    }
    protected InternalRunQueries(): Promise<RunQueryResult[]> {
        throw notUsed();
    }
    protected searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> {
        throw notUsed();
    }
    protected InternalExecuteQueryFromSpec(): Promise<RunQueryResult> {
        throw notUsed();
    }
    protected GetCurrentUser(): Promise<UserInfo> {
        throw notUsed();
    }
    public GetRecordDependencies(): Promise<RecordDependency[]> {
        throw notUsed();
    }
    public GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        throw notUsed();
    }
    public MergeRecords(): Promise<RecordMergeResult> {
        throw notUsed();
    }
    public GetDatasetByName(): Promise<DatasetResultType> {
        throw notUsed();
    }
    public GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        throw notUsed();
    }
    public CreateTransactionGroup(): Promise<TransactionGroupBase> {
        throw notUsed();
    }
}

const TICKETS_ENTITY_ID = '6E0C4F1A-1B2C-4D3E-8F90-A1B2C3D4E5F6';
const DECISION_TYPE_ID = 'D1A2B3C4-0000-4000-8000-000000000001';
const LLM_TYPE_ID = 'D1A2B3C4-0000-4000-8000-000000000002';
const PROMPT_ID = 'D1A2B3C4-0000-4000-8000-0000000000A1';
const JEV_MODEL_ID = 'D1A2B3C4-0000-4000-8000-0000000000B1';
const SMALL_DECISION_MODEL_ID = 'D1A2B3C4-0000-4000-8000-0000000000B2';
const CHAT_MODEL_ID = 'D1A2B3C4-0000-4000-8000-0000000000B3';

/** Support tickets: Status carries a value list, the way a CHECK-constrained column does. */
const TICKETS = entityInfo(TICKETS_ENTITY_ID, 'Tickets', [
    { Name: 'Subject', TSType: 'string' },
    { Name: 'EmailDomain', TSType: 'string' },
    { Name: 'IsUrgent', TSType: 'boolean' },
    { Name: 'IsBillable', TSType: 'boolean' },
    { Name: 'Priority', TSType: 'number' },
    {
        Name: 'Status',
        TSType: 'string',
        EntityFieldValues: [
            { Value: 'Open', Description: 'Waiting for support to act' },
            { Value: 'Closed', Description: 'Resolved; nothing left to do' },
        ],
    },
]);

function modelType(id: string, name: string): MJAIModelTypeEntity {
    const type = newEntity(MJAIModelTypeEntity, 'MJ: AI Model Types', ['Name']);
    type.ID = id;
    type.Name = name;
    return type;
}

function aiModel(id: string, name: string, modelTypeID: string): MJAIModelEntityExtended {
    const model = newEntity(MJAIModelEntityExtended, 'MJ: AI Models', ['Name', 'AIModelTypeID', 'IsActive']);
    model.ID = id;
    model.Name = name;
    model.AIModelTypeID = modelTypeID;
    model.IsActive = true;
    return model;
}

function binding(modelID: string, status: MJAIPromptModelEntity['Status'] = 'Active'): MJAIPromptModelEntity {
    const promptModel = newEntity(MJAIPromptModelEntity, 'MJ: AI Prompt Models', ['PromptID', 'ModelID', 'Status']);
    promptModel.ID = `${modelID}-binding`;
    promptModel.PromptID = PROMPT_ID;
    promptModel.ModelID = modelID;
    promptModel.Status = status;
    return promptModel;
}

function aiPrompt(name: string, modelTypeID: string | null): MJAIPromptEntityExtended {
    const prompt = newEntity(MJAIPromptEntityExtended, 'MJ: AI Prompts', ['Name', 'AIModelTypeID']);
    prompt.ID = PROMPT_ID;
    prompt.Name = name;
    prompt.AIModelTypeID = modelTypeID;
    return prompt;
}

function promptRun(id: string): MJAIPromptRunEntity {
    const run = newEntity(MJAIPromptRunEntity, 'MJ: AI Prompt Runs', []);
    run.ID = id;
    return run;
}

function pipelineType(driverClass: string): MJFeaturePipelineTypeEntity {
    const type = newEntity(MJFeaturePipelineTypeEntity, 'MJ: Feature Pipeline Types', ['Name', 'DriverClass', 'Status']);
    type.ID = 'F67FFBFD-94AA-47CF-9867-C3BDF36F30F9';
    type.Name = 'Decision';
    type.DriverClass = driverClass;
    type.Status = 'Active';
    return type;
}

function cacheEntry(id: string): MJFeatureValueCacheEntity {
    const entry = newEntity(MJFeatureValueCacheEntity, 'MJ: Feature Value Caches', []);
    entry.ID = id;
    return entry;
}

// ---------------------------------------------------------------------------
// Spec, record and answers, in the shapes the processor passes the driver
// ---------------------------------------------------------------------------

function booleanOutput(name: string, threshold?: number): DataFeatureOutput {
    return {
        Ref: `$.${name}`,
        Name: name,
        Description: `Whether the ticket is ${name}`,
        Constraint: { Type: 'boolean', Threshold: threshold, OnViolation: 'fail' },
        Target: { Mode: 'field', EntityFieldName: name },
    };
}

function statusOutput(constraint: Partial<Extract<DataFeatureOutput['Constraint'], { Type: 'enum' }>> = {}): DataFeatureOutput {
    return {
        Ref: '$.Status',
        Name: 'Status',
        Description: 'The ticket status',
        Constraint: { Type: 'enum', FromFieldMetadata: true, OnViolation: 'fail', ...constraint },
        Target: { Mode: 'field', EntityFieldName: 'Status' },
    };
}

function priorityOutput(levels: string[]): DataFeatureOutput {
    return {
        Ref: '$.Priority',
        Name: 'Priority',
        Description: 'How urgently the ticket needs attention',
        Constraint: { Type: 'numeric', Min: 0, Max: 100, Integer: true, Levels: levels, OnViolation: 'fail' },
        Target: { Mode: 'field', EntityFieldName: 'Priority' },
    };
}

function decisionSpec(outputs: DataFeatureOutput[], overrides: Partial<DataFeatureSpec> = {}): DataFeatureSpec {
    return {
        Name: 'Ticket triage',
        Description: 'Triage support tickets',
        PromptID: PROMPT_ID,
        PipelineType: 'Decision',
        Context: { Fields: ['Subject', 'EmailDomain'] },
        Caching: { Cacheable: false },
        Outputs: outputs,
        ...overrides,
    };
}

function ticket(id: string, emailDomain = 'example.com'): RecordRef {
    return {
        EntityID: TICKETS_ENTITY_ID,
        RecordID: id,
        Record: { ID: id, Subject: 'Cannot sign in since this morning', EmailDomain: emailDomain },
    };
}

function likelihood(probability: number): LikelihoodAnswer {
    return { Kind: 'Likelihood', Probability: probability };
}

function choice(value: string, confidence: number, probabilities: Record<string, number>): ChoiceAnswer {
    return { Kind: 'Choice', Value: value, Confidence: confidence, Probabilities: probabilities };
}

function score(value: number, confidence: number, probabilities: Record<string, number>): ScoreAnswer {
    return { Kind: 'Score', Value: value, Confidence: confidence, Probabilities: probabilities };
}

function decided(answers: Record<string, DecisionAnswer>, runID = 'PROMPT-RUN-1'): AIDecisionRunResult {
    return { success: true, Answers: answers, promptRun: promptRun(runID) };
}

/** Answers every decision with one result, and keeps the params of each call. */
class StubDecisionRunner extends AIDecisionRunner {
    public Calls: AIDecisionParams[] = [];

    constructor(private readonly result: AIDecisionRunResult) {
        super();
    }

    public override async ExecuteDecision(params: AIDecisionParams): Promise<AIDecisionRunResult> {
        this.Calls.push(params);
        return this.result;
    }
}

/** The real Decision driver, with its decision runner replaced by {@link StubDecisionRunner}. */
class StubRunnerDecisionDriver extends DecisionFeaturePipelineDriver {
    public static Runner = new StubDecisionRunner(decided({}));

    protected override CreateDecisionRunner(): AIDecisionRunner {
        return StubRunnerDecisionDriver.Runner;
    }
}
RegisterClass(BaseFeaturePipelineDriver, 'DecisionFeaturePipelineDriverTest_StubRunner')(StubRunnerDecisionDriver);

/** Answers the next decisions with `result`, and returns the runner to inspect its calls. */
function answerWith(result: AIDecisionRunResult): StubDecisionRunner {
    StubRunnerDecisionDriver.Runner = new StubDecisionRunner(result);
    return StubRunnerDecisionDriver.Runner;
}

function computeHooks(state: Record<string, string>): FeaturePipelineComputeHooks {
    return {
        BeforeBuildContext: vi.fn<FeaturePipelineComputeHooks['BeforeBuildContext']>(async () => undefined),
        BuildPromptData: vi.fn<FeaturePipelineComputeHooks['BuildPromptData']>(async () => state),
        BeforePromptExecute: vi.fn<FeaturePipelineComputeHooks['BeforePromptExecute']>(async () => undefined),
        AfterPromptExecute: vi.fn<FeaturePipelineComputeHooks['AfterPromptExecute']>(async (result) => result.result),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DecisionFeaturePipelineDriver', () => {
    const provider = new EntitiesOnlyProvider([TICKETS]);
    const contextUser = new UserInfo(provider, { ID: 'D1A2B3C4-0000-4000-8000-0000000000C1', Name: 'Tester' });
    const context: RecordProcessorContext = {
        contextUser,
        provider,
        processRunID: 'RUN-1',
        recordProcessID: 'RP-1',
        entityID: TICKETS_ENTITY_ID,
    };

    let modelTypes: MJAIModelTypeEntity[];
    let models: MJAIModelEntityExtended[];
    let bindings: MJAIPromptModelEntity[];
    let prompts: MJAIPromptEntityExtended[];
    let modelLimits: Map<string, AIModelConfiguration>;

    beforeEach(() => {
        modelTypes = [modelType(DECISION_TYPE_ID, 'Decision'), modelType(LLM_TYPE_ID, 'LLM')];
        models = [aiModel(JEV_MODEL_ID, 'Jev', DECISION_TYPE_ID), aiModel(CHAT_MODEL_ID, 'Chat', LLM_TYPE_ID)];
        bindings = [binding(JEV_MODEL_ID)];
        prompts = [aiPrompt('Triage', DECISION_TYPE_ID)];
        modelLimits = new Map();

        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'ModelTypes', 'get').mockImplementation(() => modelTypes);
        vi.spyOn(AIEngine.Instance, 'Models', 'get').mockImplementation(() => models);
        vi.spyOn(AIEngine.Instance, 'ModelsByID', 'get').mockImplementation(() => new Map(models.map((m) => [NormalizeUUID(m.ID), m])));
        vi.spyOn(AIEngine.Instance, 'PromptModels', 'get').mockImplementation(() => bindings);
        vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockImplementation(() => prompts);
        vi.spyOn(AIEngine.Instance, 'GetEffectiveModelConfiguration').mockImplementation((modelID) => modelLimits.get(modelID) ?? null);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([
            pipelineType('DecisionFeaturePipelineDriverTest_StubRunner'),
        ]);
    });

    function request(spec: DataFeatureSpec, prompt: MJAIPromptEntityExtended = prompts[0]): FeaturePipelineComputeRequest {
        return { Record: ticket('T-1'), Context: context, Prompt: prompt, Spec: spec, Hooks: computeHooks({ Subject: 'Cannot sign in' }) };
    }

    describe('Registration & Capabilities', () => {
        it('is registered with BaseFeaturePipelineDriver under key DecisionFeaturePipelineDriver', () => {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseFeaturePipelineDriver>(
                BaseFeaturePipelineDriver,
                'DecisionFeaturePipelineDriver'
            );
            expect(instance).toBeInstanceOf(DecisionFeaturePipelineDriver);
        });

        it('declares DECISION_FEATURE_PIPELINE_CAPABILITIES', () => {
            const driver = new DecisionFeaturePipelineDriver();
            expect(driver.Capabilities).toEqual(DECISION_FEATURE_PIPELINE_CAPABILITIES);
            expect(driver.Capabilities.ProducesConfidence).toBe(true);
            expect(driver.Capabilities.ProducesReasoning).toBe(false);
            expect(driver.Capabilities.ConstraintTypes).toEqual(['boolean', 'enum', 'numeric']);
            expect(driver.Capabilities.TargetModes).toEqual(['field']);
        });
    });

    describe('ValidateOutputs', () => {
        const driver = new DecisionFeaturePipelineDriver();

        it('rejects specs with CaptureReasoning: true', () => {
            const errors = driver.ValidateOutputs(decisionSpec([booleanOutput('IsUrgent')], { CaptureReasoning: true }));
            expect(errors.some((e) => e.includes('does not produce reasoning'))).toBe(true);
        });

        it('delegates base validations (unsupported constraint types, non-field targets)', () => {
            const errors = driver.ValidateOutputs(
                decisionSpec([
                    {
                        Ref: '$.summary',
                        Name: 'Summary',
                        Constraint: { Type: 'freetext', MaxLength: 200 },
                        Target: { Mode: 'field', EntityFieldName: 'Subject' },
                    },
                    {
                        Ref: '$.notes',
                        Name: 'Notes',
                        Constraint: { Type: 'boolean', OnViolation: 'fail' },
                        Target: { Mode: 'child', EntityName: 'Ticket Notes', ParentField: 'TicketID', Map: { Note: '$.note' } },
                    },
                ])
            );
            expect(errors.some((e) => e.includes("constraint type 'freetext'"))).toBe(true);
            expect(errors.some((e) => e.includes("target mode 'child'"))).toBe(true);
        });

        it('rejects outputs without any constraint', () => {
            const errors = driver.ValidateOutputs(
                decisionSpec([{ Ref: '$.Priority', Name: 'Priority', Target: { Mode: 'field', EntityFieldName: 'Priority' } }])
            );
            expect(errors.some((e) => e.includes('has no constraint'))).toBe(true);
        });

        it('validates numeric outputs have between 2 and 10 levels', () => {
            const oneLevel = driver.ValidateOutputs(decisionSpec([priorityOutput(['Low'])]));
            expect(oneLevel.some((e) => e.includes('between 2 and 10 Level descriptions'))).toBe(true);

            const elevenLevels = driver.ValidateOutputs(decisionSpec([priorityOutput(Array.from({ length: 11 }, (_, i) => `L${i}`))]));
            expect(elevenLevels.some((e) => e.includes('between 2 and 10 Level descriptions'))).toBe(true);
        });

        it('validates enum outputs have <= 255 values and all have descriptions', () => {
            const missingDescriptions = driver.ValidateOutputs(
                decisionSpec([
                    statusOutput({
                        FromFieldMetadata: false,
                        Values: ['Open', 'Pending', 'Closed'],
                        ValueDescriptions: { Open: 'Waiting for support to act' },
                    }),
                ])
            );
            expect(missingDescriptions.some((e) => e.includes('values missing descriptions: Pending, Closed'))).toBe(true);

            const values = Array.from({ length: 256 }, (_, i) => `val_${i}`);
            const tooMany = driver.ValidateOutputs(
                decisionSpec([
                    statusOutput({
                        FromFieldMetadata: false,
                        Values: values,
                        ValueDescriptions: Object.fromEntries(values.map((v) => [v, `desc ${v}`])),
                    }),
                ])
            );
            expect(tooMany.some((e) => e.includes('supports at most 255'))).toBe(true);
        });

        it('passes a fully valid Decision pipeline spec', () => {
            const errors = driver.ValidateOutputs(
                decisionSpec([
                    booleanOutput('IsUrgent', 0.7),
                    statusOutput({
                        FromFieldMetadata: false,
                        Values: ['Open', 'Closed'],
                        ValueDescriptions: { Open: 'Waiting for support to act', Closed: 'Resolved' },
                    }),
                    priorityOutput(['Low', 'Medium', 'High']),
                ])
            );
            expect(errors).toEqual([]);
        });
    });

    describe('ComputeOutputs', () => {
        const driver = new StubRunnerDecisionDriver();

        describe('prompt check', () => {
            it('rejects a prompt whose model type is not Decision, whatever its name', async () => {
                const runner = answerWith(decided({ IsUrgent: likelihood(0.9) }));
                const chatPrompt = aiPrompt('Decision triage on a chat model', LLM_TYPE_ID);

                const result = await driver.ComputeOutputs(request(decisionSpec([booleanOutput('IsUrgent')]), chatPrompt));

                expect(result).toEqual(expect.objectContaining({ Success: false, ErrorMessage: expect.stringMatching(/is not a Decision prompt/) }));
                expect(runner.Calls).toHaveLength(0);
            });

            it('accepts a prompt with no model type when a Decision model is bound to it', async () => {
                answerWith(decided({ IsUrgent: likelihood(0.9) }));
                const untyped = aiPrompt('Triage', null);

                const result = await driver.ComputeOutputs(request(decisionSpec([booleanOutput('IsUrgent')]), untyped));

                expect(result.Success).toBe(true);
            });

            it('rejects a prompt with no model type when only other model types are bound to it', async () => {
                bindings = [binding(CHAT_MODEL_ID)];
                const untyped = aiPrompt('Triage', null);

                const result = await driver.ComputeOutputs(request(decisionSpec([booleanOutput('IsUrgent')]), untyped));

                expect(result.Success).toBe(false);
            });
        });

        describe('state size', () => {
            it('fails, without truncating or calling the model, when the state exceeds the strictest bound model limit', async () => {
                models.push(aiModel(SMALL_DECISION_MODEL_ID, 'Small decision model', DECISION_TYPE_ID));
                bindings = [binding(JEV_MODEL_ID), binding(SMALL_DECISION_MODEL_ID)];
                modelLimits.set(JEV_MODEL_ID, { Decision: { MaxStateTokens: 32000 } });
                modelLimits.set(SMALL_DECISION_MODEL_ID, { Decision: { MaxStateTokens: 5 } });
                const runner = answerWith(decided({ IsUrgent: likelihood(0.9) }));

                const result = await driver.ComputeOutputs(request(decisionSpec([booleanOutput('IsUrgent')])));

                expect(result).toEqual(
                    expect.objectContaining({ Success: false, ErrorMessage: expect.stringMatching(/exceeds the model's Decision\.MaxStateTokens limit of 5\b/) })
                );
                expect(runner.Calls).toHaveLength(0);
            });

            it('checks every active Decision model when the prompt has no bound model', async () => {
                bindings = [];
                models.push(aiModel(SMALL_DECISION_MODEL_ID, 'Small decision model', DECISION_TYPE_ID));
                modelLimits.set(SMALL_DECISION_MODEL_ID, { Decision: { MaxStateTokens: 5 } });
                modelLimits.set(CHAT_MODEL_ID, { Decision: { MaxStateTokens: 1 } });
                answerWith(decided({ IsUrgent: likelihood(0.9) }));

                const result = await driver.ComputeOutputs(request(decisionSpec([booleanOutput('IsUrgent')])));

                expect(result).toEqual(expect.objectContaining({ Success: false, ErrorMessage: expect.stringMatching(/limit of 5\b/) }));
            });

            it('passes the rendered state as-is when it fits every limit', async () => {
                modelLimits.set(JEV_MODEL_ID, { Decision: { MaxStateTokens: 32000 } });
                const runner = answerWith(decided({ IsUrgent: likelihood(0.9) }));

                const result = await driver.ComputeOutputs(request(decisionSpec([booleanOutput('IsUrgent')])));

                expect(result.Success).toBe(true);
                expect(runner.Calls[0].State).toBe(JSON.stringify({ Subject: 'Cannot sign in' }));
                expect(runner.Calls[0].data).toBeUndefined();
            });
        });

        it('maps Likelihood, Choice, and Score answers, rescales the rubric, and keeps each confidence', async () => {
            answerWith(
                decided(
                    {
                        IsUrgent: likelihood(0.7),
                        IsBillable: likelihood(0.4),
                        Status: choice('Closed', 0.88, { Open: 0.12, Closed: 0.88 }),
                        Priority: score(1, 0.92, { Low: 0.03, Medium: 0.92, High: 0.03, Critical: 0.02 }),
                    },
                    'PROMPT-RUN-123'
                )
            );
            const spec = decisionSpec([
                booleanOutput('IsUrgent', 0.7), // exactly at the threshold -> true
                booleanOutput('IsBillable', 0.5), // 0.4 < 0.5 -> false
                statusOutput(),
                priorityOutput(['Low', 'Medium', 'High', 'Critical']),
            ]);
            const req = request(spec);

            const result = await driver.ComputeOutputs(req);

            expect(result).toEqual({
                Success: true,
                RawResult: { IsUrgent: true, IsBillable: false, Status: 'Closed', Priority: 33 }, // level 1 of 0..3 on [0, 100], rounded
                Confidence: {
                    IsUrgent: 0.7,
                    IsBillable: 0.6, // written false, so its confidence is P(no) = 1 - 0.4
                    Status: 0.88,
                    Priority: 0.92,
                },
                AIPromptRunID: 'PROMPT-RUN-123',
            });
            expect(req.Hooks.BeforeBuildContext).toHaveBeenCalledTimes(1);
            expect(req.Hooks.BuildPromptData).toHaveBeenCalledTimes(1);
            expect(req.Hooks.BeforePromptExecute).not.toHaveBeenCalled();
            expect(req.Hooks.AfterPromptExecute).not.toHaveBeenCalled();
        });

        it("asks a field-backed enum's options, with their descriptions, from the record entity's field", async () => {
            const runner = answerWith(decided({ Status: choice('Open', 0.9, { Open: 0.9, Closed: 0.1 }) }));

            await driver.ComputeOutputs(request(decisionSpec([statusOutput()])));

            const question = runner.Calls[0].Questions.Status;
            expect(question).toEqual({
                Kind: 'Choice',
                Instructions: 'The ticket status',
                Options: [
                    { Value: 'Open', Description: 'Waiting for support to act' },
                    { Value: 'Closed', Description: 'Resolved; nothing left to do' },
                ],
            });
        });

        it("asks only the spec's own Values, without the field's descriptions, when the enum does not set FromFieldMetadata", async () => {
            const runner = answerWith(decided({ Status: choice('Open', 0.9, { Open: 0.9 }) }));

            await driver.ComputeOutputs(request(decisionSpec([statusOutput({ FromFieldMetadata: false, Values: ['Open'] })])));

            expect(runner.Calls[0].Questions.Status).toEqual({
                Kind: 'Choice',
                Instructions: 'The ticket status',
                Options: [{ Value: 'Open', Description: 'Open' }],
            });
        });

        it("asks the field's value list in place of the spec's Values when the enum sets FromFieldMetadata", async () => {
            const runner = answerWith(decided({ Status: choice('Open', 0.9, { Open: 0.9, Closed: 0.1 }) }));

            await driver.ComputeOutputs(request(decisionSpec([statusOutput({ Values: ['Open'] })])));

            expect(runner.Calls[0].Questions.Status).toEqual(expect.objectContaining({
                Options: [
                    { Value: 'Open', Description: 'Waiting for support to act' },
                    { Value: 'Closed', Description: 'Resolved; nothing left to do' },
                ],
            }));
        });

        it('returns failure when ExecuteDecision returns success: false', async () => {
            answerWith({ success: false, errorMessage: 'Decision engine timeout', Answers: {} });

            const result = await driver.ComputeOutputs(request(decisionSpec([booleanOutput('IsUrgent')])));

            expect(result).toEqual({ Success: false, ErrorMessage: 'Decision engine timeout', AIPromptRunID: undefined });
        });
    });

    describe('the output check, end to end through InferProcessor.ProcessRecord', () => {
        /** Runs one ticket through the processor, answering with `answers`; returns the result and the Feature Values rows. */
        async function processTicket(outputs: DataFeatureOutput[], answers: Record<string, DecisionAnswer>) {
            const recordFeatureValues = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue();
            answerWith(decided(answers));
            const result = await new InferProcessor(PROMPT_ID, undefined, decisionSpec(outputs)).ProcessRecord(ticket('T-1'), context);
            return { result, featureValues: recordFeatureValues.mock.calls.map(([params]) => params.outputs) };
        }

        const offTheList = choice('Reopened', 0.9, { Reopened: 0.9, Open: 0.05, Closed: 0.05 });

        it('accepts an answer from the value list of a FromFieldMetadata enum, and keeps its confidence', async () => {
            const { result, featureValues } = await processTicket([statusOutput()], { Status: choice('Open', 0.9, { Open: 0.9, Closed: 0.1 }) });

            expect(result.Status).toBe('Succeeded');
            expect(result.ResultPayload).toEqual({ Status: 'Open' });
            expect(result.Confidence).toEqual({ Status: 0.9 });
            expect(featureValues).toEqual([[expect.objectContaining({ featureName: 'Status', value: 'Open', confidence: 0.9 })]]);
        });

        it('fails the record for an answer off the value list when OnViolation is fail, writing nothing', async () => {
            const { result, featureValues } = await processTicket([statusOutput()], { Status: offTheList });

            expect(result.Status).toBe('Failed');
            expect(result.ErrorMessage).toMatch(/Value 'Reopened' is not in the allowed vocabulary: \[Open, Closed\]/);
            expect(featureValues).toEqual([]);
        });

        it('writes null with no confidence when OnViolation is null, keeping the other outputs\' confidence', async () => {
            const { result, featureValues } = await processTicket([booleanOutput('IsUrgent'), statusOutput({ OnViolation: 'null' })], {
                IsUrgent: likelihood(0.8),
                Status: offTheList,
            });

            expect(result.Status).toBe('Succeeded');
            expect(result.ResultPayload).toEqual(expect.objectContaining({ IsUrgent: true, Status: null }));
            expect(result.Confidence).toEqual({ IsUrgent: 0.8 });
            expect(featureValues).toHaveLength(1);
            const [urgent, status] = featureValues[0];
            expect(urgent).toEqual(expect.objectContaining({ featureName: 'IsUrgent', value: true, confidence: 0.8 }));
            expect(status).toEqual(expect.objectContaining({ featureName: 'Status', value: null }));
            expect(status.confidence).toBeUndefined();
        });

        it('writes an answer along a nested Ref, so its Feature Values row carries the value with its confidence', async () => {
            const nested: DataFeatureOutput = { ...booleanOutput('IsUrgent'), Ref: '$.flags.urgent' };

            const { result, featureValues } = await processTicket([nested], { IsUrgent: likelihood(0.93) });

            expect(result.Status).toBe('Succeeded');
            expect(result.ResultPayload).toEqual({ IsUrgent: true, flags: { urgent: true } });
            expect(result.ResultPayload).not.toHaveProperty(['flags.urgent']);
            expect(featureValues).toEqual([[expect.objectContaining({ featureName: 'IsUrgent', value: true, confidence: 0.93 })]]);
        });

        it("writes 'Other' with no confidence when OnViolation is coerce-to-other", async () => {
            const { result, featureValues } = await processTicket([statusOutput({ OnViolation: 'coerce-to-other' })], { Status: offTheList });

            expect(result.Status).toBe('Succeeded');
            expect(result.ResultPayload).toEqual(expect.objectContaining({ Status: 'Other' }));
            expect(result.Confidence).toBeUndefined();
            const [status] = featureValues[0];
            expect(status).toEqual(expect.objectContaining({ featureName: 'Status', value: 'Other' }));
            expect(status.confidence).toBeUndefined();
        });
    });

    describe('InferProcessor Integration', () => {
        class DecisionProbeProcessor extends InferProcessor {
            public Resolve(ctx: RecordProcessorContext): Promise<BaseFeaturePipelineDriver> {
                return this.ResolveDriver(ctx);
            }
        }

        it("resolves the pipeline type's registered Decision driver", async () => {
            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([pipelineType('DecisionFeaturePipelineDriver')]);
            const processor = new DecisionProbeProcessor(PROMPT_ID, undefined, decisionSpec([booleanOutput('IsUrgent')]));

            const driver = await processor.Resolve(context);

            expect(driver).toBeInstanceOf(DecisionFeaturePipelineDriver);
            expect(driver.Capabilities.ProducesConfidence).toBe(true);
        });

        it("checks a FromFieldMetadata enum against the pipeline entity's own value list, not a same-named field elsewhere", async () => {
            vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'FeaturePipelineTypes', 'get').mockReturnValue([pipelineType('DecisionFeaturePipelineDriver')]);
            const spec = decisionSpec([statusOutput()]);
            // Archived tickets have a Status column too, with no value list
            const archivedTickets = entityInfo('6E0C4F1A-1B2C-4D3E-8F90-A1B2C3D4E5F7', 'Archived Tickets', [{ Name: 'Status', TSType: 'string' }]);
            const bothEntities = new EntitiesOnlyProvider([TICKETS, archivedTickets]);

            const onTickets = await new DecisionProbeProcessor(PROMPT_ID, undefined, spec).Resolve({ ...context, provider: bothEntities });
            expect(onTickets).toBeInstanceOf(DecisionFeaturePipelineDriver);

            const onArchived = new DecisionProbeProcessor(PROMPT_ID, undefined, spec).Resolve({
                ...context,
                provider: bothEntities,
                entityID: archivedTickets.ID,
            });
            await expect(onArchived).rejects.toThrow(
                "Feature Pipeline type 'Decision' cannot produce every output: Enum output 'Status' has no values defined"
            );
        });

        it('fans out confidence, to the result and to Feature Values, across records sharing a cache key', async () => {
            vi.spyOn(FeatureValueCacheService.Instance, 'BatchLookup').mockResolvedValue(new Map());
            vi.spyOn(FeatureValueCacheService.Instance, 'Store').mockResolvedValue(cacheEntry('CACHE-1'));
            const recordFeatureValues = vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockResolvedValue();
            const runner = answerWith(decided({ IsUrgent: likelihood(0.95) }, 'PR-BATCH-1'));
            const spec = decisionSpec([booleanOutput('IsUrgent')], {
                Caching: { Cacheable: true, KeyFields: ['EmailDomain'], Scope: 'pipeline' },
            });

            const results = await new InferProcessor(PROMPT_ID, undefined, spec).ProcessBatch([ticket('T-1'), ticket('T-2')], context);

            expect(runner.Calls).toHaveLength(1);
            expect(results.get('T-1')?.Confidence).toEqual({ IsUrgent: 0.95 });
            expect(results.get('T-2')?.Confidence).toEqual({ IsUrgent: 0.95 });
            expect(recordFeatureValues).toHaveBeenCalledTimes(2);
            for (const [call] of recordFeatureValues.mock.calls) {
                expect(call.outputs).toEqual([expect.objectContaining({ featureName: 'IsUrgent', value: true, confidence: 0.95 })]);
                expect(call.aiPromptRunID).toBe('PR-BATCH-1');
            }
            expect(recordFeatureValues.mock.calls.map(([call]) => call.recordID)).toEqual(['T-1', 'T-2']);
        });
    });
});
