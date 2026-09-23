/**
 * @file operations.ts
 * Handlers and BaseRemotableOperation subclasses for:
 * - RecordClone.Describe
 * - RecordClone.Plan
 * - RecordClone.Execute
 * - RecordClone.GetLineage
 *
 * @see plans/record-cloning/README.md §11.1, §13.1
 */

import {
    BaseRemotableOperation,
    CompositeKey,
    EntityInfo,
    IMetadataProvider,
    KeyValuePair,
    Metadata,
    RemoteOpServerContext,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import {
    CloneEdgeOverride,
    CloneNodeOverride,
    ClonePlan,
    CloneRequestOptions,
    CloneWarning,
    CompositeKeyLike,
    RecordCloneRequest,
    RecordCloneResult,
} from '@memberjunction/record-cloning-base';
import { ClonePlanner } from './ClonePlanner';
import { CloneExecutor } from './CloneExecutor';

export interface RecordCloneDescribeInput {
    EntityName: string;
    RecordID?: string;
    Key?: CompositeKeyLike | Record<string, unknown> | string;
}

export interface RecordCloneDescribeOutput {
    CanClone: boolean;
    Reason?: string;
    EntityName: string;
    Configured: boolean;
    RelationshipCount: number;
    Policies: Array<{
        RelatedEntityName: string;
        Policy: 'Deep' | 'Shallow' | 'Exclude' | 'Reference';
        DefaultPolicy: 'Deep' | 'Shallow' | 'Exclude' | 'Reference';
        Locked: boolean;
        Description?: string;
    }>;
    EstimatedRecords?: number;
    EstimatedDepth?: number;
}

export interface RecordClonePlanInput {
    EntityName?: string;
    RecordID?: string;
    SourceRecordKey?: CompositeKeyLike | Record<string, unknown> | string;
    Roots?: Array<{ EntityName: string; Key: CompositeKeyLike | Record<string, unknown> | string }>;
    Options?: CloneRequestOptions;
    NodeOverrides?: CloneNodeOverride[];
    EdgeOverrides?: CloneEdgeOverride[];
    ExpectedPlanHash?: string;
}

export interface RecordClonePlanOutput {
    Plan: ClonePlan;
}

export interface RecordCloneRecordMapping {
    EntityName: string;
    SourceKey: string;
    TargetKey: string;
    Depth?: number;
}

export interface RecordCloneSkippedRecord {
    EntityName: string;
    SourceKey: string;
    Reason: string;
}

export interface RecordCloneExecuteInput {
    EntityName?: string;
    RecordID?: string;
    SourceRecordKey?: CompositeKeyLike | Record<string, unknown> | string;
    Roots?: Array<{ EntityName: string; Key: CompositeKeyLike | Record<string, unknown> | string }>;
    Options?: CloneRequestOptions;
    NodeOverrides?: CloneNodeOverride[];
    EdgeOverrides?: CloneEdgeOverride[];
    PlanHash?: string;
    ExpectedPlanHash?: string;
}

export interface RecordCloneExecuteOutput {
    Success: boolean;
    ResultCode: string;
    CloneLogID?: string | null;
    Roots?: RecordCloneRecordMapping[];
    Created?: RecordCloneRecordMapping[];
    Skipped?: RecordCloneSkippedRecord[];
    Counts?: ClonePlan['Counts'];
    Plan?: ClonePlan;
    Warnings: CloneWarning[];
    ErrorMessage?: string;
    RootTargetKey?: string;
    CreatedCount: number;
}

export interface RecordCloneGetLineageInput {
    EntityName: string;
    RecordID?: string;
    Key?: CompositeKeyLike | Record<string, unknown> | string;
    Direction?: 'up' | 'down' | 'both';
}

export interface RecordCloneGetLineageOutput {
    Ancestors: Array<{
        RecordID: string;
        EntityName: string;
        ClonedAt?: string;
        CloneLogID?: string;
    }>;
    Clones: Array<{
        RecordID: string;
        EntityName: string;
        ClonedAt?: string;
        CloneLogID?: string;
    }>;
    TotalClones: number;
}

function parseRecordKey(entity: EntityInfo, rawKey?: unknown, recordId?: string): CompositeKey {
    if (rawKey instanceof CompositeKey) {
        return rawKey;
    }
    if (rawKey && typeof rawKey === 'object') {
        const obj = rawKey as Record<string, unknown>;
        if ('KeyValuePairs' in obj && Array.isArray(obj.KeyValuePairs)) {
            const pairs = obj.KeyValuePairs as Array<{ FieldName?: string; Value?: unknown }>;
            const kvps = pairs
                .filter((p) => typeof p.FieldName === 'string')
                .map((kv) => new KeyValuePair(kv.FieldName, kv.Value));
            if (kvps.length > 0) {
                return new CompositeKey(kvps);
            }
        }
        const ck = new CompositeKey();
        ck.LoadFromEntityInfoAndRecord(entity, obj);
        if (ck.KeyValuePairs.length > 0) {
            return ck;
        }
    }
    const str = (typeof rawKey === 'string' && rawKey.trim().length > 0)
        ? rawKey.trim()
        : (recordId && typeof recordId === 'string' && recordId.trim().length > 0)
            ? recordId.trim()
            : null;

    if (str) {
        const ck = new CompositeKey();
        ck.LoadFromURLSegment(entity, str);
        return ck;
    }

    throw new Error(`Cannot parse RecordID or Key for entity ${entity.Name}.`);
}

function formatKeyToString(key: CompositeKeyLike | CompositeKey | string | null | undefined): string {
    if (!key) {
        return '';
    }
    if (typeof key === 'string') {
        return key;
    }
    if (typeof (key as { ToCompactURLSegment?: () => string }).ToCompactURLSegment === 'function') {
        return (key as { ToCompactURLSegment: () => string }).ToCompactURLSegment();
    }
    if (typeof (key as { ToConcatenatedString?: () => string }).ToConcatenatedString === 'function') {
        return (key as { ToConcatenatedString: () => string }).ToConcatenatedString();
    }
    if (typeof key === 'object' && 'KeyValuePairs' in key && Array.isArray((key as CompositeKeyLike).KeyValuePairs)) {
        const kvps = (key as CompositeKeyLike).KeyValuePairs;
        if (kvps.length === 1) {
            return String(kvps[0].Value ?? '');
        }
        if (kvps.length > 1) {
            const ck = new CompositeKey(kvps.map((p) => new KeyValuePair(p.FieldName, p.Value)));
            return ck.ToCompactURLSegment();
        }
    }
    return String(key);
}

export class RecordCloneOperationsHandler {
    private _provider?: IMetadataProvider;

    public constructor(provider?: IMetadataProvider) {
        this._provider = provider;
    }

    protected get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    public async Describe(
        input: RecordCloneDescribeInput,
        contextUser: UserInfo
    ): Promise<RecordCloneDescribeOutput> {
        const md = this.Provider;
        const entity = md.EntityByName(input.EntityName);
        if (!entity) {
            return {
                CanClone: false,
                Reason: `Entity '${input.EntityName}' not found.`,
                EntityName: input.EntityName,
                Configured: false,
                RelationshipCount: 0,
                Policies: [],
            };
        }

        const perms = entity.GetUserPermisions(contextUser);
        if (!perms.CanCreate) {
            return {
                CanClone: false,
                Reason: `User lacks CanCreate permission on '${input.EntityName}'.`,
                EntityName: input.EntityName,
                Configured: false,
                RelationshipCount: 0,
                Policies: [],
            };
        }

        const config =
            entity.CloneConfig ??
            (entity as unknown as { CloneConfiguration?: import('@memberjunction/core').IEntityCloneConfiguration })
                .CloneConfiguration ??
            null;

        if (config && (config.Enabled === false || config.NotCloneable === true)) {
            return {
                CanClone: false,
                Reason: `Entity '${input.EntityName}' is marked NotCloneable in configuration.`,
                EntityName: input.EntityName,
                Configured: true,
                RelationshipCount: 0,
                Policies: [],
            };
        }

        if (config?.RequiredUserType && contextUser.Type?.trim() !== config.RequiredUserType?.trim()) {
            return {
                CanClone: false,
                Reason: `Cloning entity '${input.EntityName}' requires user type '${config.RequiredUserType}', current user is '${contextUser.Type}'.`,
                EntityName: input.EntityName,
                Configured: true,
                RelationshipCount: 0,
                Policies: [],
            };
        }

        const policies: RecordCloneDescribeOutput['Policies'] = [];
        for (const r of entity.RelatedEntities || []) {
            const relPolicy =
                r.CloneConfig ??
                (r as unknown as { CloneConfiguration?: import('@memberjunction/core').ICloneRelationshipPolicy })
                    .CloneConfiguration ??
                null;
            const relConfig = relPolicy || config?.Relationships?.[r.RelatedEntity];
            const defaultPolicy = (relConfig?.Policy ?? 'Deep') as 'Deep' | 'Shallow' | 'Exclude' | 'Reference';
            policies.push({
                RelatedEntityName: r.RelatedEntity,
                Policy: defaultPolicy,
                DefaultPolicy: defaultPolicy,
                Locked: relConfig?.Locked ?? false,
                Description: r.DisplayName || r.RelatedEntity,
            });
        }

        return {
            CanClone: true,
            EntityName: input.EntityName,
            Configured: !!config,
            RelationshipCount: policies.length,
            Policies: policies,
        };
    }

    public async Plan(
        input: RecordClonePlanInput,
        contextUser: UserInfo
    ): Promise<RecordClonePlanOutput> {
        const entityName = input.EntityName || input.Roots?.[0]?.EntityName;
        if (!entityName) {
            throw new Error(`RecordClonePlanInput must specify EntityName or Roots.`);
        }
        const entity = this.Provider.EntityByName(entityName);
        if (!entity) {
            throw new Error(`Entity '${entityName}' not found`);
        }
        const rawKey = input.SourceRecordKey ?? input.Roots?.[0]?.Key;
        const key = parseRecordKey(entity, rawKey, input.RecordID);
        const planner = new ClonePlanner({ Provider: this.Provider });
        const request: RecordCloneRequest = {
            EntityName: entityName,
            SourceRecordKey: key,
            Roots: [{ EntityName: entityName, Key: key }],
            Options: input.Options,
            NodeOverrides: input.NodeOverrides,
            EdgeOverrides: input.EdgeOverrides,
            ExpectedPlanHash: input.ExpectedPlanHash,
        };
        const plan = await planner.Plan(request, contextUser);
        return { Plan: plan };
    }

    public async Execute(
        input: RecordCloneExecuteInput,
        contextUser: UserInfo
    ): Promise<RecordCloneExecuteOutput> {
        const entityName = input.EntityName || input.Roots?.[0]?.EntityName;
        if (!entityName) {
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                ErrorMessage: 'RecordCloneExecuteInput must specify EntityName or Roots.',
                CloneLogID: null,
                Roots: [],
                Created: [],
                Skipped: [],
                Counts: { ByEntity: {}, Create: 0, Total: 0 },
                Warnings: [],
                CreatedCount: 0,
            };
        }
        const entity = this.Provider.EntityByName(entityName);
        if (!entity) {
            return {
                Success: false,
                ResultCode: 'ENTITY_NOT_FOUND',
                ErrorMessage: `Entity '${entityName}' not found`,
                CloneLogID: null,
                Roots: [],
                Created: [],
                Skipped: [],
                Counts: { ByEntity: {}, Create: 0, Total: 0 },
                Warnings: [],
                CreatedCount: 0,
            };
        }
        const rawKey = input.SourceRecordKey ?? input.Roots?.[0]?.Key;
        const key = parseRecordKey(entity, rawKey, input.RecordID);
        const planner = new ClonePlanner({ Provider: this.Provider });
        const executor = new CloneExecutor({ Provider: this.Provider });

        const request: RecordCloneRequest = {
            EntityName: entityName,
            SourceRecordKey: key,
            Roots: [{ EntityName: entityName, Key: key }],
            Options: input.Options,
            NodeOverrides: input.NodeOverrides,
            EdgeOverrides: input.EdgeOverrides,
            ExpectedPlanHash: input.ExpectedPlanHash ?? input.PlanHash,
        };

        const plan = await planner.Plan(request, contextUser);

        const expectedHash = input.ExpectedPlanHash ?? input.PlanHash;
        if (expectedHash && (plan.PlanHash || plan.Hash) !== expectedHash) {
            return {
                Success: false,
                ResultCode: 'PLAN_HASH_MISMATCH',
                ErrorMessage: 'Plan hash mismatch between preview and execution.',
                CloneLogID: null,
                Roots: [],
                Created: [],
                Skipped: [],
                Counts: plan.Counts,
                Warnings: [
                    ...plan.Warnings,
                    {
                        Code: 'PLAN_CHANGED',
                        Severity: 'Error',
                        Message: 'Plan hash mismatch between preview and execution.',
                    },
                ],
                Plan: plan,
                CreatedCount: 0,
            };
        }

        const result: RecordCloneResult = await executor.Execute(plan, contextUser);
        const rootTarget = result.Roots?.[0]?.TargetKey;
        const rootTargetStr = formatKeyToString(rootTarget) || plan.RootTargetKey || undefined;

        const roots: RecordCloneRecordMapping[] = result.Roots?.map((r) => ({
            EntityName: r.EntityName,
            SourceKey: formatKeyToString(r.SourceKey),
            TargetKey: formatKeyToString(r.TargetKey),
        })) ?? [
            {
                EntityName: plan.RootEntityName ?? entityName,
                SourceKey: plan.RootSourceKey ?? '',
                TargetKey: plan.RootTargetKey ?? '',
            },
        ];

        const created: RecordCloneRecordMapping[] = result.Created?.map((c) => ({
            EntityName: c.EntityName,
            SourceKey: formatKeyToString(c.SourceKey),
            TargetKey: formatKeyToString(c.TargetKey),
            Depth: c.Depth,
        })) ?? plan.Nodes.filter((n) => n.Action === 'Create').map((n) => ({
            EntityName: n.EntityName,
            SourceKey: typeof n.SourceKey === 'string' ? n.SourceKey : '',
            TargetKey: typeof n.TargetKey === 'string' ? n.TargetKey : '',
            Depth: n.Depth ?? 0,
        }));

        const skipped: RecordCloneSkippedRecord[] = result.Skipped?.map((s) => ({
            EntityName: s.EntityName,
            SourceKey: formatKeyToString(s.SourceKey),
            Reason: s.Reason,
        })) ?? plan.Nodes.filter((n) => n.Action === 'Skip').map((n) => ({
            EntityName: n.EntityName,
            SourceKey: typeof n.SourceKey === 'string' ? n.SourceKey : '',
            Reason: 'Skipped by policy',
        }));

        return {
            Success: result.Success,
            ResultCode: result.ResultCode ?? (result.Success ? 'SUCCESS' : 'EXECUTION_ERROR'),
            CloneLogID: result.CloneLogID ?? null,
            Roots: roots,
            Created: created,
            Skipped: skipped,
            Counts: plan.Counts,
            Plan: plan,
            RootTargetKey: rootTargetStr,
            CreatedCount: created.length,
            Warnings: result.Warnings ?? plan.Warnings ?? [],
            ErrorMessage: result.ErrorMessage,
        };
    }

    public async GetLineage(
        input: RecordCloneGetLineageInput,
        contextUser: UserInfo
    ): Promise<RecordCloneGetLineageOutput> {
        const md = this.Provider;
        const entity = md.EntityByName(input.EntityName);
        if (!entity) {
            throw new Error(`Entity '${input.EntityName}' not found.`);
        }

        const rawKey = input.Key ?? input.RecordID;
        const key = parseRecordKey(entity, rawKey, input.RecordID);
        const recordId = key.Values() || key.ToConcatenatedString();

        const ancestors: RecordCloneGetLineageOutput['Ancestors'] = [];
        const clones: RecordCloneGetLineageOutput['Clones'] = [];
        const rv = new RunView();

        const direction = input.Direction ?? 'both';

        // 1. Upwards: source records (where SourceRecordID = recordId and SourceEntityID = entity.ID)
        if (direction === 'up' || direction === 'both') {
            const res = await rv.RunView(
                {
                    EntityName: 'Record Links',
                    ExtraFilter: `SourceEntityID = '${entity.ID}' AND SourceRecordID = '${recordId}' AND LinkType = 'ClonedFrom'`,
                },
                contextUser
            );

            if (res.Success && res.Results) {
                for (const row of res.Results) {
                    const rowRecord = row as Record<string, unknown>;
                    const targetEntity = md.Entities.find((e) => e.ID === rowRecord.TargetEntityID);
                    ancestors.push({
                        RecordID: String(rowRecord.TargetRecordID),
                        EntityName: targetEntity?.Name || 'Unknown',
                        ClonedAt: String(rowRecord.__mj_CreatedAt || ''),
                        CloneLogID: rowRecord.CloneLogID ? String(rowRecord.CloneLogID) : undefined,
                    });
                }
            }
        }

        // 2. Downwards: child clones (where TargetRecordID = recordId and TargetEntityID = entity.ID)
        if (direction === 'down' || direction === 'both') {
            const res = await rv.RunView(
                {
                    EntityName: 'Record Links',
                    ExtraFilter: `TargetEntityID = '${entity.ID}' AND TargetRecordID = '${recordId}' AND LinkType = 'ClonedFrom'`,
                },
                contextUser
            );

            if (res.Success && res.Results) {
                for (const row of res.Results) {
                    const rowRecord = row as Record<string, unknown>;
                    const sourceEntity = md.Entities.find((e) => e.ID === rowRecord.SourceEntityID);
                    clones.push({
                        RecordID: String(rowRecord.SourceRecordID),
                        EntityName: sourceEntity?.Name || 'Unknown',
                        ClonedAt: String(rowRecord.__mj_CreatedAt || ''),
                        CloneLogID: rowRecord.CloneLogID ? String(rowRecord.CloneLogID) : undefined,
                    });
                }
            }
        }

        return {
            Ancestors: ancestors,
            Clones: clones,
            TotalClones: clones.length,
        };
    }
}

