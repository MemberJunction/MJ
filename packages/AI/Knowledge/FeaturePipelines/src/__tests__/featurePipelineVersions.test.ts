import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseEntity,
    DatabaseProviderBase,
    EntityInfo,
    UserInfo,
    type DatasetResultType,
    type DatasetStatusResultType,
    type DeleteSQLResult,
    type EntityRecordNameResult,
    type EntityTransactionScope,
    type IEntityDataProvider,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PotentialDuplicateResponse,
    type ProviderType,
    type RecordChange,
    type RecordDependency,
    type RecordMergeResult,
    type RunQueryResult,
    type RunViewParams,
    type RunViewResult,
    type SaveSQLResult,
    type ScoredCandidate,
    type TransactionGroupBase,
} from '@memberjunction/core';
import { FeaturePipelineVersionService, FeaturePipelineVersionRefusedError, type PlanUnattendedParams } from '../versions/FeaturePipelineVersionService.js';
import type { MJFeatureValueEntity } from '@memberjunction/core-entities';
import { MJFeaturePipelineVersionEntityExtended, type VersionActivationFields } from '../entities/MJFeaturePipelineVersionEntityExtended.js';
import { UUIDsEqual } from '@memberjunction/global';
import { FeaturePipelinePin, type FeaturePipelinePinData } from '../spec/feature-value-key.js';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';

/**
 * The version registry over in-memory `MJ: Feature Pipeline Versions` rows. The rows are REAL entity objects of the
 * registered subclass, so every save the registry makes runs the activation save check; a data provider double
 * stores them by echoing their fields.
 */

const VERSION_ENTITY_ID = 'F0000000-0000-0000-0000-000000000001';
/** The role whose members may write version rows. */
const STEWARD_ROLE_ID = 'F1000000-0000-0000-0000-000000000002';

const user = new UserInfo(undefined, {
    ID: 'user-1',
    Name: 'Pipeline Owner',
    Email: 'owner@example.com',
    UserRoles: [{ UserID: 'user-1', RoleID: STEWARD_ROLE_ID, Role: 'Stewards' }],
});
const pinA: FeaturePipelinePinData = { PromptID: 'P', PromptVersionHash: 'h1', AIModelID: 'M', ParametersHash: 'x', SpecHash: 's' };
const pinB: FeaturePipelinePinData = { ...pinA, PromptVersionHash: 'h2' };

/** The version table's columns, as the database metadata declares them. */
function versionEntityInfo(): EntityInfo {
    const column = (Name: string, Type: string, AllowsNull: boolean, DefaultValue: string | null = null) =>
        ({ ID: `FPV-${Name}`, Name, Type, AllowsNull, DefaultValue, AllowUpdateAPI: true });
    return new EntityInfo({
        ID: VERSION_ENTITY_ID,
        Name: 'MJ: Feature Pipeline Versions',
        Status: 'Active',
        SchemaName: '__mj',
        BaseTable: 'FeaturePipelineVersion',
        BaseView: 'vwFeaturePipelineVersions',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        Permissions: [{ ID: 'FPV-PERM', RoleID: STEWARD_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true }],
        Fields: [
            { ID: 'FPV-ID', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false, DefaultValue: '(newsequentialid())' },
            column('RecordProcessID', 'uniqueidentifier', false),
            column('Version', 'int', false),
            column('PinHash', 'nvarchar', false),
            column('SpecHash', 'nvarchar', false),
            column('PromptID', 'uniqueidentifier', true),
            column('PromptVersionHash', 'nvarchar', true),
            column('AIModelID', 'uniqueidentifier', true),
            column('ParametersHash', 'nvarchar', true),
            column('Status', 'nvarchar', false, "(N'Candidate')"),
            column('Gated', 'bit', false, '((0))'),
            column('GoldenSetTestID', 'uniqueidentifier', true),
            column('GoldenSetTestRunID', 'uniqueidentifier', true),
            column('Metric', 'nvarchar', true),
            column('Threshold', 'float', true),
            column('ResultValue', 'float', true),
            column('ResultLower', 'float', true),
            column('ResultUpper', 'float', true),
            column('ResultN', 'int', true),
            column('ResultDetails', 'nvarchar', true),
            column('ActivatedAt', 'datetimeoffset', true),
            column('ApprovedByUserID', 'uniqueidentifier', true),
            column('RetiredAt', 'datetimeoffset', true),
            column('BackfilledAt', 'datetimeoffset', true),
            column('__mj_CreatedAt', 'datetimeoffset', true),
            column('__mj_UpdatedAt', 'datetimeoffset', true),
        ],
    });
}
const VERSION_ENTITY = versionEntityInfo();

/** The rows the registry reads back: every version row saved so far, plus the ones a test seeds. */
const versionRows: MJFeaturePipelineVersionEntityExtended[] = [];

/** A Feature Value row as the registry reads it (two columns). */
type FeatureValueRow = Pick<MJFeatureValueEntity, 'RecordID' | 'PipelineVersion' | 'ComputedAt'>;
/** When a value was computed: minute `minute` of a fixed hour, so a test orders values by the minute it gives. */
const at = (minute: number): Date => new Date(Date.UTC(2026, 9, 1, 12, minute));
/** The pipeline's Pipeline Feature Values; every read returns them all, whatever its filter. */
const featureValueRows: FeatureValueRow[] = [];

