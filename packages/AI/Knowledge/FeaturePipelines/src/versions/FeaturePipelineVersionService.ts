/**
 * @fileoverview The Feature Pipeline version registry (MJ: Feature Pipeline Versions): numbers each distinct pin,
 * decides whether a run may write under it, and stores golden-set activations.
 * @module @memberjunction/feature-pipelines
 */
import { BaseSingleton, EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { DatabaseProviderBase, RunInEntityTransaction, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFeaturePipelineVersionEntity, MJFeatureValueEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import { MetadataProviderCapabilities, RecordIDs } from '@memberjunction/record-set-processor-base';
import { FeaturePipelinePin, type FeaturePipelinePinData } from '../spec/feature-value-key.js';
import type { DataFeatureActivation, DataFeatureUnattended } from '../spec/data-feature-spec.js';
import { MJFeaturePipelineVersionEntityExtended, type VersionActivationFields } from '../entities/MJFeaturePipelineVersionEntityExtended.js';

/** A run may not write under its pipeline version; the message says what to do. */
export class FeaturePipelineVersionRefusedError extends Error {
    constructor(message: string, public readonly Version: number | null) {
        super(message);
        this.name = 'FeaturePipelineVersionRefusedError';
    }
}

/** A version row's status (the generated union). */
export type FeaturePipelineVersionStatus = MJFeaturePipelineVersionEntity['Status'];

/** What a run asks the registry. */
export interface ResolveVersionParams {
    RecordProcessID: string;
    /** The pin the run computes under. */
    Pin: FeaturePipelinePinData;
    /** The pipeline's activation gate, when it declares one. */
    Activation?: DataFeatureActivation;
    /** The run's trigger; on-demand and manual runs activate a changed ungated version. */
    TriggeredBy?: MJProcessRunEntity['TriggeredBy'];
    /** A dry run only reads. */
    DryRun?: boolean;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/** What registering a pin needs: a run's parameters without the trigger and the dry-run flag. */
export type RegisterCandidateParams = Omit<ResolveVersionParams, 'TriggeredBy' | 'DryRun'>;

/** The version a run writes under; nulls on a dry run of an unregistered pin. */
export interface ResolvedPipelineVersion {
    Version: number | null;
    Status: FeaturePipelineVersionStatus | null;
    /** Dry runs only: why the real run would be refused (the refusal's message); absent when it would run. */
    WouldRefuse?: string;
}

/** The run gate's refusal, decided under the pipeline lock and thrown once its transaction committed. */
export interface PipelineVersionRefusal {
    /** The refusal message. */
    Refusal: string;
    /** The version refused. */
    Version: number;
}

/** The fields of a version row the run gate reads. */
export type VersionGateFields = VersionActivationFields & Pick<MJFeaturePipelineVersionEntity, 'GoldenSetTestID'>;

/** A golden-set evaluation: the metric value with its Wilson interval, the number of cases and the details JSON. */
export interface GoldenSetResult {
    Value: number;
    Lower: number | null;
    Upper: number | null;
    N: number;
    Details: string;
}

/** What the golden-set driver stores on a version. */
export interface RecordGoldenSetResultParams {
    RecordProcessID: string;
    Pin: FeaturePipelinePinData;
    Activation: DataFeatureActivation;
    TestRunID: string;
    Result: GoldenSetResult;
    ApprovedByUserID: string;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/** What the steward does for one pipeline now. */
export type FeaturePipelineStewardPlan =
    | { Kind: 'none'; Version: number }
    /** Run the golden-set test; a run of it started before `Since` does not evaluate this version as it is now. */
    | { Kind: 'evaluate'; Version: number; GoldenSetTestID: string; Since: Date }
    | { Kind: 'backfill'; Version: number; RecordIDs: string[] }
    /** The version waits for a step the pipeline opted out of; the message says which. */
    | { Kind: 'held'; Version: number; Message: string }
    | { Kind: 'refused'; Version: number; Message: string };

/** What the steward asks the registry about one pipeline. */
export interface PlanUnattendedParams {
    RecordProcessID: string;
    /** The pipeline's current pin. */
    Pin: FeaturePipelinePinData;
    /** The pipeline's activation gate, when its spec declares one. */
    Activation?: DataFeatureActivation;
    /** The pipeline's opt-outs of unattended handling. */
    Unattended?: DataFeatureUnattended;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/** A Pipeline Feature Value as the backfill reads it: the record, the version that wrote it and when. */
export type PipelineValueStamp = Pick<MJFeatureValueEntity, 'RecordID' | 'PipelineVersion' | 'ComputedAt'>;

/** A pipeline's version rows, with the row of its current pin. */
export interface PinVersions {
    /** The current pin's version row. */
    Row: MJFeaturePipelineVersionEntity;
    /** Every version row of the pipeline, the current pin's included. */
    Versions: MJFeaturePipelineVersionEntity[];
}

/**
 * The Feature Pipeline version registry. Reads run on the caller's provider; every write runs under the pipeline's lock
 * ({@link WithPipelineLock}).
 */
export class FeaturePipelineVersionService extends BaseSingleton<FeaturePipelineVersionService> {
    public static get Instance(): FeaturePipelineVersionService {
        return super.getInstance<FeaturePipelineVersionService>();
    }
    protected constructor() {
        super();
    }

    /**
     * The version a run writes under; a new pin becomes a Candidate. A gated pipeline (Activation) runs a version only
     * once it has a stored golden-set result at or above its threshold. An ungated pipeline's version becomes Active on
     * an on-demand or manual run, or when nothing is Active; a scheduled or on-change run of a changed pipeline is
     * refused. A real run decides under the pipeline lock and throws a refusal after the lock's transaction committed (the
     * Candidate stays); a dry run only reads and reports the refusal in `WouldRefuse`.
     * @throws FeaturePipelineVersionRefusedError when the run may not write.
     */
    public async ResolveForRun(p: ResolveVersionParams): Promise<ResolvedPipelineVersion> {
        const pinHash = await FeaturePipelinePin.ComputeHash(p.Pin);
        if (p.DryRun) {
            const versions = await this.LoadVersions(p.RecordProcessID, p.ContextUser, p.Provider);
            return this.PreviewRun(versions.find((v) => v.PinHash === pinHash), versions, p);
        }
        const decision = await this.WithPipelineLock(p.RecordProcessID, p.ContextUser, p.Provider, async (unit) => {
            const versions = await this.LoadVersions(p.RecordProcessID, p.ContextUser, unit);
            const row = versions.find((v) => v.PinHash === pinHash) || (await this.CreateCandidate({ ...p, Provider: unit }, pinHash, versions));
            if (p.Activation) {
                return this.ResolveGated(row, versions, p);
            }
            if (row.Status === 'Active') {
                return { Version: row.Version, Status: row.Status };
            }
            return this.ResolveUngated(row, versions, p);
        });
        if ('Refusal' in decision) {
            throw new FeaturePipelineVersionRefusedError(decision.Refusal, decision.Version);
        }
        return decision;
    }

    /** Registers a pin as its pipeline's next Candidate version (or returns its existing one), under the pipeline lock. */
    public async RegisterCandidate(p: RegisterCandidateParams): Promise<MJFeaturePipelineVersionEntity> {
        const pinHash = await FeaturePipelinePin.ComputeHash(p.Pin);
        return this.WithPipelineLock(p.RecordProcessID, p.ContextUser, p.Provider, async (unit) => {
            const versions = await this.LoadVersions(p.RecordProcessID, p.ContextUser, unit);
            return versions.find((v) => v.PinHash === pinHash) || (await this.CreateCandidate({ ...p, Provider: unit }, pinHash, versions));
        });
    }

    /**
     * Checks, read-only, that a gated pipeline may compute under its pin (a Decision pipeline's escalation target, which
     * registers no versions). An ungated pipeline always passes.
     * @throws FeaturePipelineVersionRefusedError when the pin has no version, or its version has no passing result.
     */
    public async AssertRunnable(p: RegisterCandidateParams): Promise<void> {
        if (!p.Activation) {
            return;
        }
        const pinHash = await FeaturePipelinePin.ComputeHash(p.Pin);
        const row = (await this.LoadVersions(p.RecordProcessID, p.ContextUser, p.Provider)).find((v) => v.PinHash === pinHash);
        if (!row) {
            throw new FeaturePipelineVersionRefusedError(
                `Feature Pipeline ${p.RecordProcessID} has no version for its current pin: run its golden-set test (MJ: Tests ID ${p.Activation.GoldenSetTestID}) to evaluate it against the threshold ${p.Activation.Threshold}.`, null);
        }
        const refusal = this.GatedRefusal(row, p.Activation);
        if (refusal) {
            throw new FeaturePipelineVersionRefusedError(refusal, row.Version);
        }
    }

    /** Stores a golden-set evaluation on its version, under the pipeline lock: Active when it meets the threshold, else Refused. */
    public async RecordGoldenSetResult(p: RecordGoldenSetResultParams): Promise<MJFeaturePipelineVersionEntity> {
        const pinHash = await FeaturePipelinePin.ComputeHash(p.Pin);
        return this.WithPipelineLock(p.RecordProcessID, p.ContextUser, p.Provider, async (unit) => {
            const versions = await this.LoadVersions(p.RecordProcessID, p.ContextUser, unit);
            const row = versions.find((v) => v.PinHash === pinHash)
                || (await this.CreateCandidate({ RecordProcessID: p.RecordProcessID, Pin: p.Pin, Activation: p.Activation, ContextUser: p.ContextUser, Provider: unit }, pinHash, versions));
            this.ApplyGoldenSetResult(row, p);
            if (MJFeaturePipelineVersionEntityExtended.HasPassingResult(row)) {
                await this.Activate(row, versions, p.ApprovedByUserID);
            } else {
                row.Status = 'Refused';
                await this.SaveVersion(row);
            }
            return row;
        });
    }

    /**
     * What the steward does for this pipeline now. Registers a new pin as a Candidate; never activates. In order:
     * `evaluate` a gated version without a result under the current Activation settings; `refused` for a Refused
     * version; `backfill` a changed version (or the first one over unversioned values) not yet backfilled; else `none`.
     * An opted-out step (`Unattended.AutoEvaluate` / `AutoBackfill` false) is `held`.
     */
    public async PlanUnattended(p: PlanUnattendedParams): Promise<FeaturePipelineStewardPlan> {
        const { Row: row, Versions: versions } = await this.LoadPinVersions(p);
        if (p.Activation && this.NeedsEvaluation(row, p.Activation)) {
            return this.PlanEvaluation(row, p.Activation, p.Unattended);
        }
        if (row.Status === 'Refused') {
            return { Kind: 'refused', Version: row.Version, Message: `v${row.Version} was refused activation: ${MJFeaturePipelineVersionEntityExtended.DescribeShortfall(row, String(row.ResultValue))}.` };
        }
        if (row.BackfilledAt) {
            return { Kind: 'none', Version: row.Version };
        }
        // a changed version, or the first version over values written before any version (PipelineVersion NULL)
        const changed = versions.some((v) => v.Version !== row.Version)
            || (await this.HasUnversionedPipelineValues(p.RecordProcessID, p.ContextUser, p.Provider));
        if (!changed) {
            return { Kind: 'none', Version: row.Version };
        }
        if (p.Unattended?.AutoBackfill === false) {
            return { Kind: 'held', Version: row.Version, Message: `v${row.Version} awaits its on-demand backfill; the pipeline sets Unattended.AutoBackfill = false.` };
        }
        return { Kind: 'backfill', Version: row.Version, RecordIDs: await this.BackfillRecordIDs(p.RecordProcessID, row.Version, p.ContextUser, p.Provider) };
    }

    /**
     * The records the backfill re-derives: those whose latest Pipeline Feature Value (by `ComputedAt`) was written
     * under another version, or under none. One read of three columns, proportional to the pipeline's value rows.
     */
    public async BackfillRecordIDs(recordProcessID: string, version: number, contextUser: UserInfo, provider: IMetadataProvider): Promise<string[]> {
        const res = await RunView.FromMetadataProvider(provider).RunView<PipelineValueStamp>({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(recordProcessID)}' AND Source = 'Pipeline'`,
            Fields: ['RecordID', 'PipelineVersion', 'ComputedAt'],
            IgnoreMaxRows: true,
        }, contextUser);
        if (!res.Success) {
            throw new Error(`Reading the Feature Values of '${recordProcessID}' failed: ${res.ErrorMessage}`);
        }
        return [...this.LatestValuePerRecord(res.Results || []).values()]
            .filter((latest) => latest.PipelineVersion !== version)
            .map((latest) => latest.RecordID);
    }

    /** Each record's latest value (by `ComputedAt`), keyed by `RecordIDs.Key`; a tie keeps the first row read. */
    protected LatestValuePerRecord(rows: PipelineValueStamp[]): Map<string, PipelineValueStamp> {
        const latest = new Map<string, PipelineValueStamp>();
        for (const row of rows) {
            const key = RecordIDs.Key(row.RecordID);
            const kept = latest.get(key);
            // `new Date()`: a simple-result date may arrive as a string
            if (!kept || new Date(row.ComputedAt).getTime() > new Date(kept.ComputedAt).getTime()) {
                latest.set(key, row);
            }
        }
        return latest;
    }

    /** Marks the version's steward backfill as done, under the pipeline lock; throws when there is no such version. */
    public async MarkBackfilled(recordProcessID: string, version: number, contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
        await this.WithPipelineLock(recordProcessID, contextUser, provider, async (unit) => {
            // read on the lock's unit provider, so the row is saved inside the lock's transaction
            const row = (await this.LoadVersions(recordProcessID, contextUser, unit)).find((v) => v.Version === version);
            if (!row) {
                throw new Error(`Feature Pipeline version v${version} of '${recordProcessID}' not found`);
            }
            row.BackfilledAt = new Date();
            await this.SaveVersion(row);
        });
    }

    /** The pipeline's version rows and its current pin's row, registering the pin as a Candidate when it has none. */
    protected async LoadPinVersions(p: PlanUnattendedParams): Promise<PinVersions> {
        const pinHash = await FeaturePipelinePin.ComputeHash(p.Pin);
        const versions = await this.LoadVersions(p.RecordProcessID, p.ContextUser, p.Provider);
        const existing = versions.find((v) => v.PinHash === pinHash);
        if (existing) {
            return { Row: existing, Versions: versions };
        }
        const registered = await this.RegisterCandidate({ RecordProcessID: p.RecordProcessID, Pin: p.Pin, Activation: p.Activation, ContextUser: p.ContextUser, Provider: p.Provider });
        const reread = await this.LoadVersions(p.RecordProcessID, p.ContextUser, p.Provider);
        return { Row: reread.find((v) => v.PinHash === pinHash) || registered, Versions: reread };
    }

    /** Whether a gated version needs its golden-set test run: no stored result, or one under other Activation settings. */
    protected NeedsEvaluation(row: MJFeaturePipelineVersionEntity, activation: DataFeatureActivation): boolean {
        if (!this.HasStoredResult(row)) {
            return true;
        }
        return !UUIDsEqual(row.GoldenSetTestID, activation.GoldenSetTestID) || row.Metric !== activation.Metric || row.Threshold !== activation.Threshold;
    }

    /** Whether the version row holds a golden-set result. */
    protected HasStoredResult(row: MJFeaturePipelineVersionEntity): boolean {
        return !!row.GoldenSetTestRunID && typeof row.ResultValue === 'number';
    }

    /**
     * A gated version's evaluation plan, or `held` when the pipeline opts out. Only a test run started after the version
     * was registered (or its stored result saved) counts.
     */
    protected PlanEvaluation(row: MJFeaturePipelineVersionEntity, activation: DataFeatureActivation, unattended: DataFeatureUnattended | undefined): FeaturePipelineStewardPlan {
        if (unattended?.AutoEvaluate === false) {
            return { Kind: 'held', Version: row.Version, Message: `v${row.Version} awaits its golden-set test; the pipeline sets Unattended.AutoEvaluate = false.` };
        }
        const since = this.HasStoredResult(row) ? row.__mj_UpdatedAt : row.__mj_CreatedAt;
        return { Kind: 'evaluate', Version: row.Version, GoldenSetTestID: activation.GoldenSetTestID, Since: since };
    }

    /** Whether the pipeline has Pipeline Feature Values written before any version was registered (`PipelineVersion` NULL). */
    protected async HasUnversionedPipelineValues(recordProcessID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<boolean> {
        const res = await RunView.FromMetadataProvider(provider).RunView({
            EntityName: 'MJ: Feature Values',
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(recordProcessID)}' AND Source = 'Pipeline' AND PipelineVersion IS NULL`,
            ResultType: 'count_only',
        }, contextUser);
        if (!res.Success) {
            throw new Error(`Counting the unversioned Feature Values of '${recordProcessID}' failed: ${res.ErrorMessage}`);
        }
        return res.TotalRowCount > 0;
    }

    /** Under the lock: a gated version with a passing stored result runs (activated first), else its refusal is returned. */
    protected async ResolveGated(row: MJFeaturePipelineVersionEntity, versions: MJFeaturePipelineVersionEntity[],
        p: ResolveVersionParams): Promise<ResolvedPipelineVersion | PipelineVersionRefusal> {
        const refusal = this.GatedRefusal(row, p.Activation);
        if (refusal) {
            return { Refusal: refusal, Version: row.Version };
        }
        if (row.Status !== 'Active') {
            await this.Activate(row, versions, p.ContextUser.ID);
        }
        return { Version: row.Version, Status: 'Active' };
    }

    /** Under the lock: an ungated version becomes Active on an on-demand run or when nothing is Active, else its refusal is returned. */
    protected async ResolveUngated(row: MJFeaturePipelineVersionEntity, versions: MJFeaturePipelineVersionEntity[],
        p: ResolveVersionParams): Promise<ResolvedPipelineVersion | PipelineVersionRefusal> {
        const refusal = this.UngatedRefusal(row, versions, p);
        if (refusal) {
            return { Refusal: refusal, Version: row.Version };
        }
        // A version gated before the pipeline dropped its Activation is ungated now; the save check would refuse it
        // Active while it is still marked gated without a passing result.
        row.Gated = false;
        await this.Activate(row, versions, p.ContextUser.ID);
        return { Version: row.Version, Status: 'Active' };
    }

    /** What a dry run reports: the pin's version and status as they are, and why the real run would be refused ({@link DescribeRefusal}). */
    protected PreviewRun(existing: MJFeaturePipelineVersionEntity | undefined, versions: MJFeaturePipelineVersionEntity[],
        p: ResolveVersionParams): ResolvedPipelineVersion {
        const judged: VersionGateFields = existing || {
            Version: this.NextVersionNumber(versions), Status: 'Candidate', Gated: !!p.Activation,
            Threshold: p.Activation?.Threshold || null, GoldenSetTestID: p.Activation?.GoldenSetTestID || null,
            ResultValue: null, GoldenSetTestRunID: null, ResultDetails: null,
        };
        const refusal = this.DescribeRefusal(judged, versions, p);
        const version: ResolvedPipelineVersion = existing ? { Version: existing.Version, Status: existing.Status } : { Version: null, Status: null };
        return refusal ? { ...version, WouldRefuse: refusal } : version;
    }

    /** Why a run of the pipeline may not write under this version; null when it may. The one decision of the run gate. */
    protected DescribeRefusal(row: VersionGateFields, versions: MJFeaturePipelineVersionEntity[], p: ResolveVersionParams): string | null {
        if (p.Activation) {
            return this.GatedRefusal(row, p.Activation);
        }
        return row.Status === 'Active' ? null : this.UngatedRefusal(row, versions, p);
    }

    /** Why a gated pipeline may not run this version (refused, or no passing stored result); null when it may. */
    protected GatedRefusal(row: VersionGateFields, activation: DataFeatureActivation | undefined): string | null {
        if (row.Status === 'Refused') {
            // a wrong required case is not fixed by lowering the threshold, so that remedy is offered only for a low result
            const thresholdRemedy = MJFeaturePipelineVersionEntityExtended.RequiredFailuresOf(row).length > 0
                ? '' : `, or the pipeline's Activation.Threshold and run the golden-set test again`;
            return `Feature Pipeline version v${row.Version} was refused activation: ${MJFeaturePipelineVersionEntityExtended.DescribeShortfall(row, String(row.ResultValue))}. Change the prompt, model, parameters or spec (the Feature Pipeline Version Steward evaluates the new version automatically)${thresholdRemedy}.`;
        }
        if (MJFeaturePipelineVersionEntityExtended.HasPassingResult(row)) {
            return null;
        }
        return `Feature Pipeline version v${row.Version} is not activated: run its golden-set test (MJ: Tests ID ${activation?.GoldenSetTestID || row.GoldenSetTestID}) to evaluate it against the threshold ${activation?.Threshold || row.Threshold}. The Feature Pipeline Version Steward job runs it on its next run unless the pipeline sets Unattended.AutoEvaluate = false.`;
    }

    /** Why an ungated pipeline may not activate this version (another is Active and the run is scheduled or on-change); null when it may. */
    protected UngatedRefusal(row: VersionGateFields, versions: MJFeaturePipelineVersionEntity[], p: ResolveVersionParams): string | null {
        const active = versions.find((v) => v.Status === 'Active' && v.Version !== row.Version);
        const onDemand = p.TriggeredBy === 'OnDemand' || p.TriggeredBy === 'Manual';
        if (!active || onDemand) {
            return null;
        }
        return `Feature Pipeline version changed from v${active.Version} to v${row.Version} (prompt, model, parameters or spec). Scheduled and on-change runs wait for an on-demand run that re-derives every record under v${row.Version}; the Feature Pipeline Version Steward job starts it on its next run unless the pipeline sets Unattended.AutoBackfill = false.`;
    }

    /** Copies a golden-set evaluation and its activation settings onto the version row (unsaved). */
    protected ApplyGoldenSetResult(row: MJFeaturePipelineVersionEntity, p: RecordGoldenSetResultParams): void {
        row.Gated = true;
        row.GoldenSetTestID = p.Activation.GoldenSetTestID;
        row.GoldenSetTestRunID = p.TestRunID;
        row.Metric = p.Activation.Metric;
        row.Threshold = p.Activation.Threshold;
        row.ResultValue = p.Result.Value;
        row.ResultLower = p.Result.Lower;
        row.ResultUpper = p.Result.Upper;
        row.ResultN = p.Result.N;
        row.ResultDetails = p.Result.Details;
    }

    /** The pipeline's version rows, read fresh (the run gate must see the latest status). */
    protected async LoadVersions(recordProcessID: string, user: UserInfo, provider: IMetadataProvider): Promise<MJFeaturePipelineVersionEntity[]> {
        const res = await RunView.FromMetadataProvider(provider).RunView<MJFeaturePipelineVersionEntity>({
            EntityName: 'MJ: Feature Pipeline Versions',
            ExtraFilter: `RecordProcessID = '${EscapeSQLString(recordProcessID)}'`,
            OrderBy: 'Version',
            ResultType: 'entity_object', // rows are activated, retired or refused in place
            BypassCache: true,
            // repeated on purpose: a run, a golden-set result and the steward's re-plan each need the rows as they are now
            Telemetry: { Exempt: true, Reason: 'Version gate reads the latest version rows; a reused read would be stale' },
        }, user);
        if (!res.Success) {
            throw new Error(`Reading MJ: Feature Pipeline Versions failed: ${res.ErrorMessage}`);
        }
        return res.Results || [];
    }

    /** The number after the pipeline's highest version. */
    protected NextVersionNumber(versions: ReadonlyArray<Pick<MJFeaturePipelineVersionEntity, 'Version'>>): number {
        return versions.reduce((max, v) => Math.max(max, v.Version), 0) + 1;
    }

    /** Registers a pin as the next Candidate version (under the pipeline lock) and adds it to `versions`. */
    protected async CreateCandidate(p: RegisterCandidateParams, pinHash: string,
        versions: MJFeaturePipelineVersionEntity[]): Promise<MJFeaturePipelineVersionEntity> {
        const row = await this.NewCandidateRow(p, pinHash, this.NextVersionNumber(versions));
        if (!(await row.Save())) {
            throw new Error(`Registering Feature Pipeline version failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
        versions.push(row);
        return row;
    }

    /** A new, unsaved Candidate row for the pin under `version`. */
    protected async NewCandidateRow(p: RegisterCandidateParams, pinHash: string, version: number): Promise<MJFeaturePipelineVersionEntity> {
        const row = await p.Provider.GetEntityObject<MJFeaturePipelineVersionEntity>('MJ: Feature Pipeline Versions', p.ContextUser);
        row.NewRecord();
        row.RecordProcessID = p.RecordProcessID;
        row.Version = version;
        row.PinHash = pinHash;
        row.SpecHash = p.Pin.SpecHash;
        row.PromptID = p.Pin.PromptID;
        row.PromptVersionHash = p.Pin.PromptVersionHash;
        row.AIModelID = p.Pin.AIModelID;
        row.ParametersHash = p.Pin.ParametersHash;
        row.Status = 'Candidate';
        row.Gated = !!p.Activation;
        row.GoldenSetTestID = p.Activation?.GoldenSetTestID || null;
        row.Metric = p.Activation?.Metric || null;
        row.Threshold = p.Activation?.Threshold || null;
        return row;
    }

    /**
     * Activates `row` and retires every other Active version, inside the pipeline lock (sequential saves share its
     * transaction). Retiring or re-activating clears the backfill mark; an already-Active version keeps its activation.
     */
    protected async Activate(row: MJFeaturePipelineVersionEntity, versions: MJFeaturePipelineVersionEntity[], approvedByUserID: string): Promise<void> {
        for (const other of versions) {
            if (!UUIDsEqual(other.ID, row.ID) && other.Status === 'Active') {
                other.Status = 'Retired';
                other.RetiredAt = new Date();
                other.BackfilledAt = null;
                await this.SaveVersion(other);
            }
        }
        if (row.Status !== 'Active') {
            row.BackfilledAt = null;
            row.Status = 'Active';
            row.ActivatedAt = new Date();
            row.RetiredAt = null;
            row.ApprovedByUserID = approvedByUserID;
        }
        await this.SaveVersion(row);
    }

    /**
     * Runs `work` in one entity transaction, on its own provider instance (`unit`, which every read and save of the
     * work must use), whose first statement locks the pipeline's version rows ({@link LockVersions}): writers of one
     * pipeline serialise there. A thrown error rolls the unit back.
     */
    protected async WithPipelineLock<T>(recordProcessID: string, user: UserInfo, provider: IMetadataProvider,
        work: (unit: IMetadataProvider) => Promise<T>): Promise<T> {
        return MetadataProviderCapabilities.RunIsolated(provider, (unit) =>
            RunInEntityTransaction(MetadataProviderCapabilities.IsTransactionalProvider(unit) ? unit : null, async () => {
                await this.LockVersions(recordProcessID, user, unit);
                return work(unit);
            }));
    }

    /**
     * Takes an update and range lock on the pipeline's version rows until the transaction ends (it covers a first
     * registration too). Raw SQL: no provider API takes a row lock. SQL Server only; elsewhere the work runs unlocked.
     */
    protected async LockVersions(recordProcessID: string, user: UserInfo, provider: IMetadataProvider): Promise<void> {
        if (!(provider instanceof DatabaseProviderBase) || provider.PlatformKey !== 'sqlserver') {
            return;
        }
        const entity = provider.EntityByName('MJ: Feature Pipeline Versions');
        if (!entity) {
            throw new Error("Entity 'MJ: Feature Pipeline Versions' not found in metadata");
        }
        const table = provider.Dialect.QuoteSchema(entity.SchemaName, entity.BaseTable);
        await provider.ExecuteSQL<{ ID: string }>(
            `SELECT ID FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE RecordProcessID = ${provider.Dialect.ParameterPlaceholder(0)}`,
            [recordProcessID],
            { description: 'Lock Feature Pipeline versions' },
            user
        );
    }

    /** Saves a version row; throws with the save's CompleteMessage when it fails. */
    protected async SaveVersion(row: MJFeaturePipelineVersionEntity): Promise<void> {
        if (!(await row.Save())) {
            throw new Error(`Saving Feature Pipeline version v${row.Version} failed: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
        }
    }
}
