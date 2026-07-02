import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { Metadata } from '@memberjunction/core';
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
    /** In-flight runs by CompanyIntegrationID — coalesces a concurrent duplicate onto the same promise. */
    private static readonly inFlightRuns = new Map<string, Promise<ConnectorCreationPipelineResult>>();
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
     */
    public async Run(opts: ConnectorCreationPipelineOptions): Promise<ConnectorCreationPipelineResult> {
        const ciID = opts.CompanyIntegration?.ID;
        if (!ciID) return this.runInternal(opts); // no key to de-dup on — run directly

        const cls = IntegrationConnectorCreationPipeline;
        const inFlight = cls.inFlightRuns.get(ciID);
        if (inFlight) return inFlight; // a concurrent run is already going — share it

        cls.pruneRecentRuns();
        const recent = cls.recentRuns.get(ciID);
        if (recent) return recent.result; // a run just completed (within the window) — reuse it

        const promise = this.runInternal(opts);
        cls.inFlightRuns.set(ciID, promise);
        try {
            const result = await promise;
            cls.recentRuns.set(ciID, { result, at: Date.now() });
            return result;
        } finally {
            cls.inFlightRuns.delete(ciID);
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
        emitter.runStart(`Connector creation pipeline started for ${opts.CompanyIntegration.Integration ?? '(integration)'} run=${runID}`);

        try {
            await this.StageConnectionTest(emitter, opts);
            const sourceSchema = await this.StageIntrospect(emitter, opts);
            const persistResult = await this.StagePersist(emitter, opts, sourceSchema);
            const { verdicts, unresolved } = await this.StagePKClassify(emitter, opts);

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
            const schema = await opts.Connector.IntrospectSchema(
                opts.CompanyIntegration,
                opts.ContextUser,
                opts.IntrospectOptions
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
                    if (existing && existing.Fields.length === 0) {
                        try {
                            const dfields = await opts.Connector.DiscoverFieldsViaFetch(opts.CompanyIntegration, d.Name, opts.ContextUser);
                            existing.Fields = dfields.map(f => ({
                                Name: f.Name, Label: f.Label, Description: f.Description, SourceType: f.DataType,
                                IsRequired: f.IsRequired, AllowsNull: f.AllowsNull, MaxLength: f.MaxLength ?? null,
                                Precision: f.Precision ?? null, Scale: f.Scale ?? null, DefaultValue: f.DefaultValue ?? null,
                                IsPrimaryKey: f.IsPrimaryKey ?? false, IsUniqueKey: f.IsUniqueKey, IsReadOnly: f.IsReadOnly,
                                IsForeignKey: f.IsForeignKey ?? false, ForeignKeyTarget: f.ForeignKeyTarget ?? null,
                            }));
                            existing.PrimaryKeyFields = dfields.filter(f => f.IsPrimaryKey).map(f => f.Name);
                            existing.Relationships = dfields
                                .filter(f => (f.IsForeignKey ?? false) && f.ForeignKeyTarget)
                                .map(f => ({ FieldName: f.Name, TargetObject: f.ForeignKeyTarget!, TargetField: 'ID' }));
                            console.log(`[IntrospectPipeline] declared field-less object "${d.Name}" → discovered ${dfields.length} fields via read path`);
                        } catch (err) {
                            const msg = err instanceof Error ? err.message : String(err);
                            emitter.stageError('Introspect', `DiscoverFieldsViaFetch failed for declared field-less "${d.Name}": ${msg}`, { code: 'discover-fields-failed' });
                            console.error(`[IntrospectPipeline] DiscoverFieldsViaFetch failed for declared "${d.Name}": ${msg}`);
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
                        IsPrimaryKey: f.IsPrimaryKey ?? false,
                        IsUniqueKey: f.IsUniqueKey,
                        IsReadOnly: f.IsReadOnly,
                        IsForeignKey: f.IsForeignKey ?? false,
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
