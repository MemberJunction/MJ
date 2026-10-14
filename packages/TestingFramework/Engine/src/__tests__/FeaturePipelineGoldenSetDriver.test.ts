import { describe, it, expect, vi, beforeEach, type Mock, type MockInstance } from 'vitest';
import { BaseEntity, EntityInfo, UserInfo, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { MJFeaturePipelineVersionEntity, MJRecordProcessEntity, MJTestEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { InferProcessor } from '@memberjunction/record-set-processor';
import type { RecordProcessorContext, RecordRef, RecordResult } from '@memberjunction/record-set-processor-base';
import {
    ConstraintBlockMissingError,
    FeaturePipelineVersionService,
    type DataFeatureOutput,
    type DataFeatureSpec,
    type FeaturePipelinePinData,
    type ResolvedConstraint,
} from '@memberjunction/feature-pipelines';
import { FeaturePipelineGoldenSetDriver, type FeaturePipelineGoldenSetConfig } from '../drivers/FeaturePipelineGoldenSetDriver';
import type { GoldenCase } from '../drivers/golden-set-scoring';
import type { DriverExecutionContext } from '../types';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';

/**
 * The driver over REAL entity objects (a minimal EntityInfo per entity, loaded with plain data) and a real
 * InferProcessor whose batch, pin and constraint reads are stubbed: the evaluation against the database and the model
 * is exercised by the job-title golden-set run.
 */

const TEST_ID = 'AAAAAAAA-0000-0000-0000-00000000000A';
const RP_ID = 'BBBBBBBB-0000-0000-0000-00000000000B';
const ENTITY_ID = 'EEEEEEEE-0000-0000-0000-00000000000E';
const PIN: FeaturePipelinePinData = { PromptID: 'P', PromptVersionHash: 'h', AIModelID: 'M', ParametersHash: 'x', SpecHash: 's' };

type FieldValue = string | number | boolean | null;

/** A real entity object of the given class over a minimal EntityInfo whose columns are the data's keys. */
async function realEntity<T extends BaseEntity>(ctor: new (entity: EntityInfo) => T, name: string, data: Record<string, FieldValue>): Promise<T> {
    const sqlType = (v: FieldValue): string => (typeof v === 'number' ? (Number.isInteger(v) ? 'int' : 'float') : typeof v === 'boolean' ? 'bit' : 'nvarchar');
    const info = new EntityInfo({
        ID: `00000000-0000-0000-0000-${name.length.toString().padStart(12, '0')}`, Name: name, Status: 'Active', BaseTable: name, BaseView: name,
        Fields: Object.entries(data).map(([field, v]) => ({
            ID: `F-${field}`, Name: field, Type: field === 'ID' ? 'uniqueidentifier' : sqlType(v), AllowsNull: true, IsPrimaryKey: field === 'ID',
        })),
    });
    const entity = new ctor(info);
    await entity.LoadFromData(data);
    return entity;
}

const output = (Name: string): DataFeatureOutput => ({ Name, Ref: `$.${Name}`, Target: { Mode: 'field', EntityFieldName: Name } });

function spec(goldenSetTestID: string, outputs: DataFeatureOutput[] = []): DataFeatureSpec {
    return {
        Name: 'JT', Description: 'jt', PromptID: 'P', Context: {}, Caching: { Cacheable: false }, Outputs: outputs,
        Activation: { GoldenSetTestID: goldenSetTestID, Metric: 'accuracy', Threshold: 0.6 },
    };
}

const modelMadeCase: GoldenCase = { ID: 'g1', Input: { CurrentJobTitle: 'Owner' }, Expected: { SeniorityLevel: ['C-Level'] }, LabelSource: 'model-consensus' };

/** The driver with the pipeline row it loads: the row's load is the database's, so the test supplies the row. */
class TestableGoldenSetDriver extends FeaturePipelineGoldenSetDriver {
    constructor(private readonly row: MJRecordProcessEntity | null) {
        super();
    }
    protected override async LoadRecordProcess(): Promise<MJRecordProcessEntity | null> {
        return this.row;
    }
}

interface Harness {
    driver: TestableGoldenSetDriver;
    context: DriverExecutionContext;
    processor: InferProcessor;
    processBatch: Mock<(records: RecordRef[], ctx: RecordProcessorContext) => Promise<Map<string, RecordResult>>>;
    preflight: MockInstance<InferProcessor['Preflight']>;
    resolvePin: MockInstance<InferProcessor['ResolveRunPin']>;
    record: MockInstance<FeaturePipelineVersionService['RecordGoldenSetResult']>;
}

interface HarnessOptions {
    goldenSetTestID?: string;
    cases?: GoldenCase[];
    outputs?: DataFeatureOutput[];
    config?: Partial<FeaturePipelineGoldenSetConfig>;
    results?: Map<string, RecordResult>;
    constraints?: Map<string, ResolvedConstraint | null>;
    versionStatus?: MJFeaturePipelineVersionEntity['Status'];
    rowFound?: boolean;
    /** The test's InputDefinition JSON as stored, instead of `{ Cases }`. */
    inputDefinition?: string;
    /** What successive ResolveRunPin calls return (the last one repeats); default PIN. */
    pins?: FeaturePipelinePinData[];
}

async function harness(o: HarnessOptions = {}): Promise<Harness> {
    const processor = new InferProcessor('P', undefined, spec(o.goldenSetTestID || TEST_ID, o.outputs), null);
    vi.spyOn(InferProcessor, 'FromRecordProcess').mockReturnValue(processor);
    const processBatch = vi.fn<(records: RecordRef[], ctx: RecordProcessorContext) => Promise<Map<string, RecordResult>>>()
        .mockResolvedValue(o.results || new Map());
    vi.spyOn(processor, 'ProcessBatch').mockImplementation(processBatch);
    const pins = o.pins || [PIN];
    const resolvePin = vi.spyOn(processor, 'ResolveRunPin').mockResolvedValue(pins[pins.length - 1]);
    for (const pin of pins.slice(0, -1)) {
        resolvePin.mockResolvedValueOnce(pin);
    }
    const preflight = vi.spyOn(processor, 'Preflight').mockResolvedValue(undefined);
    vi.spyOn(processor, 'GetResolvedConstraints').mockResolvedValue(o.constraints || new Map());
    const version = await realEntity(MJFeaturePipelineVersionEntity, 'MJ: Feature Pipeline Versions',
        { ID: 'V-1', Version: 3, Status: o.versionStatus || 'Active' });
    const record = vi.spyOn(FeaturePipelineVersionService.Instance, 'RecordGoldenSetResult').mockResolvedValue(version);
    const rp = await realEntity(MJRecordProcessEntity, 'MJ: Record Processes', { ID: RP_ID, Name: 'JT', EntityID: ENTITY_ID });
    const config: FeaturePipelineGoldenSetConfig = { RecordProcessID: RP_ID, ...o.config };
    const test = await realEntity(MJTestEntity, 'MJ: Tests', {
        ID: TEST_ID, Name: 'golden', Configuration: JSON.stringify(config), InputDefinition: o.inputDefinition || JSON.stringify({ Cases: o.cases || [modelMadeCase] }),
    });
    const testRun = await realEntity(MJTestRunEntity, 'MJ: Test Runs', { ID: 'TR-1' });
    const contextUser = new UserInfo(undefined, { ID: 'U-1', Name: 'Evaluator', Email: 'evaluator@example.com' });
    const driver = new TestableGoldenSetDriver(o.rowFound === false ? null : rp);
    const context: DriverExecutionContext = { test, testRun, contextUser, options: {}, oracleRegistry: new Map() };
    return { driver, context, processor, processBatch, preflight, resolvePin, record };
}

const human = (id: string, expected: Record<string, string[]>): GoldenCase => ({ ID: id, Input: { T: id }, Expected: expected, LabelSource: 'human' });
/** Every case answered with the same payload. */
const allOk = (cs: GoldenCase[], payload: Record<string, FieldValue>): Map<string, RecordResult> =>
    new Map(cs.map((c) => [`golden-${c.ID}`, { Status: 'Succeeded', ResultPayload: payload }]));
const ok = (payload: Record<string, FieldValue | Array<Record<string, FieldValue>>>): RecordResult => ({ Status: 'Succeeded', ResultPayload: payload });

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('FeaturePipelineGoldenSetDriver refusals', () => {
    it('refuses a pipeline that does not name this test as its golden set', async () => {
        const r = await harness({ goldenSetTestID: 'CCCCCCCC-0000-0000-0000-00000000000C' });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toContain('does not declare this test');
        expect(r.processBatch).not.toHaveBeenCalled();
    });
    it('matches the test ID whatever its case, then refuses model-made labels without a passing record before any case runs', async () => {
        const r = await harness({ goldenSetTestID: TEST_ID.toLowerCase() });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toContain('label-quality check');
        expect(r.processBatch).not.toHaveBeenCalled();
        expect(r.record).not.toHaveBeenCalled();
    });
    it('refuses when the Record Process does not exist', async () => {
        const r = await harness({ rowFound: false });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toContain(`Record Process '${RP_ID}' not found`);
        expect(r.processBatch).not.toHaveBeenCalled();
    });
    it('refuses a Configuration without RecordProcessID', async () => {
        const r = await harness({ config: { RecordProcessID: '' } });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toBe('Configuration.RecordProcessID is required');
    });
    it('refuses an InputDefinition without Cases as an empty golden set', async () => {
        const r = await harness({ inputDefinition: '{}' });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toContain('the golden set has no cases');
        expect(r.processBatch).not.toHaveBeenCalled();
    });
});

describe('FeaturePipelineGoldenSetDriver evaluation', () => {
    const cases = [human('g1', { SeniorityLevel: ['C-Level'] }), human('g2', { SeniorityLevel: ['Manager', 'Director'] }), human('g3', { SeniorityLevel: ['Owner'] })];

    it('runs every case as one dry-run batch with the cache bypassed, scores it and stores the result under the run pin', async () => {
        const results = new Map<string, RecordResult>([
            ['golden-g1', ok({ SeniorityLevel: 'c-level' })],
            ['golden-g2', ok({ SeniorityLevel: 'Director' })],
            ['golden-g3', { Status: 'Failed', FailureKind: 'RejectedInvalid', ErrorMessage: 'answer outside the allowed values' }],
        ]);
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results });
        const result = await r.driver.Execute(r.context);

        expect(r.processBatch).toHaveBeenCalledTimes(1);
        const [records, ctx] = r.processBatch.mock.calls[0];
        expect(records).toEqual(cases.map((c) => ({ EntityID: ENTITY_ID, RecordID: `golden-${c.ID}`, Record: c.Input })));
        expect(ctx).toMatchObject({ DryRun: true, BypassCache: true, recordProcessID: RP_ID, entityID: ENTITY_ID, TriggeredBy: 'Manual' });

        expect(r.record).toHaveBeenCalledTimes(1);
        const stored = r.record.mock.calls[0][0];
        expect(stored).toMatchObject({ RecordProcessID: RP_ID, Pin: PIN, TestRunID: 'TR-1', ApprovedByUserID: 'U-1' });
        expect(stored.Activation).toEqual({ GoldenSetTestID: TEST_ID, Metric: 'accuracy', Threshold: 0.6 });
        expect(stored.Result).toMatchObject({ N: 3 });
        expect(stored.Result.Value).toBeCloseTo(2 / 3, 6);
        expect(JSON.parse(stored.Result.Details).Answers).toEqual([
            { CaseID: 'g1', Values: { SeniorityLevel: 'c-level' } },
            { CaseID: 'g2', Values: { SeniorityLevel: 'Director' } },
            { CaseID: 'g3', Values: null },
        ]);

        expect(result.status).toBe('Passed');
        expect(result.targetLogId).toBe('V-1');
        expect(result.score).toBeCloseTo(2 / 3, 6);
        expect(result.oracleResults.map((o) => [o.oracleType, o.passed])).toEqual([['golden-set.SeniorityLevel', true], ['golden-set.activation', true]]);
    });

    it('fails the test when the stored result left the version Refused', async () => {
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results: allOk(cases, { SeniorityLevel: 'Owner' }), versionStatus: 'Refused' });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Failed');
        expect(result.oracleResults.find((o) => o.oracleType === 'golden-set.activation')).toMatchObject({ passed: false, message: 'Version v3 Refused' });
    });

    it('reads an array output\'s primary item (lowest order, at the constraint\'s ItemRef) and compares display names when asked', async () => {
        const jobFunctions: ResolvedConstraint = {
            Type: 'lookup', OnViolation: 'fail', ItemRef: '$.JobFunctionID',
            ValueDisplays: { 'JF-OPS': 'Operations — runs the place', 'JF-SAL': 'Sales — sells' },
        };
        const results = new Map<string, RecordResult>([
            ['golden-g1', ok({ JobFunctions: [{ JobFunctionID: 'JF-SAL', Rank: 2 }, { JobFunctionID: ' jf-ops', Rank: 1 }] })],
        ]);
        const r = await harness({
            cases: [human('g1', { JobFunctions: ['Operations'] })], outputs: [output('JobFunctions')], results,
            constraints: new Map([['JobFunctions', jobFunctions]]),
            config: { Outputs: { JobFunctions: { PrimaryItemOrderBy: 'Rank', Compare: 'display-name' } } },
        });
        await r.driver.Execute(r.context);
        expect(JSON.parse(r.record.mock.calls[0][0].Result.Details).Answers).toEqual([{ CaseID: 'g1', Values: { JobFunctions: 'Operations' } }]);
    });

    it('compares an array output\'s first item by value when no order or display name is configured', async () => {
        const results = new Map<string, RecordResult>([
            ['golden-g1', ok({ JobFunctions: [{ JobFunctionID: 'JF-SAL', Rank: 2 }, { JobFunctionID: 'JF-OPS', Rank: 1 }] })],
        ]);
        const r = await harness({
            cases: [human('g1', { JobFunctions: ['JF-SAL'] })], outputs: [output('JobFunctions')], results,
            constraints: new Map([['JobFunctions', { Type: 'lookup', OnViolation: 'fail', ItemRef: '$.JobFunctionID' }]]),
        });
        await r.driver.Execute(r.context);
        expect(JSON.parse(r.record.mock.calls[0][0].Result.Details).Answers).toEqual([{ CaseID: 'g1', Values: { JobFunctions: 'JF-SAL' } }]);
    });

    it('sorts items without a numeric order value last', async () => {
        const results = new Map<string, RecordResult>([
            ['golden-g1', ok({ JobFunctions: [{ JobFunctionID: 'A' }, { JobFunctionID: 'B', Rank: 'x' }, { JobFunctionID: 'C', Rank: 2 }, { JobFunctionID: 'D', Rank: '1' }] })],
        ]);
        const r = await harness({
            cases: [human('g1', { JobFunctions: ['D'] })], outputs: [output('JobFunctions')], results,
            constraints: new Map([['JobFunctions', { Type: 'lookup', OnViolation: 'fail', ItemRef: '$.JobFunctionID' }]]),
            config: { Outputs: { JobFunctions: { PrimaryItemOrderBy: 'Rank' } } },
        });
        await r.driver.Execute(r.context);
        expect(JSON.parse(r.record.mock.calls[0][0].Result.Details).Answers).toEqual([{ CaseID: 'g1', Values: { JobFunctions: 'D' } }]);
    });

    it('fails, storing nothing, when an array of objects has no ItemRef to compare', async () => {
        const results = new Map<string, RecordResult>([['golden-g1', ok({ JobFunctions: [{ JobFunctionID: 'JF-SAL' }] })]]);
        const r = await harness({ cases: [human('g1', { JobFunctions: ['JF-SAL'] })], outputs: [output('JobFunctions')], results });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toContain("Output 'JobFunctions' answered a structured value");
        expect(r.record).not.toHaveBeenCalled();
    });

    it('ends the evaluation as an Error, storing nothing, when a case failed for a reason other than its answer', async () => {
        const results = new Map<string, RecordResult>([
            ['golden-g1', ok({ SeniorityLevel: 'C-Level' })],
            ['golden-g2', { Status: 'Failed', ErrorMessage: 'provider unavailable (503)' }],
            ['golden-g3', { Status: 'Failed', ErrorMessage: 'provider unavailable (503)' }],
        ]);
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toBe('2 of 3 golden cases could not be run (case g2: provider unavailable (503)); nothing was stored');
        expect(r.record).not.toHaveBeenCalled();
    });

    it('ends the evaluation as an Error, storing nothing, when a case was skipped', async () => {
        const results = new Map<string, RecordResult>([
            ['golden-g1', ok({ SeniorityLevel: 'C-Level' })],
            ['golden-g2', ok({ SeniorityLevel: 'Owner' })],
            ['golden-g3', { Status: 'Skipped' }],
        ]);
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toBe('1 of 3 golden cases could not be run (case g3: Skipped); nothing was stored');
        expect(r.record).not.toHaveBeenCalled();
    });

    it('treats a case with no result as not run', async () => {
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results: allOk(cases.slice(0, 2), { SeniorityLevel: 'Owner' }) });
        const result = await r.driver.Execute(r.context);
        expect(result.errorMessage).toBe('1 of 3 golden cases could not be run (case g3: no result); nothing was stored');
        expect(r.record).not.toHaveBeenCalled();
    });

    it('stores nothing when the pipeline\'s pin changed while the cases ran', async () => {
        const edited: FeaturePipelinePinData = { ...PIN, PromptVersionHash: 'h-edited' };
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results: allOk(cases, { SeniorityLevel: 'Owner' }), pins: [PIN, edited] });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toContain('changed (prompt, model, parameters or spec) during the evaluation; nothing was stored');
        expect(r.record).not.toHaveBeenCalled();
    });

    it('stores the result under the pin captured before the batch', async () => {
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results: allOk(cases, { SeniorityLevel: 'Owner' }) });
        await r.driver.Execute(r.context);
        const resolvePin = r.resolvePin;
        expect(resolvePin).toHaveBeenCalledTimes(2);
        expect(resolvePin.mock.invocationCallOrder[0]).toBeLessThan(r.processBatch.mock.invocationCallOrder[0]);
        expect(resolvePin.mock.invocationCallOrder[1]).toBeGreaterThan(r.processBatch.mock.invocationCallOrder[0]);
        expect(r.record.mock.calls[0][0].Pin).toEqual(PIN);
    });
});