/**
 * Stores version rows by echoing their fields. Like the table's unique keys, it refuses a row whose pipeline already has
 * another row with the same Version or the same PinHash. `FailSave` makes a save fail (the provider throws, as on a
 * SQL error).
 */
class VersionRowStore implements IEntityDataProvider {
    public FailSave: ((row: MJFeaturePipelineVersionEntityExtended) => boolean) | null = null;
    /** How many saves the unique keys refused. */
    public UniqueKeyViolations = 0;
    /** Whether the provider's transaction (the pipeline lock in this double) is open; the registry writes only under it. */
    constructor(private readonly inTransaction: () => boolean, private readonly onUniqueKeyViolation: () => void = () => undefined) {}
    public EntityByID(entityID: string): EntityInfo | undefined {
        return UUIDsEqual(entityID, VERSION_ENTITY_ID) ? VERSION_ENTITY : undefined;
    }
    public async Config(): Promise<boolean> {
        return true;
    }
    public async Load(): Promise<{}> {
        throw new Error('not used by the version registry');
    }
    public async Save(entity: BaseEntity): Promise<{}> {
        if (!(entity instanceof MJFeaturePipelineVersionEntityExtended)) {
            throw new Error('only version rows are stored here');
        }
        if (!this.inTransaction()) {
            throw new Error('version rows are written only under the pipeline lock');
        }
        if (this.FailSave?.(entity)) {
            throw new Error('save failed');
        }
        // copy first: the unique check and the insert below then run without yielding, as one statement does
        const stored = await this.Copy(entity);
        const duplicate = versionRows.find((r) => !UUIDsEqual(r.ID, entity.ID) && r.RecordProcessID === entity.RecordProcessID
            && (r.Version === entity.Version || r.PinHash === entity.PinHash));
        if (duplicate) {
            this.UniqueKeyViolations++;
            this.onUniqueKeyViolation();
            throw new Error(`Violation of UNIQUE KEY constraint: version ${duplicate.Version} or its pin already exists`);
        }
        // the table keeps the copy of the saved values: later in-memory edits of the caller's object do not reach it
        const index = versionRows.findIndex((r) => UUIDsEqual(r.ID, entity.ID));
        if (index >= 0) {
            versionRows[index] = stored;
        } else {
            versionRows.push(stored);
        }
        return entity.GetAll();
    }
    /** A separate entity object with the same values, as each database read returns. */
    public async Copy(row: MJFeaturePipelineVersionEntityExtended): Promise<MJFeaturePipelineVersionEntityExtended> {
        const copy = new MJFeaturePipelineVersionEntityExtended(VERSION_ENTITY, this);
        copy.ContextCurrentUser = user;
        await copy.LoadFromData(row.GetAll());
        return copy;
    }
    public async Delete(): Promise<boolean> {
        throw new Error('not used by the version registry');
    }
    public async GetRecordChanges(): Promise<RecordChange[]> {
        return [];
    }
}

/**
 * The registry's metadata provider: views and new rows over the store, and optional entity transactions. Its
 * transactions are serialised, as the database's lock on the pipeline's version rows serialises two activations: a
 * transaction begins only after the open one committed or rolled back.
 */
class VersionRegistryProvider extends EntitiesOnlyProvider {
    public readonly Store = new VersionRowStore(() => this.transactionOpen);
    /** Settles when the open transaction ends. */
    private openTransaction: Promise<void> = Promise.resolve();
    private endTransaction: () => void = () => undefined;
    private transactionOpen = false;
    public readonly Scope = {
        IsNested: false,
        Commit: vi.fn<() => Promise<void>>().mockImplementation(async () => this.EndTransaction()),
        Rollback: vi.fn<() => Promise<void>>().mockImplementation(async () => this.EndTransaction()),
    };
    public readonly Views: RunViewParams[] = [];
    constructor(private readonly transactions: boolean) {
        super([VERSION_ENTITY]);
    }
    public override get SupportsEntityTransactions(): boolean {
        return this.transactions;
    }
    public async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        const previous = this.openTransaction;
        let end: () => void = () => undefined;
        this.openTransaction = new Promise<void>((resolve) => { end = resolve; });
        await previous;
        this.transactionOpen = true;
        this.endTransaction = end;
        return this.Scope;
    }
    private EndTransaction(): void {
        this.transactionOpen = false;
        this.endTransaction();
    }
    /** An unsaved version row on the store, owned by the test user. */
    public NewRow(): MJFeaturePipelineVersionEntityExtended {
        const row = new MJFeaturePipelineVersionEntityExtended(VERSION_ENTITY, this.Store);
        row.ContextCurrentUser = user;
        return row;
    }
}

/** A registry provider whose views return the stored rows and whose new entity objects are version rows on the store. */
function registryProvider(transactions: boolean): VersionRegistryProvider {
    const provider = new VersionRegistryProvider(transactions);
    vi.spyOn(provider, 'RunView').mockImplementation(async (params: RunViewParams) => {
        provider.Views.push(params);
        if (params.EntityName === 'MJ: Feature Values') {
            return featureValueResult(params);
        }
        // each read returns new objects with the values stored at the time of the read, as a database read does
        const rows = await Promise.all(versionRows.map((r) => provider.Store.Copy(r)));
        return viewResult(rows);
    });
    vi.spyOn(provider, 'GetEntityObject').mockImplementation(async () => provider.NewRow());
    return provider;
}

