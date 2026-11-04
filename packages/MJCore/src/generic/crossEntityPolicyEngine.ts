/**
 * @fileoverview Batch-Aware Cross-Entity Policy Engine (`CrossEntityPolicyEngine`).
 *
 * Enforces cross-record invariants across `Save()`, `Delete()`, `MJ.SaveEntityGraph`, and
 * `TransactionGroupBase.Submit()` without incurring `O(N)` per-row parent `RunView` queries:
 *
 * 1. **Transaction-Epoch Scoped Memoization + Promise Coalescing**:
 *    - When a provider has an active transaction (`provider.TransactionScopeCacheKey !== null`),
 *      all `CrossEntityEvaluationScope.GetOrLoad(namespace, partitionKey, loader)` calls within that
 *      transaction share an in-flight `Promise` cache—collapsing 200 sequential or concurrent child
 *      saves referencing the same parent into **1 single parent query**.
 *    - Outside an active transaction (`TransactionScopeCacheKey === null`), each evaluation creates
 *      an ephemeral scope discarded immediately when the call completes so stale snapshots never leak.
 * 2. **Intra-Transaction Mutation Invalidation & Settle Cleanup**:
 *    - Saving or deleting a parent record inside an open transaction calls
 *      {@link CrossEntityPolicyEngine.NotifyEntityMutated}, immediately evicting cached snapshots for
 *      that `(EntityName, PrimaryKey)` pair so subsequent writes in the same transaction observe the
 *      updated parent state.
 *    - Transaction commit/rollback calls `ClearProviderScope(provider)` via `BumpTransactionEpoch()`.
 * 3. **Built-In Declarative `ParentStateLock` + Programmatic `ICrossEntityPolicy` (`EvaluateBatch`)**:
 *    - Entities can declare parent-status write locks in `EntityInfo.Settings` (`'CrossEntityPolicies'`)
 *      or `IEntityConfiguration.CrossEntityPolicies`, automatically batching `ID IN (...)` parent
 *      queries in `PreEvaluateBatch`.
 *
 * @module @memberjunction/core
 */

import { BaseSingleton, NormalizeUUID, SafeJSONParse } from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';
import type { SaveContext } from './databaseProviderBase';
import type { EntityInfo } from './entityInfo';
import { ServerOperationScopeManager, type EntityWriteOperation } from './entityLifecyclePolicy';
import type { IMetadataProvider, IRunViewProvider } from './interfaces';
import { LogError } from './logging';
import type { UserInfo } from './securityInfo';

export type CrossEntityCachedValue = object | string | number | boolean | null;

export interface CrossEntityPolicyVerdict {
    readonly Allowed: boolean;
    readonly ErrorMessage?: string;
    readonly FieldName?: string;
}

export interface CrossEntityEvaluationScope {
    readonly ScopeId: string;
    readonly Provider: IMetadataProvider;
    readonly ContextUser?: UserInfo;
    GetOrLoad<TValue extends CrossEntityCachedValue>(
        cacheNamespace: string,
        partitionKey: string,
        loader: () => Promise<TValue>,
    ): Promise<TValue>;
    Prime<TValue extends CrossEntityCachedValue>(
        cacheNamespace: string,
        partitionKey: string,
        value: TValue,
    ): void;
    Invalidate(cacheNamespace: string, partitionKey?: string): void;
    InvalidateNamespacePrefix(namespacePrefix: string, partitionKey?: string): void;
}

export interface CrossEntityPolicyItemContext {
    readonly Entity: BaseEntity;
    readonly Operation: EntityWriteOperation;
    readonly Scope: CrossEntityEvaluationScope;
    readonly SaveContext?: SaveContext;
}

export interface CrossEntityBatchItem {
    readonly Entity: BaseEntity;
    readonly Operation: EntityWriteOperation;
}

export interface ICrossEntityPolicy {
    readonly PolicyKey: string;
    readonly TargetEntityNames: ReadonlyArray<string>;
    readonly Priority?: number;
    EvaluateBeforeSave?(ctx: CrossEntityPolicyItemContext): Promise<CrossEntityPolicyVerdict>;
    EvaluateBeforeDelete?(ctx: CrossEntityPolicyItemContext): Promise<CrossEntityPolicyVerdict>;
    /**
     * Optional batch pre-evaluation / cache pre-warming hook invoked by {@link CrossEntityPolicyEngine.PreEvaluateBatch}
     * before executing a multi-entity graph save or transaction group. Implementations can issue a single
     * bulk `RunView` for all items and either return per-entity verdicts or `scope.Prime(...)` snapshots.
     */
    EvaluateBatch?(
        items: ReadonlyArray<CrossEntityBatchItem>,
        scope: CrossEntityEvaluationScope,
    ): Promise<Map<BaseEntity, CrossEntityPolicyVerdict> | void>;
}

/**
 * Declarative cross-entity policy locking child creates/updates/deletes based on a parent record's status.
 * Configured in `EntityInfo.Settings` (`'CrossEntityPolicies'`) or `IEntityConfiguration.CrossEntityPolicies`.
 */
