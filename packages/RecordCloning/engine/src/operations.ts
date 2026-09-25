/**
 * @file operations.ts
 * Server implementations of the four RecordClone remote operations:
 * - RecordClone.Describe
 * - RecordClone.Plan
 * - RecordClone.Execute
 * - RecordClone.GetLineage
 *
 * Each server class extends the operation class CodeGen emits into `@memberjunction/core-entities`
 * from the `MJ: Remote Operations` metadata, and returns exactly the input/output types defined in
 * `metadata/remote-operations/types/record-clone-*.ts`. Those types are the contract clients see;
 * the engine's richer internal types (`ClonePlan`, `RecordCloneResult`) are mapped onto them here.
 *
 * @see plans/record-cloning/README.md §9, §11.1
 */

import {
    BaseRemotableOperation,
    CompositeKey,
    EntityInfo,
    IMetadataProvider,
    KeyValuePair,
    Metadata,
    RunView,
    UserInfo,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
    RecordCloneDescribeOperation,
    RecordClonePlanOperation,
    RecordCloneExecuteOperation,
    RecordCloneGetLineageOperation,
    type RecordCloneKey,
    type RecordCloneDescribeInput,
    type RecordCloneDescribeOutput,
    type RecordCloneDescribeRelationship,
    type RecordClonePlanInput,
    type RecordClonePlanOutput,
    type RecordClonePlanDetails,
    type RecordCloneExecuteInput,
    type RecordCloneExecuteOutput,
    type RecordCloneRecordMapping,
    type RecordCloneGetLineageInput,
    type RecordCloneGetLineageOutput,
    type RecordCloneLineageItem,
} from '@memberjunction/core-entities';
import { MaskSensitiveFieldChange, NormalizeClonePresets } from '@memberjunction/record-cloning-base';
import type {
    ClonePlan,
    CloneRequestOptions,
    CompositeKeyLike,
    RecordCloneRequest,
    RecordCloneResult,
} from '@memberjunction/record-cloning-base';
import { SqlEquals } from '@memberjunction/record-graph';
import { ClonePlanner } from './ClonePlanner';
import { CloneExecutor } from './CloneExecutor';
import { CloneAuthorizer } from './CloneAuthorization';
import { KeyFromPairs, ToRecordKeyString } from './CloneKeys';

type PlanValue = string | number | boolean | null;

/** Builds a CompositeKey from a wire key, keeping every primary key column. */
function toCompositeKey(entity: EntityInfo, key: RecordCloneKey | undefined): CompositeKey {
    const pairs = key?.KeyValuePairs?.filter((p) => typeof p.FieldName === 'string' && p.FieldName.length > 0) ?? [];
    if (pairs.length === 0) {
        throw new Error(`A record key with at least one field is required for entity '${entity.Name}'.`);
    }
    return KeyFromPairs(pairs.map((p) => new KeyValuePair(p.FieldName, p.Value)));
}

/** Plan values are free-form in the engine; the contract carries primitives only. */
function toPlanValue(value: unknown): PlanValue {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    return JSON.stringify(value);
}

/** Maps the engine's plan onto the `RecordClonePlanDetails` contract. */
export function ToPlanDetails(plan: ClonePlan): RecordClonePlanDetails {
    return {
        PlanVersion: 1,
        Hash: plan.Hash || plan.PlanHash || '',
        Roots: plan.Roots ?? [],
        Nodes: plan.Nodes.map((n) => ({
            Key: n.Key ?? n.NodeKey ?? '',
            EntityName: n.EntityName,
            SourceKey: ToRecordKeyString(n.SourceKey),
            TargetKey: n.TargetKey ? ToRecordKeyString(n.TargetKey) : null,
            Action: n.Action,
            Reason: n.Reason,
            Depth: n.Depth,
            ParentKey: n.ParentKey,
            DisplayName: n.DisplayName,
            IsSubtypeRow: n.IsSubtypeRow,
            // Encrypted values never leave the server; the Plan output is what the browser sees.
            FieldChanges: (n.FieldChanges ?? []).map(MaskSensitiveFieldChange).map((fc) => ({
                Field: fc.Field,
                Kind: fc.Kind,
                OldValue: toPlanValue(fc.OldValue),
                NewValue: toPlanValue(fc.NewValue),
                Reason: fc.Reason ?? '',
            })),
            Warnings: n.Warnings ?? [],
            Route: n.Route,
        })),
        Edges: plan.Edges.map((e) => ({
            FromKey: e.FromKey,
            ToKey: e.ToKey,
            Kind: e.Kind,
            RelatedEntityName: e.RelatedEntityName,
            JoinField: e.JoinField,
            RelationshipID: e.RelationshipID,
            CollectionName: e.CollectionName,
            IsSoftLink: e.IsSoftLink,
            Policy: e.Policy,
            Locked: e.Locked,
            PolicySource: e.PolicySource,
        })),
        Counts: plan.Counts,
        Warnings: plan.Warnings,
        Blocked: plan.Blocked,
        EffectiveOptions: plan.EffectiveOptions,
    };
}

