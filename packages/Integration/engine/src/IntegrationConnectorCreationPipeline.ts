import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { LogError, Metadata } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import {
    IntegrationProgressEmitter,
    type IntegrationRunManifest,
} from '@memberjunction/integration-progress-artifacts';
import {
    SoftPKClassifier,
    type LLMOneShotCallback,
} from '@memberjunction/integration-pk-classifier';
import { BaseIntegrationConnector, type ExternalObjectSchema, type ExternalFieldSchema } from './BaseIntegrationConnector.js';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import { IntegrationSchemaSync, type PersistSchemaResult } from './IntegrationSchemaSync.js';
import type { IntrospectSchemaOptions } from './types.js';
import { MergeDeclaredWithSample } from './DeclaredSampleMerge.js';

/** Options for the creation/refresh pipeline run. */
export interface ConnectorCreationPipelineOptions {
    /** The connector instance to drive (already constructed by caller). */
    Connector: BaseIntegrationConnector;
    /** CompanyIntegration row to authenticate with. */
    CompanyIntegration: MJCompanyIntegrationEntity;
    /** User context for all entity operations. */
    ContextUser: UserInfo;
    /** Optional metadata provider override (multi-provider scenarios). */
    Provider?: IMetadataProvider;
    /** Optional subset filter — limits introspection to a named set of objects. */
    IntrospectOptions?: IntrospectSchemaOptions;
    /** Optional vendor-wide PK convention hint (e.g. "id" for HubSpot). */
    UniversalPKConvention?: string;
    /** Optional one-shot LLM callback for the PK classifier's last-resort step. */
    LLMInference?: LLMOneShotCallback;
    /** Optional pre-fetched sample rows per object for statistical PK detection. */
    SampleRowsByObject?: Record<string, Array<Record<string, unknown>>>;
    /**
     * Directory for structured progress artifacts. Defaults to
     * `<cwd>/logs/integration-runs`. Each run gets its own `<runID>/` subdir
     * containing manifest.json, progress.jsonl, result.json.
     */
    ArtifactRootDir?: string;
    /** Mirror progress to console (default false). */
    ConsoleMirror?: boolean;
    /**
     * Optional explicit runID. When omitted, generated as `connector-<ts>-<rand>`.
     * Supply your own when resuming a previously-killed run.
     */
    RunID?: string;
    /** Trigger reason recorded in the manifest. */
    TriggerType?: 'Manual' | 'Scheduled' | 'Webhook' | 'Pipeline' | 'Restart';
    /**
     * §7 — when true, this is a COMPREHENSIVE re-discovery: declared/discovered objects (and their
     * fields) ABSENT from this run are deactivated (Status='Disabled', never deleted; reversible on a
     * later rediscovery). Only set on a full-surface refresh — a scoped/partial discovery must leave it
     * false so it never disables what it didn't look at. Threaded to PersistDiscoveredSchema.
     */
    DeactivateAbsent?: boolean;
    /**
     * Hard ceiling for the WHOLE run. Default {@link DEFAULT_RUN_DEADLINE_MS}; 0 disables it.
     *
     * Every other budget in this system bounds something INSIDE a stage, and none of them can preempt
     * an `await` that never settles. A connector's `outOfTime()` is only checked BETWEEN requests; an
     * HTTP abort signal governs only its own request; the discovery sample budget is spent by the code
     * reading the stream. There is always one more layer able to stall — and when one does, this
     * pipeline waits on it forever.
     *
     * Forever is literal. `complete()` and `fail()` are the only writers of `result.json` and both sit
     * inside the try/catch around the stages, so a stage that never returns reaches neither. Since
     * `isInFlight` is computed as "result.json is absent", the run then reports itself running for the
     * rest of time: no client can learn otherwise and no retry clears it.
     *
     * Observed live 2026-08-12 three times on one connector: ConnectionTest completes in ~1s, Introspect
     * starts, and the event stream is flat for ten minutes and counting — against a reference run that
     * finished the entire pipeline in 3m53s.
     *
     * This does NOT stop the stalled work; a promise is not cancellable, so it keeps running until the
     * process ends. It stops WAITING on it, so the run fails honestly, writes its artifact, and becomes
     * retryable. A reported failure you can act on beats silence you cannot.
     */
    RunDeadlineMs?: number;
}

/** Outcome of a single pipeline invocation. */
export interface ConnectorCreationPipelineResult {
    RunID: string;
    Success: boolean;
    PersistResult?: PersistSchemaResult;
    PKVerdicts: Array<{
        ObjectName: string;
        Confident: boolean;
        Nominee?: string;
        Confidence: number;
        Strategy: string;
        Reason: string;
    }>;
    /** Objects that ended the run with no PK — these won't be entity-generated. */
    UnresolvedObjects: string[];
    /** Manifest used to identify the run on disk (for resumption tools). */
    Manifest: IntegrationRunManifest;
    /** Final fail reason if Success=false. */
    FailureMessage?: string;
}