export interface IDeclarativeParentStateLockPolicy {
    kind?: 'ParentStateLock';
    policyKey?: string;
    /** Foreign-key column on THIS child entity (e.g. `'OrderHeaderID'`, `'JournalEntryID'`, `'ElectionID'`). */
    foreignKeyField: string;
    /** Target parent entity name (e.g. `'Orders'`, `'Journal Entries'`, `'Elections'`). */
    parentEntityName: string;
    /** Primary-key column on the parent entity. Defaults to `'ID'`. */
    parentKeyField?: string;
    /** Status column on the parent entity (e.g. `'Status'`). */
    parentStatusField: string;
    /** If specified, child writes are permitted ONLY when the parent's status is in this list. */
    allowedParentStates?: string[];
    /** If specified, child writes are refused when the parent's status is in this list. */
    forbiddenParentStates?: string[];
    /** Which child operations this lock governs. Defaults to `['Create', 'Update', 'Delete']`. */
    operations?: EntityWriteOperation[];
    /** Default `true`: skip parent lookup when `foreignKeyField` is null/empty. Set `false` to refuse orphans. */
    allowOrphanWhenForeignKeyNull?: boolean;
    /** Server operation keys (via {@link ServerOperationScopeManager}) exempted from this parent lock. */
    exemptOperations?: string[];
    /** Optional custom refusal message. */
    errorMessage?: string;
}

export interface ITransactionScopeCacheProvider {
    readonly TransactionScopeCacheKey?: string | null;
}

interface ParentStatusSnapshot {
    readonly exists: boolean;
    readonly status: string;
}

class DefaultCrossEntityEvaluationScope implements CrossEntityEvaluationScope {
    private readonly _entries = new Map<string, Promise<CrossEntityCachedValue>>();
    private readonly _preEvaluatedEntities = new Map<BaseEntity, EntityWriteOperation>();

    constructor(
        public readonly ScopeId: string,
        public readonly Provider: IMetadataProvider,
        public readonly ContextUser?: UserInfo,
    ) {}

    public MarkPreEvaluated(entity: BaseEntity, operation: EntityWriteOperation): void {
        this._preEvaluatedEntities.set(entity, operation);
    }

    public IsPreEvaluated(entity: BaseEntity, operation: EntityWriteOperation): boolean {
        return this._preEvaluatedEntities.get(entity) === operation;
    }

    public ClearPreEvaluated(): void {
        this._preEvaluatedEntities.clear();
    }

    public GetOrLoad<TValue extends CrossEntityCachedValue>(
        cacheNamespace: string,
        partitionKey: string,
        loader: () => Promise<TValue>,
    ): Promise<TValue> {
        const key = this.composeKey(cacheNamespace, partitionKey);
        const existing = this._entries.get(key);
        if (existing !== undefined) {
            return existing as Promise<TValue>;
        }
        const inFlight = loader().catch((err: Error) => {
            if (this._entries.get(key) === inFlight) {
                this._entries.delete(key);
            }
            throw err;
        });
        this._entries.set(key, inFlight);
        return inFlight;
    }

    public Prime<TValue extends CrossEntityCachedValue>(
        cacheNamespace: string,
        partitionKey: string,
        value: TValue,
    ): void {
        const key = this.composeKey(cacheNamespace, partitionKey);
        this._entries.set(key, Promise.resolve(value));
    }

    public Invalidate(cacheNamespace: string, partitionKey?: string): void {
        this._preEvaluatedEntities.clear();
        const normalizedNs = cacheNamespace.trim().toLowerCase();
        if (partitionKey !== undefined) {
            this._entries.delete(this.composeKey(normalizedNs, partitionKey));
            return;
        }
        const prefix = `${normalizedNs}::`;
        for (const key of Array.from(this._entries.keys())) {
            if (key.startsWith(prefix)) {
                this._entries.delete(key);
            }
        }
    }

    public InvalidateNamespacePrefix(namespacePrefix: string, partitionKey?: string): void {
        this._preEvaluatedEntities.clear();
        const normalizedPrefix = namespacePrefix.trim().toLowerCase();
        const normalizedSuffix =
            partitionKey !== undefined ? `::${partitionKey.trim().toLowerCase()}` : null;
        for (const key of Array.from(this._entries.keys())) {
            if (!key.startsWith(normalizedPrefix)) {
                continue;
            }
            if (normalizedSuffix === null || key.endsWith(normalizedSuffix)) {
                this._entries.delete(key);
            }
        }
    }

    private composeKey(cacheNamespace: string, partitionKey: string): string {
        return `${cacheNamespace.trim().toLowerCase()}::${partitionKey.trim().toLowerCase()}`;
    }
}

interface CachedDeclarativePoliciesEntry {
    readonly signature: string;
    readonly policies: ReadonlyArray<IDeclarativeParentStateLockPolicy>;
}

const SAFE_UUID_OR_ALNUM_KEY_REGEX = /^[A-Za-z0-9_.:-]+$/;
const BATCH_CHUNK_SIZE = 500;

/**
 * Process-wide singleton managing declarative and programmatic cross-entity save/delete policies
 * with transaction-scoped memoization and batch pre-warming.
 */
export class CrossEntityPolicyEngine extends BaseSingleton<CrossEntityPolicyEngine> {
    public static readonly CROSS_ENTITY_POLICIES_SETTING_NAME = 'CrossEntityPolicies';