function viewResult(rows: MJFeaturePipelineVersionEntityExtended[]): RunViewResult<MJFeaturePipelineVersionEntityExtended> {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
}

/**
 * A read of `MJ: Feature Values`: a `count_only` read answers the number of rows without a pipeline version (the only
 * count the registry makes); any other read returns every row.
 */
function featureValueResult(params: RunViewParams): RunViewResult<FeatureValueRow> {
    if (params.ResultType === 'count_only') {
        const unversioned = featureValueRows.filter((r) => r.PipelineVersion === null).length;
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: unversioned, ExecutionTime: 0, ErrorMessage: '' };
    }
    const rows = featureValueRows.map((r) => ({ ...r }));
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
}

/** Seeds a saved version row of pipeline RP under `pin`. */
async function seedVersion(provider: VersionRegistryProvider, pin: FeaturePipelinePinData,
    fields: Partial<Pick<MJFeaturePipelineVersionEntityExtended, 'Version' | 'Status' | 'Gated' | 'Threshold' | 'ResultValue' | 'GoldenSetTestRunID' | 'BackfilledAt' | 'ActivatedAt' | 'ApprovedByUserID' | 'RetiredAt' | 'ResultDetails'
        | 'GoldenSetTestID' | 'Metric' | '__mj_CreatedAt' | '__mj_UpdatedAt'>>): Promise<MJFeaturePipelineVersionEntityExtended> {
    const row = provider.NewRow();
    await row.LoadFromData({
        ID: `V-${fields.Version}`, RecordProcessID: 'RP', PinHash: await FeaturePipelinePin.ComputeHash(pin), SpecHash: pin.SpecHash,
        PromptID: pin.PromptID, PromptVersionHash: pin.PromptVersionHash, AIModelID: pin.AIModelID, ParametersHash: pin.ParametersHash,
        Version: 1, Status: 'Active', Gated: false, ...fields,
    });
    versionRows.push(row);
    return row;
}

/** The stored row of version `version`, as the table holds it now. */
function stored(version: number): MJFeaturePipelineVersionEntityExtended | undefined {
    return versionRows.find((r) => r.Version === version);
}

const svc = FeaturePipelineVersionService.Instance;
const gate = { GoldenSetTestID: 'T-1', Metric: 'accuracy' as const, Threshold: 0.9 };
let provider: VersionRegistryProvider;

beforeEach(() => {
    versionRows.length = 0;
    featureValueRows.length = 0;
    provider = registryProvider(true);
});

