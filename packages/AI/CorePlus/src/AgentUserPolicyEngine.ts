/**
 * @fileoverview Engine for loading and evaluating per-(Agent, User) governance policies
 * (`MJ: AI Agent User Policies` / `__mj.AIAgentUserPolicy`).
 *
 * Architectural invariant:
 * - The owning user's MJ permissions (`contextUser` entity CRUD permissions, Role RLS, Role FLS)
 *   are ALWAYS the hard ceiling.
 * - `MJAIAgentUserPolicyEntity` can only NARROW what the agent is permitted to do on that user's
 *   behalf: restricting entity CRUD, adding SQL/expression RLS filters, masking or write-protecting
 *   FLS fields, enforcing time-of-day / day-of-week windows, and gating actions behind
 *   `MJ: AI Agent Requests` approvals.
 *
 * @module @memberjunction/ai-core-plus
 */

import { BaseEntity, BaseEntityEvent, IMetadataProvider, IRunViewProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentUserPolicyEntity,
    MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule,
    MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule,
} from '@memberjunction/core-entities';
import {
    BaseSingleton,
    EscapeSQLString,
    GetGlobalObjectStore,
    MJEvent,
    MJEventType,
    MJGlobal,
    SafeExpressionEvaluator,
    SafeJSONParse,
    SQLExpressionValidator,
    UUIDsEqual,
} from '@memberjunction/global';
import { Subscription } from 'rxjs';

/** The entity whose rows this engine caches. */
const POLICY_ENTITY_NAME = 'MJ: AI Agent User Policies';

/**
 * Strongly-typed default posture applied to newly created `MJ: AI Agent User Policies` records:
 * - `CoordinationMode`: `'Autonomous'`
 * - `EmailChannelMode`: `'DraftOnly'`
 * - `CalendarChannelMode`: `'ProposeWithApproval'` (calendar mutations require approval)
 * - `PhoneChannelMode`: `'Disabled'` (phone channel off until explicitly requested)
 */
export interface DefaultAgentUserPolicyPosture {
    readonly Status: MJAIAgentUserPolicyEntity['Status'];
    readonly OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'];
    readonly CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'];
    readonly DefaultDataAccessMode: MJAIAgentUserPolicyEntity['DefaultDataAccessMode'];
    readonly EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
    readonly CalendarChannelMode: MJAIAgentUserPolicyEntity['CalendarChannelMode'];
    readonly PhoneChannelMode: MJAIAgentUserPolicyEntity['PhoneChannelMode'];
    readonly MessagingChannelMode: MJAIAgentUserPolicyEntity['MessagingChannelMode'];
    readonly AllowInterAgentCoordination: MJAIAgentUserPolicyEntity['AllowInterAgentCoordination'];
    readonly RequireApprovalForExternalComms: MJAIAgentUserPolicyEntity['RequireApprovalForExternalComms'];
    readonly RequireApprovalForFinancials: MJAIAgentUserPolicyEntity['RequireApprovalForFinancials'];
    readonly RequireApprovalForDestructiveActions: MJAIAgentUserPolicyEntity['RequireApprovalForDestructiveActions'];
    readonly AutoApproveAmountThreshold: MJAIAgentUserPolicyEntity['AutoApproveAmountThreshold'];
}

/**
 * Canonical Slice 3 default posture for newly onboarded/created user agent policies.
 */
export const DEFAULT_AGENT_USER_POLICY_POSTURE: DefaultAgentUserPolicyPosture = {
    Status: 'Active',
    OnboardingStatus: 'NotStarted',
    CoordinationMode: 'Autonomous',
    DefaultDataAccessMode: 'UserCeiling',
    EmailChannelMode: 'DraftOnly',
    CalendarChannelMode: 'ProposeWithApproval',
    PhoneChannelMode: 'Disabled',
    MessagingChannelMode: 'Enabled',
    AllowInterAgentCoordination: true,
    RequireApprovalForExternalComms: true,
    RequireApprovalForFinancials: true,
    RequireApprovalForDestructiveActions: true,
    AutoApproveAmountThreshold: null,
};

/**
 * Populates unset fields on a newly created `MJAIAgentUserPolicyEntity` with
 * {@link DEFAULT_AGENT_USER_POLICY_POSTURE}. Existing explicit values are preserved unless
 * `overwriteExisting` is `true`.
 */
export function ApplyDefaultAgentUserPolicyValues(
    policy: MJAIAgentUserPolicyEntity,
    options?: { overwriteExisting?: boolean }
): MJAIAgentUserPolicyEntity {
    const overwrite = options?.overwriteExisting === true;
    if (overwrite || !policy.Status) {
        policy.Status = DEFAULT_AGENT_USER_POLICY_POSTURE.Status;
    }
    if (overwrite || !policy.OnboardingStatus) {
        policy.OnboardingStatus = DEFAULT_AGENT_USER_POLICY_POSTURE.OnboardingStatus;
    }
    if (overwrite || !policy.CoordinationMode) {
        policy.CoordinationMode = DEFAULT_AGENT_USER_POLICY_POSTURE.CoordinationMode;
    }
    if (overwrite || !policy.DefaultDataAccessMode) {
        policy.DefaultDataAccessMode = DEFAULT_AGENT_USER_POLICY_POSTURE.DefaultDataAccessMode;
    }
    if (overwrite || !policy.EmailChannelMode) {
        policy.EmailChannelMode = DEFAULT_AGENT_USER_POLICY_POSTURE.EmailChannelMode;
    }
    if (overwrite || !policy.CalendarChannelMode) {
        policy.CalendarChannelMode = DEFAULT_AGENT_USER_POLICY_POSTURE.CalendarChannelMode;
    }
    if (overwrite || !policy.PhoneChannelMode) {
        policy.PhoneChannelMode = DEFAULT_AGENT_USER_POLICY_POSTURE.PhoneChannelMode;
    }
    if (overwrite || !policy.MessagingChannelMode) {
        policy.MessagingChannelMode = DEFAULT_AGENT_USER_POLICY_POSTURE.MessagingChannelMode;
    }
    if (overwrite || policy.AllowInterAgentCoordination == null) {
        policy.AllowInterAgentCoordination = DEFAULT_AGENT_USER_POLICY_POSTURE.AllowInterAgentCoordination;
    }
    if (overwrite || policy.RequireApprovalForExternalComms == null) {
        policy.RequireApprovalForExternalComms = DEFAULT_AGENT_USER_POLICY_POSTURE.RequireApprovalForExternalComms;
    }
    if (overwrite || policy.RequireApprovalForFinancials == null) {
        policy.RequireApprovalForFinancials = DEFAULT_AGENT_USER_POLICY_POSTURE.RequireApprovalForFinancials;
    }
    if (overwrite || policy.RequireApprovalForDestructiveActions == null) {
        policy.RequireApprovalForDestructiveActions =
            DEFAULT_AGENT_USER_POLICY_POSTURE.RequireApprovalForDestructiveActions;
    }
    if (overwrite && policy.AutoApproveAmountThreshold === undefined) {
        policy.AutoApproveAmountThreshold = DEFAULT_AGENT_USER_POLICY_POSTURE.AutoApproveAmountThreshold;
    }
    return policy;
}

/**
 * One slot in the policy cache. `Policy === null` is a cached "no policy configured" result, which is
 * only trusted until `NoneExpiresAt`; a found policy ignores `NoneExpiresAt`.
 */
interface PolicyCacheEntry {
    Policy: MJAIAgentUserPolicyEntity | null;
    NoneExpiresAt: number;
}

/**
 * Discriminated result of looking up a `(agentId, userId)` policy so security-critical
 * callers can distinguish "no policy row configured" from "policy lookup failed" and fail closed.
 */
export type PolicyLookupResult =
    | { status: 'found'; policy: MJAIAgentUserPolicyEntity }
    | { status: 'none'; policy: null }
    | { status: 'error'; policy: null; errorMessage: string; missingRunViewProvider?: boolean };

/**
 * Options for {@link AgentUserPolicyEngine.ResolvePolicyForAgentAndUser}.
 */
export interface ResolvePolicyLookupOptions {
    forceRefresh?: boolean;
    provider?: IMetadataProvider;
}

/**
 * Immutable snapshot of permission-bearing fields on {@link MJAIAgentUserPolicyEntity},
 * captured before mutating an existing entity instance so self-modification checks can
 * detect any widening attempt.
 */
export interface AgentPolicyBaselineSnapshot {
    Status: MJAIAgentUserPolicyEntity['Status'];
    CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'];
    AllowInterAgentCoordination: MJAIAgentUserPolicyEntity['AllowInterAgentCoordination'];
    DefaultDataAccessMode: MJAIAgentUserPolicyEntity['DefaultDataAccessMode'];
    EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
    PhoneChannelMode: MJAIAgentUserPolicyEntity['PhoneChannelMode'];
    MessagingChannelMode: MJAIAgentUserPolicyEntity['MessagingChannelMode'];
    CalendarChannelMode: MJAIAgentUserPolicyEntity['CalendarChannelMode'];
    RequireApprovalForExternalComms: MJAIAgentUserPolicyEntity['RequireApprovalForExternalComms'];
    RequireApprovalForFinancials: MJAIAgentUserPolicyEntity['RequireApprovalForFinancials'];
    RequireApprovalForDestructiveActions: MJAIAgentUserPolicyEntity['RequireApprovalForDestructiveActions'];
    AutoApproveAmountThreshold: MJAIAgentUserPolicyEntity['AutoApproveAmountThreshold'];
    EntityAccessRules: MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[];
    ActionPolicyRules: MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[];
}

/**
 * Type of a time window rule derived from `MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule`.
 */
export type AgentPolicyTimeWindow = NonNullable<
    MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule['timeWindows']
>[number];

/**
 * Verdict returned by `AgentUserPolicyEngine` when evaluating an entity operation or action invocation.
 */
export type AgentPolicyVerdict = 'Allow' | 'RequireApproval' | 'Deny' | 'DeferUntilNextWindow';

/**
 * CRUD operation types evaluated against entity access policies.
 */
export type AgentEntityCrudOperation = 'Read' | 'Create' | 'Update' | 'Delete';

/**
 * Optional explicit user permission flags for an entity (auto-resolved from `Metadata` when omitted).
 */
export interface UserEntityPermissionCeiling {
    canRead: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
}

/**
 * Input parameters for evaluating entity access under a user's agent policy.
 */
export interface EvaluateEntityAccessInput {
    entityName: string;
    operation: AgentEntityCrudOperation;
    contextUser: UserInfo;
    policy: MJAIAgentUserPolicyEntity | null;
    /** Optional record values for Tier 1 `recordConditionExpression` evaluation. */
    record?: Record<string, string | number | boolean | null | undefined>;
    /** Optional field names being written on Create or Update. */
    mutatedFields?: string[];
    /** Optional explicit permission ceiling override for unit testing without global Metadata. */
    userPermissionCeiling?: UserEntityPermissionCeiling;
    /** Optional metadata provider (falls back to global Metadata when omitted). */
    provider?: IMetadataProvider;
    /** Evaluation timestamp (defaults to `new Date()`). */
    now?: Date;
}

/**
 * Detailed result of evaluating an entity access request against the user's ceiling + agent policy.
 */
export interface EntityAccessEvaluationResult {
    verdict: AgentPolicyVerdict;
    reason: string;
    /** Additional SQL WHERE clause (validated via `SQLExpressionValidator`) to AND with user RLS. */
    combinedRlsWhereClause: string | null;
    /** Reusable `MJ: Row Level Security Filters` IDs referenced by matching rules. */
    rlsFilterIds: string[];
    /** Field patterns that must be stripped from read results and blocked from writes. */
    deniedFieldPatterns: string[];
    /** Field patterns that are readable but blocked from Create/Update mutations. */
    readOnlyFieldPatterns: string[];
    /** Field patterns whose mutation requires explicit user approval via `AIAgentRequest`. */
    requireApprovalFieldPatterns: string[];
    /** Next allowed window start timestamp (ISO-8601) when `verdict === 'DeferUntilNextWindow'`. */
    nextWindowStartISO: string | null;
}