    private readonly _programmaticPolicies = new Map<string, ICrossEntityPolicy>();
    private readonly _declarativeCache = new Map<string, CachedDeclarativePoliciesEntry>();
    private readonly _providerScopes = new WeakMap<
        IMetadataProvider,
        Map<string, DefaultCrossEntityEvaluationScope>
    >();
    private readonly _transactionGroupScopes = new WeakMap<
        object,
        Map<string, DefaultCrossEntityEvaluationScope>
    >();
    private _ephemeralScopeCounter = 0;
    private _txGroupScopeCounter = 0;

    protected constructor() {
        super();
    }

    public static get Instance(): CrossEntityPolicyEngine {
        return super.getInstance<CrossEntityPolicyEngine>();
    }

    public RegisterPolicy(policy: ICrossEntityPolicy): void {
        if (!policy.PolicyKey || policy.PolicyKey.trim().length === 0) {
            throw new Error('CrossEntityPolicyEngine.RegisterPolicy: PolicyKey must be non-empty.');
        }
        this._programmaticPolicies.set(policy.PolicyKey.trim().toLowerCase(), policy);
    }

    public UnregisterPolicy(policyKey: string): void {
        this._programmaticPolicies.delete(policyKey.trim().toLowerCase());
    }

    public ClearProgrammaticPolicies(): void {
        this._programmaticPolicies.clear();
        this._declarativeCache.clear();
    }

    public ClearProviderScope(provider: IMetadataProvider): void {
        this._providerScopes.delete(provider);
    }

    public ClearTransactionGroupScope(transactionGroup: object): void {
        this._transactionGroupScopes.delete(transactionGroup);
    }

    /**
     * Resolves or creates the evaluation scope for `provider` (and optional `transactionGroup`),
     * partitioned by `contextUser?.ID` so two different users never share RLS-scoped parent snapshots:
     * - When `transactionGroup` is supplied (items enrolling into / submitting a `TransactionGroupBase`),
     *   returns the shared memoizing scope bound to that `(TransactionGroupBase, user)` pair.
     * - Inside an active provider transaction (`TransactionScopeCacheKey !== null`), returns the shared
     *   memoizing scope bound to that `(transactionEpoch, user)` pair.
     * - Outside both, returns a fresh single-call ephemeral scope so snapshots never outlive the call.
     */
    public ResolveScope(
        provider: IMetadataProvider,
        contextUser?: UserInfo,
        transactionGroup?: object | null,
    ): CrossEntityEvaluationScope {
        return this.resolveInternalScope(provider, contextUser, transactionGroup);
    }

    private resolveInternalScope(
        provider: IMetadataProvider,
        contextUser?: UserInfo,
        transactionGroup?: object | null,
    ): DefaultCrossEntityEvaluationScope {
        const userKey = contextUser?.ID ? NormalizeUUID(contextUser.ID) : '__anon__';
        if (transactionGroup) {
            let tgMap = this._transactionGroupScopes.get(transactionGroup);
            if (!tgMap) {
                tgMap = new Map<string, DefaultCrossEntityEvaluationScope>();
                this._transactionGroupScopes.set(transactionGroup, tgMap);
            }
            let tgScope = tgMap.get(userKey);
            if (!tgScope) {
                tgScope = new DefaultCrossEntityEvaluationScope(
                    `tg:${++this._txGroupScopeCounter}:${userKey}`,
                    provider,
                    contextUser,
                );
                tgMap.set(userKey, tgScope);
            }
            return tgScope;
        }
        const txKey = (provider as IMetadataProvider & ITransactionScopeCacheProvider).TransactionScopeCacheKey ?? null;
        if (!txKey) {
            return new DefaultCrossEntityEvaluationScope(
                `ephemeral:${++this._ephemeralScopeCounter}:${userKey}`,
                provider,
                contextUser,
            );
        }
        let mapForProvider = this._providerScopes.get(provider);
        if (!mapForProvider) {
            mapForProvider = new Map<string, DefaultCrossEntityEvaluationScope>();
            this._providerScopes.set(provider, mapForProvider);
        }
        const compositeKey = `${txKey}::${userKey}`;
        let scope = mapForProvider.get(compositeKey);
        if (!scope) {
            // Evict any prior epoch entries on this provider while keeping entries for the current txKey across users.
            const currentEpochPrefix = `${txKey}::`;
            for (const existingKey of Array.from(mapForProvider.keys())) {
                if (!existingKey.startsWith(currentEpochPrefix)) {
                    mapForProvider.delete(existingKey);
                }
            }
            scope = new DefaultCrossEntityEvaluationScope(compositeKey, provider, contextUser);
            mapForProvider.set(compositeKey, scope);
        }
        return scope;
    }