describe('FeaturePipelineGoldenSetDriver preflight', () => {
    const cases = [human('g1', { SeniorityLevel: ['C-Level'] })];

    it('runs the processor\'s Preflight once, as a dry run, before any case', async () => {
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results: allOk(cases, { SeniorityLevel: 'C-Level' }) });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Passed');
        expect(r.preflight).toHaveBeenCalledTimes(1);
        expect(r.preflight.mock.calls[0][0]).toMatchObject({ DryRun: true, recordProcessID: RP_ID });
        expect(r.preflight.mock.invocationCallOrder[0]).toBeLessThan(r.processBatch.mock.invocationCallOrder[0]);
        expect(r.processor.WritesHistory).toBe(true);
    });

    it('refuses a pipeline whose Preflight fails with an empty message, naming the error', async () => {
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results: allOk(cases, { SeniorityLevel: 'C-Level' }) });
        r.preflight.mockRejectedValue(new ConstraintBlockMissingError('Job Title Prompt', ''));
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toBe("Pipeline 'JT' would not run: ConstraintBlockMissingError");
        expect(r.processBatch).not.toHaveBeenCalled();
        expect(r.record).not.toHaveBeenCalled();
    });

    it('refuses a pipeline whose Preflight fails (template without the constraint block), storing nothing', async () => {
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results: allOk(cases, { SeniorityLevel: 'C-Level' }) });
        r.preflight.mockRejectedValue(new ConstraintBlockMissingError('Job Title Prompt', 'the template does not render the constraint block'));
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toBe("Pipeline 'JT' would not run: the template does not render the constraint block");
        expect(r.processBatch).not.toHaveBeenCalled();
        expect(r.record).not.toHaveBeenCalled();
    });
});