describe('FeaturePipelineVersionService.ResolveForRun', () => {
    it('activates the first version of a pipeline whatever the trigger', async () => {
        const v = await svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'Schedule', ContextUser: user, Provider: provider });
        expect(v).toEqual({ Version: 1, Status: 'Active' });
        // the gate reads the pipeline's rows fresh: a cached read could miss a version another run just activated
        expect(provider.Views[0]).toMatchObject({ EntityName: 'MJ: Feature Pipeline Versions', ExtraFilter: "RecordProcessID = 'RP'", BypassCache: true, Telemetry: { Exempt: true } });
    });

    it('holds a scheduled run when the version changed, naming the on-demand backfill', async () => {
        await seedVersion(provider, pinA, { Version: 1 });
        const refused = svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinB, TriggeredBy: 'Schedule', ContextUser: user, Provider: provider });
        await expect(refused).rejects.toThrow(/v1 to v2.*on-demand run/);
        await expect(refused).rejects.toBeInstanceOf(FeaturePipelineVersionRefusedError);
        expect(versionRows.find((r) => r.Version === 2)?.Status).toBe('Candidate');
    });

    it('activates the new version on an on-demand run and retires the old one', async () => {
        await seedVersion(provider, pinA, { Version: 1 });
        const v = await svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinB, TriggeredBy: 'OnDemand', ContextUser: user, Provider: provider });
        expect(v).toEqual({ Version: 2, Status: 'Active' });
        expect(stored(1)?.Status).toBe('Retired');
        expect(stored(2)?.ApprovedByUserID).toBe('user-1');
    });

    it('retires and activates in one transaction: a failed activation rolls the retirement back', async () => {
        const t = registryProvider(true);
        t.Store.FailSave = (row) => row.Version === 2 && row.Status === 'Active'; // the Candidate saves; its activation fails
        await seedVersion(t, pinA, { Version: 1 });
        await expect(svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinB, TriggeredBy: 'OnDemand', ContextUser: user, Provider: t }))
            .rejects.toThrow(/Saving Feature Pipeline version v2 failed/);
        expect(t.Scope.Rollback).toHaveBeenCalledTimes(1);
        expect(t.Scope.Commit).not.toHaveBeenCalled();
    });

    it('refuses a gated version without a stored golden-set result, even on demand', async () => {
        await expect(svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'OnDemand', ContextUser: user, Provider: provider,
            Activation: { GoldenSetTestID: 'T-1', Metric: 'accuracy', Threshold: 0.9 } })).rejects.toBeInstanceOf(FeaturePipelineVersionRefusedError);
        expect(versionRows[0].GetAll()).toMatchObject({ Version: 1, Status: 'Candidate', Gated: true, Threshold: 0.9 });
    });

    it('does not treat an Active version as activated once the pipeline declares a gate it has no passing result for', async () => {
        await seedVersion(provider, pinA, { Version: 1 });
        await expect(svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'OnDemand', ContextUser: user, Provider: provider,
            Activation: { GoldenSetTestID: 'T-1', Metric: 'accuracy', Threshold: 0.9 } })).rejects.toThrow(/v1 is not activated: run its golden-set test/);
    });

    it('runs an Active gated version whose stored result passes', async () => {
        await seedVersion(provider, pinA, { Version: 1, Gated: true, Threshold: 0.9, ResultValue: 0.95, GoldenSetTestRunID: 'TR' });
        const v = await svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'Schedule', ContextUser: user, Provider: provider,
            Activation: { GoldenSetTestID: 'T-1', Metric: 'accuracy', Threshold: 0.9 } });
        expect(v).toEqual({ Version: 1, Status: 'Active' });
    });

    it('refuses a refused version, naming what to change', async () => {
        await seedVersion(provider, pinA, { Version: 1, Status: 'Refused', Gated: true, Threshold: 0.9, ResultValue: 0.77, GoldenSetTestRunID: 'TR' });
        await expect(svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'OnDemand', ContextUser: user, Provider: provider, Activation: gate }))
            .rejects.toThrow(/v1 was refused activation: its golden-set result 0.77 is below the threshold 0.9/);
    });

    it('names the wrong required golden cases when they refused the version, without the threshold remedy', async () => {
        const details = JSON.stringify({ Score: { RequiredFailures: [{ CaseID: 'h01', Outputs: ['SeniorityLevel'] }, { CaseID: 'h03', Outputs: ['SeniorityLevel', 'JobFunctions'] }] } });
        await seedVersion(provider, pinA, { Version: 1, Status: 'Refused', Gated: true, Threshold: 0.9, ResultValue: 0, GoldenSetTestRunID: 'TR', ResultDetails: details });
        const refusal = svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'OnDemand', ContextUser: user, Provider: provider, Activation: gate });
        await expect(refusal).rejects.toThrow(/v1 was refused activation: its golden set has 2 required case\(s\) wrong: h01 \(SeniorityLevel\); h03 \(SeniorityLevel, JobFunctions\)\. Change the prompt, model, parameters or spec \(the Feature Pipeline Version Steward evaluates the new version automatically\)\.$/);
    });

    it('keeps the Candidate a refused run registered: the refusal is thrown after the lock committed', async () => {
        await seedVersion(provider, pinA, { Version: 1 });
        await expect(svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinB, TriggeredBy: 'Schedule', ContextUser: user, Provider: provider }))
            .rejects.toBeInstanceOf(FeaturePipelineVersionRefusedError);
        expect(provider.Scope.Commit).toHaveBeenCalledTimes(1);
        expect(provider.Scope.Rollback).not.toHaveBeenCalled();
        expect(stored(2)?.Status).toBe('Candidate');
    });

    it('tells a dry run the real run would be held, and creates nothing', async () => {
        await seedVersion(provider, pinA, { Version: 1 });
        const v = await svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinB, TriggeredBy: 'Schedule', DryRun: true, ContextUser: user, Provider: provider });
        expect(v.Version).toBeNull();
        expect(v.WouldRefuse).toMatch(/changed from v1 to v2/);
        expect(versionRows).toHaveLength(1);
    });

    it('tells a dry run of a gated pipeline without a passing result that the real run would be refused', async () => {
        const v = await svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'OnDemand', DryRun: true, ContextUser: user, Provider: provider, Activation: gate });
        expect(v.WouldRefuse).toMatch(/v1 is not activated: run its golden-set test \(MJ: Tests ID T-1\)/);
    });

    it('runs a version gated before as ungated once the pipeline drops its Activation', async () => {
        await seedVersion(provider, pinA, { Version: 1, Status: 'Candidate', Gated: true, Threshold: 0.9 });
        const v = await svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'OnDemand', ContextUser: user, Provider: provider });
        expect(v).toEqual({ Version: 1, Status: 'Active' });
        expect(stored(1)?.Gated).toBe(false);
    });

});

describe('FeaturePipelineVersionService.RegisterCandidate', () => {
    it('numbers a new pin as the next Candidate version', async () => {
        await seedVersion(provider, pinA, { Version: 1 });
        const row = await svc.RegisterCandidate({ RecordProcessID: 'RP', Pin: pinB, ContextUser: user, Provider: provider });
        expect(row.GetAll()).toMatchObject({ Version: 2, Status: 'Candidate', Gated: false, PinHash: await FeaturePipelinePin.ComputeHash(pinB) });
    });

    it('returns the version already registered for the pin', async () => {
        const v1 = await seedVersion(provider, pinA, { Version: 1 });
        expect((await svc.RegisterCandidate({ RecordProcessID: 'RP', Pin: pinA, ContextUser: user, Provider: provider })).ID).toBe(v1.ID);
        expect(provider.GetEntityObject).not.toHaveBeenCalled(); // nothing new was created, not even an insert the unique key refuses
        expect(versionRows).toHaveLength(1);
    });

});