    /**
     * Notifies the engine that `entity` was created, updated, or deleted on `provider`, immediately
     * invalidating any cached parent status snapshots for that entity and primary key in the active
     * transaction scope.
     */
    public NotifyEntityMutated(
        provider: IMetadataProvider,
        entity: BaseEntity,
        _operation: EntityWriteOperation,
    ): void {
        const mapForProvider = this._providerScopes.get(provider);
        const tgMap = entity.TransactionGroup
            ? this._transactionGroupScopes.get(entity.TransactionGroup)
            : undefined;
        if ((!mapForProvider || mapForProvider.size === 0) && (!tgMap || tgMap.size === 0)) {
            return;
        }
        const entityNameLower = entity.EntityInfo.Name.trim().toLowerCase();
        const pkFields = entity.EntityInfo.PrimaryKeys;
        const singlePkVal =
            pkFields.length === 1 ? entity.GetFieldByName(pkFields[0].Name)?.Value : null;
        const partitionPrefix =
            singlePkVal !== null && singlePkVal !== undefined ? String(singlePkVal).trim() : undefined;

        const scopesToInvalidate: DefaultCrossEntityEvaluationScope[] = [
            ...(mapForProvider ? Array.from(mapForProvider.values()) : []),
            ...(tgMap ? Array.from(tgMap.values()) : []),
        ];
        for (const scope of scopesToInvalidate) {
            scope.InvalidateNamespacePrefix(`parent:${entityNameLower}:`, partitionPrefix);
            // Also invalidate any custom policy caches namespaced by entity name.
            scope.Invalidate(`entity:${entityNameLower}`, partitionPrefix);
            scope.InvalidateNamespacePrefix(`entity:${entityNameLower}:`);
        }
    }

    /**
     * Bulk-primes declarative parent-lock snapshots into the active scope for a batch or graph
     * of entity operations without marking individual items as pre-evaluated, so each item's
     * own `EnforceBeforeSave` / `EnforceBeforeDelete` still runs after `Prepare()`, RLS, and
     * before-save hooks while enjoying $O(1)$ cache hits on parent state lookups.
     */
    public async PrimeParentLocksForBatch(
        items: ReadonlyArray<CrossEntityBatchItem>,
        provider: IMetadataProvider,
        contextUser: UserInfo | undefined,
        transactionGroup?: object | null,
    ): Promise<void> {
        if (items.length === 0) {
            return;
        }
        const scope = this.resolveInternalScope(provider, contextUser, transactionGroup);
        await this.primeDeclarativeParentLocksForBatch(items, scope);
    }

    /**
     * Batch pre-evaluation and cache pre-warming across multiple entity mutations (`MJ.SaveEntityGraph`,
     * `TransactionGroupBase.Submit`, or bulk imports). Returns `null` when all items pass, or the first
     * refusal message encountered.
     */
    public async PreEvaluateBatch(
        items: ReadonlyArray<CrossEntityBatchItem>,
        provider: IMetadataProvider,
        contextUser: UserInfo | undefined,
        transactionGroup?: object | null,
    ): Promise<string | null> {
        const validItems = items.filter((item) => Boolean(item.Entity?.EntityInfo?.Name));
        if (validItems.length === 0) {
            return null;
        }
        const scope = this.resolveInternalScope(provider, contextUser, transactionGroup);

        // 1. Bulk-prime declarative ParentStateLock lookups (including in-batch parent creates/updates/deletes)
        //    with chunked `ID IN (...)` RunView queries per parent entity.
        await this.primeDeclarativeParentLocksForBatch(validItems, scope);

        // 2. Run programmatic policies that implement `EvaluateBatch`.
        const allProgrammatic = this.sortedProgrammaticPolicies();
        for (const policy of allProgrammatic) {
            if (!policy.EvaluateBatch) {
                continue;
            }
            const targetSet = new Set(policy.TargetEntityNames.map((n) => n.trim().toLowerCase()));
            const matchingItems = validItems.filter((item) =>
                targetSet.has(item.Entity.EntityInfo.Name.trim().toLowerCase()),
            );
            if (matchingItems.length === 0) {
                continue;
            }
            const verdicts = await policy.EvaluateBatch(matchingItems, scope);
            if (verdicts) {
                for (const item of matchingItems) {
                    const verdict = verdicts.get(item.Entity);
                    if (verdict && !verdict.Allowed) {
                        return (
                            verdict.ErrorMessage ??
                            `Cross-entity policy '${policy.PolicyKey}' refused ${item.Operation} on ${item.Entity.EntityInfo.Name}.`
                        );
                    }
                }
            }
        }

        // 3. Evaluate declarative locks and per-item programmatic policies against the now-primed scope
        //    so batch callers fail fast before SQL runs.
        for (const item of validItems) {
            const declPolicies = this.ResolveDeclarativePolicies(item.Entity.EntityInfo);
            for (const decl of declPolicies) {
                const err = await this.evaluateDeclarativeLock(item.Entity, item.Operation, decl, scope);
                if (err) {
                    return err;
                }
            }
            const progPolicies = this.getProgrammaticPoliciesForEntity(item.Entity.EntityInfo.Name);
            for (const prog of progPolicies) {
                // Skip if already evaluated by EvaluateBatch above without per-item hooks, or run per-item hook against primed scope
                if (item.Operation === 'Delete' && prog.EvaluateBeforeDelete) {
                    const verdict = await prog.EvaluateBeforeDelete({
                        Entity: item.Entity,
                        Operation: 'Delete',
                        Scope: scope,
                    });
                    if (!verdict.Allowed) {
                        return (
                            verdict.ErrorMessage ??
                            `Cross-entity policy '${prog.PolicyKey}' refused Delete on ${item.Entity.EntityInfo.Name}.`
                        );
                    }
                } else if (item.Operation !== 'Delete' && prog.EvaluateBeforeSave) {
                    const verdict = await prog.EvaluateBeforeSave({
                        Entity: item.Entity,
                        Operation: item.Operation,
                        Scope: scope,
                    });
                    if (!verdict.Allowed) {
                        return (
                            verdict.ErrorMessage ??
                            `Cross-entity policy '${prog.PolicyKey}' refused ${item.Operation} on ${item.Entity.EntityInfo.Name}.`
                        );
                    }
                }
            }
            scope.MarkPreEvaluated(item.Entity, item.Operation);
        }

        return null;
    }