/**
 * The unified pipeline that drives connector creation / refresh end-to-end:
 *
 *   1. ConnectionTest stage  — verifies credentials before any heavy work
 *   2. Introspect stage      — parallel describe via the connector
 *   3. Persist stage         — bounded-concurrency upsert with overlay precedence
 *   4. PKClassify stage      — soft PK classifier on objects still missing a PK
 *
 * Every stage emits structured events through IntegrationProgressEmitter so the
 * stream is identical regardless of vendor. Stages also emit checkpoint events
 * carrying enough resumableState that the orchestrator can pick up from a kill
 * or container restart without re-running prior stages.
 *
 * The pipeline does NOT generate MJ entities itself — that gate (D7) lives in
 * the CodeGen metadata layer: rows without a PK are simply not promoted to
 * `__mj.Entity`. The pipeline emits `entity.skipped-no-pk` events for visibility.
 */
export class IntegrationConnectorCreationPipeline {
    /**
     * In-flight runs by CompanyIntegrationID — coalesces a concurrent duplicate onto the same promise.
     *
     * Carries `at` because the entry is removed in a `finally`, which only fires when the promise
     * SETTLES. A run that hangs therefore owns this slot forever, and every later refresh for that
     * connector takes the `if (inFlight) return inFlight` path and attaches to a promise that will
     * never resolve. No new run starts, no run.start is emitted, nothing reaches the workspace log —
     * from outside the request simply vanishes, and the connector is unrefreshable until the process
     * restarts.
     *
     * That is the whole explanation for behaviour that looked random for two days: a fresh process
     * discovers in ~4 minutes; one hang poisons the slot; every attempt after it hangs; a restart
     * clears the map and it "works again" until the next hang. Observed live 2026-08-12 — a run stuck
     * at EventCount 5 with healthy runs on either side of it.
     *
     * Coalescing is right for concurrent callers, but it is only SAFE if runs terminate, and nothing
     * guarantees that. So the entry expires: past {@link IN_FLIGHT_MAX_AGE_MS} a caller stops trusting
     * it and runs fresh. That does not stop the stalled work (a promise is not cancellable) — it stops
     * one hang from costing every future attempt.
     */
    private static readonly inFlightRuns = new Map<string, { promise: Promise<ConnectorCreationPipelineResult>; at: number }>();
    /**
     * How long a coalescing entry may be trusted before a new caller runs fresh instead of joining it.
     *
     * Generous on purpose: a legitimate large discovery must still coalesce, and re-running one is
     * expensive. This is not a run deadline — it bounds how long ONE hang can hijack other people's
     * requests, nothing more.
     */
    private static readonly IN_FLIGHT_MAX_AGE_MS = 20 * 60_000;
    /**
     * Default whole-run ceiling. Deliberately far above any healthy run — the reference Totara run
     * completes in under four minutes and a large Salesforce-backed catalog in tens — so this only ever
     * fires on work that has genuinely stopped, never on work that is merely big.
     */
    private static readonly DEFAULT_RUN_DEADLINE_MS = 45 * 60_000;
    /** Just-completed runs by CompanyIntegrationID — coalesces a *sequential* duplicate within the window. */
    private static readonly recentRuns = new Map<string, { result: ConnectorCreationPipelineResult; at: number }>();
    /** Default coalesce window (ms) when the env override is unset/invalid. */
    private static readonly DEFAULT_COALESCE_WINDOW_MS = 5000;

    /**
     * How long a just-completed run is reused for a duplicate invocation of the SAME CompanyIntegration.
     * Sized only to absorb the create-time double-fire (the `IsActive` Save-hook runs the pipeline, then
     * `IntegrationCreateConnection` calls it again milliseconds later) — short enough that a genuine,
     * later operator-initiated re-refresh always runs fresh. Override via the
     * `MJ_CONNECTOR_PIPELINE_COALESCE_WINDOW_MS` env var (a positive integer of milliseconds; set 0/unset
     * to use the default). Env-based, matching the RSU env-var convention (RSU_WORK_DIR, etc.).
     */
    private static get COALESCE_WINDOW_MS(): number {
        const override = Number(process.env.MJ_CONNECTOR_PIPELINE_COALESCE_WINDOW_MS);
        return Number.isFinite(override) && override > 0 ? override : IntegrationConnectorCreationPipeline.DEFAULT_COALESCE_WINDOW_MS;
    }