// ---------------------------------------------------------------------------
// Server Remote Operation Subclasses
// ---------------------------------------------------------------------------

@RegisterClass(BaseRemotableOperation, 'RecordClone.Describe')
export class RecordCloneDescribeServerOperation extends BaseRemotableOperation<
    RecordCloneDescribeInput,
    RecordCloneDescribeOutput
> {
    public readonly OperationKey = 'RecordClone.Describe';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'recordclone:read';
    public readonly RequiresSystemUser = false;

    protected async InternalExecute(
        input: RecordCloneDescribeInput,
        provider: IMetadataProvider,
        user: UserInfo,
        _context: RemoteOpServerContext
    ): Promise<RecordCloneDescribeOutput> {
        const handler = new RecordCloneOperationsHandler(provider);
        return handler.Describe(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'RecordClone.Plan')
export class RecordClonePlanServerOperation extends BaseRemotableOperation<
    RecordClonePlanInput,
    RecordClonePlanOutput
> {
    public readonly OperationKey = 'RecordClone.Plan';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'recordclone:read';
    public readonly RequiresSystemUser = false;

    protected async InternalExecute(
        input: RecordClonePlanInput,
        provider: IMetadataProvider,
        user: UserInfo,
        _context: RemoteOpServerContext
    ): Promise<RecordClonePlanOutput> {
        const handler = new RecordCloneOperationsHandler(provider);
        return handler.Plan(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'RecordClone.Execute')
export class RecordCloneExecuteServerOperation extends BaseRemotableOperation<
    RecordCloneExecuteInput,
    RecordCloneExecuteOutput
> {
    public readonly OperationKey = 'RecordClone.Execute';
    public readonly ExecutionMode = 'LongRunning' as const;
    public readonly RequiredScope = 'recordclone:execute';
    public readonly RequiresSystemUser = false;

    protected async InternalExecute(
        input: RecordCloneExecuteInput,
        provider: IMetadataProvider,
        user: UserInfo,
        _context: RemoteOpServerContext
    ): Promise<RecordCloneExecuteOutput> {
        const handler = new RecordCloneOperationsHandler(provider);
        return handler.Execute(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'RecordClone.GetLineage')
export class RecordCloneGetLineageServerOperation extends BaseRemotableOperation<
    RecordCloneGetLineageInput,
    RecordCloneGetLineageOutput
> {
    public readonly OperationKey = 'RecordClone.GetLineage';
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'recordclone:read';
    public readonly RequiresSystemUser = false;

    protected async InternalExecute(
        input: RecordCloneGetLineageInput,
        provider: IMetadataProvider,
        user: UserInfo,
        _context: RemoteOpServerContext
    ): Promise<RecordCloneGetLineageOutput> {
        const handler = new RecordCloneOperationsHandler(provider);
        return handler.GetLineage(input, user);
    }
}

/** Tree-shaking anchor — call from a server bootstrap to retain these operation registrations. */
export function LoadRecordCloneOperations(): void {
    // intentionally empty
}