    /**
     * Enforces all declarative and programmatic cross-entity policies before saving `entity`.
     * Returns `null` when allowed, or a refusal error message when vetoed.
     */
    public async EnforceBeforeSave(
        entity: BaseEntity,
        contextUser: UserInfo | undefined,
        provider: IMetadataProvider,
        saveContext?: SaveContext,
    ): Promise<string | null> {
        const operation: EntityWriteOperation = entity.IsSaved ? 'Update' : 'Create';
        const declPolicies = this.ResolveDeclarativePolicies(entity.EntityInfo);
        const progPolicies = this.getProgrammaticPoliciesForEntity(entity.EntityInfo.Name);
        if (declPolicies.length === 0 && progPolicies.length === 0) {
            return null;
        }

        const scope = this.resolveInternalScope(provider, contextUser, entity.TransactionGroup);
        if (scope.IsPreEvaluated(entity, operation)) {
            return null;
        }

        for (const decl of declPolicies) {
            const err = await this.evaluateDeclarativeLock(entity, operation, decl, scope);
            if (err) {
                return err;
            }
        }

        const ctx: CrossEntityPolicyItemContext = {
            Entity: entity,
            Operation: operation,
            Scope: scope,
            SaveContext: saveContext,
        };
        for (const policy of progPolicies) {
            if (!policy.EvaluateBeforeSave) {
                continue;
            }
            const verdict = await policy.EvaluateBeforeSave(ctx);
            if (!verdict.Allowed) {
                return (
                    verdict.ErrorMessage ??
                    `Cross-entity policy '${policy.PolicyKey}' refused ${operation} on ${entity.EntityInfo.Name}.`
                );
            }
        }
        return null;
    }

    /**
     * Enforces all declarative and programmatic cross-entity policies before deleting `entity`.
     * Returns `null` when allowed, or a refusal error message when vetoed.
     */
    public async EnforceBeforeDelete(
        entity: BaseEntity,
        contextUser: UserInfo | undefined,
        provider: IMetadataProvider,
    ): Promise<string | null> {
        const declPolicies = this.ResolveDeclarativePolicies(entity.EntityInfo);
        const progPolicies = this.getProgrammaticPoliciesForEntity(entity.EntityInfo.Name);
        if (declPolicies.length === 0 && progPolicies.length === 0) {
            return null;
        }

        const scope = this.resolveInternalScope(provider, contextUser, entity.TransactionGroup);
        if (scope.IsPreEvaluated(entity, 'Delete')) {
            return null;
        }

        for (const decl of declPolicies) {
            const err = await this.evaluateDeclarativeLock(entity, 'Delete', decl, scope);
            if (err) {
                return err;
            }
        }

        const ctx: CrossEntityPolicyItemContext = {
            Entity: entity,
            Operation: 'Delete',
            Scope: scope,
        };
        for (const policy of progPolicies) {
            if (!policy.EvaluateBeforeDelete) {
                continue;
            }
            const verdict = await policy.EvaluateBeforeDelete(ctx);
            if (!verdict.Allowed) {
                return (
                    verdict.ErrorMessage ??
                    `Cross-entity policy '${policy.PolicyKey}' refused Delete on ${entity.EntityInfo.Name}.`
                );
            }
        }
        return null;
    }

