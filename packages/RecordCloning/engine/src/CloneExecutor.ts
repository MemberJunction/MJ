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
    IMetadataProvider,
    Metadata,
    RunInEntityTransaction,
    UserInfo,
} from '@memberjunction/core';
import { MJRecordCloneLogEntity, MJRecordLinkEntity } from '@memberjunction/core-entities';
import {
    ClonePlan,
    CompositeKeyLike,
    ComputeClonePlanHash,
    GenerateUUID,
    RecordCloneResult,
} from '@memberjunction/record-cloning-base';
import { CloneMaterializer } from './CloneMaterializer';

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

function toScalarKey(key: CompositeKeyLike | CompositeKey | string | null | undefined): string {
    if (!key) return '';
    let val: string;
    if (typeof key === 'string') {
        val = key;
    } else if (key instanceof CompositeKey) {
        val = key.ToCompactURLSegment ? key.ToCompactURLSegment() : key.Values();
    } else if (key.KeyValuePairs && key.KeyValuePairs.length > 0) {
        val = String(key.KeyValuePairs[0].Value ?? '');
    } else {
        return '';
    }
    if (val.includes('|')) {
        const firstSegment = val.split('||')[0];
        const parts = firstSegment.split('|');
        return parts.slice(1).join('|');
    }
    return val;
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
    public async Execute(
        plan: ClonePlan,
        contextUser: UserInfo,
        loadedSources?: Map<string, BaseEntity>
    ): Promise<RecordCloneResult> {
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
                } = await materializer.Materialize(plan, contextUser, loadedSources);

                // 4. Attach CloneContext to all staged entities (§10)
                for (const [nodeKey, entity] of stagedEntities.entries()) {
                    const planNode = plan.Nodes.find((n) => (n.NodeKey ?? n.Key) === nodeKey);
                    entity.SetCloneContext({
                        CloneLogID: cloneLogId,
                        SourceEntityName: planNode?.EntityName || entity.EntityInfo.Name,
                        SourceRecordID: toScalarKey(planNode?.SourceKey),
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
                    const prereqSaved = await prereq.Save();
                    if (!prereqSaved) {
                        const errorMsg =
                            prereq.LatestResult?.CompleteMessage ||
                            `Prerequisite clone save failed for entity '${prereq.EntityInfo.Name}'.`;
                        throw new Error(errorMsg);
                    }
                }

                // 5. Atomic Save via root.Save()
                const rootSaved = await rootEntity.Save();
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
                    const sidecarSaved = await sidecar.Save();
                    if (!sidecarSaved) {
                        const errorMsg =
                            sidecar.LatestResult?.CompleteMessage ||
                            `Sidecar clone save failed for entity '${sidecar.EntityInfo.Name}'.`;
                        throw new Error(errorMsg);
                    }
                }

                // 7. Write Provenance Records (§10)
                await this.writeProvenance(plan, cloneLogId, stagedEntities, contextUser, rootEntity, sidecarEntities);

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
     * Writes Record Links and Clone Log provenance records.
     */
    private async writeProvenance(
        plan: ClonePlan,
        cloneLogId: string,
        stagedEntities: Map<string, BaseEntity>,
        contextUser: UserInfo,
        rootEntity: BaseEntity,
        sidecarEntities: BaseEntity[]
    ): Promise<void> {
        const md = this.Provider;

        // A. Record Links (LinkType = 'ClonedFrom')
        const recordLinksInfo = md.EntityByName('Record Links');
        if (recordLinksInfo) {
            for (const [nodeKey, entity] of stagedEntities.entries()) {
                const planNode = plan.Nodes.find((n) => (n.NodeKey ?? n.Key) === nodeKey);
                if (!planNode) continue;

                try {
                    const linkEntity = await md.GetEntityObject<MJRecordLinkEntity>('Record Links', contextUser);
                    linkEntity.NewRecord();
                    linkEntity.LinkType = 'ClonedFrom';
                    linkEntity.SourceEntityID = entity.EntityInfo.ID;
                    linkEntity.SourceRecordID = toScalarKey(entity.PrimaryKey ?? planNode.TargetKey);
                    linkEntity.TargetEntityID = entity.EntityInfo.ID;
                    linkEntity.TargetRecordID = toScalarKey(planNode.SourceKey);
                    linkEntity.Metadata = JSON.stringify({ CloneLogID: cloneLogId });
                    await linkEntity.Save();
                } catch {
                    // Non-fatal provenance logging
                }
            }
        }

        // B. Record Clone Logs
        const cloneLogsInfo = md.EntityByName('Record Clone Logs');
        if (cloneLogsInfo) {
            try {
                const logEntity = await md.GetEntityObject<MJRecordCloneLogEntity>('Record Clone Logs', contextUser);
                logEntity.NewRecord();
                logEntity.ID = cloneLogId;
                logEntity.Status = 'Complete';
                logEntity.InitiatedByUserID = contextUser?.ID ?? '';
                logEntity.RootEntityID = md.EntityByName(plan.RootEntityName ?? '')?.ID ?? '';
                logEntity.RootSourceRecordID = toScalarKey(plan.RootSourceKey) ?? '';
                logEntity.RootTargetRecordID = toScalarKey(rootEntity.PrimaryKey ?? plan.RootTargetKey) ?? null;
                logEntity.PlanHash = plan.PlanHash || plan.Hash;
                logEntity.PlanJSON = JSON.stringify(plan);
                logEntity.CreatedCount = stagedEntities.size + sidecarEntities.length;
                logEntity.ReferencedCount = plan.Nodes.filter((n) => n.Action === 'Reference').length;
                logEntity.SkippedCount = plan.Nodes.filter((n) => n.Action === 'Skip').length;
                logEntity.EndedAt = new Date();
                await logEntity.Save();
            } catch {
                // Non-fatal provenance logging
            }
        }
    }
}
