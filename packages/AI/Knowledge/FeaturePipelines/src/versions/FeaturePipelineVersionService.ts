/**
 * @fileoverview The Feature Pipeline version registry (MJ: Feature Pipeline Versions): numbers each distinct pin,
 * decides whether a run may write under it, and stores golden-set activations.
 * @module @memberjunction/feature-pipelines
 */
import { BaseSingleton, EscapeSQLString, IsValidUUID, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { DatabaseProviderBase, RunInEntityTransaction, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFeaturePipelineVersionEntity, MJFeatureValueEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import { FeaturePipelinePin, type FeaturePipelinePinData } from '../spec/feature-value-key.js';
import type { DataFeatureActivation, DataFeatureUnattended } from '../spec/data-feature-spec.js';
import { MJFeaturePipelineVersionEntityExtended, type VersionActivationFields } from '../entities/MJFeaturePipelineVersionEntityExtended.js';
import { MetadataProviderCapabilities } from '../providers/metadata-provider-capabilities.js';

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

/**
 * How many times registering a pin tries a version number. Registrations through the service are serialised by the
 * pipeline lock, so a collision on the pipeline's unique version number means a writer that bypassed the lock took the
 * number; the next number is tried. A guard: a few attempts are enough.
 */
export const MAX_VERSION_REGISTRATION_ATTEMPTS = 3;

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
 * The Feature Pipeline version registry. Lock-free reads (a dry run's resolve, `AssertRunnable`, the steward's plan and
 * backfill reads) run on the caller's provider. Every write (resolve for a run, registering a Candidate, recording a
 * golden-set result, marking a steward backfill) runs under the
 * pipeline's lock in a unit of work on the lock's unit provider ({@link MetadataProviderCapabilities.RunIsolated}): an
 * isolated provider instance, or the caller's provider when the caller already holds a transaction.
 */
export class FeaturePipelineVersionService extends BaseSingleton<FeaturePipelineVersionService> {
    public static get Instance(): FeaturePipelineVersionService {
        return super.getInstance<FeaturePipelineVersionService>();
    }
    protected constructor() {
        super();
    }

    /**
     * The version a run writes under. A new pin becomes a Candidate.
     *
     * A gated pipeline (its spec declares Activation) runs a version only once the version has a stored golden-set
     * result at or above its threshold, whatever the version's status: a pipeline that adds a gate does not keep running
     * the version it activated before, since the gate is not part of the pin. A Refused version is refused.
     *
     * An ungated pipeline's version becomes Active on an on-demand or manual run, or when the pipeline has no Active
     * version; a scheduled or on-change run of a changed pipeline is refused (the controlled backfill). A version gated
     * before the pipeline dropped its Activation is ungated from then on.
     *
     * A real run reads, registers, decides and activates under the pipeline lock ({@link WithPipelineLock}), so the
     * decision is made on rows no concurrent writer can change before it is saved. A refusal is thrown after the lock's
     * transaction committed, so the Candidate it registered stays. A dry run only reads, without the lock: it reports the
     * version and status as they are, and in `WouldRefuse` why the real run would be refused.
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

    /**
     * Registers a pin as its pipeline's next Candidate version, or returns the version already registered for it, under
     * the pipeline lock. Nothing is activated: the run gate and the golden-set result do that.
     */
    public async RegisterCandidate(p: RegisterCandidateParams): Promise<MJFeaturePipelineVersionEntity> {
        const pinHash = await FeaturePipelinePin.ComputeHash(p.Pin);
        return this.WithPipelineLock(p.RecordProcessID, p.ContextUser, p.Provider, async (unit) => {
            const versions = await this.LoadVersions(p.RecordProcessID, p.ContextUser, unit);
            return versions.find((v) => v.PinHash === pinHash) || (await this.CreateCandidate({ ...p, Provider: unit }, pinHash, versions));
        });
    }

    /**
     * Checks, without writing anything, that a gated pipeline may compute under its pin: the pin's version has a stored
     * golden-set result at or above its threshold. For a pipeline that runs on behalf of another (a Decision pipeline's
     * escalation target), which writes no Feature Values of its own and so registers and activates no versions. A plain
     * read, without the pipeline lock. An ungated pipeline (no `Activation`) always passes.
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

    /**
     * Stores a golden-set evaluation on its version, under the pipeline lock: Active when it meets the threshold (the
     * Active version retired), Refused otherwise.
     */
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
     * What the steward does for this pipeline now (the pipeline's current pin, gate and opt-outs). Registers a new pin as
     * a Candidate, under the pipeline lock; never activates by itself (activation stays with the run gate and the
     * golden-set result). In order:
     * - a gated pipeline whose version has no stored golden-set result, or one measured under other Activation settings
     *   (the threshold, metric and test are outside the pin, so changing them is not a new version): `evaluate`, or
     *   `held` when the pipeline sets `Unattended.AutoEvaluate = false`;
     * - a Refused version: `refused` (the refusal stands until the pin or the Activation settings change);
     * - a version not yet backfilled that changed from another version, or the first version while Pipeline values
     *   written before any version exist: `backfill` over the records whose latest value is under another version
     *   (or none), or `held` when the pipeline sets `Unattended.AutoBackfill = false`;
     * - otherwise `none`.
     */
    public async PlanUnattended(p: PlanUnattendedParams): Promise<FeaturePipelineStewardPlan> {
        const { Row: row, Versions: versions } = await this.LoadPinVersions(p);
        if (p.Activation && this.NeedsEvaluation(row, p.Activation)) {
            return this.PlanEvaluation(row, p.Activation, p.Unattended);
        }
        if (row.Status === 'Refused') {
            return { Kind: 'refused', Version: row.Version, Message: `v${row.Version} was refused activation: golden-set result ${row.ResultValue} is below the threshold ${row.Threshold}.` };
        }
        if (row.BackfilledAt) {
            return { Kind: 'none', Version: row.Version };
        }
        // A changed version, or the pipeline's first version over values written before any version was registered
        // (PipelineVersion NULL): those values may come from an older prompt text, and an UpdatedAt-watermark pipeline
        // never re-derives a record whose source row did not change.
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
     * under another version, or under no version (`PipelineVersion` NULL: written before any version was registered).
     * The latest value is what the record's write-back targets hold, so a version that becomes Active again re-derives
     * the records a newer version wrote last, even though they also hold older values under it; for unchanged inputs
     * that is a Dedup Cache hit. One read of three columns; record IDs compared case-insensitively when they are UUIDs.
     * Trade-off: the read is proportional to the pipeline's value rows; a stored Query (RunQuery) is the follow-up if a
     * pipeline's rows outgrow one read.
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

    /** Each record's latest value (by `ComputedAt`), keyed by {@link RecordKey}; a tie keeps the first row read. */
    protected LatestValuePerRecord(rows: PipelineValueStamp[]): Map<string, PipelineValueStamp> {
        const latest = new Map<string, PipelineValueStamp>();
        for (const row of rows) {
            const key = this.RecordKey(row.RecordID);
            const kept = latest.get(key);
            // `new Date()`: a simple-result date may arrive as a string
            if (!kept || new Date(row.ComputedAt).getTime() > new Date(kept.ComputedAt).getTime()) {
                latest.set(key, row);
            }
        }
        return latest;
    }

    /**
     * Marks the version's one steward backfill as done, under the pipeline lock (the version's row is written).
     * @throws Error when the pipeline has no such version
     */
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

    /**
     * The pipeline's version rows and its current pin's row. A plain read when the pin is registered; otherwise the pin
     * is registered as a Candidate under the pipeline lock ({@link RegisterCandidate}) and the rows are read again.
     */
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

    /**
     * Whether a gated pipeline's version needs its golden-set test run: it has no stored result, or its stored result
     * was measured under other Activation settings than the pipeline declares now. The settings are outside the pin, so
     * a changed threshold, metric or test applies the next time the version is evaluated (the row copies them then).
     */
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
     * A gated version's evaluation plan, or `held` when the pipeline opts out. A run of the test counts as this
     * evaluation only when it started after the version was registered or, for a version re-evaluated under changed
     * settings, after its stored result was saved (so the run that produced that result does not count).
     */
    protected PlanEvaluation(row: MJFeaturePipelineVersionEntity, activation: DataFeatureActivation, unattended: DataFeatureUnattended | undefined): FeaturePipelineStewardPlan {
        if (unattended?.AutoEvaluate === false) {
            return { Kind: 'held', Version: row.Version, Message: `v${row.Version} awaits its golden-set test; the pipeline sets Unattended.AutoEvaluate = false.` };
        }
        const since = this.HasStoredResult(row) ? row.__mj_UpdatedAt : row.__mj_CreatedAt;
        return { Kind: 'evaluate', Version: row.Version, GoldenSetTestID: activation.GoldenSetTestID, Since: since };
    }

    /**
     * Whether the pipeline has Pipeline Feature Values written before any version was registered (`PipelineVersion`
     * NULL). A count, read only while the current version has not been backfilled: once it has, `BackfilledAt` ends
     * the check. Trade-off: a pipeline whose first version has nothing to backfill pays this count once per pass.
     */
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

    /** The key a record is matched by: a UUID case-insensitively, any other key as written. */
    protected RecordKey(recordID: string): string {
        return IsValidUUID(recordID) ? NormalizeUUID(recordID) : recordID;
    }

    /**
     * Under the pipeline lock: a gated version runs (activated first when it is not yet Active) once its stored result
     * passes; otherwise the refusal is returned, for the caller to throw once the lock's transaction committed.
     */
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

    /**
     * Under the pipeline lock: an ungated version that is not Active becomes Active on an on-demand or manual run, or
     * when nothing is Active; otherwise the refusal (held) is returned, for the caller to throw once the lock's
     * transaction committed.
     */
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

    /**
     * What a dry run reports: the pin's version and status as they are (nulls when it has none), and why the real run
     * would be refused. The decision is the real run's ({@link DescribeRefusal}); a pin with no version is judged as
     * the Candidate the real run would register.
     */
    protected PreviewRun(existing: MJFeaturePipelineVersionEntity | undefined, versions: MJFeaturePipelineVersionEntity[],
        p: ResolveVersionParams): ResolvedPipelineVersion {
        const judged: VersionGateFields = existing || {
            Version: this.NextVersionNumber(versions), Status: 'Candidate', Gated: !!p.Activation,
            Threshold: p.Activation?.Threshold || null, GoldenSetTestID: p.Activation?.GoldenSetTestID || null,
            ResultValue: null, GoldenSetTestRunID: null,
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
            return `Feature Pipeline version v${row.Version} was refused activation: its golden-set result ${row.ResultValue} is below the threshold ${row.Threshold}. Change the prompt, model, parameters or spec (the Feature Pipeline Version Steward evaluates the new version automatically), or the pipeline's Activation.Threshold and run the golden-set test again.`;
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

    /**
     * Registers a pin as the next Candidate version, given the pipeline's rows already read (refreshed in place when it
     * re-reads them). A failed save is classified by what a re-read finds, never by the error text:
     * - the pin's row: a concurrent run registered the same pin first, and that row is returned;
     * - another row with this version number: a writer that bypassed the pipeline lock registered another pin under it
     *   (through the service, registrations are serialised by the lock, so this is a guard), and the next number is
     *   tried, up to {@link MAX_VERSION_REGISTRATION_ATTEMPTS} attempts;
     * - neither: the save failed for its own reason, which is thrown.
     */
    protected async CreateCandidate(p: RegisterCandidateParams, pinHash: string,
        versions: MJFeaturePipelineVersionEntity[]): Promise<MJFeaturePipelineVersionEntity> {
        for (let attempt = 1; ; attempt++) {
            const row = await this.NewCandidateRow(p, pinHash, this.NextVersionNumber(versions));
            if (await row.Save()) {
                versions.push(row);
                return row;
            }
            const current = await this.LoadVersions(p.RecordProcessID, p.ContextUser, p.Provider);
            versions.splice(0, versions.length, ...current);
            const again = current.find((v) => v.PinHash === pinHash);
            if (again) {
                return again;
            }
            const numberTaken = current.some((v) => v.Version === row.Version);
            if (!numberTaken || attempt >= MAX_VERSION_REGISTRATION_ATTEMPTS) {
                const attempts = numberTaken ? ` after ${attempt} attempts` : '';
                throw new Error(`Registering Feature Pipeline version failed${attempts}: ${row.LatestResult?.CompleteMessage || 'unknown error'}`);
            }
        }
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
        row.Threshold = p.Activation?.Threshold || null; // Threshold is > 0 by ValidateSpec, so `||` loses nothing
        return row;
    }

    /**
     * Activates `row` and retires every other Active version in `versions`. Runs inside the pipeline lock
     * ({@link WithPipelineLock}): `versions` and `row` come from the read taken under it, so no concurrent writer changed
     * them, and the lock's transaction makes the saves one unit (a failed save rolls the whole activation back).
     * Sequential saves: they share the transaction. A retired version's backfill mark is cleared, and so is the mark of
     * a version that becomes Active again: its records are re-derived under it. A version that is already Active (a new
     * golden-set result recorded on it) keeps its mark.
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
        }
        row.Status = 'Active';
        row.ActivatedAt = new Date();
        row.RetiredAt = null;
        row.ApprovedByUserID = approvedByUserID;
        await this.SaveVersion(row);
    }

    /**
     * Runs `work` in one entity transaction whose first statement locks the pipeline's version rows
     * ({@link LockVersions}). Every write to a pipeline's versions goes through it (registration, the run gate's
     * activation, a golden-set result), so all writers of one pipeline request the same lock, in the same order, before
     * they touch the table: the second waits there, holding nothing the first needs, and then reads what the first
     * committed. A thrown error rolls the whole unit back.
     *
     * The transaction runs on its own provider instance ({@link MetadataProviderCapabilities.RunIsolated}), handed to
     * `work` as `unit`: every read and save of the unit must use it, so its version rows are bound to it. Two runs that
     * share one provider instance (the scheduler passes one to every job) therefore hold two transactions on two
     * sessions and serialise on the lock; on the shared instance the second would join the first's transaction, take the
     * lock its own session already holds, and not wait.
     *
     * Precondition when the caller already holds a transaction on `provider`: the unit joins it (as a savepoint), and the
     * lock is then the first statement of the savepoint, not of the transaction. The caller must not have read or
     * written this pipeline's version rows earlier in that transaction, or the lock-ordering argument above does not
     * hold; the caller owns the ordering of its own transaction.
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
     * Takes an update lock on the pipeline's version rows, and the key range they occupy, held until the open
     * transaction ends: a concurrent writer of the same pipeline waits at the same statement until this one committed or
     * rolled back. When the pipeline has no rows yet, the range lock still covers where its first row would go, so a
     * first registration is serialised too. Must be the first statement of the transaction ({@link WithPipelineLock}),
     * or a writer that already holds index locks could wait on it in the opposite order (a deadlock). When the unit
     * joins a caller's transaction it is the first statement of the savepoint only: the caller must not have touched
     * this pipeline's version rows earlier in its transaction.
     *
     * Raw SQL by necessity: no MJ provider API takes a row lock, and a stored Query runs outside the caller's
     * transaction. The table and schema come from the entity's metadata. The lock hint is SQL Server's; on any other
     * platform, and on a provider that is not a database provider (which cannot hold a transaction of its own), the
     * work runs without the lock.
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