    public ResolveDeclarativePolicies(
        entityInfo: EntityInfo | null | undefined,
    ): ReadonlyArray<IDeclarativeParentStateLockPolicy> {
        if (!entityInfo || !entityInfo.Name) {
            return [];
        }
        const settings = entityInfo.Settings ?? [];
        const setting = settings.find(
            (s) =>
                s.Name?.trim().toLowerCase() ===
                CrossEntityPolicyEngine.CROSS_ENTITY_POLICIES_SETTING_NAME.toLowerCase(),
        );
        const configPolicies = entityInfo.ConfigurationObject?.CrossEntityPolicies;
        const signature = `${setting?.Value ?? ''}|${configPolicies ? JSON.stringify(configPolicies) : ''}`;
        if (signature === '|') {
            return [];
        }

        const cacheKey = entityInfo.ID || entityInfo.Name;
        const cached = this._declarativeCache.get(cacheKey);
        if (cached && cached.signature === signature) {
            return cached.policies;
        }

        const list: IDeclarativeParentStateLockPolicy[] = [];
        if (configPolicies && configPolicies.length > 0) {
            for (const raw of configPolicies) {
                list.push(
                    this.normalizeDeclarativePolicy(
                        raw as object as Record<string, object | string | number | boolean | null>,
                    ),
                );
            }
        }
        if (setting?.Value && setting.Value.trim().length > 0) {
            const parsed = SafeJSONParse<
                | Record<string, object | string | number | boolean | null>
                | Array<Record<string, object | string | number | boolean | null>>
            >(setting.Value, false);
            if (!parsed || typeof parsed !== 'object') {
                LogError(
                    `CrossEntityPolicyEngine: invalid JSON in EntitySetting '${CrossEntityPolicyEngine.CROSS_ENTITY_POLICIES_SETTING_NAME}' on entity '${entityInfo.Name}'; failing closed.`,
                );
                const invalidSentinel: IDeclarativeParentStateLockPolicy = {
                    foreignKeyField: '__INVALID_METADATA_CROSS_ENTITY_POLICY__',
                    parentEntityName: '__INVALID__',
                    parentStatusField: 'Status',
                };
                this._declarativeCache.set(cacheKey, { signature, policies: [invalidSentinel] });
                return [invalidSentinel];
            }
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            for (const raw of arr) {
                list.push(this.normalizeDeclarativePolicy(raw));
            }
        }

        this._declarativeCache.set(cacheKey, { signature, policies: list });
        return list;
    }

    private normalizeDeclarativePolicy(
        raw: Record<string, object | string | number | boolean | null>,
    ): IDeclarativeParentStateLockPolicy {
        return {
            kind: 'ParentStateLock',
            policyKey: (raw.policyKey ?? raw.PolicyKey) as string | undefined,
            foreignKeyField: String(raw.foreignKeyField ?? raw.ForeignKeyField ?? ''),
            parentEntityName: String(raw.parentEntityName ?? raw.ParentEntityName ?? ''),
            parentKeyField: (raw.parentKeyField ?? raw.ParentKeyField) as string | undefined,
            parentStatusField: String(raw.parentStatusField ?? raw.ParentStatusField ?? ''),
            allowedParentStates: (raw.allowedParentStates ?? raw.AllowedParentStates) as string[] | undefined,
            forbiddenParentStates: (raw.forbiddenParentStates ?? raw.ForbiddenParentStates) as string[] | undefined,
            operations: (raw.operations ?? raw.Operations) as EntityWriteOperation[] | undefined,
            allowOrphanWhenForeignKeyNull: (raw.allowOrphanWhenForeignKeyNull ??
                raw.AllowOrphanWhenForeignKeyNull) as boolean | undefined,
            exemptOperations: (raw.exemptOperations ?? raw.ExemptOperations) as string[] | undefined,
            errorMessage: (raw.errorMessage ?? raw.ErrorMessage) as string | undefined,
        };
    }

    private extractForeignKeyIdsForOperation(
        entity: BaseEntity,
        operation: EntityWriteOperation,
        foreignKeyFieldName: string,
    ): { fieldExists: boolean; ids: string[] } {
        const fkField = entity.GetFieldByName(foreignKeyFieldName);
        if (!fkField) {
            return { fieldExists: false, ids: [] };
        }
        if (operation === 'Delete') {
            const raw = fkField.Dirty ? fkField.OldValue : fkField.Value;
            const id = raw !== null && raw !== undefined ? String(raw).trim() : '';
            return { fieldExists: true, ids: id ? [id] : [] };
        }
        if (operation === 'Update') {
            const ids: string[] = [];
            if (fkField.Dirty && fkField.OldValue !== null && fkField.OldValue !== undefined) {
                const oldId = String(fkField.OldValue).trim();
                if (oldId) {
                    ids.push(oldId);
                }
            }
            const curRaw = fkField.Value;
            const curId = curRaw !== null && curRaw !== undefined ? String(curRaw).trim() : '';
            if (curId && !ids.some((existing) => existing.toLowerCase() === curId.toLowerCase())) {
                ids.push(curId);
            }
            return { fieldExists: true, ids };
        }
        const raw = fkField.Value;
        const id = raw !== null && raw !== undefined ? String(raw).trim() : '';
        return { fieldExists: true, ids: id ? [id] : [] };
    }

