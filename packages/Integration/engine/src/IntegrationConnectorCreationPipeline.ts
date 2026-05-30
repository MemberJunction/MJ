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
import { BaseIntegrationConnector } from './BaseIntegrationConnector.js';
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
    public async Run(opts: ConnectorCreationPipelineOptions): Promise<ConnectorCreationPipelineResult> {
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
