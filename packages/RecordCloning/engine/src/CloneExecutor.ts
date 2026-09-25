/**
 * @file CloneExecutor.ts
 * Executes deterministic clone plans inside an atomic database transaction.
 * Materializes graphs, verifies plan hash stability, enforces root.Save() arbitration,
 * writes provenance (Record Changes, Record Links, Clone Logs), and executes post-clone actions.
 * @see plans/record-cloning/README.md §6, §8, §10, §13.1
 */

import {
    BaseEntity,
    CompositeKey,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    Metadata,
    RunInEntityTransaction,
    UserInfo,
} from '@memberjunction/core';
import { MJRecordCloneLogEntity, MJRecordLinkEntity } from '@memberjunction/core-entities';
import {
    ClonePlan,
    CompositeKeyLike,
    GenerateUUID,
    MaskSensitivePlan,
    RecordCloneResult,
} from '@memberjunction/record-cloning-base';
import { CloneMaterializer } from './CloneMaterializer';
import { ComputeClonePlanHash } from './ClonePlanHash';
import { ToRecordKeyString } from './CloneKeys';

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

        const cloneLogId = GenerateUUID();
        const startedAt = new Date();
        const saveOptions = CloneExecutor.saveOptionsFor(plan);
        const materializer = new CloneMaterializer(md);

        try {
            const transProvider = md as unknown as {
                SupportsEntityTransactions?: boolean;
                BeginEntityTransaction?(): Promise<import('@memberjunction/core').EntityTransactionScope>;
            };
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

                // 6. Save Sidecars in dependency order
                for (const sidecar of sidecarEntities) {
                    sidecar.SetCloneContext({
                        CloneLogID: cloneLogId,
                        SourceEntityName: sidecar.EntityInfo.Name,
                        SourceRecordID: '',
                        RootEntityName: plan.RootEntityName || sidecar.EntityInfo.Name,
                        RootSourceRecordID: plan.RootSourceKey || '',
                        RootTargetRecordID: plan.RootTargetKey || '',
                        Depth: 1,
                        Route: 'Sidecar',
                        FieldChangeSummary: [],
                    });
                    const sidecarSaved = await sidecar.Save(saveOptions);
                    if (!sidecarSaved) {
                        const errorMsg =
                            sidecar.LatestResult?.CompleteMessage ||
                            `Sidecar clone save failed for entity '${sidecar.EntityInfo.Name}'.`;
                        throw new Error(errorMsg);
                    }
                }

                // 7. Write Provenance Records (§10)
                await this.writeProvenance(plan, cloneLogId, startedAt, stagedEntities, contextUser, rootEntity, sidecarEntities);

                const clonedCount = stagedEntities.size + sidecarEntities.length;
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
                for (const sidecar of sidecarEntities) {
                    createdMappings.push({
                        EntityName: sidecar.EntityInfo.Name,
                        SourceKey: toCompositeKey(''),
                        TargetKey: toCompositeKey(sidecar.PrimaryKey),
                        Depth: 1,
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
     * Save options for the clone's own rows. Entity Actions and AI Actions are suppressed unless the
     * plan's effective options say 'fire', which the planner only allows for Fire Hooks holders (plan §8.4).
     */
    private static saveOptionsFor(plan: ClonePlan): EntitySaveOptions {
        const options = new EntitySaveOptions();
        options.SkipEntityActions = plan.EffectiveOptions?.EntityActions !== 'fire';
        options.SkipEntityAIActions = plan.EffectiveOptions?.AIActions !== 'fire';
        return options;
    }

    /**
     * Writes Record Links and Clone Log provenance records.
     */
    private async writeProvenance(
        plan: ClonePlan,
        cloneLogId: string,
        startedAt: Date,
        stagedEntities: Map<string, BaseEntity>,
        contextUser: UserInfo,
        rootEntity: BaseEntity,
        sidecarEntities: BaseEntity[]
    ): Promise<void> {
        const md = this.Provider;

        // Provenance is non-fatal to the clone, but a failure is logged rather than swallowed:
        // an unresolvable entity name here once meant no log or link was ever written.

        // A. Record Links (LinkType = 'ClonedFrom'): Source = the new clone, Target = its original.
        const recordLinksInfo = md.EntityByName('MJ: Record Links');
        if (!recordLinksInfo) LogError(`[RecordCloning] 'MJ: Record Links' not found; clone ${cloneLogId} has no lineage links.`);
        if (recordLinksInfo) {
            for (const [nodeKey, entity] of stagedEntities.entries()) {
                const planNode = plan.Nodes.find((n) => (n.NodeKey ?? n.Key) === nodeKey);
                if (!planNode) continue;

                try {
                    const linkEntity = await md.GetEntityObject<MJRecordLinkEntity>('MJ: Record Links', contextUser);
                    linkEntity.NewRecord();
                    linkEntity.LinkType = 'ClonedFrom';
                    linkEntity.SourceEntityID = entity.EntityInfo.ID;
                    linkEntity.SourceRecordID = ToRecordKeyString(entity.PrimaryKey ?? planNode.TargetKey);
                    linkEntity.TargetEntityID = entity.EntityInfo.ID;
                    linkEntity.TargetRecordID = ToRecordKeyString(planNode.SourceKey);
                    linkEntity.Metadata = JSON.stringify({ CloneLogID: cloneLogId });
                    if (!(await linkEntity.Save())) {
                        LogError(`[RecordCloning] Record link for ${nodeKey} not saved: ${linkEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                } catch (err) {
                    LogError(`[RecordCloning] Record link for ${nodeKey} not saved: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }

        // B. Record Clone Logs
        const cloneLogsInfo = md.EntityByName('MJ: Record Clone Logs');
        if (!cloneLogsInfo) LogError(`[RecordCloning] 'MJ: Record Clone Logs' not found; clone ${cloneLogId} has no log.`);
        if (cloneLogsInfo) {
            try {
                const logEntity = await md.GetEntityObject<MJRecordCloneLogEntity>('MJ: Record Clone Logs', contextUser);
                logEntity.NewRecord();
                logEntity.ID = cloneLogId;
                logEntity.Status = 'Complete';
                logEntity.StartedAt = startedAt;
                logEntity.InitiatedByUserID = contextUser?.ID ?? '';
                logEntity.RootEntityID = md.EntityByName(plan.RootEntityName ?? '')?.ID ?? '';
                logEntity.RootSourceRecordID = ToRecordKeyString(plan.RootSourceKey) ?? '';
                logEntity.RootTargetRecordID = ToRecordKeyString(rootEntity.PrimaryKey ?? plan.RootTargetKey) ?? null;
                logEntity.PlanHash = plan.PlanHash || plan.Hash;
                logEntity.PlanJSON = JSON.stringify(MaskSensitivePlan(plan));
                logEntity.CreatedCount = stagedEntities.size + sidecarEntities.length;
                logEntity.ReferencedCount = plan.Nodes.filter((n) => n.Action === 'Reference').length;
                logEntity.SkippedCount = plan.Nodes.filter((n) => n.Action === 'Skip').length;
                logEntity.EndedAt = new Date();
                logEntity.OptionsJSON = JSON.stringify({ Effective: plan.EffectiveOptions, Overrides: plan.Overrides ?? [] });
                if (!(await logEntity.Save())) {
                    LogError(`[RecordCloning] Clone log ${cloneLogId} not saved: ${logEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            } catch (err) {
                LogError(`[RecordCloning] Clone log ${cloneLogId} not saved: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
}