describe('FeaturePipelineVersionService.AssertRunnable', () => {
    it('refuses a gated pin without a registered version, naming the golden-set test, and registers nothing', async () => {
        const refused = svc.AssertRunnable({ RecordProcessID: 'RP', Pin: pinA, Activation: gate, ContextUser: user, Provider: provider });
        await expect(refused).rejects.toBeInstanceOf(FeaturePipelineVersionRefusedError);
        await expect(refused).rejects.toThrow(/has no version for its current pin: run its golden-set test \(MJ: Tests ID T-1\)/);
        expect(versionRows).toHaveLength(0);
    });
});

describe('RecordGoldenSetResult', () => {
    const activation = { GoldenSetTestID: 'T-1', Metric: 'accuracy' as const, Threshold: 0.9 };
    it('activates a version whose result meets the threshold, at the threshold included', async () => {
        const row = await svc.RecordGoldenSetResult({ RecordProcessID: 'RP', Pin: pinA, Activation: activation, TestRunID: 'TR-1',
            Result: { Value: 0.9, Lower: 0.79, Upper: 0.96, N: 52, Details: '{}' }, ApprovedByUserID: 'user-1', ContextUser: user, Provider: provider });
        expect(row.Status).toBe('Active');
    });
    it('refuses a version below it, 1 of 1', async () => {
        const row = await svc.RecordGoldenSetResult({ RecordProcessID: 'RP', Pin: pinB, Activation: activation, TestRunID: 'TR-2',
            Result: { Value: 0.77, Lower: 0.64, Upper: 0.86, N: 52, Details: '{}' }, ApprovedByUserID: 'user-1', ContextUser: user, Provider: provider });
        expect(row.Status).toBe('Refused');
        expect(row.GetAll()).toMatchObject({ Gated: true, GoldenSetTestRunID: 'TR-2', ResultValue: 0.77, ResultN: 52 });
    });
});

describe('MJFeaturePipelineVersionEntityExtended.GetActivationProblems (the save check)', () => {
    const base: VersionActivationFields = { Version: 3, Gated: true, Threshold: 0.9, GoldenSetTestRunID: 'TR', ResultValue: 0.95, Status: 'Active', ResultDetails: null };
    const problems = (v: VersionActivationFields): string[] => MJFeaturePipelineVersionEntityExtended.GetActivationProblems(v);
    it('does not constrain ungated or non-Active rows', () => {
        expect(problems({ ...base, Gated: false, ResultValue: null })).toEqual([]);
        expect(problems({ ...base, Status: 'Candidate', ResultValue: 0.1 })).toEqual([]);
    });
    it('refuses, through Save(), an Active gated row below its threshold, naming Status', async () => {
        const row = await seedVersion(provider, pinA, { Version: 3, Status: 'Candidate', Gated: true, Threshold: 0.9, ResultValue: 0.8, GoldenSetTestRunID: 'TR' });
        row.Status = 'Active';
        expect(await row.Save()).toBe(false);
        expect(row.LatestResult?.CompleteMessage).toContain('Version 3 cannot be activated: its golden-set result 0.8000 is below the threshold 0.9.');
    });
});

function notUsed(): Error {
    return new Error('not used by the version registry');
}

/**
 * The database a set of provider instances share: the version rows (`versionRows`) and the pipeline lock, held by one
 * session (provider instance) until its outermost transaction ends. A session that already holds it takes it again
 * without waiting, as SQL Server grants a lock its own session holds.
 */
class SharedVersionDatabase {
    private holder: VersionDatabaseProvider | null = null;
    private waiting: Array<() => void> = [];
    /** Provider instances minted with `CreateIndependentInstance`. */
    public IndependentInstances = 0;
    /** Saves the unique keys refused, on any instance. */
    public UniqueKeyViolations = 0;
    public async Lock(session: VersionDatabaseProvider): Promise<void> {
        while (this.holder && this.holder !== session) {
            await new Promise<void>((resolve) => this.waiting.push(resolve));
        }
        this.holder = session;
    }
    public Unlock(session: VersionDatabaseProvider): void {
        if (this.holder === session) {
            this.holder = null;
            this.waiting.splice(0).forEach((resume) => resume());
        }
    }
    public Holds(session: VersionDatabaseProvider): boolean {
        return this.holder === session;
    }
}

/**
 * A database provider instance over the shared database: its own transaction stack (a nested begin is a savepoint on
 * the same session), the lock statement, independent instances on the same database, and version rows saved through
 * it only while it holds the lock. It extends `DatabaseProviderBase`, so the registry treats it as the server provider
 * does; everything it does not use throws.
 */