    private async primeDeclarativeParentLocksForBatch(
        items: ReadonlyArray<CrossEntityBatchItem>,
        scope: CrossEntityEvaluationScope,
    ): Promise<void> {
        const grouped = new Map<
            string,
            {
                parentEntityName: string;
                parentKeyField: string;
                parentStatusField: string;
                parentIds: Set<string>;
            }
        >();

        for (const item of items) {
            if (!item.Entity?.EntityInfo?.Name) {
                continue;
            }
            const policies = this.ResolveDeclarativePolicies(item.Entity.EntityInfo);
            for (const policy of policies) {
                const ops = policy.operations ?? ['Create', 'Update', 'Delete'];
                if (!ops.includes(item.Operation)) {
                    continue;
                }
                const { fieldExists, ids } = this.extractForeignKeyIdsForOperation(
                    item.Entity,
                    item.Operation,
                    policy.foreignKeyField,
                );
                if (!fieldExists || ids.length === 0) {
                    continue;
                }
                const parentKeyField = policy.parentKeyField ?? 'ID';
                const groupKey = `${policy.parentEntityName.trim().toLowerCase()}::${parentKeyField.toLowerCase()}::${policy.parentStatusField.toLowerCase()}`;
                let bucket = grouped.get(groupKey);
                if (!bucket) {
                    bucket = {
                        parentEntityName: policy.parentEntityName,
                        parentKeyField,
                        parentStatusField: policy.parentStatusField,
                        parentIds: new Set<string>(),
                    };
                    grouped.set(groupKey, bucket);
                }
                for (const fkStr of ids) {
                    if (SAFE_UUID_OR_ALNUM_KEY_REGEX.test(fkStr)) {
                        bucket.parentIds.add(fkStr);
                    }
                }
            }
        }

        for (const bucket of grouped.values()) {
            const ns = this.parentCacheNamespace(
                bucket.parentEntityName,
                `${bucket.parentKeyField}:${bucket.parentStatusField}`,
            );
            const parentEntityLower = bucket.parentEntityName.trim().toLowerCase();

            // First prime any in-batch parent mutations (e.g. a new parent Order created in the same graph/group
            // alongside its child OrderLines) so children see the in-batch parent state without failing DB lookup.
            for (const item of items) {
                if (item.Entity.EntityInfo.Name.trim().toLowerCase() !== parentEntityLower) {
                    continue;
                }
                const pkVal = item.Entity.GetFieldByName(bucket.parentKeyField)?.Value;
                const pkStr = pkVal !== null && pkVal !== undefined ? String(pkVal).trim() : '';
                if (!pkStr) {
                    continue;
                }
                if (item.Operation === 'Delete') {
                    scope.Prime(ns, pkStr, { exists: false, status: '' } satisfies ParentStatusSnapshot);
                } else {
                    const statusVal = item.Entity.GetFieldByName(bucket.parentStatusField)?.Value;
                    const statusStr = statusVal !== null && statusVal !== undefined ? String(statusVal).trim() : '';
                    scope.Prime(ns, pkStr, { exists: true, status: statusStr } satisfies ParentStatusSnapshot);
                }
                for (const id of Array.from(bucket.parentIds)) {
                    if (id.toLowerCase() === pkStr.toLowerCase()) {
                        bucket.parentIds.delete(id);
                    }
                }
            }

            if (bucket.parentIds.size === 0 || !this.isRunViewCapable(scope.Provider)) {
                continue;
            }
            const allIds = Array.from(bucket.parentIds);
            for (let offset = 0; offset < allIds.length; offset += BATCH_CHUNK_SIZE) {
                const chunk = allIds.slice(offset, offset + BATCH_CHUNK_SIZE);
                const quotedList = chunk.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
                const rv = await scope.Provider.RunView<Record<string, string | number | null>>(
                    {
                        EntityName: bucket.parentEntityName,
                        ExtraFilter: `${bucket.parentKeyField} IN (${quotedList})`,
                        Fields: [bucket.parentKeyField, bucket.parentStatusField],
                        IgnoreMaxRows: true,
                        ResultType: 'simple',
                        BypassCache: true,
                    },
                    scope.ContextUser,
                );
                if (!rv.Success) {
                    LogError(
                        `CrossEntityPolicyEngine.primeDeclarativeParentLocksForBatch: RunView failed for '${bucket.parentEntityName}': ${rv.ErrorMessage ?? 'unknown error'}`,
                    );
                    continue;
                }
                const foundIds = new Set<string>();
                for (const row of rv.Results ?? []) {
                    const rowId = String(row[bucket.parentKeyField] ?? '').trim();
                    if (rowId) {
                        foundIds.add(rowId.toLowerCase());
                        const statusStr = String(row[bucket.parentStatusField] ?? '').trim();
                        const snap: ParentStatusSnapshot = { exists: true, status: statusStr };
                        scope.Prime(ns, rowId, snap);
                    }
                }
                for (const requestedId of chunk) {
                    if (!foundIds.has(requestedId.toLowerCase())) {
                        const missingSnap: ParentStatusSnapshot = { exists: false, status: '' };
                        scope.Prime(ns, requestedId, missingSnap);
                    }
                }
            }
        }
    }