/**
 * Input parameters for evaluating an action execution under a user's agent policy.
 */
export interface EvaluateActionExecutionInput {
    actionName: string;
    params?: Record<string, string | number | boolean | object | null | undefined>;
    contextUser: UserInfo;
    policy: MJAIAgentUserPolicyEntity | null;
    /** Optional flag indicating the action communicates with external (non-org) recipients. */
    isExternalCommunication?: boolean;
    /** Optional monetary amount associated with the action. */
    financialAmount?: number | null;
    /** Optional flag indicating the action deletes data or cancels workflows. */
    isDestructive?: boolean;
    /** Evaluation timestamp (defaults to `new Date()`). */
    now?: Date;
}

/**
 * Detailed result of evaluating an action execution against the user's agent policy.
 */
export interface ActionPolicyEvaluationResult {
    verdict: AgentPolicyVerdict;
    reason: string;
    matchedRulePattern: string | null;
    nextWindowStartISO: string | null;
}

const DAY_NAMES: ReadonlyArray<'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'> = [
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
];

interface GlobalUserCacheLookup {
    GetSystemUser?: () => UserInfo | undefined;
}

/**
 * Async-local frame tracking the currently executing agent and any ancestor agents
 * whose narrowed `MJ: AI Agent User Policies` apply as ceilings (e.g. Chief of Staff
 * delegating to a specialist sub-agent).
 */
export interface ExecutingAgentFrame {
    agentId: string;
    policyCeilingAgentIds: readonly string[];
}

/**
 * Minimal async-local store contract (satisfied by Node's `AsyncLocalStorage<string | ExecutingAgentFrame>`)
 * so `@memberjunction/ai-core-plus` remains browser-safe without importing `node:async_hooks`
 * while isolating concurrent agent turns and human saves on the server.
 */
export interface ExecutingAgentContextStore {
    getStore(): string | ExecutingAgentFrame | undefined;
    run<T>(store: string | ExecutingAgentFrame, callback: () => Promise<T>): Promise<T>;
}

interface NodeProcessWithBuiltinModule {
    getBuiltinModule?: (id: string) => { AsyncLocalStorage?: new () => ExecutingAgentContextStore } | undefined;
}

interface StampedPolicyCacheEntry {
    Entry: PolicyCacheEntry;
    Stamp: number;
}

/**
 * Singleton engine that loads and evaluates `MJ: AI Agent User Policies` records.
 */
export class AgentUserPolicyEngine extends BaseSingleton<AgentUserPolicyEngine> {
    private static readonly NONE_POLICY_CACHE_TTL_MS = 30_000; // 30s negative-cache TTL when no policy row exists yet for an (agent, user) pair

    private readonly expressionEvaluator = new SafeExpressionEvaluator();
    /**
     * Global/default-provider policy cache keyed by `agent::user` pair. Kept coherent via
     * {@link HandleEntityEvent} (`save`, `delete`, `remote-invalidate`) without arbitrary size caps.
     */
    private readonly defaultPolicyCache = new Map<string, PolicyCacheEntry>();
    /**
     * Per-provider policy caches keyed weakly by `IMetadataProvider` object identity.
     * MJServer constructs a fresh provider per GraphQL/HTTP request; storing per-provider slots in a
     * `WeakMap` gives 100% intra-request cache hits while letting V8 garbage-collect both the provider
     * and any cached `BaseEntity` attached to it as soon as the request finishes — with zero arbitrary
     * entry caps and zero cross-request pinning.
     */
    private providerPolicyCaches = new WeakMap<object, Map<string, StampedPolicyCacheEntry>>();
    /** Monotonic per-`agent::user` invalidation stamps so `ClearCache(agentId, userId)` invalidates live provider maps in O(1). */
    private readonly invalidatedPairGeneration = new Map<string, number>();
    private nextGeneration = 1;
    private executingAgentStore: ExecutingAgentContextStore | null = null;
    private entityEventSubscription: Subscription | null = null;

    public constructor() {
        super();
        this.initDefaultExecutingAgentStore();
        this.subscribeToPolicyEntityEvents();
    }

    private initDefaultExecutingAgentStore(): void {
        try {
            const proc = (globalThis as { process?: NodeProcessWithBuiltinModule }).process;
            const asyncHooks = proc?.getBuiltinModule?.('node:async_hooks');
            if (asyncHooks?.AsyncLocalStorage) {
                this.executingAgentStore = new asyncHooks.AsyncLocalStorage();
            }
        } catch {
            // Browser or non-Node runtime; server packages can also register via RegisterExecutingAgentContextStore
        }
    }

    /**
     * Registers an async-local store (e.g. `new AsyncLocalStorage<string>()` from `node:async_hooks`)
     * used to track the active executing agent ID across async call trees without process-global bleed.
     */
    public RegisterExecutingAgentContextStore(store: ExecutingAgentContextStore): void {
        if (!this.executingAgentStore) {
            this.executingAgentStore = store;
        }
    }