    /**
     * Public entry. De-dups the known create-time double-invocation: the connection's `IsActive`
     * false→true Save fires the entity-server hook (which runs this pipeline WITH LLM PK inference),
     * and the create resolver then calls it again. Both converge here, so we run the pipeline ONCE
     * per CompanyIntegration and hand both callers the same result — no double introspect/persist/
     * classify, no double live API calls, and the resolver still gets a real summary. A legitimate
     * re-refresh later (outside the window) runs fresh.
     *
     * COALESCING vs. A CALLER-SUPPLIED `RunID`. A coalesced call never reaches `runInternal`, so
     * `opts.RunID` is not the ID of the run that served it. That is fine for a caller who awaits the
     * result (it gets the real `RunID` back), but NOT for a caller that already handed `opts.RunID` to
     * a client as "the run to tail" — for that client, the ID would resolve to a run directory that
     * never gets created, and `IntegrationTailRunEvents` would answer "Run not found" forever, which
     * is indistinguishable from "the run hasn't opened its stream yet". So whenever a caller supplied
     * a `RunID` and coalescing served a different run, we publish a terminal ALIAS run under the
     * requested ID pointing at the run that actually did the work. See {@link honourRequestedRunID}.
     */
    public async Run(opts: ConnectorCreationPipelineOptions): Promise<ConnectorCreationPipelineResult> {
        const ciID = opts.CompanyIntegration?.ID;
        if (!ciID) return this.runInternal(opts); // no key to de-dup on — run directly

        const cls = IntegrationConnectorCreationPipeline;
        const inFlight = cls.inFlightRuns.get(ciID);
        if (inFlight) {
            if (Date.now() - inFlight.at < cls.IN_FLIGHT_MAX_AGE_MS) {
                // A concurrent run is already going — share it, but THROUGH honourRequestedRunID so a
                // caller that supplied its own RunID still gets that ID published as a tailable alias.
                // Returning `inFlight.promise` directly (as this branch did before the rebase) discards
                // the requested ID, which is exactly the defect #3354 fixed: the client polls a run
                // directory that is never created and reads "Run not found" forever, indistinguishable
                // from "hasn't started yet".
                return this.honourRequestedRunID(opts, await inFlight.promise);
            }
            // Too old to be believed. Evicted rather than awaited: joining it is how one hang made a
            // connector permanently unrefreshable. The stalled work carries on unattended — nothing
            // here can cancel it — but this caller gets a real run instead of inheriting the stall.
            LogError(
                `[ConnectorCreationPipeline] Discarding an in-flight run for ${ciID} that has not settled in ` +
                `${Math.round((Date.now() - inFlight.at) / 60000)}min — starting a fresh run. The previous run is ` +
                `stuck and will never terminate; its artifact stays in-flight until the workspace restarts.`
            );
            cls.inFlightRuns.delete(ciID);
        }

        cls.pruneRecentRuns();
        const recent = cls.recentRuns.get(ciID);
        if (recent) return this.honourRequestedRunID(opts, recent.result); // just completed — reuse it

        const promise = this.runInternal(opts);
        cls.inFlightRuns.set(ciID, { promise, at: Date.now() });
        try {
            const result = await promise;
            cls.recentRuns.set(ciID, { result, at: Date.now() });
            return result;
        } finally {
            // Only clear the slot if it is still OURS. An eviction above may have handed it to a newer
            // run; deleting blindly would drop that entry and let a third caller start yet another
            // duplicate.
            if (cls.inFlightRuns.get(ciID)?.promise === promise) {
                cls.inFlightRuns.delete(ciID);
            }
        }
    }

    /**
     * Keeps a caller-supplied `opts.RunID` tailable even when coalescing served the call from a
     * DIFFERENT run.
     *
     * Why this exists: `IntegrationCreateConnection`/`IntegrationUpdateConnection` can launch the
     * refresh detached — they mint a run ID, hand it to the client as "tail this", and only then call
     * `Run()`. On create, the connection's `IsActive` false→true Save has ALREADY awaited a full
     * pipeline run for the same CompanyIntegration (MJCompanyIntegrationEntityServer), so the
     * resolver's call lands inside the coalesce window every time. Without this, the minted ID names
     * a run directory that is never created: the detached promise RESOLVES (so the launcher's
     * rejection handler never fires) and the client polls `IntegrationTailRunEvents` forever on
     * `Run '<id>' not found`, which reads exactly like "not started yet".
     *
     * So: publish a real, terminal, one-stage run under the requested ID whose events name the run
     * that actually did the work. The tail resolves, carries the served run's outcome, and
     * `data.servedByRunID` lets a client hop to the full stream. The returned result is the served
     * run unchanged — a caller that awaits still gets the true `RunID`.
     */
    private async honourRequestedRunID(
        opts: ConnectorCreationPipelineOptions,
        served: ConnectorCreationPipelineResult
    ): Promise<ConnectorCreationPipelineResult> {
        const requested = opts.RunID;
        if (!requested || requested === served.RunID) return served;
        await this.publishCoalescedAlias(requested, opts, served);
        return served;
    }