describe('FeaturePipelineGoldenSetDriver.LoadRecordProcess', () => {
    async function withProvider(loads: boolean) {
        const r = await harness();
        const rp = await realEntity(MJRecordProcessEntity, 'MJ: Record Processes', { ID: RP_ID, Name: 'JT', EntityID: ENTITY_ID });
        const load = vi.spyOn(rp, 'Load').mockResolvedValue(loads);
        const provider = new EntitiesOnlyProvider([]);
        const getEntityObject = vi.spyOn(provider, 'GetEntityObject').mockResolvedValue(rp);
        const driver = new FeaturePipelineGoldenSetDriver();
        driver.Provider = provider;
        return { r, driver, load, getEntityObject };
    }

    it('reads the row on the driver\'s provider and reports a row that does not load as not found', async () => {
        const { r, driver, load, getEntityObject } = await withProvider(false);
        const result = await driver.Execute(r.context);
        expect(getEntityObject).toHaveBeenCalledWith('MJ: Record Processes', r.context.contextUser);
        expect(load).toHaveBeenCalledWith(RP_ID);
        expect(result.errorMessage).toBe(`Record Process '${RP_ID}' not found`);
    });

    it('evaluates the row it loaded', async () => {
        const { r, driver } = await withProvider(true);
        const result = await driver.Execute(r.context);
        expect(result.errorMessage).toContain('label-quality check');
    });
});