class VersionDatabaseProvider extends DatabaseProviderBase {
    private depth = 0;
    public readonly Store = new VersionRowStore(() => this.db.Holds(this), () => this.db.UniqueKeyViolations++);
    constructor(private readonly db: SharedVersionDatabase) {
        super();
    }
    public override get Entities(): EntityInfo[] { return [VERSION_ENTITY]; }
    protected override get CurrentTransactionDepth(): number { return this.depth; }
    public async BeginTransaction(): Promise<void> { this.depth++; }
    public async CommitTransaction(): Promise<void> { this.EndOne(); }
    public async RollbackTransaction(): Promise<void> { this.EndOne(); }
    private EndOne(): void {
        this.depth--;
        if (this.depth === 0) {
            this.db.Unlock(this);
        }
    }
    public async ExecuteSQL<T>(query: string): Promise<Array<T>> {
        if (!query.includes('UPDLOCK')) {
            throw notUsed();
        }
        await this.db.Lock(this);
        return [];
    }
    public override async CreateIndependentInstance(): Promise<DatabaseProviderBase> {
        this.db.IndependentInstances++;
        return databaseProvider(this.db);
    }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): null { return null; }
    public get InstanceConnectionString(): string { return ''; }
    public get LocalStorageProvider(): ILocalStorageProvider { throw notUsed(); }
    protected get AllowRefresh(): boolean { return false; }
    protected get Metadata(): IMetadataProvider { return this; }
    protected async InternalGetEntityRecordName(): Promise<string> { throw notUsed(); }
    protected async InternalGetEntityRecordNames(): Promise<EntityRecordNameResult[]> { throw notUsed(); }
    public async GetRecordFavoriteStatus(): Promise<boolean> { throw notUsed(); }
    public async SetRecordFavoriteStatus(): Promise<void> { throw notUsed(); }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> { throw notUsed(); }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { throw notUsed(); }
    protected async InternalRunQuery(): Promise<RunQueryResult> { throw notUsed(); }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { throw notUsed(); }
    protected async searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> { throw notUsed(); }
    protected async GetCurrentUser(): Promise<UserInfo> { throw notUsed(); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { throw notUsed(); }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> { throw notUsed(); }
    public async MergeRecords(): Promise<RecordMergeResult> { throw notUsed(); }
    public async GetDatasetByName(): Promise<DatasetResultType> { throw notUsed(); }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { throw notUsed(); }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { throw notUsed(); }
    public QuoteIdentifier(name: string): string { return `[${name}]`; }
    public QuoteSchemaAndView(schema: string, name: string): string { return `[${schema}].[${name}]`; }
    protected async InternalExecuteQueryFromSpec(): Promise<RunQueryResult> { throw notUsed(); }
    protected BuildChildDiscoverySQL(): string { throw notUsed(); }
    protected BuildHardLinkDependencySQL(): string { throw notUsed(); }
    protected BuildSoftLinkDependencySQL(): string { throw notUsed(); }
    protected async GenerateSaveSQL(): Promise<SaveSQLResult> { throw notUsed(); }
    protected GenerateDeleteSQL(): DeleteSQLResult { throw notUsed(); }
    protected get UUIDFunctionPattern(): RegExp { return /^newid\(\)$/i; }
    protected get DBDefaultFunctionPattern(): RegExp { return /^getdate\(\)$/i; }
    protected async CheckRecordRLS(): Promise<boolean> { throw notUsed(); }
    protected async CheckCreateRLS(): Promise<boolean> { throw notUsed(); }
    protected async CheckUpdateRLSPostImage(): Promise<boolean> { throw notUsed(); }
    protected BuildRecordChangeSQL(): { sql: string; parameters?: unknown[] } | null { throw notUsed(); }
    protected BuildSiblingRecordChangeSQL(): string { throw notUsed(); }
}

/** A database provider instance whose views read the shared rows and whose new entity objects are version rows on it. */
function databaseProvider(db: SharedVersionDatabase): VersionDatabaseProvider {
    const instance = new VersionDatabaseProvider(db);
    vi.spyOn(instance, 'RunView').mockImplementation(async () => {
        const rows = await Promise.all(versionRows.map((r) => instance.Store.Copy(r)));
        return viewResult(rows);
    });
    vi.spyOn(instance, 'GetEntityObject').mockImplementation(async () => {
        const row = new MJFeaturePipelineVersionEntityExtended(VERSION_ENTITY, instance.Store);
        row.ContextCurrentUser = user;
        return row;
    });
    return instance;
}

describe('the pipeline lock on a database provider', () => {
    it('marks a backfill on the lock\'s own instance: the version row is read and saved under the lock', async () => {
        const db = new SharedVersionDatabase();
        const shared = databaseProvider(db);
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active' });
        await svc.MarkBackfilled('RP', 1, user, shared);
        expect(db.IndependentInstances).toBe(1);
        expect(versionRows.find((r) => r.Version === 1)?.BackfilledAt).toBeInstanceOf(Date);
        expect(shared.TransactionDepth).toBe(0);
    });

    it('joins the transaction a caller holds on the provider instead of opening its own instance', async () => {
        const db = new SharedVersionDatabase();
        const shared = databaseProvider(db);
        await shared.BeginTransaction();
        const v = await svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'OnDemand', ContextUser: user, Provider: shared });
        expect(v).toEqual({ Version: 1, Status: 'Active' });
        expect(db.IndependentInstances).toBe(0);
        expect(shared.TransactionDepth).toBe(1); // the caller's transaction is still open: it owns the commit
        await shared.CommitTransaction();
    });
});

