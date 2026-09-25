/**
 * @file CloneExecutor.ts
 * Executes deterministic clone plans inside an atomic database transaction.
 * Materializes graphs, verifies plan hash stability, enforces root.Save() arbitration,
 * and writes provenance: Record Changes, a Clone Log with one item per planned row, ClonedFrom
 * Record Links, and a Record Cloned audit entry. Refused and failed runs are logged too.
 * @see plans/record-cloning/README.md §6, §8, §10, §13.1
 */

import {
    BaseEntity,
    CompositeKey,
    DatabaseProviderBase,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    Metadata,
    RunInEntityTransaction,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import { MJRecordCloneLogEntity, MJRecordCloneLogItemEntity, MJRecordLinkEntity } from '@memberjunction/core-entities';
import {
    ClonePlan,
    CompositeKeyLike,
    GenerateUUID,
    MaskSensitiveFieldChange,
    MaskSensitivePlan,
    RecordCloneResult,
} from '@memberjunction/record-cloning-base';
import { CloneMaterializer } from './CloneMaterializer';
import { ComputeClonePlanHash } from './ClonePlanHash';
import { ToRecordKeyString } from './CloneKeys';

/** Entities the executor writes provenance to. */
const PROVENANCE_ENTITIES = ['MJ: Record Clone Logs', 'MJ: Record Clone Log Items', 'MJ: Record Links'];

function toCompositeKey(key: CompositeKeyLike | CompositeKey | string | null | undefined, defaultFieldName = 'ID'): CompositeKeyLike {
    if (!key) {
        return { KeyValuePairs: [{ FieldName: defaultFieldName, Value: '' }] };
    }
    if (typeof key === 'object' && 'KeyValuePairs' in key && Array.isArray((key as CompositeKeyLike).KeyValuePairs)) {
        return {
            KeyValuePairs: (key as CompositeKeyLike).KeyValuePairs.map((kvp) => ({
                FieldName: kvp.FieldName,
                Value: kvp.Value,
            })),
        };
    }
    return {
        KeyValuePairs: [{ FieldName: defaultFieldName, Value: String(key) }],
    };
}

export interface CloneExecutorOptions {
    Provider?: IMetadataProvider;
}

export class CloneExecutor {
    private _provider?: IMetadataProvider;

    public constructor(options?: CloneExecutorOptions) {
        this._provider = options?.Provider;
    }

    protected get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Executes a ClonePlan atomically.
     */
    public async Execute(plan: ClonePlan, contextUser: UserInfo): Promise<RecordCloneResult> {
        const md = this.Provider;

        // 1. Refuse blocked plan
        if (plan.Blocked) {
            await this.WriteRefusalLog(plan, contextUser, 'Blocked: ' + plan.Warnings.filter((w) => w.Severity === 'Error').map((w) => w.Message).join('; '));
            return {
                Success: false,
                ResultCode: 'BLOCKED',
                RootRecordKey: plan.RootTargetKey,
                RecordsCloned: 0,
                Warnings: plan.Warnings,
                ErrorMessage: `Clone plan is blocked due to validation or permission errors: ${plan.Warnings.map((w) => w.Message).join('; ')}`,
            };
        }

        // 2. Verify Plan Hash integrity (§13.1 RC7)
        const currentHash = ComputeClonePlanHash({
            Nodes: plan.Nodes,
            Edges: plan.Edges,
            Excluded: plan.Excluded,
        });

        if (currentHash !== plan.Hash && currentHash !== plan.PlanHash) {
            await this.WriteRefusalLog(plan, contextUser, 'PLAN_CHANGED: the plan changed between review and execution.');
            return {
                Success: false,
                ResultCode: 'PLAN_CHANGED',
                RootRecordKey: plan.RootTargetKey,
                RecordsCloned: 0,
                Warnings: [
                    ...plan.Warnings,
                    {
                        Code: 'PLAN_CHANGED',
                        Severity: 'Error',
                        Message: 'Plan hash mismatch: the plan or underlying source entities changed between review and execution.',
                    },
                ],
                ErrorMessage: 'PLAN_CHANGED',
            };
        }

        // A clone is all or nothing (plan §6): refuse rather than run it without a transaction.
        const transProvider = md as unknown as {
            SupportsEntityTransactions?: boolean;
            BeginEntityTransaction?(): Promise<import('@memberjunction/core').EntityTransactionScope>;
        };
        if (transProvider.SupportsEntityTransactions !== true || typeof transProvider.BeginEntityTransaction !== 'function') {
            const message = 'This provider cannot run the clone in a transaction, so it was not started (a partial clone cannot be undone).';
            await this.WriteRefusalLog(plan, contextUser, message);
            return { Success: false, ResultCode: 'EXECUTION_ERROR', RootRecordKey: plan.RootTargetKey, RecordsCloned: 0, Warnings: plan.Warnings, ErrorMessage: message };
        }

        const cloneLogId = GenerateUUID();
        const startedAt = new Date();
        const saveOptions = CloneExecutor.saveOptionsFor(plan);
        const materializer = new CloneMaterializer(md);

        try {
            return await RunInEntityTransaction(transProvider, async () => {
                // 3. Materialize in-memory graph
                const {
                    RootEntity: rootEntity,
                    StagedEntities: stagedEntities,
                    SidecarEntities: sidecarEntities,
                    PrerequisiteEntities: prerequisiteEntities,
                } = await materializer.Materialize(plan, contextUser);

                // 4. Attach CloneContext to all staged entities (§10)
                for (const [nodeKey, entity] of stagedEntities.entries()) {
                    const planNode = plan.Nodes.find((n) => (n.NodeKey ?? n.Key) === nodeKey);
                    entity.SetCloneContext({
                        CloneLogID: cloneLogId,
                        SourceEntityName: planNode?.EntityName || entity.EntityInfo.Name,
                        SourceRecordID: ToRecordKeyString(planNode?.SourceKey),
                        RootEntityName: plan.RootEntityName || entity.EntityInfo.Name,
                        RootSourceRecordID: plan.RootSourceKey || '',
                        RootTargetRecordID: plan.RootTargetKey || '',
                        Depth: planNode?.Depth ?? 0,
                        Route: planNode?.Route ?? 'RootSave',
                        FieldChangeSummary: [],
                    });
                }

                // 4b. Save Prerequisites in dependency order (e.g. ForwardFK targets needed before rootEntity can be saved)
                const prereqEntities = prerequisiteEntities ?? [];
                for (const prereq of prereqEntities) {
                    const prereqSaved = await prereq.Save(saveOptions);
                    if (!prereqSaved) {
                        const errorMsg =
                            prereq.LatestResult?.CompleteMessage ||
                            `Prerequisite clone save failed for entity '${prereq.EntityInfo.Name}'.`;
                        throw new Error(errorMsg);
                    }
                }

                // 5. Atomic Save via root.Save()
                const rootSaved = await rootEntity.Save(saveOptions); // forwarded to every child in the save plan
                if (!rootSaved) {
                    const errorMsg =
                        rootEntity.LatestResult?.CompleteMessage ||
                        `Composite clone save failed for root entity '${plan.RootEntityName}'.`;
                    throw new Error(errorMsg);
                }

                // 6. Save Sidecars in dependency order. They are staged too, so step 4 already gave
                // each its clone context (with its real source record).
                for (const sidecar of sidecarEntities) {
                    const sidecarSaved = await sidecar.Save(saveOptions);
                    if (!sidecarSaved) {
                        const errorMsg =
                            sidecar.LatestResult?.CompleteMessage ||
                            `Sidecar clone save failed for entity '${sidecar.EntityInfo.Name}'.`;
                        throw new Error(errorMsg);
                    }
                }

                // 7. Write provenance (§10) in the same transaction: a clone with no log or lineage
                // is not a successful clone, so a provenance failure rolls the clone back.
                await this.writeSuccessProvenance(plan, cloneLogId, startedAt, stagedEntities, contextUser, rootEntity);

                // Every created row (root, children, prerequisites, sidecars) is in stagedEntities once.
                const clonedCount = stagedEntities.size;
                const rootTargetKey = rootEntity.PrimaryKey?.ToCompactURLSegment?.() ?? rootEntity.PrimaryKey?.ToConcatenatedString?.() ?? plan.RootTargetKey;

                // Build created records mapping
                const createdMappings: Array<{ EntityName: string; SourceKey: CompositeKeyLike; TargetKey: CompositeKeyLike; Depth: number }> = [];
                for (const [nodeKey, entity] of stagedEntities.entries()) {
                    const planNode = plan.Nodes.find((n) => (n.NodeKey ?? n.Key) === nodeKey);
                    createdMappings.push({
                        EntityName: entity.EntityInfo.Name,
                        SourceKey: toCompositeKey(planNode?.SourceKey),
                        TargetKey: toCompositeKey(entity.PrimaryKey),
                        Depth: planNode?.Depth ?? 0,
                    });
                }

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    RootRecordKey: rootTargetKey,
                    Roots: [
                        {
                            EntityName: plan.RootEntityName,
                            SourceKey: toCompositeKey(plan.RootSourceKey),
                            TargetKey: toCompositeKey(rootEntity.PrimaryKey ?? rootTargetKey),
                        },
                    ],
                    Created: createdMappings,
                    RecordsCloned: clonedCount,
                    CloneLogID: cloneLogId,
                    Warnings: plan.Warnings,
                };
            });
        } catch (e) {
            const detail = e instanceof Error ? e.message : String(e);
            // The transaction rolled back, taking any log written inside it; record the failure outside it.
            await this.writeLog(plan, contextUser, { ID: cloneLogId, Status: 'Error', StartedAt: startedAt, ErrorMessage: detail });
            await this.writeAudit(plan, contextUser, false, cloneLogId, null, detail);
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                RootRecordKey: plan.RootTargetKey,
                RecordsCloned: 0,
                Warnings: plan.Warnings,
                ErrorMessage: detail,
            };
        }
    }

    /**
     * Save options for the clone's own rows, from the plan's effective options: Entity Actions run
     * by default and AI Actions don't, unless the entity's configuration (or a Fire Hooks holder's
     * request) says otherwise.
     */
    private static saveOptionsFor(plan: ClonePlan): EntitySaveOptions {
        const options = new EntitySaveOptions();
        options.SkipEntityActions = plan.EffectiveOptions?.EntityActions !== 'fire';
        options.SkipEntityAIActions = plan.EffectiveOptions?.AIActions !== 'fire';
        return options;
    }

    /**
     * Records a refused run (blocked, or the plan changed since review) as a Cancelled clone log,
     * so every Execute leaves a trace. Written outside any transaction; never throws.
     */
    public async WriteRefusalLog(plan: ClonePlan, contextUser: UserInfo, reason: string): Promise<void> {
        const id = GenerateUUID();
        await this.writeLog(plan, contextUser, { ID: id, Status: 'Cancelled', StartedAt: new Date(), ErrorMessage: reason });
        await this.writeAudit(plan, contextUser, false, id, null, reason);
    }

    /**
     * The identity provenance rows are saved as. Logs and lineage links are the platform's record
     * of what happened, not the cloner's own data (the UI role may only read them), so they are
     * written as the system user when this process has one. `InitiatedByUserID` still names the cloner.
     */
    private async provenanceUser(contextUser: UserInfo): Promise<UserInfo> {
        return (await WellKnownUserSource.Instance.GetSystemUser(this.Provider)) ?? contextUser;
    }

    /** Clone log, one log item per plan node, ClonedFrom links, and the audit entry. Throws if the log or a link can't be saved. */
    private async writeSuccessProvenance(
        plan: ClonePlan,
        cloneLogId: string,
        startedAt: Date,
        stagedEntities: Map<string, BaseEntity>,
        contextUser: UserInfo,
        rootEntity: BaseEntity
    ): Promise<void> {
        const md = this.Provider;
        const missing = PROVENANCE_ENTITIES.filter((name) => !md.EntityByName(name));
        if (missing.length > 0) {
            // Only a provider without MJ's own entities (a bare test provider) lands here.
            LogError(`[RecordCloning] ${missing.join(', ')} not found; clone ${cloneLogId} has no provenance.`);
            return;
        }
        const asUser = await this.provenanceUser(contextUser);
        const rootTargetId = ToRecordKeyString(rootEntity.PrimaryKey ?? plan.RootTargetKey) || null;

        const logSaved = await this.writeLog(plan, contextUser, {
            ID: cloneLogId,
            Status: 'Complete',
            StartedAt: startedAt,
            RootTargetRecordID: rootTargetId,
            CreatedCount: stagedEntities.size,
            ResultJSON: JSON.stringify({ Created: stagedEntities.size }),
        });
        if (!logSaved) throw new Error(`The clone log could not be saved, so the clone was rolled back.`);

        // A. Log items: what happened to each planned row, with its (masked) field changes.
        let sequence = 0;
        for (const node of plan.Nodes) {
            const nodeKey = node.NodeKey ?? node.Key;
            const created = stagedEntities.get(nodeKey);
            const item = await md.GetEntityObject<MJRecordCloneLogItemEntity>('MJ: Record Clone Log Items', asUser);
            item.NewRecord();
            item.RecordCloneLogID = cloneLogId;
            item.EntityID = md.EntityByName(node.EntityName)?.ID ?? '';
            item.SourceRecordID = ToRecordKeyString(node.SourceKey);
            item.TargetRecordID = created ? ToRecordKeyString(created.PrimaryKey) : null;
            item.Depth = node.Depth;
            item.Route = node.Route;
            item.Status = created ? 'Created' : node.Action === 'Reference' ? 'Referenced' : 'Skipped';
            item.Sequence = sequence++;
            item.Reason = node.Reason || null;
            item.FieldChangesJSON = created ? JSON.stringify((node.FieldChanges ?? []).map(MaskSensitiveFieldChange)) : null;
            if (!(await item.Save())) {
                throw new Error(`Clone log item for ${nodeKey} not saved: ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }

        // B. Record Links (LinkType = 'ClonedFrom'): Source = the new clone, Target = its original.
        for (const [nodeKey, entity] of stagedEntities.entries()) {
            const planNode = plan.Nodes.find((n) => (n.NodeKey ?? n.Key) === nodeKey);
            if (!planNode) continue;
            const link = await md.GetEntityObject<MJRecordLinkEntity>('MJ: Record Links', asUser);
            link.NewRecord();
            link.LinkType = 'ClonedFrom';
            link.SourceEntityID = entity.EntityInfo.ID;
            link.SourceRecordID = ToRecordKeyString(entity.PrimaryKey ?? planNode.TargetKey);
            link.TargetEntityID = entity.EntityInfo.ID;
            link.TargetRecordID = ToRecordKeyString(planNode.SourceKey);
            link.Metadata = JSON.stringify({ CloneLogID: cloneLogId });
            if (!(await link.Save())) {
                throw new Error(`Record link for ${nodeKey} not saved: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }

        await this.writeAudit(plan, contextUser, true, cloneLogId, rootTargetId, null);
    }

    /**
     * Saves one clone log header. Returns whether it saved; failures are logged, never thrown, so the
     * failure and refusal paths can call it after a rollback.
     */
    private async writeLog(
        plan: ClonePlan,
        contextUser: UserInfo,
        fields: { ID: string; Status: 'Complete' | 'Error' | 'Cancelled'; StartedAt: Date; ErrorMessage?: string; RootTargetRecordID?: string | null; CreatedCount?: number; ResultJSON?: string }
    ): Promise<boolean> {
        const md = this.Provider;
        if (!md.EntityByName('MJ: Record Clone Logs')) return false;
        try {
            const log = await md.GetEntityObject<MJRecordCloneLogEntity>('MJ: Record Clone Logs', await this.provenanceUser(contextUser));
            log.NewRecord();
            log.ID = fields.ID;
            log.Status = fields.Status;
            log.StartedAt = fields.StartedAt;
            log.EndedAt = new Date();
            log.InitiatedByUserID = contextUser?.ID ?? '';
            log.RootEntityID = md.EntityByName(plan.RootEntityName ?? '')?.ID ?? '';
            log.RootSourceRecordID = ToRecordKeyString(plan.RootSourceKey) ?? '';
            log.RootTargetRecordID = fields.RootTargetRecordID ?? null;
            log.PlanHash = plan.PlanHash || plan.Hash || '';
            log.PlanJSON = JSON.stringify(MaskSensitivePlan(plan));
            log.OptionsJSON = JSON.stringify({ Effective: plan.EffectiveOptions, Overrides: plan.Overrides ?? [] });
            log.ResultJSON = fields.ResultJSON ?? null;
            log.ErrorMessage = fields.ErrorMessage ?? null;
            log.CreatedCount = fields.CreatedCount ?? 0;
            log.ReferencedCount = plan.Nodes.filter((n) => n.Action === 'Reference').length;
            log.SkippedCount = plan.Excluded?.length ?? 0;
            if (await log.Save()) return true;
            LogError(`[RecordCloning] Clone log ${fields.ID} not saved: ${log.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        } catch (err) {
            LogError(`[RecordCloning] Clone log ${fields.ID} not saved: ${err instanceof Error ? err.message : String(err)}`);
        }
        return false;
    }

    /** One `Record Cloned` audit entry per Execute, as the cloner. Best effort, like all audit logging. */
    private async writeAudit(plan: ClonePlan, contextUser: UserInfo, success: boolean, cloneLogId: string, rootTargetId: string | null, error: string | null): Promise<void> {
        const md = this.Provider as IMetadataProvider & { CreateAuditLogRecord?: DatabaseProviderBase['CreateAuditLogRecord'] };
        if (typeof md.CreateAuditLogRecord !== 'function') return;
        const entityId = md.EntityByName(plan.RootEntityName ?? '')?.ID;
        if (!entityId) return;
        await md.CreateAuditLogRecord(
            contextUser,
            null,
            'Record Cloned',
            success ? 'Success' : 'Failed',
            JSON.stringify({ CloneLogID: cloneLogId, SourceRecordID: ToRecordKeyString(plan.RootSourceKey), TargetRecordID: rootTargetId, Error: error }),
            entityId,
            rootTargetId ?? ToRecordKeyString(plan.RootSourceKey),
            success ? `Cloned ${plan.RootEntityName} ${ToRecordKeyString(plan.RootSourceKey)}` : `Clone of ${plan.RootEntityName} ${ToRecordKeyString(plan.RootSourceKey)} failed`,
            null
        );
    }
}