describe('FeaturePipelineGoldenSetDriver evaluation cost', () => {
    const cases = [human('g1', { SeniorityLevel: ['C-Level'] }), human('g2', { SeniorityLevel: ['C-Level'] }), human('g3', { SeniorityLevel: ['Director'] })];
    type CostRow = { ID: string; TotalCost: number | null };

    /** The harness with the driver on a provider that answers the prompt-run read with the given rows. */
    async function withCosts(results: Map<string, RecordResult>, rows: CostRow[], o: HarnessOptions = {}, success = true) {
        const r = await harness({ cases, outputs: [output('SeniorityLevel')], results, ...o });
        const provider = new EntitiesOnlyProvider([]);
        const reads: RunViewParams[] = [];
        vi.spyOn(provider, 'RunView').mockImplementation(async (params: RunViewParams): Promise<RunViewResult<CostRow>> => {
            reads.push(params);
            return { Success: success, Results: success ? rows : [], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: success ? '' : 'timeout' };
        });
        r.driver.Provider = provider;
        return { r, reads };
    }
    const answered = (run: string | undefined): RecordResult => ({ ...ok({ SeniorityLevel: 'C-Level' }), AIPromptRunID: run });

    it('reports the summed TotalCost of the distinct prompt runs the batch recorded as the result\'s totalCost', async () => {
        // g1 and g2 share one prompt run (one cache key), so it is read and counted once.
        const results = new Map<string, RecordResult>([['golden-g1', answered('RUN-A')], ['golden-g2', answered('run-a')], ['golden-g3', answered('RUN-B')]]);
        const { r, reads } = await withCosts(results, [{ ID: 'RUN-A', TotalCost: 0.0005 }, { ID: 'RUN-B', TotalCost: 0.00025 }]);
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Passed');
        expect(result.totalCost).toBeCloseTo(0.00075, 10);
        expect(reads).toHaveLength(1);
        expect(reads[0]).toMatchObject({ EntityName: 'MJ: AI Prompt Runs', Fields: ['ID', 'TotalCost'], ExtraFilter: "ID IN ('RUN-A','RUN-B')" });
    });

    it('reports 0 without reading anything when no result names a prompt run', async () => {
        const results = new Map<string, RecordResult>(cases.map((c) => [`golden-${c.ID}`, answered(undefined)]));
        const { r, reads } = await withCosts(results, []);
        const result = await r.driver.Execute(r.context);
        expect(result.totalCost).toBe(0);
        expect(reads).toHaveLength(0);
    });

    it('still reports what the model calls cost when the evaluation stops after them (the pin changed)', async () => {
        const results = new Map<string, RecordResult>(cases.map((c) => [`golden-${c.ID}`, answered('RUN-A')]));
        const edited: FeaturePipelinePinData = { ...PIN, PromptVersionHash: 'h2' };
        const { r } = await withCosts(results, [{ ID: 'RUN-A', TotalCost: 0.001 }], { pins: [PIN, edited] });
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toContain('changed');
        expect(result.totalCost).toBeCloseTo(0.001, 10);
        expect(r.record).not.toHaveBeenCalled();
    });

    it('still reports what the model calls cost when a case could not be run', async () => {
        const results = new Map<string, RecordResult>([['golden-g1', answered('RUN-A')], ['golden-g2', answered('RUN-B')],
            ['golden-g3', { Status: 'Failed', ErrorMessage: '503 unavailable', AIPromptRunID: 'RUN-C' }]]);
        const { r } = await withCosts(results, [{ ID: 'RUN-A', TotalCost: 0.001 }, { ID: 'RUN-B', TotalCost: 0.002 }, { ID: 'RUN-C', TotalCost: null }]);
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toContain('could not be run');
        expect(result.totalCost).toBeCloseTo(0.003, 10);
    });

    it('fails, storing nothing, when the prompt runs cannot be read (an unknown cost is never reported as 0)', async () => {
        const results = new Map<string, RecordResult>(cases.map((c) => [`golden-${c.ID}`, answered('RUN-A')]));
        const { r } = await withCosts(results, [], {}, false);
        const result = await r.driver.Execute(r.context);
        expect(result.status).toBe('Error');
        expect(result.errorMessage).toBe("could not read the evaluation's AI Prompt Runs to report its cost: timeout");
        expect(r.record).not.toHaveBeenCalled();
    });
});
