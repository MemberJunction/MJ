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

import { BaseSingleton, SafeJSONParse } from '@memberjunction/global';
import type { BaseEntity } from './baseEntity';
import type { SaveContext } from './databaseProviderBase';
import type { EntityInfo } from './entityInfo';
import { ServerOperationScopeManager, type EntityWriteOperation } from './entityLifecyclePolicy';
import type { IMetadataProvider, IRunViewProvider } from './interfaces';
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

    constructor(
        public readonly ScopeId: string,
        public readonly Provider: IMetadataProvider,
        public readonly ContextUser?: UserInfo,
    ) {}

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
    private readonly _transactionGroupScopes = new WeakMap<object, DefaultCrossEntityEvaluationScope>();
    private _ephemeralScopeCounter = 0;
    private _txGroupScopeCounter = 0;

    public constructor() {
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
     * Resolves or creates the evaluation scope for `provider` (and optional `transactionGroup`):
     * - When `transactionGroup` is supplied (items enrolling into / submitting a `TransactionGroupBase`),
     *   returns the shared memoizing scope bound to that `TransactionGroupBase` instance.
     * - Inside an active provider transaction (`TransactionScopeCacheKey !== null`), returns the shared
     *   memoizing scope bound to that transaction epoch.
     * - Outside both, returns a fresh single-call ephemeral scope so snapshots never outlive the call.
     */
    public ResolveScope(
        provider: IMetadataProvider,
        contextUser?: UserInfo,
        transactionGroup?: object | null,
    ): CrossEntityEvaluationScope {
        if (transactionGroup) {
            let tgScope = this._transactionGroupScopes.get(transactionGroup);
            if (!tgScope) {
                tgScope = new DefaultCrossEntityEvaluationScope(
                    `tg:${++this._txGroupScopeCounter}`,
                    provider,
                    contextUser,
                );
                this._transactionGroupScopes.set(transactionGroup, tgScope);
            }
            return tgScope;
        }
        const txKey = (provider as IMetadataProvider & ITransactionScopeCacheProvider).TransactionScopeCacheKey ?? null;
        if (!txKey) {
            return new DefaultCrossEntityEvaluationScope(
                `ephemeral:${++this._ephemeralScopeCounter}`,
                provider,
                contextUser,
            );
        }
        let mapForProvider = this._providerScopes.get(provider);
        if (!mapForProvider) {
            mapForProvider = new Map<string, DefaultCrossEntityEvaluationScope>();
            this._providerScopes.set(provider, mapForProvider);
        }
        let scope = mapForProvider.get(txKey);
        if (!scope) {
            // Evict any prior epoch entries on this provider before storing the current transaction scope.
            mapForProvider.clear();
            scope = new DefaultCrossEntityEvaluationScope(txKey, provider, contextUser);
            mapForProvider.set(txKey, scope);
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
        const tgScope = entity.TransactionGroup
            ? this._transactionGroupScopes.get(entity.TransactionGroup)
            : undefined;
        if ((!mapForProvider || mapForProvider.size === 0) && !tgScope) {
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
            ...(tgScope ? [tgScope] : []),
        ];
        for (const scope of scopesToInvalidate) {
            scope.InvalidateNamespacePrefix(`parent:${entityNameLower}:`, partitionPrefix);
            // Also invalidate any custom policy caches namespaced by entity name.
            scope.Invalidate(`entity:${entityNameLower}`, partitionPrefix);
            scope.InvalidateNamespacePrefix(`entity:${entityNameLower}:`);
        }
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
        if (items.length === 0) {
            return null;
        }
        const scope = this.ResolveScope(provider, contextUser, transactionGroup);

        // 1. Bulk-prime declarative ParentStateLock lookups with 1 batched `ID IN (...)` RunView per parent entity.
        await this.primeDeclarativeParentLocksForBatch(items, scope);

        // 2. Run programmatic policies that implement `EvaluateBatch`.
        const allProgrammatic = this.sortedProgrammaticPolicies();
        for (const policy of allProgrammatic) {
            if (!policy.EvaluateBatch) {
                continue;
            }
            const targetSet = new Set(policy.TargetEntityNames.map((n) => n.trim().toLowerCase()));
            const matchingItems = items.filter((item) =>
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

        // 3. Evaluate declarative locks against the now-primed scope so batch callers fail fast before SQL runs.
        for (const item of items) {
            const declPolicies = this.ResolveDeclarativePolicies(item.Entity.EntityInfo);
            for (const decl of declPolicies) {
                const err = await this.evaluateDeclarativeLock(item.Entity, item.Operation, decl, scope);
                if (err) {
                    return err;
                }
            }
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

        const scope = this.ResolveScope(provider, contextUser, entity.TransactionGroup);

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

        const scope = this.ResolveScope(provider, contextUser, entity.TransactionGroup);

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
            list.push(...configPolicies);
        }
        if (setting?.Value) {
            const parsed = SafeJSONParse<
                IDeclarativeParentStateLockPolicy | IDeclarativeParentStateLockPolicy[]
            >(setting.Value, false);
            if (parsed) {
                const arr = Array.isArray(parsed) ? parsed : [parsed];
                list.push(...arr);
            }
        }

        this._declarativeCache.set(cacheKey, { signature, policies: list });
        return list;
    }

    private async primeDeclarativeParentLocksForBatch(
        items: ReadonlyArray<CrossEntityBatchItem>,
        scope: CrossEntityEvaluationScope,
    ): Promise<void> {
        if (!this.isRunViewCapable(scope.Provider)) {
            return;
        }
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
            const policies = this.ResolveDeclarativePolicies(item.Entity.EntityInfo);
            for (const policy of policies) {
                const ops = policy.operations ?? ['Create', 'Update', 'Delete'];
                if (!ops.includes(item.Operation)) {
                    continue;
                }
                const fkVal = item.Entity.GetFieldByName(policy.foreignKeyField)?.Value;
                if (fkVal === null || fkVal === undefined || String(fkVal).trim() === '') {
                    continue;
                }
                const fkStr = String(fkVal).trim();
                if (!SAFE_UUID_OR_ALNUM_KEY_REGEX.test(fkStr)) {
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
                bucket.parentIds.add(fkStr);
            }
        }

        for (const bucket of grouped.values()) {
            if (bucket.parentIds.size === 0) {
                continue;
            }
            const ids = Array.from(bucket.parentIds);
            const quotedList = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
            const rv = await scope.Provider.RunView<Record<string, string | number | null>>(
                {
                    EntityName: bucket.parentEntityName,
                    ExtraFilter: `${bucket.parentKeyField} IN (${quotedList})`,
                    Fields: [bucket.parentKeyField, bucket.parentStatusField],
                    ResultType: 'simple',
                    BypassCache: true,
                },
                scope.ContextUser,
            );
            if (!rv.Success) {
                continue;
            }
            const ns = this.parentCacheNamespace(bucket.parentEntityName, `${bucket.parentKeyField}:${bucket.parentStatusField}`);
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
            for (const requestedId of ids) {
                if (!foundIds.has(requestedId.toLowerCase())) {
                    const missingSnap: ParentStatusSnapshot = { exists: false, status: '' };
                    scope.Prime(ns, requestedId, missingSnap);
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
            )
        ) {
            return null;
        }

        const fkField = entity.GetFieldByName(policy.foreignKeyField);
        const fkRaw = fkField?.Value;
        const fkId = fkRaw !== null && fkRaw !== undefined ? String(fkRaw).trim() : '';
        if (!fkId) {
            if (policy.allowOrphanWhenForeignKeyNull === false) {
                return (
                    policy.errorMessage ??
                    `Cannot ${operation.toLowerCase()} ${entity.EntityInfo.Name}: required parent reference '${policy.foreignKeyField}' is empty.`
                );
            }
            return null;
        }

        if (!SAFE_UUID_OR_ALNUM_KEY_REGEX.test(fkId)) {
            return `Invalid parent key '${fkId}' in ${entity.EntityInfo.Name}.${policy.foreignKeyField}.`;
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