/** The empty-result shape every refused Execute returns. */
function refusedExecute(
    resultCode: RecordCloneExecuteOutput['ResultCode'],
    message: string,
    plan?: ClonePlan
): RecordCloneExecuteOutput {
    return {
        Success: false,
        ResultCode: resultCode,
        ErrorMessage: message,
        CloneLogID: null,
        Roots: [],
        Created: [],
        Skipped: [],
        Counts: plan?.Counts ?? { ByEntity: {}, Create: 0, Total: 0 },
        Warnings: plan?.Warnings ?? [],
        Plan: plan ? ToPlanDetails(plan) : undefined,
    };
}

/** Reads the clone log ID the executor stores in a Record Link's `Metadata` JSON. */
function cloneLogIdFromLinkMetadata(metadata: unknown): string | undefined {
    if (typeof metadata !== 'string' || metadata.length === 0) return undefined;
    try {
        const parsed = JSON.parse(metadata) as { CloneLogID?: unknown };
        return typeof parsed.CloneLogID === 'string' ? parsed.CloneLogID : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The logic behind the four operations. Also usable directly on the server (see
 * `RecordCloneEngine`); every method takes the acting user and uses the handler's provider.
 */
export class RecordCloneOperationsHandler {
    private _provider?: IMetadataProvider;

    public constructor(provider?: IMetadataProvider) {
        this._provider = provider;
    }

    protected get Provider(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /**
     * Whether `user` may clone records of the entity, and what the UI may offer. Refuses when the
     * entity is missing, not enabled as a clone root, lacks CanCreate for the user, needs another
     * user type, or the user lacks the entity's clone authorization.
     */
    public async Describe(input: RecordCloneDescribeInput, contextUser: UserInfo): Promise<RecordCloneDescribeOutput> {
        const md = this.Provider;
        const entity = md.EntityByName(input.EntityName);
        if (!entity) {
            return { CanClone: false, Reason: `Entity '${input.EntityName}' not found.`, Relationships: [] };
        }

        const config = entity.CloneConfig;
        const authorizer = new CloneAuthorizer(md);
        const authorization = authorizer.CanCloneEntity(entity, contextUser);
        const base: Pick<RecordCloneDescribeOutput, 'Authorization' | 'CanFireHooks' | 'CanOverrideScope' | 'Relationships'> = {
            Authorization: authorization,
            CanFireHooks: authorizer.CanFireHooks(contextUser),
            CanOverrideScope: authorizer.CanOverrideScope(contextUser),
            Relationships: [],
        };

        if (config?.Enabled !== true || config.NotCloneable === true) {
            return {
                ...base,
                CanClone: false,
                Reason: config?.NotCloneableReason || `Cloning is not enabled for '${entity.Name}'.`,
            };
        }
        if (!entity.GetUserPermisions(contextUser).CanCreate) {
            return { ...base, CanClone: false, Reason: `You don't have permission to create '${entity.Name}' records.` };
        }
        if (config.RequiredUserType && contextUser.Type?.trim() !== config.RequiredUserType.trim()) {
            return {
                ...base,
                CanClone: false,
                Reason: `Cloning '${entity.Name}' requires user type '${config.RequiredUserType}'.`,
            };
        }
        if (!authorization.Granted) {
            return { ...base, CanClone: false, Reason: `Cloning '${entity.Name}' requires the '${authorization.Name}' authorization.` };
        }

        const relationships: RecordCloneDescribeRelationship[] = (entity.RelatedEntities ?? []).map((r) => {
            const policy = r.CloneConfig ?? config.Relationships?.[r.RelatedEntity];
            return {
                Name: r.DisplayName || r.RelatedEntity,
                RelatedEntity: r.RelatedEntity,
                DefaultPolicy: policy?.Policy ?? 'Deep',
                Locked: policy?.Locked ?? false,
            };
        });

        return {
            ...base,
            CanClone: true,
            Presets: NormalizeClonePresets(config.Presets).map((p) => p.Key),
            UserEditable: config.UserEditable ?? 'all',
            Relationships: relationships,
        };
    }

    /** Computes a dry-run plan. Writes nothing. */
    public async Plan(input: RecordClonePlanInput, contextUser: UserInfo): Promise<RecordClonePlanOutput> {
        const { request } = this.buildRequest(input);
        const plan = await new ClonePlanner({ Provider: this.Provider }).Plan(request, contextUser);
        return { Plan: ToPlanDetails(plan) };
    }

    /**
     * Re-plans, refuses with `PLAN_CHANGED` when the plan differs from the reviewed one, then
     * executes. A blocked plan returns `FORBIDDEN` when an authorization caused it, else `BLOCKED`.
     */
    public async Execute(input: RecordCloneExecuteInput, contextUser: UserInfo): Promise<RecordCloneExecuteOutput> {
        let built: { request: RecordCloneRequest; entityName: string };
        try {
            built = this.buildRequest(input);
        } catch (err) {
            return refusedExecute('EXECUTION_ERROR', err instanceof Error ? err.message : String(err));
        }

        const plan = await new ClonePlanner({ Provider: this.Provider }).Plan(built.request, contextUser);

        // Blocked first: a plan the user can no longer run is FORBIDDEN/BLOCKED, not merely changed.
        if (plan.Blocked) {
            const forbidden = plan.Warnings.some((w) => w.Code === 'FORBIDDEN');
            const reasons = plan.Warnings.filter((w) => w.Severity === 'Error').map((w) => w.Message).join('; ');
            return refusedExecute(forbidden ? 'FORBIDDEN' : 'BLOCKED', reasons || 'The clone plan is blocked.', plan);
        }

        if (input.ExpectedPlanHash && (plan.Hash || plan.PlanHash) !== input.ExpectedPlanHash) {
            const changed = refusedExecute('PLAN_CHANGED', 'The records changed since the plan was reviewed. Review the new plan and confirm again.', plan);
            changed.Warnings = [
                ...changed.Warnings,
                { Code: 'PLAN_CHANGED', Severity: 'Error', Message: 'Plan hash mismatch between review and execution.' },
            ];
            return changed;
        }
        const result: RecordCloneResult = await new CloneExecutor({ Provider: this.Provider }).Execute(plan, contextUser);
        const toMapping = (m: { EntityName: string; SourceKey: CompositeKeyLike; TargetKey: CompositeKeyLike; Depth?: number }): RecordCloneRecordMapping => ({
            EntityName: m.EntityName,
            SourceKey: ToRecordKeyString(m.SourceKey),
            TargetKey: ToRecordKeyString(m.TargetKey),
            Depth: m.Depth,
        });

        return {
            Success: result.Success,
            ResultCode: result.ResultCode ?? (result.Success ? 'SUCCESS' : 'EXECUTION_ERROR'),
            CloneLogID: result.CloneLogID ?? null,
            Roots: (result.Roots ?? []).map(toMapping),
            Created: (result.Created ?? []).map(toMapping),
            Skipped: (result.Skipped ?? []).map((s) => ({ EntityName: s.EntityName, SourceKey: ToRecordKeyString(s.SourceKey), Reason: s.Reason })),
            Counts: result.Counts ?? plan.Counts,
            Warnings: result.Warnings ?? plan.Warnings,
            Plan: result.Success ? undefined : ToPlanDetails(plan),
            ErrorMessage: result.ErrorMessage,
        };
    }

    /**
     * Ancestors (records this one was cloned from) and direct clones, read from `MJ: Record Links`
     * rows of type `ClonedFrom`, where Source is the clone and Target is its original.
     */
    public async GetLineage(input: RecordCloneGetLineageInput, contextUser: UserInfo): Promise<RecordCloneGetLineageOutput> {
        const md = this.Provider;
        const entity = md.EntityByName(input.EntityName);
        if (!entity) {
            throw new Error(`Entity '${input.EntityName}' not found.`);
        }

        const recordId = ToRecordKeyString(toCompositeKey(entity, input.Key));
        const direction = input.Direction ?? 'both';
        const rv = RunView.FromMetadataProvider(md);

        const load = async (side: 'Source' | 'Target'): Promise<Array<Record<string, unknown>>> => {
            const res = await rv.RunView<Record<string, unknown>>(
                {
                    EntityName: 'MJ: Record Links',
                    ExtraFilter: [
                        SqlEquals(`${side}EntityID`, entity.ID),
                        SqlEquals(`${side}RecordID`, recordId),
                        SqlEquals('LinkType', 'ClonedFrom'),
                    ].join(' AND '),
                    ResultType: 'simple',
                },
                contextUser
            );
            return res.Success ? res.Results ?? [] : [];
        };

        const toItem = (row: Record<string, unknown>, side: 'Source' | 'Target'): RecordCloneLineageItem => ({
            RecordID: String(row[`${side}RecordID`]),
            EntityName: md.Entities.find((e) => UUIDsEqual(e.ID, String(row[`${side}EntityID`])))?.Name ?? 'Unknown',
            ClonedAt: row.__mj_CreatedAt ? String(row.__mj_CreatedAt) : undefined,
            CloneLogID: cloneLogIdFromLinkMetadata(row.Metadata),
        });

        const ancestors = direction === 'down' ? [] : (await load('Source')).map((row) => toItem(row, 'Target'));
        const clones = direction === 'up' ? [] : (await load('Target')).map((row) => toItem(row, 'Source'));

        return { Ancestors: ancestors, Clones: clones, TotalClones: clones.length };
    }

    /** Turns a Plan/Execute input into the engine's request. */
    private buildRequest(input: RecordClonePlanInput | RecordCloneExecuteInput): { request: RecordCloneRequest; entityName: string } {
        const entityName = input.EntityName || input.Roots?.[0]?.EntityName;
        if (!entityName) {
            throw new Error('EntityName or Roots is required.');
        }
        const entity = this.Provider.EntityByName(entityName);
        if (!entity) {
            throw new Error(`Entity '${entityName}' not found.`);
        }
        const key = toCompositeKey(entity, input.SourceRecordKey ?? input.Roots?.[0]?.Key);
        return {
            entityName,
            request: {
                EntityName: entityName,
                SourceRecordKey: key,
                Roots: [{ EntityName: entityName, Key: key }],
                Options: input.Options as CloneRequestOptions | undefined,
                NodeOverrides: input.NodeOverrides,
                EdgeOverrides: input.EdgeOverrides,
                ExpectedPlanHash: input.ExpectedPlanHash,
            },
        };
    }
}

// ---------------------------------------------------------------------------
// Server remote operations (extend the CodeGen'd client classes)
// ---------------------------------------------------------------------------

@RegisterClass(BaseRemotableOperation, 'RecordClone.Describe')
export class RecordCloneDescribeServerOperation extends RecordCloneDescribeOperation {
    protected async InternalExecute(input: RecordCloneDescribeInput, provider: IMetadataProvider, user: UserInfo): Promise<RecordCloneDescribeOutput> {
        return new RecordCloneOperationsHandler(provider).Describe(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'RecordClone.Plan')
export class RecordClonePlanServerOperation extends RecordClonePlanOperation {
    protected async InternalExecute(input: RecordClonePlanInput, provider: IMetadataProvider, user: UserInfo): Promise<RecordClonePlanOutput> {
        return new RecordCloneOperationsHandler(provider).Plan(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'RecordClone.Execute')
export class RecordCloneExecuteServerOperation extends RecordCloneExecuteOperation {
    protected async InternalExecute(input: RecordCloneExecuteInput, provider: IMetadataProvider, user: UserInfo): Promise<RecordCloneExecuteOutput> {
        return new RecordCloneOperationsHandler(provider).Execute(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'RecordClone.GetLineage')
export class RecordCloneGetLineageServerOperation extends RecordCloneGetLineageOperation {
    protected async InternalExecute(input: RecordCloneGetLineageInput, provider: IMetadataProvider, user: UserInfo): Promise<RecordCloneGetLineageOutput> {
        return new RecordCloneOperationsHandler(provider).GetLineage(input, user);
    }
}

/** Tree-shaking anchor — call from a server bootstrap to retain these operation registrations. */
export function LoadRecordCloneOperations(): void {
    // intentionally empty
}