    /**
     * Writes the alias run described in {@link honourRequestedRunID}. Best-effort: an artifact-write
     * failure must never turn a schema refresh that genuinely succeeded into a thrown error, so this
     * only logs. The alias mirrors the served run's success/failure so a client tailing it cannot
     * read a failed refresh as a clean one.
     */
    private async publishCoalescedAlias(
        requestedRunID: string,
        opts: ConnectorCreationPipelineOptions,
        served: ConnectorCreationPipelineResult
    ): Promise<void> {
        try {
            const emitter = new IntegrationProgressEmitter({
                runID: requestedRunID,
                runKind: 'ConnectorCreation',
                integrationID: opts.CompanyIntegration.IntegrationID,
                companyIntegrationID: opts.CompanyIntegration.ID,
                triggerType: opts.TriggerType ?? 'Pipeline',
                startedAt: new Date().toISOString(),
                expectedStages: ['Coalesced'],
                context: { servedByRunID: served.RunID, coalesced: true },
            }, { rootDir: opts.ArtifactRootDir, consoleMirror: opts.ConsoleMirror });

            const pointer = `A schema refresh for this connection was already running (or had just ` +
                `completed), so this request was served by run ${served.RunID} instead of starting a ` +
                `second live introspect. Tail that run for the full event stream.`;
            emitter.runStart(pointer);
            emitter.stageComplete('Coalesced', { processed: 1, succeeded: served.Success ? 1 : 0 });

            if (served.Success) {
                const p = served.PersistResult;
                await emitter.complete(
                    `${pointer} Outcome: ${p?.ObjectsCreated ?? 0} objects created, ` +
                    `${p?.ObjectsUpdated ?? 0} updated, ${served.UnresolvedObjects.length} unresolved PKs.`
                );
            } else {
                emitter.stageError('Coalesced', served.FailureMessage ?? 'no reason reported', {
                    code: 'coalesced-run-failed',
                    servedByRunID: served.RunID,
                });
                await emitter.fail(
                    `${pointer} That run FAILED: ${served.FailureMessage ?? 'no reason reported'}`,
                    'coalesced-run-failed'
                );
            }
            await emitter.flush();
        } catch (err) {
            console.warn(
                `[IntegrationConnectorCreationPipeline] Could not publish coalesced-run alias ` +
                `${requestedRunID} → ${served.RunID}: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    /** Drops recent-run entries older than the coalesce window so the map stays bounded. */
    private static pruneRecentRuns(): void {
        const now = Date.now();
        for (const [key, entry] of IntegrationConnectorCreationPipeline.recentRuns) {
            if (now - entry.at >= IntegrationConnectorCreationPipeline.COALESCE_WINDOW_MS) {
                IntegrationConnectorCreationPipeline.recentRuns.delete(key);
            }
        }
    }

    private async runInternal(opts: ConnectorCreationPipelineOptions): Promise<ConnectorCreationPipelineResult> {
        const runID = opts.RunID ?? IntegrationProgressEmitter.newRunID('connector');
        const manifest: IntegrationRunManifest = {
            runID,
            runKind: 'ConnectorCreation',
            integrationID: opts.CompanyIntegration.IntegrationID,
            companyIntegrationID: opts.CompanyIntegration.ID,
            triggerType: opts.TriggerType ?? 'Pipeline',
            startedAt: new Date().toISOString(),
            expectedStages: ['ConnectionTest', 'Introspect', 'Persist', 'PKClassify'],
            context: {
                connectorClass: opts.Connector.constructor.name,
                integrationName: opts.CompanyIntegration.Integration ?? null,
            },
        };
        const emitter = new IntegrationProgressEmitter(manifest, {
            rootDir: opts.ArtifactRootDir,
            consoleMirror: opts.ConsoleMirror,
        });
        const startedMs = Date.now();
        emitter.runStart(`Connector creation pipeline started for ${opts.CompanyIntegration.Integration ?? '(integration)'} run=${runID}`);

        // THE RUN MUST END. Raced rather than awaited: a stage that never settles cannot be cancelled,
        // but it can be stopped being waited on — which is the difference between a run that fails and
        // one that is in-flight forever. See RunDeadlineMs.
        const deadlineMs = opts.RunDeadlineMs ?? IntegrationConnectorCreationPipeline.DEFAULT_RUN_DEADLINE_MS;
        // The default is 45min, but RunDeadlineMs is a public knob and a caller may set seconds — in
        // which case rounding to minutes reported the failure as a "deadline of 0min", which reads as
        // a bug in the pipeline rather than the limit the caller actually asked for.
        const deadlineLabel = deadlineMs >= 60_000
            ? `${Math.round(deadlineMs / 60_000)}min`
            : `${(deadlineMs / 1000).toFixed(deadlineMs % 1000 === 0 ? 0 : 1)}s`;
        let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
        const withDeadline = async <T>(stage: string, work: Promise<T>): Promise<T> => {
            if (deadlineMs <= 0) return work;
            const remaining = deadlineMs - (Date.now() - startedMs);
            if (remaining <= 0) {
                throw new Error(`Run deadline of ${deadlineLabel} exceeded before stage "${stage}" could start.`);
            }
            return Promise.race([
                work,
                new Promise<never>((_, reject) => {
                    deadlineTimer = setTimeout(
                        () => reject(new Error(
                            `Stage "${stage}" did not finish within the run deadline of ` +
                            `${deadlineLabel}. The work may still be running on this ` +
                            `process — it cannot be cancelled — but the run is being failed so it stops ` +
                            `reporting itself in-flight and can be retried.`)),
                        remaining,
                    );
                    // Never hold the process open for a deadline nobody is waiting on.
                    (deadlineTimer as unknown as { unref?: () => void }).unref?.();
                }),
            ]).finally(() => { if (deadlineTimer) clearTimeout(deadlineTimer); }) as Promise<T>;
        };

        try {
            await withDeadline('ConnectionTest', this.StageConnectionTest(emitter, opts));
            const sourceSchema = await withDeadline('Introspect', this.StageIntrospect(emitter, opts));
            const persistResult = await withDeadline('Persist', this.StagePersist(emitter, opts, sourceSchema));
            const { verdicts, unresolved } = await withDeadline('PKClassify', this.StagePKClassify(emitter, opts));

            emitter.stageComplete('Pipeline', {
                processed: persistResult.ObjectsCreated + persistResult.ObjectsUpdated,
                succeeded: verdicts.filter(v => v.Confident).length,
                skipped: unresolved.length,
            });
            await emitter.complete(`Pipeline complete. ${persistResult.ObjectsCreated} objects created, ${persistResult.ObjectsUpdated} updated, ${unresolved.length} unresolved PKs.`);

            return {
                RunID: runID,
                Success: true,
                PersistResult: persistResult,
                PKVerdicts: verdicts,
                UnresolvedObjects: unresolved,
                Manifest: manifest,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await emitter.fail(`Pipeline failed: ${msg}`);
            return {
                RunID: runID,
                Success: false,
                PKVerdicts: [],
                UnresolvedObjects: [],
                Manifest: manifest,
                FailureMessage: msg,
            };
        } finally {
            await emitter.flush();
        }
    }

    // ── Stage 1: connection ──────────────────────────────────────────────

    private async StageConnectionTest(
        emitter: IntegrationProgressEmitter,
        opts: ConnectorCreationPipelineOptions
    ): Promise<void> {
        emitter.stageStart('ConnectionTest', 'Validating credentials before heavy work');
        const startMs = Date.now();
        const result = await opts.Connector.TestConnection(opts.CompanyIntegration, opts.ContextUser);
        if (!result.Success) {
            emitter.stageError('ConnectionTest', result.Message ?? 'Connection failed', { code: 'connection-failed' });
            throw new Error(`ConnectionTest failed: ${result.Message ?? 'unknown reason'}`);
        }
        emitter.stageComplete('ConnectionTest', { processed: 1, succeeded: 1 });
        emitter.checkpoint('ConnectionTest', { completedAt: new Date().toISOString(), durationMs: Date.now() - startMs });
    }

    // ── Stage 2: introspect ──────────────────────────────────────────────

    private async StageIntrospect(
        emitter: IntegrationProgressEmitter,
        opts: ConnectorCreationPipelineOptions
    ) {
        emitter.stageStart('Introspect', 'Discovering objects and fields via connector');
        const startMs = Date.now();
        try {
            // U11 — determinate discovery progress: surface scanned/total on the structured
            // stream (IntegrationTailRunEvents carries counts) so a client can render a real
            // "scanned N of M objects" bar. Throttled to every 10 objects (+ the final one) so a
            // large catalog doesn't flood the artifact.
            let lastEmitted = 0;
            const onProgress = (scanned: number, total: number): void => {
                if (scanned - lastEmitted < 10 && scanned !== total) return;
                lastEmitted = scanned;
                emitter.heartbeat('Introspect', `scanned ${scanned}/${total} objects`, { processed: scanned, totalKnown: total });
            };
            const schema = await opts.Connector.IntrospectSchema(
                opts.CompanyIntegration,
                opts.ContextUser,
                { ...(opts.IntrospectOptions ?? {}), OnProgress: onProgress }
            );

            // UNIVERSAL additive runtime-object discovery — the single chokepoint EVERY connector
            // funnels through, regardless of which base it extends or whether that base's
            // IntrospectSchema only reflects already-declared metadata. IntrospectSchema gives the
            // rich declared/persisted catalog; we then ADD any objects the connector surfaces at
            // runtime that aren't already in it, via the abstract DiscoverObjects/DiscoverFields
            // primitives that EVERY connector implements (so a future connector on a different base
            // can't silently lose runtime discovery). PersistDiscoveredSchema is additive, so
            // declared objects are preserved and runtime-only objects (e.g. an auth-gated file
            // feed's streams) get created as Discovered. Errors are SURFACED, never swallowed.
            const seen = new Set(schema.Objects.map(o => o.ExternalName.toLowerCase()));
            let runtimeObjects: ExternalObjectSchema[] = [];
            try {
                runtimeObjects = await opts.Connector.DiscoverObjects(opts.CompanyIntegration, opts.ContextUser);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                emitter.stageError('Introspect', `DiscoverObjects failed: ${msg}`, { code: 'discover-objects-failed' });
                console.error(`[IntrospectPipeline] DiscoverObjects failed: ${msg}`);
            }
            let runtimeAdded = 0;
            for (const d of runtimeObjects) {
                const key = d.Name.toLowerCase();
                if (seen.has(key)) {
                    // §case-3 (data-only-discoverable): a DECLARED object the connector ALSO surfaces at
                    // runtime, but the declared form carries NO fields (e.g. a file-feed stream declared by
                    // NAME only — its columns are knowable solely from the records). Without this, the loop
                    // skipped it, it stayed field-less + PK-less, and ApplyAll dropped it — so the user's data
                    // for that object never landed. Discover its fields over the read path and populate the
                    // existing declared object IN PLACE so it becomes syncable.
                    const existing = schema.Objects.find(o => o.ExternalName.toLowerCase() === key);
                    // SAMPLE UNCONDITIONALLY. This used to run only for a declared object with no
                    // fields — a gate on the wrong question, because streaming answers three and a
                    // declaration can only pre-answer one of them. A declared key IS authoritative;
                    // which fields the source actually sends, and how wide their values are, only
                    // the data knows. An object declared with fields and a key was therefore never
                    // sampled: its undeclared columns arrived later through the overflow path one
                    // sync at a time, and its widths were whatever the catalog guessed — which is a
                    // truncation, or a migration written by hand afterwards.
                    //
                    // The merge is one-directional (see DeclaredSampleMerge): sampling fills gaps
                    // and widens, never overrides. A fetch failure leaves the declaration exactly
                    // as it was, so the worst case is the behaviour that shipped before.
                    if (existing) {
                        try {
                            const dfields = await opts.Connector.DiscoverFieldsViaFetch(opts.CompanyIntegration, d.Name, opts.ContextUser);
                            const sampled = dfields.map(f => ({
                                Name: f.Name, Label: f.Label, Description: f.Description, SourceType: f.DataType,
                                IsRequired: f.IsRequired, AllowsNull: f.AllowsNull, MaxLength: f.MaxLength ?? null,
                                Precision: f.Precision ?? null, Scale: f.Scale ?? null, DefaultValue: f.DefaultValue ?? null,
                                // U1 — preserve `undefined` (no opinion); `?? false` fabricated a "not a PK/FK" opinion
                                IsPrimaryKey: f.IsPrimaryKey, IsUniqueKey: f.IsUniqueKey, IsReadOnly: f.IsReadOnly,
                                IsForeignKey: f.IsForeignKey, ForeignKeyTarget: f.ForeignKeyTarget ?? null,
                            }));
                            if (existing.Fields.length === 0) {
                                // Nothing was declared, so there is nothing to defer to — the
                                // sample is the whole truth, exactly as before this change.
                                existing.Fields = sampled;
                                existing.PrimaryKeyFields = dfields.filter(f => f.IsPrimaryKey).map(f => f.Name);
                                existing.Relationships = dfields
                                    .filter(f => (f.IsForeignKey ?? false) && f.ForeignKeyTarget)
                                    .map(f => ({ FieldName: f.Name, TargetObject: f.ForeignKeyTarget!, TargetField: 'ID' }));
                                console.log(`[IntrospectPipeline] declared field-less object "${d.Name}" → discovered ${dfields.length} field(s) via read path`);
                            } else {
                                const merged = MergeDeclaredWithSample(existing.Fields, sampled);
                                existing.Fields = merged.Fields;
                                // Only when the declaration named no key at all — a declared key
                                // stays authoritative even if the sample nominates another column,
                                // which is how a child table ends up keyed on its parent's FK.
                                if (merged.AdoptedKeyNames.length > 0) {
                                    existing.PrimaryKeyFields = merged.AdoptedKeyNames;
                                }
                                // Relationships come from the declaration when there is one; a
                                // sampled FK target is a guess and must not rewrite a stated graph.
                                const parts = [
                                    merged.AddedFieldNames.length ? `added ${merged.AddedFieldNames.length} undeclared field(s): ${merged.AddedFieldNames.join(', ')}` : null,
                                    merged.WidenedFieldNames.length ? `widened ${merged.WidenedFieldNames.length}: ${merged.WidenedFieldNames.join(', ')}` : null,
                                    merged.AdoptedKeyNames.length ? `adopted key [${merged.AdoptedKeyNames.join(', ')}]` : null,
                                ].filter(Boolean);
                                console.log(`[IntrospectPipeline] declared object "${d.Name}" sampled ${dfields.length} field(s) — ${parts.length ? parts.join('; ') : 'declaration already matched the data'}`);
                            }
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            // The declaration stands exactly as it was — the worst case of sampling
                            // failing is the behaviour that shipped before it. Say which was lost so
                            // an operator can tell "no columns at all" from "possibly narrow ones".
                            const lost = existing.Fields.length === 0
                                ? 'object has NO fields and cannot be synced until this succeeds'
                                : 'keeping the declared fields; undeclared columns and true widths are unknown for this run';
                            emitter.stageError('Introspect', `DiscoverFieldsViaFetch failed for declared "${d.Name}" — ${lost}: ${msg}`, { code: 'discover-fields-failed' });
                            console.error(`[IntrospectPipeline] DiscoverFieldsViaFetch failed for declared "${d.Name}" — ${lost}: ${msg}`);
                        }
                    }
                    continue;
                }
                seen.add(key);
                let fields: ExternalFieldSchema[] = [];
                try {
                    // Discover fields + PROVABLE PK over the READ PATH (FetchChanges), time-bounded and
                    // SAVE-LESS — stream as much of the feed as the budget allows so the PK decision is
                    // made on a statistically-significant sample, not a single (possibly tiny) file. No
                    // DB write happens here; the real save is the later ApplyAll → StartSync.
                    fields = await opts.Connector.DiscoverFieldsViaFetch(opts.CompanyIntegration, d.Name, opts.ContextUser);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    emitter.stageError('Introspect', `DiscoverFieldsViaFetch failed for "${d.Name}": ${msg}`, { code: 'discover-fields-failed' });
                    console.error(`[IntrospectPipeline] DiscoverFieldsViaFetch failed for "${d.Name}": ${msg}`);
                }
                schema.Objects.push({
                    ExternalName: d.Name,
                    ExternalLabel: d.Label,
                    Description: d.Description,
                    Fields: fields.map(f => ({
                        Name: f.Name,
                        Label: f.Label,
                        Description: f.Description,
                        SourceType: f.DataType,
                        IsRequired: f.IsRequired,
                        AllowsNull: f.AllowsNull,
                        MaxLength: f.MaxLength ?? null,
                        Precision: f.Precision ?? null,
                        Scale: f.Scale ?? null,
                        DefaultValue: f.DefaultValue ?? null,
                        // U1 — preserve `undefined` (no opinion); `?? false` fabricated a "not a PK/FK" opinion
                        IsPrimaryKey: f.IsPrimaryKey,
                        IsUniqueKey: f.IsUniqueKey,
                        IsReadOnly: f.IsReadOnly,
                        IsForeignKey: f.IsForeignKey,
                        ForeignKeyTarget: f.ForeignKeyTarget ?? null,
                    })),
                    PrimaryKeyFields: fields.filter(f => f.IsPrimaryKey).map(f => f.Name),
                    Relationships: fields
                        .filter(f => (f.IsForeignKey ?? false) && f.ForeignKeyTarget)
                        .map(f => ({ FieldName: f.Name, TargetObject: f.ForeignKeyTarget!, TargetField: 'ID' })),
                });
                runtimeAdded++;
            }
            console.log(`[IntrospectPipeline] declared=${seen.size - runtimeAdded} runtime-added=${runtimeAdded} total=${schema.Objects.length}`);

            const fieldCount = schema.Objects.reduce((acc, o) => acc + o.Fields.length, 0);
            emitter.stageComplete('Introspect', {
                processed: schema.Objects.length,
                succeeded: schema.Objects.length,
                totalKnown: schema.Objects.length,
            });
            emitter.checkpoint('Introspect', {
                objectsDiscovered: schema.Objects.length,
                fieldsDiscovered: fieldCount,
                durationMs: Date.now() - startMs,
            });
            return schema;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            emitter.stageError('Introspect', msg, { code: 'introspect-failed' });
            throw err;
        }
    }

    // ── Stage 3: persist ─────────────────────────────────────────────────

    private async StagePersist(
        emitter: IntegrationProgressEmitter,
        opts: ConnectorCreationPipelineOptions,
        sourceSchema: Awaited<ReturnType<BaseIntegrationConnector['IntrospectSchema']>>
    ): Promise<PersistSchemaResult> {
        emitter.stageStart('Persist', 'Upserting IntegrationObject/Field rows with overlay precedence');
        const startMs = Date.now();
        const persistResult = await IntegrationSchemaSync.PersistDiscoveredSchema({
            IntegrationID: opts.CompanyIntegration.IntegrationID,
            SourceSchema: sourceSchema,
            ContextUser: opts.ContextUser,
            Provider: opts.Provider,
            UseTransactionGroup: true,
            // §7 comprehensive-refresh deactivation (objects + fields absent from this discovery).
            DeactivateAbsent: opts.DeactivateAbsent ?? false,
        });

        // Emit per-object + per-field structural-transparency events so the UI/audit
        // trail captures WHO won each attribute.
        for (const objLog of persistResult.ObjectMergeLog) {
            emitter.objectAdded(objLog.ObjectName, objLog.EffectiveSource);
        }
        for (const fieldLog of persistResult.FieldMergeLog) {
            emitter.fieldAdded(fieldLog.ObjectName, fieldLog.FieldName, fieldLog.EffectiveSource);
        }
        // A comprehensive refresh deactivates declared objects/fields it did not observe. That is
        // the intended behaviour, but it is also the point where a connector's declared field stops
        // being materialized by every later apply — so say which ones, on the progress stream the
        // caller is already reading, instead of only in a server console line.
        if (persistResult.ObjectsDeactivated.length > 0 || persistResult.FieldsDeactivated.length > 0) {
            emitter.warning(
                'Persist',
                'DECLARED_ROWS_DEACTIVATED',
                `${persistResult.ObjectsDeactivated.length} object(s) and ${persistResult.FieldsDeactivated.length} ` +
                `field(s) were declared but not observed by this authoritative discovery, so they were deactivated ` +
                `(never deleted) and will not be materialized by a later apply until they are observed again or ` +
                `re-enabled.`,
                {
                    objects: persistResult.ObjectsDeactivated,
                    fields: persistResult.FieldsDeactivated,
                },
            );
        }
        emitter.stageComplete('Persist', {
            processed: persistResult.ObjectsCreated + persistResult.ObjectsUpdated,
            succeeded: persistResult.ObjectsCreated + persistResult.ObjectsUpdated,
        });
        emitter.checkpoint('Persist', {
            objectsCreated: persistResult.ObjectsCreated,
            objectsUpdated: persistResult.ObjectsUpdated,
            fieldsCreated: persistResult.FieldsCreated,
            fieldsUpdated: persistResult.FieldsUpdated,
            durationMs: Date.now() - startMs,
        });
        return persistResult;
    }

    // ── Stage 4: PK classification ───────────────────────────────────────

    private async StagePKClassify(
        emitter: IntegrationProgressEmitter,
        opts: ConnectorCreationPipelineOptions
    ): Promise<{
        verdicts: ConnectorCreationPipelineResult['PKVerdicts'];
        unresolved: string[];
    }> {
        emitter.stageStart('PKClassify', 'Soft PK classifier for objects still missing a PK');
        const md = opts.Provider ?? Metadata.Provider;
        const engine = IntegrationEngineBase.Instance;
        // Refresh from DB so we see what Persist just wrote
        await engine.Config(true, opts.ContextUser, md);
        const objects = engine.GetIntegrationObjectsByIntegrationID(opts.CompanyIntegration.IntegrationID);

        const classifier = new SoftPKClassifier();
        const verdicts: ConnectorCreationPipelineResult['PKVerdicts'] = [];
        const unresolved: string[] = [];

        for (const obj of objects) {
            const fields = engine.GetIntegrationObjectFields(obj.ID);
            const hasPK = fields.some(f => f.IsPrimaryKey);
            if (hasPK) {
                emitter.entityGenerated(obj.Name, obj.Name);
                continue;
            }
            emitter.pkClassifierInvoked(obj.Name);
            const verdict = await classifier.Classify({
                object: obj,
                fields,
                universalConvention: opts.UniversalPKConvention,
                sampleRows: opts.SampleRowsByObject?.[obj.Name],
                llmInference: opts.LLMInference,
            });
            emitter.pkClassifierResult(obj.Name, {
                Confident: verdict.Confident,
                Nominee: verdict.Nominee,
                Confidence: verdict.Confidence,
                Strategy: verdict.Strategy,
                Reason: verdict.Reason,
            });
            verdicts.push({
                ObjectName: obj.Name,
                Confident: verdict.Confident,
                Nominee: verdict.Nominee,
                Confidence: verdict.Confidence,
                Strategy: verdict.Strategy,
                Reason: verdict.Reason,
            });

            if (verdict.Confident && verdict.Nominee) {
                const winning = fields.find(f => f.Name === verdict.Nominee);
                if (winning) {
                    winning.IsPrimaryKey = true;
                    const saved = await winning.Save();
                    if (!saved) {
                        emitter.stageError('PKClassify', `Failed to persist PK on ${obj.Name}.${verdict.Nominee}: ${winning.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                        unresolved.push(obj.Name);
                        continue;
                    }
                    emitter.entityGenerated(obj.Name, obj.Name);
                } else {
                    // Classifier nominated a field that's not in our cache — refuse silently and skip.
                    unresolved.push(obj.Name);
                    emitter.entitySkippedNoPK(obj.Name);
                }
            } else {
                unresolved.push(obj.Name);
                emitter.entitySkippedNoPK(obj.Name);
            }
        }

        emitter.stageComplete('PKClassify', {
            processed: verdicts.length,
            succeeded: verdicts.filter(v => v.Confident).length,
            skipped: unresolved.length,
        });
        emitter.checkpoint('PKClassify', {
            totalObjects: objects.length,
            verdicts: verdicts.length,
            unresolved: unresolved.length,
        });

        return { verdicts, unresolved };
    }
}