    /**
     * Keeps the cache in step with the entity layer. A policy saved anywhere in this process (the
     * Chief of Staff app's Governance page through GraphQL, the Configure Agent User Policy action, a script)
     * replaces the cached copy; a delete evicts it; a remote invalidation from another server clears
     * the cache so the next read reloads. Without this the agent kept running on the policy it first
     * loaded until the API restarted, whatever the Governance tab showed.
     */
    private subscribeToPolicyEntityEvents(): void {
        if (this.entityEventSubscription) {
            return;
        }
        try {
            this.entityEventSubscription = MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
                this.HandleEntityEvent(event);
            });
        } catch (error) {
            LogError(`AgentUserPolicyEngine could not subscribe to entity events: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** Applies one MJGlobal event to the cache. Public so the behaviour can be driven directly in tests. */
    public HandleEntityEvent(event: MJEvent): void {
        if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode || !event.args) {
            return;
        }
        const entityEvent = event.args as BaseEntityEvent;
        const entityName = entityEvent.type === 'remote-invalidate'
            ? entityEvent.entityName
            : entityEvent.baseEntity?.EntityInfo?.Name;
        if (!entityName || entityName.trim().toLowerCase() !== POLICY_ENTITY_NAME.toLowerCase()) {
            return;
        }
        if (entityEvent.type === 'remote-invalidate') {
            this.ClearCache();
            return;
        }
        const policy = entityEvent.baseEntity as unknown as MJAIAgentUserPolicyEntity | null;
        if (!policy?.AgentID || !policy.UserID) {
            return;
        }
        if (entityEvent.type === 'save') {
            this.ClearCache(policy.AgentID, policy.UserID);
            this.SetCachedPolicy(policy);
        } else if (entityEvent.type === 'delete') {
            this.ClearCache(policy.AgentID, policy.UserID);
        }
    }

    public static get Instance(): AgentUserPolicyEngine {
        return AgentUserPolicyEngine.getInstance<AgentUserPolicyEngine>();
    }

    /**
     * Returns the ID of the agent currently executing an action in this async call tree, if any.
     * Backed by `AsyncLocalStorage` on the server so concurrent agent turns and concurrent human
     * saves never bleed across async execution contexts.
     */
    public GetActiveExecutingAgentID(): string | null {
        const stored = this.executingAgentStore?.getStore();
        if (!stored) {
            return null;
        }
        return typeof stored === 'string' ? stored : stored.agentId;
    }

    /**
     * Returns any ancestor agent IDs whose narrowed user policies act as policy ceilings for
     * the currently executing sub-agent (outermost to innermost, excluding the active agent itself).
     */
    public GetActivePolicyCeilingAgentIDs(): readonly string[] {
        const stored = this.executingAgentStore?.getStore();
        if (!stored || typeof stored === 'string') {
            return [];
        }
        return stored.policyCeilingAgentIds;
    }

    /**
     * Returns the deduplicated ordered list of all agent IDs whose policies govern the current
     * execution: the active executing agent (or `explicitAgentId`) followed by any inherited
     * parent policy ceiling agent IDs.
     */
    public GetEffectivePolicyAgentChain(explicitAgentId?: string | null): string[] {
        const seen = new Set<string>();
        const chain: string[] = [];
        const add = (id: string | null | undefined): void => {
            const trimmed = id?.trim();
            if (!trimmed) {
                return;
            }
            const lower = trimmed.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                chain.push(trimmed);
            }
        };
        add(explicitAgentId);
        add(this.GetActiveExecutingAgentID());
        for (const ceilingId of this.GetActivePolicyCeilingAgentIDs()) {
            add(ceilingId);
        }
        return chain;
    }

    /**
     * Executes `fn` inside an async-local executing-agent context so entity subclasses
     * (such as `MJAIAgentUserPolicyEntityServer`) and typed actions (`TypedActionPolicyGuard`)
     * can enforce self-only, non-widening, and parent-policy-ceiling rules without interfering
     * with concurrent human saves or sibling agent runs.
     */
    public async RunWithExecutingAgentContext<T>(
        agentId: string,
        fn: () => Promise<T>,
        policyCeilingAgentIds?: readonly string[]
    ): Promise<T> {
        const trimmed = agentId.trim();
        if (!trimmed || !this.executingAgentStore) {
            return fn();
        }
        const inherited = this.GetActivePolicyCeilingAgentIDs();
        const combinedSet = new Set<string>();
        const combined: string[] = [];
        for (const id of [...inherited, ...(policyCeilingAgentIds ?? [])]) {
            const clean = id.trim();
            if (clean && !UUIDsEqual(clean, trimmed) && !combinedSet.has(clean.toLowerCase())) {
                combinedSet.add(clean.toLowerCase());
                combined.push(clean);
            }
        }
        const frame: ExecutingAgentFrame = {
            agentId: trimmed,
            policyCeilingAgentIds: combined,
        };
        return this.executingAgentStore.run(frame, fn);
    }

    private buildPairKey(agentId: string, userId: string): string {
        return `${agentId.trim().toLowerCase()}::${userId.trim().toLowerCase()}`;
    }

    private setCacheEntry(
        agentId: string,
        userId: string,
        provider: object | null | undefined,
        policy: MJAIAgentUserPolicyEntity | null,
        noneExpiresAt = 0
    ): void {
        const pair = this.buildPairKey(agentId, userId);
        const entry: PolicyCacheEntry = { Policy: policy, NoneExpiresAt: noneExpiresAt };
        if (provider && typeof provider === 'object') {
            let map = this.providerPolicyCaches.get(provider);
            if (!map) {
                map = new Map<string, StampedPolicyCacheEntry>();
                this.providerPolicyCaches.set(provider, map);
            }
            const stamp = this.invalidatedPairGeneration.get(pair) ?? 0;
            map.set(pair, { Entry: entry, Stamp: stamp });
            return;
        }
        this.defaultPolicyCache.set(pair, entry);
    }

    private getCacheEntry(agentId: string, userId: string, provider?: object | null): PolicyCacheEntry | undefined {
        const pair = this.buildPairKey(agentId, userId);
        if (provider && typeof provider === 'object') {
            const map = this.providerPolicyCaches.get(provider);
            const stamped = map?.get(pair);
            if (!stamped) {
                return undefined;
            }
            const minStamp = this.invalidatedPairGeneration.get(pair) ?? 0;
            if (stamped.Stamp < minStamp) {
                map?.delete(pair);
                return undefined;
            }
            return stamped.Entry;
        }
        return this.defaultPolicyCache.get(pair);
    }

    private deleteCacheEntry(agentId: string, userId: string, provider?: object | null): void {
        const pair = this.buildPairKey(agentId, userId);
        if (provider && typeof provider === 'object') {
            this.providerPolicyCaches.get(provider)?.delete(pair);
            return;
        }
        this.defaultPolicyCache.delete(pair);
    }

    /** Number of default-provider cached `(agent, user)` slots (per-request provider caches live in a WeakMap). */
    public get DefaultCachedPolicySlotCount(): number {
        return this.defaultPolicyCache.size;
    }

    /** Put or update a policy entity in the in-memory cache. */
    public SetCachedPolicy(policy: MJAIAgentUserPolicyEntity, provider?: IMetadataProvider | null): void {
        if (!policy.AgentID || !policy.UserID) {
            return;
        }
        const entityProvider = (policy as { ProviderToUse?: object | null }).ProviderToUse ?? null;
        if (provider) {
            this.setCacheEntry(policy.AgentID, policy.UserID, provider, policy);
            return;
        }
        // Evict any stale copies cached under other providers for this (agentId, userId) pair first.
        this.ClearCache(policy.AgentID, policy.UserID);
        this.setCacheEntry(policy.AgentID, policy.UserID, null, policy);
        if (entityProvider) {
            this.setCacheEntry(policy.AgentID, policy.UserID, entityProvider, policy);
        }
    }

    /** Synchronously retrieve a cached policy for `(agentId, userId)` if loaded. */
    public GetCachedPolicy(
        agentId: string,
        userId: string,
        provider?: IMetadataProvider | null
    ): MJAIAgentUserPolicyEntity | null {
        if (!agentId || !userId) {
            return null;
        }
        if (provider) {
            const scoped = this.getCacheEntry(agentId, userId, provider);
            if (scoped) {
                return scoped.Policy;
            }
        }
        return this.getCacheEntry(agentId, userId, null)?.Policy ?? null;
    }

    /** Clear all cached policies (or a single `(agentId, userId)` pair across all or one provider). */
    public ClearCache(agentId?: string, userId?: string, provider?: IMetadataProvider | null): void {
        if (agentId && userId) {
            if (provider) {
                this.deleteCacheEntry(agentId, userId, provider);
                return;
            }
            const pair = this.buildPairKey(agentId, userId);
            this.defaultPolicyCache.delete(pair);
            this.invalidatedPairGeneration.set(pair, this.nextGeneration++);
            return;
        }
        this.defaultPolicyCache.clear();
        this.providerPolicyCaches = new WeakMap<object, Map<string, StampedPolicyCacheEntry>>();
        this.invalidatedPairGeneration.clear();
    }

    private resolvePolicyLookupUser(contextUser: UserInfo): UserInfo {
        try {
            const store = GetGlobalObjectStore() as Record<string, unknown> | null;
            const userCache = store?.['___SINGLETON__UserCache'] as GlobalUserCacheLookup | undefined;
            const sysUser = typeof userCache?.GetSystemUser === 'function' ? userCache.GetSystemUser() : undefined;
            if (sysUser?.ID) {
                return sysUser;
            }
        } catch (err) {
            LogError(
                `AgentUserPolicyEngine.resolvePolicyLookupUser failed to read system user: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
        return contextUser;
    }

    /**
     * Load the active/configured `MJAIAgentUserPolicyEntity` for `(agentId, userId)` with an
     * explicit tri-state outcome (`found` | `none` | `error`).
     *
     * Security-critical callers MUST check `status === 'error'` and fail closed rather than
     * treating a database or RunView failure as "no narrowing policy configured".
     */
    public async ResolvePolicyForAgentAndUser(
        agentId: string,
        userId: string,
        contextUser: UserInfo,
        options?: ResolvePolicyLookupOptions
    ): Promise<PolicyLookupResult> {
        const forceRefresh = options?.forceRefresh === true;
        if (!forceRefresh) {
            const cached = this.getCacheEntry(agentId, userId, options?.provider);
            if (cached) {
                if (cached.Policy) {
                    return { status: 'found', policy: cached.Policy };
                }
                if (Date.now() < cached.NoneExpiresAt) {
                    return { status: 'none', policy: null };
                }
                this.deleteCacheEntry(agentId, userId, options?.provider);
            }
            if (options?.provider) {
                const defaultCached = this.getCacheEntry(agentId, userId, null)?.Policy ?? null;
                if (defaultCached) {
                    return { status: 'found', policy: defaultCached };
                }
            }
        }

        try {
            const rv = options?.provider ? RunView.FromMetadataProvider(options.provider) : new RunView();
            const safeAgentId = EscapeSQLString(agentId);
            const safeUserId = EscapeSQLString(userId);
            const lookupUser = this.resolvePolicyLookupUser(contextUser);
            const result = await rv.RunView<MJAIAgentUserPolicyEntity>(
                {
                    EntityName: 'MJ: AI Agent User Policies',
                    ExtraFilter: `AgentID='${safeAgentId}' AND UserID='${safeUserId}'`,
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'entity_object',
                },
                lookupUser
            );
            if (!result.Success) {
                const errMessage = result.ErrorMessage || 'RunView returned Success=false loading MJ: AI Agent User Policies';
                LogError(
                    `AgentUserPolicyEngine.ResolvePolicyForAgentAndUser failed for agent=${agentId}, user=${userId}: ${errMessage}`
                );
                return { status: 'error', policy: null, errorMessage: errMessage };
            }
            if (result.Results.length > 0) {
                const policy = result.Results[0];
                this.setCacheEntry(agentId, userId, options?.provider, policy);
                return { status: 'found', policy };
            }
            this.setCacheEntry(agentId, userId, options?.provider, null, Date.now() + AgentUserPolicyEngine.NONE_POLICY_CACHE_TTL_MS);
            return { status: 'none', policy: null };
        } catch (error) {
            const errMessage = error instanceof Error ? error.message : String(error);
            const missingRunViewProvider =
                Boolean(options?.provider) &&
                typeof (options?.provider as Partial<IRunViewProvider>).RunView !== 'function';
            if (!missingRunViewProvider) {
                LogError(
                    `AgentUserPolicyEngine.ResolvePolicyForAgentAndUser threw for agent=${agentId}, user=${userId}: ${errMessage}`
                );
            }
            return {
                status: 'error',
                policy: null,
                errorMessage: errMessage,
                ...(missingRunViewProvider ? { missingRunViewProvider: true } : {}),
            };
        }
    }

    /**
     * Load the active/configured `MJAIAgentUserPolicyEntity` for `(agentId, userId)`.
     * Returns `null` when no policy row has been created yet or when lookup fails.
     * Prefer {@link ResolvePolicyForAgentAndUser} in authorization paths so lookup errors fail closed.
     */
    public async GetPolicyForAgentAndUser(
        agentId: string,
        userId: string,
        contextUser: UserInfo,
        forceRefresh: boolean = false
    ): Promise<MJAIAgentUserPolicyEntity | null> {
        const lookup = await this.ResolvePolicyForAgentAndUser(agentId, userId, contextUser, { forceRefresh });
        return lookup.policy;
    }

    /**
     * Resolves and intersects user policies across an agent's `BaseAgentID` prototype inheritance
     * chain (`[rootAgentId, ..., leafAgentId]`) using strictest-wins ceiling semantics.
     *
     * Fast-path: when only a single agent in the chain has a policy row (the common case where
     * only a personal instance like *Pepper* has a policy), returns that policy directly in O(1).
     */
    public async GetEffectivePolicyForAgentChain(
        agentChainIds: readonly string[],
        userId: string,
        contextUser: UserInfo,
        options?: ResolvePolicyLookupOptions
    ): Promise<MJAIAgentUserPolicyEntity | null> {
        const uniqueIds = this.deduplicateOrderedAgentIds(agentChainIds);
        if (uniqueIds.length === 0 || !userId) {
            return null;
        }
        const lookups = await Promise.all(
            uniqueIds.map((agentId) => this.ResolvePolicyForAgentAndUser(agentId, userId, contextUser, options))
        );
        const policies: MJAIAgentUserPolicyEntity[] = [];
        for (const lookup of lookups) {
            if (lookup.status === 'found' && lookup.policy) {
                policies.push(lookup.policy);
            }
        }
        return this.IntersectPolicies(policies);
    }

    /**
     * Synchronous counterpart to {@link GetEffectivePolicyForAgentChain} over already-cached
     * policies in memory.
     */
    public GetCachedEffectivePolicyForAgentChain(
        agentChainIds: readonly string[],
        userId: string,
        provider?: IMetadataProvider | null
    ): MJAIAgentUserPolicyEntity | null {
        const uniqueIds = this.deduplicateOrderedAgentIds(agentChainIds);
        if (uniqueIds.length === 0 || !userId) {
            return null;
        }
        const policies: MJAIAgentUserPolicyEntity[] = [];
        for (const agentId of uniqueIds) {
            const cached = this.GetCachedPolicy(agentId, userId, provider);
            if (cached) {
                policies.push(cached);
            }
        }
        return this.IntersectPolicies(policies);
    }

    /**
     * Combines an ordered list of policies from `[rootAgent ... leafAgent]` into a single
     * effective policy using strictest-wins ceiling semantics:
     * - `Status`, `CoordinationMode`, `DefaultDataAccessMode`, and all channel modes take the
     *   minimum (most restrictive) rank across the chain.
     * - `AllowInterAgentCoordination` is ANDed across the chain.
     * - `RequireApprovalForExternalComms`, `RequireApprovalForFinancials`, and
     *   `RequireApprovalForDestructiveActions` are ORed across the chain.
     * - `AutoApproveAmountThreshold` takes the strictest ceiling (`null` beats any finite value;
     *   otherwise `Math.min`).
     * - `EntityAccessRules` and `ActionPolicyRules` concatenate root -> leaf so every ancestor
     *   rule remains enforced alongside leaf narrowings.
     * - Personalization metadata (`DisplayNameOverride`, `OnboardingStatus`, `PreferredPersonaID`)
     *   takes the nearest descendant value (leaf wins), while non-empty `InstructionsOverride`
     *   values stack root -> leaf.
     *
     * Does not mutate any input entity. Returns `null` when empty, or the single policy directly
     * when only one policy is present.
     */
    public IntersectPolicies(
        policies: ReadonlyArray<MJAIAgentUserPolicyEntity | null | undefined>
    ): MJAIAgentUserPolicyEntity | null {
        const present = policies.filter((p): p is MJAIAgentUserPolicyEntity => p != null);
        if (present.length === 0) {
            return null;
        }
        if (present.length === 1) {
            return present[0];
        }

        const leaf = present[present.length - 1];

        const statusRank: Record<MJAIAgentUserPolicyEntity['Status'], number> = {
            Disabled: 0,
            Paused: 1,
            Active: 2,
        };
        const coordRank: Record<MJAIAgentUserPolicyEntity['CoordinationMode'], number> = {
            Observer: 0,
            Coordinator: 1,
            Autonomous: 2,
        };
        const dataModeRank: Record<MJAIAgentUserPolicyEntity['DefaultDataAccessMode'], number> = {
            AllowListOnly: 0,
            ReadOnly: 1,
            UserCeiling: 2,
        };
        const emailRank: Record<MJAIAgentUserPolicyEntity['EmailChannelMode'], number> = {
            Disabled: 0,
            ReadOnly: 1,
            DraftOnly: 2,
            SendAsAgent: 3,
            SendAsUser: 4,
        };
        const phoneRank: Record<MJAIAgentUserPolicyEntity['PhoneChannelMode'], number> = {
            Disabled: 0,
            InboundOnly: 1,
            OutboundWithApproval: 2,
            OutboundAutonomous: 3,
        };
        const calendarRank: Record<MJAIAgentUserPolicyEntity['CalendarChannelMode'], number> = {
            Disabled: 0,
            ReadOnly: 1,
            ProposeWithApproval: 2,
            Autonomous: 3,
        };
        const msgRank: Record<MJAIAgentUserPolicyEntity['MessagingChannelMode'], number> = {
            Disabled: 0,
            Enabled: 1,
        };

        const pickStrictest = <T extends string>(values: readonly T[], ranks: Record<T, number>): T => {
            let best = values[0];
            let bestRank = ranks[best];
            for (let i = 1; i < values.length; i++) {
                const candidate = values[i];
                const rank = ranks[candidate];
                if (rank < bestRank) {
                    best = candidate;
                    bestRank = rank;
                }
            }
            return best;
        };

        const effectiveStatus = pickStrictest(
            present.map((p) => p.Status ?? DEFAULT_AGENT_USER_POLICY_POSTURE.Status),
            statusRank
        );
        const effectiveCoordinationMode = pickStrictest(
            present.map((p) => p.CoordinationMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CoordinationMode),
            coordRank
        );
        const effectiveAllowInterAgent = present.every(
            (p) => (p.AllowInterAgentCoordination ?? DEFAULT_AGENT_USER_POLICY_POSTURE.AllowInterAgentCoordination) === true
        );
        const effectiveDataMode = pickStrictest(
            present.map((p) => p.DefaultDataAccessMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.DefaultDataAccessMode),
            dataModeRank
        );
        const effectiveEmailMode = pickStrictest(
            present.map((p) => p.EmailChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.EmailChannelMode),
            emailRank
        );
        const effectivePhoneMode = pickStrictest(
            present.map((p) => p.PhoneChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.PhoneChannelMode),
            phoneRank
        );
        const effectiveCalendarMode = pickStrictest(
            present.map((p) => p.CalendarChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CalendarChannelMode),
            calendarRank
        );
        const effectiveMessagingMode = pickStrictest(
            present.map((p) => p.MessagingChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.MessagingChannelMode),
            msgRank
        );
        const effectiveReqExternal = present.some((p) => p.RequireApprovalForExternalComms !== false);
        const effectiveReqFinancials = present.some((p) => p.RequireApprovalForFinancials !== false);
        const effectiveReqDestructive = present.some((p) => p.RequireApprovalForDestructiveActions !== false);

        let effectiveAutoApproveThreshold: number | null = null;
        if (present.every((p) => p.AutoApproveAmountThreshold != null)) {
            effectiveAutoApproveThreshold = Math.min(
                ...present.map((p) => p.AutoApproveAmountThreshold as number)
            );
        }

        const combinedEntityRules: MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[] = [];
        const combinedActionRules: MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[] = [];
        const instructionParts: string[] = [];
        for (const p of present) {
            combinedEntityRules.push(...this.resolveEntityRules(p));
            combinedActionRules.push(...this.resolveActionRules(p));
            if (p.InstructionsOverride && p.InstructionsOverride.trim().length > 0) {
                instructionParts.push(p.InstructionsOverride.trim());
            }
        }

        const serializedEntityRules = combinedEntityRules.length > 0 ? JSON.stringify(combinedEntityRules) : null;
        const serializedActionRules = combinedActionRules.length > 0 ? JSON.stringify(combinedActionRules) : null;
        const stackedInstructions = instructionParts.length > 0 ? instructionParts.join('\n\n') : null;

        let effectiveDisplayName: string | null = null;
        let effectivePreferredPersonaId: string | null = null;
        for (let i = present.length - 1; i >= 0; i--) {
            if (!effectiveDisplayName && present[i].DisplayNameOverride?.trim()) {
                effectiveDisplayName = present[i].DisplayNameOverride;
            }
            if (!effectivePreferredPersonaId && present[i].PreferredPersonaID) {
                effectivePreferredPersonaId = present[i].PreferredPersonaID;
            }
        }

        return Object.create(leaf, {
            Status: { get: () => effectiveStatus, enumerable: true, configurable: true },
            CoordinationMode: { get: () => effectiveCoordinationMode, enumerable: true, configurable: true },
            AllowInterAgentCoordination: { get: () => effectiveAllowInterAgent, enumerable: true, configurable: true },
            DefaultDataAccessMode: { get: () => effectiveDataMode, enumerable: true, configurable: true },
            EmailChannelMode: { get: () => effectiveEmailMode, enumerable: true, configurable: true },
            PhoneChannelMode: { get: () => effectivePhoneMode, enumerable: true, configurable: true },
            CalendarChannelMode: { get: () => effectiveCalendarMode, enumerable: true, configurable: true },
            MessagingChannelMode: { get: () => effectiveMessagingMode, enumerable: true, configurable: true },
            RequireApprovalForExternalComms: { get: () => effectiveReqExternal, enumerable: true, configurable: true },
            RequireApprovalForFinancials: { get: () => effectiveReqFinancials, enumerable: true, configurable: true },
            RequireApprovalForDestructiveActions: { get: () => effectiveReqDestructive, enumerable: true, configurable: true },
            AutoApproveAmountThreshold: { get: () => effectiveAutoApproveThreshold, enumerable: true, configurable: true },
            EntityAccessRules: { get: () => serializedEntityRules, enumerable: true, configurable: true },
            EntityAccessRulesObject: { get: () => combinedEntityRules, enumerable: true, configurable: true },
            ActionPolicyRules: { get: () => serializedActionRules, enumerable: true, configurable: true },
            ActionPolicyRulesObject: { get: () => combinedActionRules, enumerable: true, configurable: true },
            DisplayNameOverride: { get: () => effectiveDisplayName, enumerable: true, configurable: true },
            PreferredPersonaID: { get: () => effectivePreferredPersonaId, enumerable: true, configurable: true },
            InstructionsOverride: { get: () => stackedInstructions, enumerable: true, configurable: true },
        }) as MJAIAgentUserPolicyEntity;
    }

    private deduplicateOrderedAgentIds(agentIds: readonly string[]): string[] {
        const seen = new Set<string>();
        const result: string[] = [];
        for (const id of agentIds) {
            const trimmed = id?.trim();
            if (!trimmed) {
                continue;
            }
            const lower = trimmed.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                result.push(trimmed);
            }
        }
        return result;
    }

    /**
     * Capture an immutable snapshot of permission-bearing fields on a policy entity before
     * in-place mutation so {@link DetectAgentPolicyWidening} can compare against the baseline.
     */
    public SnapshotPolicy(policy: MJAIAgentUserPolicyEntity): AgentPolicyBaselineSnapshot {
        return {
            Status: policy.Status ?? DEFAULT_AGENT_USER_POLICY_POSTURE.Status,
            CoordinationMode: policy.CoordinationMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CoordinationMode,
            AllowInterAgentCoordination:
                policy.AllowInterAgentCoordination ?? DEFAULT_AGENT_USER_POLICY_POSTURE.AllowInterAgentCoordination,
            DefaultDataAccessMode:
                policy.DefaultDataAccessMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.DefaultDataAccessMode,
            EmailChannelMode: policy.EmailChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.EmailChannelMode,
            PhoneChannelMode: policy.PhoneChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.PhoneChannelMode,
            MessagingChannelMode:
                policy.MessagingChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.MessagingChannelMode,
            CalendarChannelMode: policy.CalendarChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CalendarChannelMode,
            RequireApprovalForExternalComms: policy.RequireApprovalForExternalComms !== false,
            RequireApprovalForFinancials: policy.RequireApprovalForFinancials !== false,
            RequireApprovalForDestructiveActions: policy.RequireApprovalForDestructiveActions !== false,
            AutoApproveAmountThreshold: policy.AutoApproveAmountThreshold ?? null,
            EntityAccessRules: JSON.parse(JSON.stringify(this.resolveEntityRules(policy))) as MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[],
            ActionPolicyRules: JSON.parse(JSON.stringify(this.resolveActionRules(policy))) as MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[],
        };
    }

    /**
     * Reconstructs the pre-save {@link AgentPolicyBaselineSnapshot} of an existing (`IsSaved === true`)
     * policy entity from its `EntityField.OldValue` entries so entity-level `Validate()` / `Save()`
     * hooks can detect policy widening even after fields have already been mutated in memory.
     */
    public SnapshotPolicyFromOldValues(policy: MJAIAgentUserPolicyEntity): AgentPolicyBaselineSnapshot | null {
        if (!policy.IsSaved) {
            return null;
        }
        const readOld = <K extends keyof MJAIAgentUserPolicyEntity>(
            fieldName: K
        ): MJAIAgentUserPolicyEntity[K] => {
            if (typeof policy.GetFieldByName === 'function') {
                const field = policy.GetFieldByName(String(fieldName));
                if (field && field.OldValue !== undefined) {
                    return field.OldValue as MJAIAgentUserPolicyEntity[K];
                }
            }
            return policy[fieldName];
        };

        const rawEntityRules = readOld('EntityAccessRules');
        const parsedEntityRules =
            typeof rawEntityRules === 'string' && rawEntityRules.trim().length > 0
                ? SafeJSONParse<MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[]>(rawEntityRules) ?? []
                : [];
        const rawActionRules = readOld('ActionPolicyRules');
        const parsedActionRules =
            typeof rawActionRules === 'string' && rawActionRules.trim().length > 0
                ? SafeJSONParse<MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[]>(rawActionRules) ?? []
                : [];

        return {
            Status: readOld('Status') ?? DEFAULT_AGENT_USER_POLICY_POSTURE.Status,
            CoordinationMode: readOld('CoordinationMode') ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CoordinationMode,
            AllowInterAgentCoordination:
                readOld('AllowInterAgentCoordination') ?? DEFAULT_AGENT_USER_POLICY_POSTURE.AllowInterAgentCoordination,
            DefaultDataAccessMode:
                readOld('DefaultDataAccessMode') ?? DEFAULT_AGENT_USER_POLICY_POSTURE.DefaultDataAccessMode,
            EmailChannelMode: readOld('EmailChannelMode') ?? DEFAULT_AGENT_USER_POLICY_POSTURE.EmailChannelMode,
            PhoneChannelMode: readOld('PhoneChannelMode') ?? DEFAULT_AGENT_USER_POLICY_POSTURE.PhoneChannelMode,
            MessagingChannelMode:
                readOld('MessagingChannelMode') ?? DEFAULT_AGENT_USER_POLICY_POSTURE.MessagingChannelMode,
            CalendarChannelMode:
                readOld('CalendarChannelMode') ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CalendarChannelMode,
            RequireApprovalForExternalComms: readOld('RequireApprovalForExternalComms') !== false,
            RequireApprovalForFinancials: readOld('RequireApprovalForFinancials') !== false,
            RequireApprovalForDestructiveActions: readOld('RequireApprovalForDestructiveActions') !== false,
            AutoApproveAmountThreshold: readOld('AutoApproveAmountThreshold') ?? null,
            EntityAccessRules: JSON.parse(
                JSON.stringify(parsedEntityRules)
            ) as MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[],
            ActionPolicyRules: JSON.parse(
                JSON.stringify(parsedActionRules)
            ) as MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[],
        };
    }

    /**
     * Compare a proposed `MJAIAgentUserPolicyEntity` against `baseline` (or self-onboarding
     * defaults {@link DEFAULT_AGENT_USER_POLICY_POSTURE} when `baseline === null`) and return a
     * list of human-readable policy-widening violations.
     *
     * Used when an agent invokes `Configure Agent User Policy` on its own behalf so a prompt-injected
     * agent can narrow or personalize its policy during onboarding, but can NEVER loosen approval gates,
     * drop/weaken entity/action rules, unpause itself, or escalate channel/coordination modes.
     */
    public DetectAgentPolicyWidening(
        baseline: AgentPolicyBaselineSnapshot | null,
        proposed: MJAIAgentUserPolicyEntity
    ): string[] {
        const effectiveBaseline: AgentPolicyBaselineSnapshot = baseline ?? {
            Status: DEFAULT_AGENT_USER_POLICY_POSTURE.Status,
            CoordinationMode: DEFAULT_AGENT_USER_POLICY_POSTURE.CoordinationMode,
            AllowInterAgentCoordination: DEFAULT_AGENT_USER_POLICY_POSTURE.AllowInterAgentCoordination,
            DefaultDataAccessMode: DEFAULT_AGENT_USER_POLICY_POSTURE.DefaultDataAccessMode,
            EmailChannelMode: DEFAULT_AGENT_USER_POLICY_POSTURE.EmailChannelMode,
            PhoneChannelMode: DEFAULT_AGENT_USER_POLICY_POSTURE.PhoneChannelMode,
            MessagingChannelMode: DEFAULT_AGENT_USER_POLICY_POSTURE.MessagingChannelMode,
            CalendarChannelMode: DEFAULT_AGENT_USER_POLICY_POSTURE.CalendarChannelMode,
            RequireApprovalForExternalComms: DEFAULT_AGENT_USER_POLICY_POSTURE.RequireApprovalForExternalComms,
            RequireApprovalForFinancials: DEFAULT_AGENT_USER_POLICY_POSTURE.RequireApprovalForFinancials,
            RequireApprovalForDestructiveActions:
                DEFAULT_AGENT_USER_POLICY_POSTURE.RequireApprovalForDestructiveActions,
            AutoApproveAmountThreshold: DEFAULT_AGENT_USER_POLICY_POSTURE.AutoApproveAmountThreshold,
            EntityAccessRules: [],
            ActionPolicyRules: [],
        };

        const violations: string[] = [];

        const statusRank: Record<MJAIAgentUserPolicyEntity['Status'], number> = {
            Disabled: 0,
            Paused: 1,
            Active: 2,
        };
        const nextStatus = proposed.Status ?? DEFAULT_AGENT_USER_POLICY_POSTURE.Status;
        if (statusRank[nextStatus] > statusRank[effectiveBaseline.Status]) {
            violations.push(`Cannot widen Status from '${effectiveBaseline.Status}' to '${nextStatus}'.`);
        }

        const coordRank: Record<MJAIAgentUserPolicyEntity['CoordinationMode'], number> = {
            Observer: 0,
            Coordinator: 1,
            Autonomous: 2,
        };
        const nextCoord = proposed.CoordinationMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CoordinationMode;
        if (coordRank[nextCoord] > coordRank[effectiveBaseline.CoordinationMode]) {
            violations.push(
                `Cannot widen CoordinationMode from '${effectiveBaseline.CoordinationMode}' to '${nextCoord}'.`
            );
        }

        const nextInterAgent =
            proposed.AllowInterAgentCoordination ?? DEFAULT_AGENT_USER_POLICY_POSTURE.AllowInterAgentCoordination;
        if (nextInterAgent && !effectiveBaseline.AllowInterAgentCoordination) {
            violations.push('Cannot enable AllowInterAgentCoordination when disabled in baseline policy.');
        }

        const dataModeRank: Record<MJAIAgentUserPolicyEntity['DefaultDataAccessMode'], number> = {
            AllowListOnly: 0,
            ReadOnly: 1,
            UserCeiling: 2,
        };
        const nextDataMode =
            proposed.DefaultDataAccessMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.DefaultDataAccessMode;
        if (dataModeRank[nextDataMode] > dataModeRank[effectiveBaseline.DefaultDataAccessMode]) {
            violations.push(
                `Cannot widen DefaultDataAccessMode from '${effectiveBaseline.DefaultDataAccessMode}' to '${nextDataMode}'.`
            );
        }

        const emailRank: Record<MJAIAgentUserPolicyEntity['EmailChannelMode'], number> = {
            Disabled: 0,
            ReadOnly: 1,
            DraftOnly: 2,
            SendAsAgent: 3,
            SendAsUser: 4,
        };
        const nextEmail = proposed.EmailChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.EmailChannelMode;
        if (emailRank[nextEmail] > emailRank[effectiveBaseline.EmailChannelMode]) {
            violations.push(
                `Cannot widen EmailChannelMode from '${effectiveBaseline.EmailChannelMode}' to '${nextEmail}'.`
            );
        }

        const phoneRank: Record<MJAIAgentUserPolicyEntity['PhoneChannelMode'], number> = {
            Disabled: 0,
            InboundOnly: 1,
            OutboundWithApproval: 2,
            OutboundAutonomous: 3,
        };
        const nextPhone = proposed.PhoneChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.PhoneChannelMode;
        if (phoneRank[nextPhone] > phoneRank[effectiveBaseline.PhoneChannelMode]) {
            violations.push(
                `Cannot widen PhoneChannelMode from '${effectiveBaseline.PhoneChannelMode}' to '${nextPhone}'.`
            );
        }

        const calendarRank: Record<MJAIAgentUserPolicyEntity['CalendarChannelMode'], number> = {
            Disabled: 0,
            ReadOnly: 1,
            ProposeWithApproval: 2,
            Autonomous: 3,
        };
        const nextCalendar =
            proposed.CalendarChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CalendarChannelMode;
        if (calendarRank[nextCalendar] > calendarRank[effectiveBaseline.CalendarChannelMode]) {
            violations.push(
                `Cannot widen CalendarChannelMode from '${effectiveBaseline.CalendarChannelMode}' to '${nextCalendar}'.`
            );
        }

        const msgRank: Record<MJAIAgentUserPolicyEntity['MessagingChannelMode'], number> = {
            Disabled: 0,
            Enabled: 1,
        };
        const nextMsg = proposed.MessagingChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.MessagingChannelMode;
        if (msgRank[nextMsg] > msgRank[effectiveBaseline.MessagingChannelMode]) {
            violations.push(
                `Cannot widen MessagingChannelMode from '${effectiveBaseline.MessagingChannelMode}' to '${nextMsg}'.`
            );
        }

        if (effectiveBaseline.RequireApprovalForExternalComms && proposed.RequireApprovalForExternalComms === false) {
            violations.push('Cannot disable RequireApprovalForExternalComms.');
        }
        if (effectiveBaseline.RequireApprovalForFinancials && proposed.RequireApprovalForFinancials === false) {
            violations.push('Cannot disable RequireApprovalForFinancials.');
        }
        if (
            effectiveBaseline.RequireApprovalForDestructiveActions &&
            proposed.RequireApprovalForDestructiveActions === false
        ) {
            violations.push('Cannot disable RequireApprovalForDestructiveActions.');
        }

        const nextThreshold = proposed.AutoApproveAmountThreshold ?? null;
        if (nextThreshold != null) {
            if (effectiveBaseline.AutoApproveAmountThreshold == null) {
                violations.push(`Cannot set AutoApproveAmountThreshold (${nextThreshold}) when baseline has none.`);
            } else if (nextThreshold > effectiveBaseline.AutoApproveAmountThreshold) {
                violations.push(
                    `Cannot increase AutoApproveAmountThreshold from ${effectiveBaseline.AutoApproveAmountThreshold} to ${nextThreshold}.`
                );
            }
        }

        this.detectEntityRuleWidening(
            effectiveBaseline.EntityAccessRules,
            this.resolveEntityRules(proposed),
            effectiveBaseline.DefaultDataAccessMode,
            violations
        );
        this.detectActionRuleWidening(
            effectiveBaseline.ActionPolicyRules,
            this.resolveActionRules(proposed),
            violations
        );

        return violations;
    }

    /**
     * Evaluate whether an agent running as `contextUser` may perform `operation` on `entityName`.
     * Enforces:
     * 1. `contextUser`'s MJ EntityPermission ceiling (hard ceiling — never widened)
     * 2. `policy.Status` & `policy.DefaultDataAccessMode`
     * 3. Matching `EntityAccessRules` CRUD narrowing
     * 4. Time window gates (`timeWindows` + `outsideWindowBehavior`)
     * 5. Row-Level Security narrowing (`whereClause` validated via `SQLExpressionValidator` + `recordConditionExpression`)
     * 6. Field-Level Security narrowing (`deniedFields`, `readOnlyFields`, `requireApprovalFields`)
     */
    public EvaluateEntityAccess(input: EvaluateEntityAccessInput): EntityAccessEvaluationResult {
        const now = input.now ?? new Date();
        const ceiling =
            input.userPermissionCeiling ??
            this.resolveUserEntityPermissionCeiling(input.entityName, input.contextUser, input.provider);

        // 1. Enforce hard user permission ceiling first
        if (!this.isAllowedByUserCeiling(input.operation, ceiling)) {
            return {
                verdict: 'Deny',
                reason: `User '${input.contextUser.Name || input.contextUser.ID}' does not have '${input.operation}' permission on entity '${input.entityName}'. Agent cannot exceed the user's permission ceiling.`,
                combinedRlsWhereClause: null,
                rlsFilterIds: [],
                deniedFieldPatterns: [],
                readOnlyFieldPatterns: [],
                requireApprovalFieldPatterns: [],
                nextWindowStartISO: null,
            };
        }

        const policy = input.policy;
        if (!policy) {
            return {
                verdict: 'Allow',
                reason: 'Permitted within user permission ceiling (no narrowing policy configured).',
                combinedRlsWhereClause: null,
                rlsFilterIds: [],
                deniedFieldPatterns: [],
                readOnlyFieldPatterns: [],
                requireApprovalFieldPatterns: [],
                nextWindowStartISO: null,
            };
        }

        if (policy.Status === 'Disabled') {
            return {
                verdict: 'Deny',
                reason: 'Agent user policy status is Disabled.',
                combinedRlsWhereClause: null,
                rlsFilterIds: [],
                deniedFieldPatterns: [],
                readOnlyFieldPatterns: [],
                requireApprovalFieldPatterns: [],
                nextWindowStartISO: null,
            };
        }

        const rules = this.resolveEntityRules(policy);
        const matchingRules = rules.filter((r) => this.matchesWildcardPattern(input.entityName, r.entityPattern));

        const whereClauses: string[] = [];
        const rlsFilterIds: string[] = [];
        const deniedFieldPatterns: string[] = [];
        const readOnlyFieldPatterns: string[] = [];
        const requireApprovalFieldPatterns: string[] = [];

        for (const rule of matchingRules) {
            if (rule.rlsNarrowing?.rowLevelSecurityFilterId) {
                rlsFilterIds.push(rule.rlsNarrowing.rowLevelSecurityFilterId);
            }
            if (rule.rlsNarrowing?.whereClause) {
                const validatedClause = this.validateAndInterpolateWhereClause(
                    rule.rlsNarrowing.whereClause,
                    input.contextUser
                );
                if (!validatedClause.valid) {
                    return {
                        verdict: 'Deny',
                        reason: `Entity RLS whereClause rejected by SQLExpressionValidator: ${validatedClause.error}`,
                        combinedRlsWhereClause: null,
                        rlsFilterIds,
                        deniedFieldPatterns,
                        readOnlyFieldPatterns,
                        requireApprovalFieldPatterns,
                        nextWindowStartISO: null,
                    };
                }
                if (validatedClause.sql) {
                    whereClauses.push(`(${validatedClause.sql})`);
                }
            }
            if (rule.flsNarrowing?.deniedFields) {
                deniedFieldPatterns.push(...rule.flsNarrowing.deniedFields);
            }
            if (rule.flsNarrowing?.readOnlyFields) {
                readOnlyFieldPatterns.push(...rule.flsNarrowing.readOnlyFields);
            }
            if (rule.flsNarrowing?.requireApprovalFields) {
                requireApprovalFieldPatterns.push(...rule.flsNarrowing.requireApprovalFields);
            }
        }

        const combinedRlsWhereClause = whereClauses.length > 0 ? whereClauses.join(' AND ') : null;
        const isWriteOperation = input.operation !== 'Read';

        // 2. Check DefaultDataAccessMode when no explicit rule matched
        if (matchingRules.length === 0) {
            if (policy.DefaultDataAccessMode === 'AllowListOnly') {
                return {
                    verdict: 'Deny',
                    reason: `Entity '${input.entityName}' is not listed in EntityAccessRules and DefaultDataAccessMode is AllowListOnly.`,
                    combinedRlsWhereClause,
                    rlsFilterIds,
                    deniedFieldPatterns,
                    readOnlyFieldPatterns,
                    requireApprovalFieldPatterns,
                    nextWindowStartISO: null,
                };
            }
            if (policy.DefaultDataAccessMode === 'ReadOnly' && isWriteOperation) {
                return {
                    verdict: 'Deny',
                    reason: `Write operation '${input.operation}' on '${input.entityName}' blocked because DefaultDataAccessMode is ReadOnly.`,
                    combinedRlsWhereClause,
                    rlsFilterIds,
                    deniedFieldPatterns,
                    readOnlyFieldPatterns,
                    requireApprovalFieldPatterns,
                    nextWindowStartISO: null,
                };
            }
        }

        let finalVerdict: AgentPolicyVerdict = 'Allow';
        let finalReason = 'Permitted by user policy.';
        let nextWindowStartISO: string | null = null;

        // 3. Destructive operation gate on Delete
        if (input.operation === 'Delete' && policy.RequireApprovalForDestructiveActions) {
            finalVerdict = 'RequireApproval';
            finalReason = `Deleting from '${input.entityName}' requires user approval (RequireApprovalForDestructiveActions=true).`;
        }

        // 4. Evaluate each matching rule (most restrictive verdict wins)
        for (const rule of matchingRules) {
            if (rule.access === 'Deny') {
                return {
                    verdict: 'Deny',
                    reason: `Entity rule '${rule.entityPattern}' denies all access to '${input.entityName}'.`,
                    combinedRlsWhereClause,
                    rlsFilterIds,
                    deniedFieldPatterns,
                    readOnlyFieldPatterns,
                    requireApprovalFieldPatterns,
                    nextWindowStartISO: null,
                };
            }
            if (rule.access === 'ReadOnly' && isWriteOperation) {
                return {
                    verdict: 'Deny',
                    reason: `Entity rule '${rule.entityPattern}' restricts '${input.entityName}' to ReadOnly.`,
                    combinedRlsWhereClause,
                    rlsFilterIds,
                    deniedFieldPatterns,
                    readOnlyFieldPatterns,
                    requireApprovalFieldPatterns,
                    nextWindowStartISO: null,
                };
            }
            if (rule.access === 'RequireApprovalOnWrite' && isWriteOperation) {
                finalVerdict = 'RequireApproval';
                finalReason = `Entity rule '${rule.entityPattern}' requires user approval for '${input.operation}' on '${input.entityName}'.`;
            }

            // Evaluate Time Windows on the rule
            if (rule.timeWindows && rule.timeWindows.length > 0) {
                const windowEval = this.evaluateTimeWindows(rule.timeWindows, now, isWriteOperation);
                if (!windowEval.inWindow) {
                    if (windowEval.verdict === 'Deny') {
                        return {
                            verdict: 'Deny',
                            reason: windowEval.reason,
                            combinedRlsWhereClause,
                            rlsFilterIds,
                            deniedFieldPatterns,
                            readOnlyFieldPatterns,
                            requireApprovalFieldPatterns,
                            nextWindowStartISO: null,
                        };
                    }
                    if (windowEval.verdict === 'DeferUntilNextWindow') {
                        finalVerdict = 'DeferUntilNextWindow';
                        finalReason = windowEval.reason;
                        nextWindowStartISO = windowEval.nextWindowStartISO;
                    } else if (windowEval.verdict === 'RequireApproval' && finalVerdict === 'Allow') {
                        finalVerdict = 'RequireApproval';
                        finalReason = windowEval.reason;
                    }
                }
            }

            // Evaluate record-level SafeExpressionEvaluator RLS condition if a record was supplied
            if (input.record && rule.rlsNarrowing?.recordConditionExpression) {
                const exprResult = this.expressionEvaluator.evaluate(
                    rule.rlsNarrowing.recordConditionExpression,
                    {
                        record: input.record,
                        user: {
                            ID: input.contextUser.ID,
                            Email: input.contextUser.Email,
                            Name: input.contextUser.Name,
                        },
                        nowIso: now.toISOString(),
                    }
                );
                if (!exprResult.success || !exprResult.value) {
                    return {
                        verdict: 'Deny',
                        reason: `Record failed policy RLS recordConditionExpression '${rule.rlsNarrowing.recordConditionExpression}'.`,
                        combinedRlsWhereClause,
                        rlsFilterIds,
                        deniedFieldPatterns,
                        readOnlyFieldPatterns,
                        requireApprovalFieldPatterns,
                        nextWindowStartISO: null,
                    };
                }
            }
        }

        // 5. Evaluate FLS field narrowing on Create/Update mutations
        if (isWriteOperation && input.mutatedFields && input.mutatedFields.length > 0) {
            for (const field of input.mutatedFields) {
                if (deniedFieldPatterns.some((p) => this.matchesWildcardPattern(field, p))) {
                    return {
                        verdict: 'Deny',
                        reason: `Field '${field}' on '${input.entityName}' is denied by user policy FLS narrowing.`,
                        combinedRlsWhereClause,
                        rlsFilterIds,
                        deniedFieldPatterns,
                        readOnlyFieldPatterns,
                        requireApprovalFieldPatterns,
                        nextWindowStartISO: null,
                    };
                }
                if (readOnlyFieldPatterns.some((p) => this.matchesWildcardPattern(field, p))) {
                    return {
                        verdict: 'Deny',
                        reason: `Field '${field}' on '${input.entityName}' is read-only under user policy FLS narrowing.`,
                        combinedRlsWhereClause,
                        rlsFilterIds,
                        deniedFieldPatterns,
                        readOnlyFieldPatterns,
                        requireApprovalFieldPatterns,
                        nextWindowStartISO: null,
                    };
                }
                if (
                    finalVerdict === 'Allow' &&
                    requireApprovalFieldPatterns.some((p) => this.matchesWildcardPattern(field, p))
                ) {
                    finalVerdict = 'RequireApproval';
                    finalReason = `Modifying field '${field}' on '${input.entityName}' requires user approval under FLS narrowing.`;
                }
            }
        }

        return {
            verdict: finalVerdict,
            reason: finalReason,
            combinedRlsWhereClause,
            rlsFilterIds,
            deniedFieldPatterns,
            readOnlyFieldPatterns,
            requireApprovalFieldPatterns,
            nextWindowStartISO,
        };
    }

    /**
     * Strip `deniedFields` patterns from a plain record object returned to an agent.
     */
    public MaskRecordFields<T extends Record<string, string | number | boolean | object | null | undefined>>(
        record: T,
        deniedFieldPatterns: string[]
    ): Partial<T> {
        if (deniedFieldPatterns.length === 0) {
            return { ...record };
        }
        const clone: Partial<T> = {};
        for (const [key, value] of Object.entries(record)) {
            const isDenied = deniedFieldPatterns.some((pattern) => this.matchesWildcardPattern(key, pattern));
            if (!isDenied) {
                clone[key as keyof T] = value as T[keyof T];
            }
        }
        return clone;
    }

    /**
     * Evaluate whether an agent running as `contextUser` may execute `actionName` with `params`.
     */
    public EvaluateActionExecution(input: EvaluateActionExecutionInput): ActionPolicyEvaluationResult {
        const now = input.now ?? new Date();
        const policy = input.policy;
        if (!policy) {
            return {
                verdict: 'Allow',
                reason: 'No user policy narrowing configured for this agent.',
                matchedRulePattern: null,
                nextWindowStartISO: null,
            };
        }

        if (policy.Status === 'Disabled') {
            return {
                verdict: 'Deny',
                reason: 'Agent user policy status is Disabled.',
                matchedRulePattern: null,
                nextWindowStartISO: null,
            };
        }

        const rules = this.resolveActionRules(policy);
        const params = input.params ?? {};
        let verdict: AgentPolicyVerdict = 'Allow';
        let reason = 'Permitted by user policy.';
        let matchedRulePattern: string | null = null;
        let nextWindowStartISO: string | null = null;

        // High-level approval switches on MJAIAgentUserPolicyEntity
        const isExternal =
            input.isExternalCommunication === true ||
            params['IsExternal'] === true ||
            params['isExternal'] === true;
        if (isExternal && policy.RequireApprovalForExternalComms) {
            verdict = 'RequireApproval';
            reason = `Action '${input.actionName}' targets external recipients and RequireApprovalForExternalComms is enabled.`;
        }

        const rawAmount =
            input.financialAmount ??
            (typeof params['Amount'] === 'number'
                ? params['Amount']
                : typeof params['amount'] === 'number'
                  ? params['amount']
                  : null);
        if (rawAmount != null) {
            if (policy.RequireApprovalForFinancials) {
                verdict = 'RequireApproval';
                reason = `Action '${input.actionName}' involves financial amount ${rawAmount} and RequireApprovalForFinancials is enabled.`;
            } else if (
                policy.AutoApproveAmountThreshold != null &&
                rawAmount > policy.AutoApproveAmountThreshold
            ) {
                verdict = 'RequireApproval';
                reason = `Action '${input.actionName}' amount (${rawAmount}) exceeds AutoApproveAmountThreshold (${policy.AutoApproveAmountThreshold}).`;
            }
        }

        const isDestructive =
            input.isDestructive === true ||
            this.matchesWildcardPattern(input.actionName, '*Delete*') ||
            this.matchesWildcardPattern(input.actionName, '*Cancel*');
        if (isDestructive && policy.RequireApprovalForDestructiveActions) {
            verdict = 'RequireApproval';
            reason = `Action '${input.actionName}' is destructive and RequireApprovalForDestructiveActions is enabled.`;
        }

        // Evaluate ActionPolicyRules in order
        for (const rule of rules) {
            if (!this.matchesWildcardPattern(input.actionName, rule.actionPattern)) {
                continue;
            }

            if (rule.conditionExpression && rule.conditionExpression.trim().length > 0) {
                const condResult = this.expressionEvaluator.evaluate(rule.conditionExpression, {
                    params,
                    user: {
                        ID: input.contextUser.ID,
                        Email: input.contextUser.Email,
                        Name: input.contextUser.Name,
                    },
                    nowIso: now.toISOString(),
                });
                if (!condResult.success || !condResult.value) {
                    continue;
                }
            }

            matchedRulePattern = rule.actionPattern;

            if (rule.policy === 'Deny') {
                return {
                    verdict: 'Deny',
                    reason: `Action '${input.actionName}' denied by action policy rule '${rule.actionPattern}'.`,
                    matchedRulePattern,
                    nextWindowStartISO: null,
                };
            }

            if (rule.policy === 'RequireApproval') {
                verdict = 'RequireApproval';
                reason = `Action '${input.actionName}' requires user approval per rule '${rule.actionPattern}'.`;
            }

            if (rule.timeWindows && rule.timeWindows.length > 0) {
                const windowEval = this.evaluateTimeWindows(rule.timeWindows, now, true);
                if (!windowEval.inWindow) {
                    if (windowEval.verdict === 'Deny') {
                        return {
                            verdict: 'Deny',
                            reason: windowEval.reason,
                            matchedRulePattern,
                            nextWindowStartISO: null,
                        };
                    }
                    if (windowEval.verdict === 'DeferUntilNextWindow') {
                        verdict = 'DeferUntilNextWindow';
                        reason = windowEval.reason;
                        nextWindowStartISO = windowEval.nextWindowStartISO;
                    } else if (windowEval.verdict === 'RequireApproval' && verdict === 'Allow') {
                        verdict = 'RequireApproval';
                        reason = windowEval.reason;
                    }
                }
            }
        }

        return {
            verdict,
            reason,
            matchedRulePattern,
            nextWindowStartISO,
        };
    }

    /**
     * Build a concise Markdown governance summary to inject into the agent's system prompt
     * so the agent knows the user's personalized name, onboarding state, coordination posture,
     * channel modes, and active narrowing rules.
     */
    public BuildPromptPolicyContextBlock(policy: MJAIAgentUserPolicyEntity | null, user: UserInfo): string {
        if (!policy) {
            return [
                '### User Governance & Personalization Policy',
                `- **User**: ${user.Name} (${user.Email})`,
                '- **Onboarding Status**: `NotStarted` (No `MJ: AI Agent User Policies` record exists yet for this user — initiate onboarding to capture goals, coordination posture, channel permissions, and approval boundaries.)',
                '- **Permission Ceiling**: Running strictly within the user\'s MJ Entity CRUD, Role RLS, and Role FLS permissions.',
            ].join('\n');
        }

        const lines: string[] = [
            '### User Governance & Personalization Policy',
            `- **User**: ${user.Name} (${user.Email})`,
            `- **Agent Display Name**: ${policy.DisplayNameOverride || 'Chief of Staff'}`,
            `- **Policy Status**: \`${policy.Status ?? DEFAULT_AGENT_USER_POLICY_POSTURE.Status}\` | **Onboarding Status**: \`${policy.OnboardingStatus ?? DEFAULT_AGENT_USER_POLICY_POSTURE.OnboardingStatus}\``,
            `- **Coordination Mode**: \`${policy.CoordinationMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CoordinationMode}\` | **Inter-Agent Coordination**: \`${(policy.AllowInterAgentCoordination ?? DEFAULT_AGENT_USER_POLICY_POSTURE.AllowInterAgentCoordination) ? 'Allowed' : 'Disabled'}\``,
            `- **Default Data Access Mode**: \`${policy.DefaultDataAccessMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.DefaultDataAccessMode}\` (always bounded by user's MJ role permissions)`,
            `- **Channels**: Email=\`${policy.EmailChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.EmailChannelMode}\`, Calendar=\`${policy.CalendarChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.CalendarChannelMode}\`, Phone=\`${policy.PhoneChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.PhoneChannelMode}\`, Messaging=\`${policy.MessagingChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.MessagingChannelMode}\``,
            `- **Approval Guardrails**: ExternalComms=\`${policy.RequireApprovalForExternalComms ? 'RequireApproval' : 'Auto'}\`, Financials=\`${policy.RequireApprovalForFinancials ? 'RequireApproval' : 'Auto'}\` (Threshold: ${policy.AutoApproveAmountThreshold != null ? `$${policy.AutoApproveAmountThreshold}` : 'None'}), Destructive=\`${policy.RequireApprovalForDestructiveActions ? 'RequireApproval' : 'Auto'}\``,
        ];

        if (policy.InstructionsOverride && policy.InstructionsOverride.trim().length > 0) {
            lines.push(`- **User Standing Instructions**: ${policy.InstructionsOverride.trim()}`);
        }

        return lines.join('\n');
    }

    /**
     * Evaluate whether a user's `CalendarChannelMode` permits reading or mutating calendar events.
     */
    public EvaluateCalendarOperation(
        policy: MJAIAgentUserPolicyEntity | null,
        isMutation: boolean
    ): { verdict: AgentPolicyVerdict; mode: MJAIAgentUserPolicyEntity['CalendarChannelMode']; reason: string } {
        const mode: MJAIAgentUserPolicyEntity['CalendarChannelMode'] =
            policy?.CalendarChannelMode ?? 'ProposeWithApproval';
        if (policy?.Status === 'Disabled' || mode === 'Disabled') {
            return {
                verdict: 'Deny',
                mode: 'Disabled',
                reason: 'Calendar channel access is Disabled in the user\'s AI Agent User Policy.',
            };
        }
        if (!isMutation) {
            return {
                verdict: 'Allow',
                mode,
                reason: `Calendar read permitted under CalendarChannelMode='${mode}'.`,
            };
        }
        if (mode === 'ReadOnly') {
            return {
                verdict: 'Deny',
                mode,
                reason: 'Calendar mutations are blocked because CalendarChannelMode is ReadOnly.',
            };
        }
        if (mode === 'ProposeWithApproval') {
            return {
                verdict: 'RequireApproval',
                mode,
                reason: 'Calendar mutations require user approval because CalendarChannelMode is ProposeWithApproval.',
            };
        }
        return {
            verdict: 'Allow',
            mode,
            reason: 'Calendar mutation permitted autonomously under CalendarChannelMode=Autonomous.',
        };
    }

    /**
     * Evaluate whether a user's `EmailChannelMode` permits reading, drafting, or sending email.
     */
    public EvaluateEmailOperation(
        policy: MJAIAgentUserPolicyEntity | null,
        operation: 'Read' | 'Draft' | 'Send'
    ): { verdict: AgentPolicyVerdict; mode: MJAIAgentUserPolicyEntity['EmailChannelMode']; reason: string } {
        const mode: MJAIAgentUserPolicyEntity['EmailChannelMode'] = policy?.EmailChannelMode ?? 'DraftOnly';
        if (policy?.Status === 'Disabled' || mode === 'Disabled') {
            return {
                verdict: 'Deny',
                mode: 'Disabled',
                reason: 'Email channel access is Disabled in the user\'s AI Agent User Policy.',
            };
        }
        if (operation === 'Read') {
            return {
                verdict: 'Allow',
                mode,
                reason: `Email read permitted under EmailChannelMode='${mode}'.`,
            };
        }
        if (mode === 'ReadOnly') {
            return {
                verdict: 'Deny',
                mode,
                reason: `Email ${operation.toLowerCase()} is blocked because EmailChannelMode is ReadOnly.`,
            };
        }
        if (operation === 'Draft') {
            return {
                verdict: 'Allow',
                mode,
                reason: `Email draft creation permitted under EmailChannelMode='${mode}'.`,
            };
        }
        if (mode === 'DraftOnly') {
            return {
                verdict: 'Deny',
                mode,
                reason: 'Direct email sending is blocked because EmailChannelMode is DraftOnly (save a draft instead).',
            };
        }
        if (policy?.RequireApprovalForExternalComms) {
            return {
                verdict: 'RequireApproval',
                mode,
                reason: `Sending email (${mode}) requires user approval because RequireApprovalForExternalComms is enabled.`,
            };
        }
        return {
            verdict: 'Allow',
            mode,
            reason: `Sending email permitted under EmailChannelMode=${mode}.`,
        };
    }

    /**
     * Evaluate whether a user's `PhoneChannelMode` permits inbound or outbound telephony operations.
     * Defaults to `'Disabled'` (`Off`) when unset until explicitly requested by the user.
     */
    public EvaluatePhoneOperation(
        policy: MJAIAgentUserPolicyEntity | null,
        direction: 'Inbound' | 'Outbound'
    ): { verdict: AgentPolicyVerdict; mode: MJAIAgentUserPolicyEntity['PhoneChannelMode']; reason: string } {
        const mode: MJAIAgentUserPolicyEntity['PhoneChannelMode'] =
            policy?.PhoneChannelMode ?? DEFAULT_AGENT_USER_POLICY_POSTURE.PhoneChannelMode;
        if (policy?.Status === 'Disabled' || mode === 'Disabled') {
            return {
                verdict: 'Deny',
                mode: 'Disabled',
                reason: 'Phone channel access is Disabled (Off) in the user\'s AI Agent User Policy.',
            };
        }
        if (direction === 'Inbound') {
            return {
                verdict: 'Allow',
                mode,
                reason: `Inbound phone handling permitted under PhoneChannelMode='${mode}'.`,
            };
        }
        if (mode === 'InboundOnly') {
            return {
                verdict: 'Deny',
                mode,
                reason: 'Outbound phone calls are blocked because PhoneChannelMode is InboundOnly.',
            };
        }
        if (mode === 'OutboundWithApproval' || policy?.RequireApprovalForExternalComms) {
            return {
                verdict: 'RequireApproval',
                mode,
                reason: `Outbound phone calls require user approval under PhoneChannelMode='${mode}'.`,
            };
        }
        return {
            verdict: 'Allow',
            mode,
            reason: 'Outbound phone call permitted under PhoneChannelMode=OutboundAutonomous.',
        };
    }

    // ========================================================================
    // Internal Helpers
    // ========================================================================

    private resolveUserEntityPermissionCeiling(
        entityName: string,
        user: UserInfo,
        provider?: IMetadataProvider
    ): UserEntityPermissionCeiling {
        try {
            const md = provider ?? new Metadata();
            const entity = md.EntityByName(entityName);
            if (!entity) {
                return { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
            }
            const perms = entity.GetUserPermisions(user);
            return {
                canRead: perms.CanRead,
                canCreate: perms.CanCreate,
                canUpdate: perms.CanUpdate,
                canDelete: perms.CanDelete,
            };
        } catch {
            // In unit test environments where Metadata provider is not initialized, default to open ceiling
            // unless explicit `userPermissionCeiling` is supplied.
            return { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
        }
    }

    private isAllowedByUserCeiling(
        operation: AgentEntityCrudOperation,
        ceiling: UserEntityPermissionCeiling
    ): boolean {
        switch (operation) {
            case 'Read':
                return ceiling.canRead;
            case 'Create':
                return ceiling.canCreate;
            case 'Update':
                return ceiling.canUpdate;
            case 'Delete':
                return ceiling.canDelete;
            default:
                return false;
        }
    }

    private resolveEntityRules(
        policy: MJAIAgentUserPolicyEntity
    ): MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[] {
        if (policy.EntityAccessRulesObject) {
            return policy.EntityAccessRulesObject;
        }
        if (policy.EntityAccessRules && policy.EntityAccessRules.trim().length > 0) {
            return SafeJSONParse<MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[]>(policy.EntityAccessRules) ?? [];
        }
        return [];
    }

    private resolveActionRules(
        policy: MJAIAgentUserPolicyEntity
    ): MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[] {
        if (policy.ActionPolicyRulesObject) {
            return policy.ActionPolicyRulesObject;
        }
        if (policy.ActionPolicyRules && policy.ActionPolicyRules.trim().length > 0) {
            return SafeJSONParse<MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[]>(policy.ActionPolicyRules) ?? [];
        }
        return [];
    }

    /** Case-insensitive wildcard matcher supporting `*` anywhere in `pattern`. */
    private matchesWildcardPattern(candidate: string, pattern: string): boolean {
        const trimmedPattern = pattern.trim();
        if (trimmedPattern === '*') {
            return true;
        }
        const escaped = trimmedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        const regex = new RegExp(`^${escaped}$`, 'i');
        return regex.test(candidate.trim());
    }

    private detectEntityRuleWidening(
        baselineRules: MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[],
        proposedRules: MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[],
        baselineDefaultMode: MJAIAgentUserPolicyEntity['DefaultDataAccessMode'],
        violations: string[]
    ): void {
        const accessRank: Record<MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule['access'], number> = {
            Deny: 0,
            ReadOnly: 1,
            RequireApprovalOnWrite: 2,
            ReadWrite: 3,
        };
        const normalizePattern = (p: string): string => p.trim().toLowerCase();

        for (const baseRule of baselineRules) {
            const key = normalizePattern(baseRule.entityPattern);
            const match = proposedRules.find((r) => normalizePattern(r.entityPattern) === key);
            if (!match) {
                violations.push(
                    `Cannot remove existing EntityAccessRule for pattern '${baseRule.entityPattern}'.`
                );
                continue;
            }
            if (accessRank[match.access] > accessRank[baseRule.access]) {
                violations.push(
                    `Cannot widen EntityAccessRule '${baseRule.entityPattern}' from '${baseRule.access}' to '${match.access}'.`
                );
            }
            if (
                baseRule.rlsNarrowing?.rowLevelSecurityFilterId &&
                match.rlsNarrowing?.rowLevelSecurityFilterId !== baseRule.rlsNarrowing.rowLevelSecurityFilterId
            ) {
                violations.push(
                    `Cannot drop or replace rowLevelSecurityFilterId on EntityAccessRule '${baseRule.entityPattern}'.`
                );
            }
            if (
                baseRule.rlsNarrowing?.whereClause &&
                (match.rlsNarrowing?.whereClause ?? '').trim() !== baseRule.rlsNarrowing.whereClause.trim()
            ) {
                violations.push(
                    `Cannot drop or alter RLS whereClause on EntityAccessRule '${baseRule.entityPattern}'.`
                );
            }
            if (
                baseRule.rlsNarrowing?.recordConditionExpression &&
                (match.rlsNarrowing?.recordConditionExpression ?? '').trim() !==
                    baseRule.rlsNarrowing.recordConditionExpression.trim()
            ) {
                violations.push(
                    `Cannot drop or alter RLS recordConditionExpression on EntityAccessRule '${baseRule.entityPattern}'.`
                );
            }

            const nextDenied = new Set((match.flsNarrowing?.deniedFields ?? []).map(normalizePattern));
            const nextReadOnly = new Set((match.flsNarrowing?.readOnlyFields ?? []).map(normalizePattern));
            const nextReqApproval = new Set(
                (match.flsNarrowing?.requireApprovalFields ?? []).map(normalizePattern)
            );

            for (const f of baseRule.flsNarrowing?.deniedFields ?? []) {
                if (!nextDenied.has(normalizePattern(f))) {
                    violations.push(
                        `Cannot remove denied field '${f}' from EntityAccessRule '${baseRule.entityPattern}'.`
                    );
                }
            }
            for (const f of baseRule.flsNarrowing?.readOnlyFields ?? []) {
                const k = normalizePattern(f);
                if (!nextReadOnly.has(k) && !nextDenied.has(k)) {
                    violations.push(
                        `Cannot remove read-only field '${f}' from EntityAccessRule '${baseRule.entityPattern}'.`
                    );
                }
            }
            for (const f of baseRule.flsNarrowing?.requireApprovalFields ?? []) {
                const k = normalizePattern(f);
                if (!nextReqApproval.has(k) && !nextReadOnly.has(k) && !nextDenied.has(k)) {
                    violations.push(
                        `Cannot remove require-approval field '${f}' from EntityAccessRule '${baseRule.entityPattern}'.`
                    );
                }
            }

            if (
                baseRule.timeWindows &&
                baseRule.timeWindows.length > 0 &&
                JSON.stringify(match.timeWindows ?? []) !== JSON.stringify(baseRule.timeWindows)
            ) {
                violations.push(
                    `Cannot drop or alter timeWindows on EntityAccessRule '${baseRule.entityPattern}'.`
                );
            }
        }

        const baselineKeys = new Set(baselineRules.map((r) => normalizePattern(r.entityPattern)));
        for (const propRule of proposedRules) {
            if (baselineKeys.has(normalizePattern(propRule.entityPattern))) {
                continue;
            }
            if (
                (baselineDefaultMode === 'AllowListOnly' || baselineDefaultMode === 'ReadOnly') &&
                propRule.access !== 'Deny'
            ) {
                violations.push(
                    `Cannot add non-Deny EntityAccessRule '${propRule.entityPattern}' while DefaultDataAccessMode is ${baselineDefaultMode}.`
                );
                continue;
            }
            for (const baseRule of baselineRules) {
                if (
                    (this.matchesWildcardPattern(propRule.entityPattern, baseRule.entityPattern) ||
                        this.matchesWildcardPattern(baseRule.entityPattern, propRule.entityPattern)) &&
                    accessRank[propRule.access] > accessRank[baseRule.access]
                ) {
                    violations.push(
                        `Cannot add EntityAccessRule '${propRule.entityPattern}' with access '${propRule.access}' broader than existing rule '${baseRule.entityPattern}' ('${baseRule.access}').`
                    );
                    break;
                }
            }
        }
    }

    private detectActionRuleWidening(
        baselineRules: MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[],
        proposedRules: MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[],
        violations: string[]
    ): void {
        const policyRank: Record<MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule['policy'], number> = {
            Deny: 0,
            RequireApproval: 1,
            Allow: 2,
        };
        const ruleKey = (r: MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule): string =>
            `${r.actionPattern.trim().toLowerCase()}::${(r.conditionExpression ?? '').trim()}`;

        for (const baseRule of baselineRules) {
            const key = ruleKey(baseRule);
            const match = proposedRules.find((r) => ruleKey(r) === key);
            if (!match) {
                violations.push(
                    `Cannot remove existing ActionPolicyRule for pattern '${baseRule.actionPattern}'.`
                );
                continue;
            }
            if (policyRank[match.policy] > policyRank[baseRule.policy]) {
                violations.push(
                    `Cannot widen ActionPolicyRule '${baseRule.actionPattern}' from '${baseRule.policy}' to '${match.policy}'.`
                );
            }
            if (
                baseRule.timeWindows &&
                baseRule.timeWindows.length > 0 &&
                JSON.stringify(match.timeWindows ?? []) !== JSON.stringify(baseRule.timeWindows)
            ) {
                violations.push(
                    `Cannot drop or alter timeWindows on ActionPolicyRule '${baseRule.actionPattern}'.`
                );
            }
        }

        const baselineKeys = new Set(baselineRules.map(ruleKey));
        for (const propRule of proposedRules) {
            if (!baselineKeys.has(ruleKey(propRule)) && propRule.policy === 'Allow') {
                violations.push(
                    `Cannot add explicit Allow ActionPolicyRule '${propRule.actionPattern}' during self-modification.`
                );
            }
        }
    }

    /**
     * Validate a SQL `whereClause` via `SQLExpressionValidator` and interpolate safe
     * `{{UserID}}` and `{{UserEmail}}` tokens.
     */
    private validateAndInterpolateWhereClause(
        rawWhereClause: string,
        user: UserInfo
    ): { valid: boolean; sql: string | null; error?: string } {
        const safeUserId = EscapeSQLString(user.ID);
        const safeEmail = EscapeSQLString(user.Email);
        const interpolated = rawWhereClause
            .replace(/\{\{\s*UserID\s*\}\}/gi, () => `'${safeUserId}'`)
            .replace(/\{\{\s*UserEmail\s*\}\}/gi, () => `'${safeEmail}'`);

        const validation = SQLExpressionValidator.Instance.validate(interpolated, {
            context: 'where_clause',
        });
        if (!validation.valid) {
            return {
                valid: false,
                sql: null,
                error: validation.error ?? 'Unsafe SQL expression in whereClause',
            };
        }
        return { valid: true, sql: interpolated.trim() };
    }

    /**
     * Evaluate whether `now` falls inside at least one of the configured `timeWindows`.
     */
    private evaluateTimeWindows(
        windows: AgentPolicyTimeWindow[],
        now: Date,
        isWriteOperation: boolean
    ): {
        inWindow: boolean;
        verdict: AgentPolicyVerdict;
        reason: string;
        nextWindowStartISO: string | null;
    } {
        for (const win of windows) {
            if (this.isInsideSingleTimeWindow(win, now)) {
                return {
                    inWindow: true,
                    verdict: 'Allow',
                    reason: 'Within allowed time window.',
                    nextWindowStartISO: null,
                };
            }
        }

        const primaryWindow = windows[0];
        const behavior = primaryWindow?.outsideWindowBehavior ?? 'RequireApproval';
        const nextWindowStartISO = this.computeNextWindowStartISO(primaryWindow, now);

        if (behavior === 'ReadOnly') {
            if (!isWriteOperation) {
                return {
                    inWindow: true,
                    verdict: 'Allow',
                    reason: 'Read permitted outside write time window.',
                    nextWindowStartISO: null,
                };
            }
            return {
                inWindow: false,
                verdict: 'Deny',
                reason: 'Write operation blocked outside allowed time window (outsideWindowBehavior=ReadOnly).',
                nextWindowStartISO,
            };
        }

        if (behavior === 'Deny') {
            return {
                inWindow: false,
                verdict: 'Deny',
                reason: 'Operation denied outside allowed time window.',
                nextWindowStartISO,
            };
        }

        if (behavior === 'DeferUntilNextWindow') {
            return {
                inWindow: false,
                verdict: 'DeferUntilNextWindow',
                reason: `Operation deferred until next allowed time window (${nextWindowStartISO ?? 'upcoming'}).`,
                nextWindowStartISO,
            };
        }

        return {
            inWindow: false,
            verdict: 'RequireApproval',
            reason: 'Operation invoked outside allowed time window — user approval required.',
            nextWindowStartISO,
        };
    }

    private isInsideSingleTimeWindow(win: AgentPolicyTimeWindow, now: Date): boolean {
        if (win.validFromISO && now.getTime() < new Date(win.validFromISO).getTime()) {
            return false;
        }
        if (win.validUntilISO && now.getTime() > new Date(win.validUntilISO).getTime()) {
            return false;
        }

        const tz = win.timezone?.trim() || 'UTC';
        const localParts = this.getLocalTimeParts(now, tz);

        if (win.daysOfWeek && win.daysOfWeek.length > 0) {
            if (!win.daysOfWeek.includes(localParts.dayOfWeek)) {
                return false;
            }
        }

        const currentMinutes = localParts.hour * 60 + localParts.minute;
        const startMinutes = win.startTime ? this.parseHHMM(win.startTime) : 0;
        const endMinutes = win.endTime ? this.parseHHMM(win.endTime) : 24 * 60;

        if (startMinutes <= endMinutes) {
            return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        }
        // Overnight window (e.g. 22:00 to 06:00)
        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    private getLocalTimeParts(
        date: Date,
        timeZone: string
    ): { dayOfWeek: 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'; hour: number; minute: number } {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone,
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });
            const parts = formatter.formatToParts(date);
            const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
            const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
            const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '0';
            const matchedDay = DAY_NAMES.find((d) => d.toLowerCase() === weekdayStr.substring(0, 3).toLowerCase()) ?? 'Mon';
            const rawHour = parseInt(hourStr, 10);
            return {
                dayOfWeek: matchedDay,
                hour: rawHour === 24 ? 0 : rawHour,
                minute: parseInt(minuteStr, 10),
            };
        } catch {
            return {
                dayOfWeek: DAY_NAMES[date.getUTCDay()],
                hour: date.getUTCHours(),
                minute: date.getUTCMinutes(),
            };
        }
    }

    private parseHHMM(hhmm: string): number {
        const [h, m] = hhmm.split(':').map((part) => parseInt(part, 10));
        return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    }

    /** Compute the next timestamp (up to 8 days ahead) when `win` opens. */
    private computeNextWindowStartISO(win: AgentPolicyTimeWindow | undefined, now: Date): string | null {
        if (!win) {
            return null;
        }
        const probe = new Date(now.getTime());
        probe.setUTCSeconds(0, 0);
        // Step in 15-minute increments up to 8 days to find the next window opening
        const maxSteps = 8 * 24 * 4;
        for (let i = 1; i <= maxSteps; i++) {
            const candidate = new Date(probe.getTime() + i * 15 * 60_000);
            if (this.isInsideSingleTimeWindow(win, candidate)) {
                return candidate.toISOString();
            }
        }
        return null;
    }
}