describe('FeaturePipelineVersionService.PlanUnattended', () => {
    const P1 = 'aaaaaaaa-0000-0000-0000-000000000001';
    const P2 = 'aaaaaaaa-0000-0000-0000-000000000002';
    const plan = (pin: FeaturePipelinePinData, more: Partial<PlanUnattendedParams> = {}) =>
        svc.PlanUnattended({ RecordProcessID: 'RP', Pin: pin, ContextUser: user, Provider: provider, ...more });
    /** The stored row of `version`; throws when the table has none. */
    const versionRow = (version: number): MJFeaturePipelineVersionEntityExtended => {
        const row = stored(version);
        if (!row) {
            throw new Error(`no version row v${version}`);
        }
        return row;
    };

    it('evaluates a gated Candidate, or holds it when AutoEvaluate is false', async () => {
        expect(await plan(pinA, { Activation: gate })).toMatchObject({ Kind: 'evaluate', Version: 1, GoldenSetTestID: 'T-1' });
        expect(versionRow(1).Status).toBe('Candidate'); // registered, never activated by the plan
        expect(await plan(pinA, { Activation: gate, Unattended: { AutoEvaluate: false } })).toMatchObject({ Kind: 'held', Version: 1 });
    });

    it('dates an evaluation from the version\'s registration, so an earlier run of the test does not count', async () => {
        const created = new Date('2026-10-01T00:00:00Z');
        await seedVersion(provider, pinA, { Version: 1, Status: 'Candidate', Gated: true, Threshold: 0.9, GoldenSetTestID: 'T-1', __mj_CreatedAt: created, __mj_UpdatedAt: new Date('2026-10-02T00:00:00Z') });
        expect(await plan(pinA, { Activation: gate })).toEqual({ Kind: 'evaluate', Version: 1, GoldenSetTestID: 'T-1', Since: created });
    });

    it('backfills a changed ungated version once, over the records valued under another version only', async () => {
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active', Gated: false, BackfilledAt: null });
        featureValueRows.push({ RecordID: P1, PipelineVersion: 1, ComputedAt: at(1) }, { RecordID: P2, PipelineVersion: 1, ComputedAt: at(1) },
            { RecordID: P2.toUpperCase(), PipelineVersion: 2, ComputedAt: at(2) });
        expect(await plan(pinB)).toEqual({ Kind: 'backfill', Version: 2, RecordIDs: [P1] });
        versionRow(2).BackfilledAt = new Date();
        expect(await plan(pinB)).toEqual({ Kind: 'none', Version: 2 });
    });

    it('backfills a re-activated version over the records whose latest value is under another version', async () => {
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active', BackfilledAt: null });
        await seedVersion(provider, pinB, { Version: 2, Status: 'Retired' });
        const P3 = 'aaaaaaaa-0000-0000-0000-000000000003';
        // P1: valued under v1, then v2 (latest) — its targets hold v2's output. P2: valued under v2, then v1 again (latest).
        // P3: a v1 value written after an unversioned one.
        featureValueRows.push(
            { RecordID: P1, PipelineVersion: 1, ComputedAt: at(1) }, { RecordID: P1, PipelineVersion: 2, ComputedAt: at(2) },
            { RecordID: P2, PipelineVersion: 2, ComputedAt: at(2) }, { RecordID: P2, PipelineVersion: 1, ComputedAt: at(3) },
            { RecordID: P3, PipelineVersion: null, ComputedAt: at(1) }, { RecordID: P3, PipelineVersion: 1, ComputedAt: at(4) });
        expect(await plan(pinA)).toEqual({ Kind: 'backfill', Version: 1, RecordIDs: [P1] });
    });

    it('holds a changed version when AutoBackfill is false', async () => {
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active', Gated: false, BackfilledAt: null });
        expect(await plan(pinB, { Unattended: { AutoBackfill: false } })).toMatchObject({ Kind: 'held', Version: 2 });
    });

    it('does nothing for a pipeline\'s first version when no value predates versions, and reports a Refused one', async () => {
        expect(await plan(pinA)).toEqual({ Kind: 'none', Version: 1 });
        versionRow(1).Status = 'Refused';
        expect((await plan(pinA)).Kind).toBe('refused');
        versionRow(1).ResultDetails = JSON.stringify({ Score: { RequiredFailures: [{ CaseID: 'h02', Outputs: ['JobFunctions'] }] } });
        expect(await plan(pinA)).toEqual({ Kind: 'refused', Version: 1, Message: 'v1 was refused activation: its golden set has 1 required case(s) wrong: h02 (JobFunctions).' });
    });

    it('backfills a first version over the records whose Pipeline values all predate versions (PipelineVersion NULL)', async () => {
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active', Gated: false, BackfilledAt: null });
        // P1 has only a value written before versions existed: re-derived. P2 also has a v1 value: already current.
        featureValueRows.push({ RecordID: P1, PipelineVersion: null, ComputedAt: at(1) }, { RecordID: P2, PipelineVersion: null, ComputedAt: at(1) },
            { RecordID: P2, PipelineVersion: 1, ComputedAt: at(2) });
        expect(await plan(pinA)).toEqual({ Kind: 'backfill', Version: 1, RecordIDs: [P1] });
        // the read keeps the unversioned rows: it filters on the pipeline and the source only
        const valueReads = provider.Views.filter((v) => v.EntityName === 'MJ: Feature Values' && v.ResultType !== 'count_only');
        expect(valueReads.map((v) => [v.ExtraFilter, v.Fields])).toEqual([["RecordProcessID = 'RP' AND Source = 'Pipeline'", ['RecordID', 'PipelineVersion', 'ComputedAt']]]);
        versionRow(1).BackfilledAt = new Date();
        expect(await plan(pinA)).toEqual({ Kind: 'none', Version: 1 });
    });

    it('backfills, not evaluates, a version gated before the pipeline dropped its Activation', async () => {
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active', Gated: false });
        await seedVersion(provider, pinB, { Version: 2, Status: 'Candidate', Gated: true, Threshold: 0.9, GoldenSetTestID: 'T-1' });
        featureValueRows.push({ RecordID: P1, PipelineVersion: 1, ComputedAt: at(1) });
        expect(await plan(pinB)).toEqual({ Kind: 'backfill', Version: 2, RecordIDs: [P1] });
    });

    it('re-evaluates a version whose stored result was measured under other Activation settings', async () => {
        const measured = new Date('2026-10-05T00:00:00Z');
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active', Gated: true, GoldenSetTestID: 'T-1', Metric: 'accuracy', Threshold: 0.8,
            ResultValue: 0.85, GoldenSetTestRunID: 'TR-1', BackfilledAt: new Date(), __mj_CreatedAt: new Date('2026-10-01T00:00:00Z'), __mj_UpdatedAt: measured });
        const stored08 = { ...gate, Threshold: 0.8 };
        expect(await plan(pinA, { Activation: stored08 })).toEqual({ Kind: 'none', Version: 1 });
        // dated from when the stored result was saved, so the run that produced it does not count as the new evaluation
        expect(await plan(pinA, { Activation: gate })).toEqual({ Kind: 'evaluate', Version: 1, GoldenSetTestID: 'T-1', Since: measured });
        expect((await plan(pinA, { Activation: { ...stored08, Metric: 'macro-f1' } })).Kind).toBe('evaluate');
        expect(await plan(pinA, { Activation: { ...stored08, GoldenSetTestID: 'T-2' } })).toMatchObject({ Kind: 'evaluate', GoldenSetTestID: 'T-2' });
        expect(await plan(pinA, { Activation: gate, Unattended: { AutoEvaluate: false } })).toMatchObject({ Kind: 'held', Version: 1 });
    });

});