    private async evaluateDeclarativeLock(
        entity: BaseEntity,
        operation: EntityWriteOperation,
        policy: IDeclarativeParentStateLockPolicy,
        scope: CrossEntityEvaluationScope,
    ): Promise<string | null> {
        const ops = policy.operations ?? ['Create', 'Update', 'Delete'];
        if (!ops.includes(operation)) {
            return null;
        }
        if (
            policy.exemptOperations &&
            policy.exemptOperations.length > 0 &&
            ServerOperationScopeManager.Instance.IsOperationActive(
                policy.exemptOperations,
                entity.EntityInfo.Name,
                scope.ContextUser,
            )
        ) {
            return null;
        }

        const { fieldExists, ids } = this.extractForeignKeyIdsForOperation(
            entity,
            operation,
            policy.foreignKeyField,
        );
        if (!fieldExists) {
            LogError(
                `CrossEntityPolicyEngine: configured foreignKeyField '${policy.foreignKeyField}' does not exist on entity '${entity.EntityInfo.Name}'.`,
            );
            return `Cross-entity policy error on ${entity.EntityInfo.Name}: configured foreignKeyField '${policy.foreignKeyField}' does not exist.`;
        }

        const curFkVal =
            operation === 'Delete'
                ? entity.GetFieldByName(policy.foreignKeyField)?.Dirty
                    ? entity.GetFieldByName(policy.foreignKeyField)?.OldValue
                    : entity.GetFieldByName(policy.foreignKeyField)?.Value
                : entity.GetFieldByName(policy.foreignKeyField)?.Value;
        const curFkId = curFkVal !== null && curFkVal !== undefined ? String(curFkVal).trim() : '';

        if (!curFkId && ids.length === 0) {
            if (policy.allowOrphanWhenForeignKeyNull === false) {
                return (
                    policy.errorMessage ??
                    `Cannot ${operation.toLowerCase()} ${entity.EntityInfo.Name}: required parent reference '${policy.foreignKeyField}' is empty.`
                );
            }
            return null;
        }

        if (!curFkId && policy.allowOrphanWhenForeignKeyNull === false) {
            return (
                policy.errorMessage ??
                `Cannot ${operation.toLowerCase()} ${entity.EntityInfo.Name}: required parent reference '${policy.foreignKeyField}' is empty.`
            );
        }

        for (const fkId of ids) {
            if (!SAFE_UUID_OR_ALNUM_KEY_REGEX.test(fkId)) {
                return `Invalid parent key '${fkId}' in ${entity.EntityInfo.Name}.${policy.foreignKeyField}.`;
            }
        }

        if (!this.isRunViewCapable(scope.Provider)) {
            return null;
        }
        const runViewProvider = scope.Provider;
        const parentKeyField = policy.parentKeyField ?? 'ID';
        const ns = this.parentCacheNamespace(
            policy.parentEntityName,
            `${parentKeyField}:${policy.parentStatusField}`,
        );

        for (const fkId of ids) {
            const snapshot = await scope.GetOrLoad<ParentStatusSnapshot>(ns, fkId, async () => {
                const escaped = fkId.replace(/'/g, "''");
                const rv = await runViewProvider.RunView<Record<string, string | number | null>>(
                    {
                        EntityName: policy.parentEntityName,
                        ExtraFilter: `${parentKeyField}='${escaped}'`,
                        Fields: [parentKeyField, policy.parentStatusField],
                        MaxRows: 1,
                        ResultType: 'simple',
                        BypassCache: true,
                    },
                    scope.ContextUser,
                );
                if (!rv.Success) {
                    throw new Error(
                        `CrossEntityPolicyEngine failed to query parent '${policy.parentEntityName}' (${fkId}): ${rv.ErrorMessage ?? 'RunView failed'}`,
                    );
                }
                const row = rv.Results?.[0];
                if (!row) {
                    return { exists: false, status: '' };
                }
                return {
                    exists: true,
                    status: String(row[policy.parentStatusField] ?? '').trim(),
                };
            });

            if (!snapshot.exists) {
                return (
                    policy.errorMessage ??
                    `Cannot ${operation.toLowerCase()} ${entity.EntityInfo.Name}: parent ${policy.parentEntityName} '${fkId}' does not exist.`
                );
            }

            if (policy.forbiddenParentStates && policy.forbiddenParentStates.includes(snapshot.status)) {
                return (
                    policy.errorMessage ??
                    `Cannot ${operation.toLowerCase()} ${entity.EntityInfo.Name} while parent ${policy.parentEntityName} ${policy.parentStatusField} is '${snapshot.status}'.`
                );
            }

            if (
                policy.allowedParentStates &&
                policy.allowedParentStates.length > 0 &&
                !policy.allowedParentStates.includes(snapshot.status)
            ) {
                return (
                    policy.errorMessage ??
                    `Cannot ${operation.toLowerCase()} ${entity.EntityInfo.Name} while parent ${policy.parentEntityName} ${policy.parentStatusField} is '${snapshot.status}' (allowed: [${policy.allowedParentStates.join(', ')}]).`
                );
            }
        }

        return null;
    }

    private parentCacheNamespace(parentEntityName: string, fieldDescriptor: string): string {
        return `parent:${parentEntityName.trim().toLowerCase()}:${fieldDescriptor.trim().toLowerCase()}`;
    }

    private getProgrammaticPoliciesForEntity(entityName: string): ICrossEntityPolicy[] {
        const wanted = entityName.trim().toLowerCase();
        return this.sortedProgrammaticPolicies().filter((p) =>
            p.TargetEntityNames.some((n) => n.trim().toLowerCase() === wanted),
        );
    }

    private sortedProgrammaticPolicies(): ICrossEntityPolicy[] {
        return Array.from(this._programmaticPolicies.values()).sort(
            (a, b) => (b.Priority ?? 0) - (a.Priority ?? 0),
        );
    }

    private isRunViewCapable(provider: IMetadataProvider): provider is IMetadataProvider & IRunViewProvider {
        return typeof (provider as { RunView?: Function }).RunView === 'function';
    }
}