describe('FeaturePipelineVersionService.MarkBackfilled', () => {
    it('throws when the pipeline has no such version', async () => {
        await expect(svc.MarkBackfilled('RP', 4, user, provider)).rejects.toThrow(/v4 of 'RP' not found/);
    });
});

describe('FeaturePipelineVersionService activation and the backfill mark', () => {
    it('clears the backfill mark of a version that becomes Active again, so the steward backfills it again', async () => {
        await seedVersion(provider, pinA, { Version: 1, Status: 'Retired', BackfilledAt: new Date('2026-10-01T00:00:00Z') });
        await seedVersion(provider, pinB, { Version: 2, Status: 'Active' });
        await svc.ResolveForRun({ RecordProcessID: 'RP', Pin: pinA, TriggeredBy: 'OnDemand', ContextUser: user, Provider: provider });
        expect(stored(1)?.Status).toBe('Active');
        expect(stored(1)?.BackfilledAt).toBeNull();
    });
    it('keeps the activation date and approver of a version that stays Active when a new golden-set result is recorded', async () => {
        const activatedAt = new Date('2026-10-01T14:45:00Z');
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active', Gated: true, Threshold: 0.8, ResultValue: 0.85, GoldenSetTestRunID: 'TR-1',
            ActivatedAt: activatedAt, ApprovedByUserID: 'approver-1' });
        await svc.RecordGoldenSetResult({ RecordProcessID: 'RP', Pin: pinA, Activation: gate, TestRunID: 'TR-2',
            Result: { Value: 0.95, Lower: 0.9, Upper: 0.98, N: 52, Details: '{}' }, ApprovedByUserID: 'qa-runner', ContextUser: user, Provider: provider });
        expect(stored(1)?.Status).toBe('Active');
        expect(stored(1)?.ActivatedAt).toEqual(activatedAt);
        expect(stored(1)?.ApprovedByUserID).toBe('approver-1');
        expect(stored(1)?.GoldenSetTestRunID).toBe('TR-2');
        expect(stored(1)?.ResultValue).toBe(0.95);
    });
    it('keeps the backfill mark of a version that stays Active when a new golden-set result is recorded', async () => {
        const backfilled = new Date('2026-10-01T00:00:00Z');
        await seedVersion(provider, pinA, { Version: 1, Status: 'Active', Gated: true, Threshold: 0.8, ResultValue: 0.85, GoldenSetTestRunID: 'TR-1', BackfilledAt: backfilled });
        await svc.RecordGoldenSetResult({ RecordProcessID: 'RP', Pin: pinA, Activation: gate, TestRunID: 'TR-2',
            Result: { Value: 0.95, Lower: 0.9, Upper: 0.98, N: 52, Details: '{}' }, ApprovedByUserID: 'user-1', ContextUser: user, Provider: provider });
        expect(stored(1)?.Status).toBe('Active');
        expect(stored(1)?.BackfilledAt).toEqual(backfilled);
    });
});
