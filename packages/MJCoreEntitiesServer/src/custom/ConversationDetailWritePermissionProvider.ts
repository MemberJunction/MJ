import {
    IMetadataProvider,
    LogError,
    RunView,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import type { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { BaseSingleton, EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';

/**
 * Write operation evaluated by {@link ConversationDetailWritePermissionProvider}.
 */
export type ConversationDetailWriteOperation = 'create' | 'update' | 'delete';

/**
 * Preloaded conversation metadata passed to write permission providers so rule-based
 * host authorizations can decide in memory without redundant per-write database queries.
 */
export interface ConversationSummaryForWritePermission {
    ID: string;
    UserID: string | null;
    TypeID: string | null;
    ProjectID: string | null;
    LinkedEntityID: string | null;
    LinkedRecordID: string | null;
    AnchorType: MJConversationEntity['AnchorType'];
    ExternalID: string | null;
    AdditionalData: string | null;
}

/**
 * Rich, server-verified context handed to {@link ConversationDetailWritePermissionProvider.EvaluateWritePermission}.
 */
export interface ConversationDetailWritePermissionContext {
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
    Operation: ConversationDetailWriteOperation;
    ConversationID: string;
    Conversation: ConversationSummaryForWritePermission | null;
    ConversationDetail: MJConversationDetailEntity;
    IsServerAuthoredReply: boolean;
}

/**
 * Decision returned by a {@link ConversationDetailWritePermissionProvider}:
 * - `'Allow'`: Authorizes the conversation write by host rule without per-member `MJ: Resource Permissions` fan-out rows.
 * - `'Deny'`: Refuses the conversation write immediately with `Reason`.
 * - `'Abstain'`: Defers to the next registered provider or MemberJunction's built-in `UserMayWriteConversation` rules.
 */
export type ConversationDetailWritePermissionVerdict =
    | { Decision: 'Allow'; IsOwnerOverride?: boolean; Reason?: string }
    | { Decision: 'Deny'; Reason: string }
    | { Decision: 'Abstain' };

/**
 * Pluggable server-side authorization seam for `MJ: Conversation Details` writes (`create`, `update`, `delete`).
 *
 * Host applications can subclass and register via `@RegisterClass(ConversationDetailWritePermissionProvider, 'MyKey')`
 * or via {@link ConversationDetailWritePermissionRegistry.Instance.Register} to authorize shared rooms,
 * community channels, or scoped team conversations by rule without creating per-member `ResourcePermission` rows.
 */
export abstract class ConversationDetailWritePermissionProvider {
    /** Evaluation priority (higher runs earlier). Defaults to `0`. */
    public get Priority(): number {
        return 0;
    }

    /** Evaluates whether `context.ContextUser` may perform `context.Operation` on `context.ConversationDetail`. */
    public abstract EvaluateWritePermission(
        context: ConversationDetailWritePermissionContext
    ): Promise<ConversationDetailWritePermissionVerdict> | ConversationDetailWritePermissionVerdict;
}

interface RegisteredProviderEntry {
    Key: string;
    Provider: ConversationDetailWritePermissionProvider;
    OrderPriority: number;
}

/**
 * Singleton registry coordinating both explicitly registered {@link ConversationDetailWritePermissionProvider}
 * instances and `@RegisterClass(ConversationDetailWritePermissionProvider, ...)` subclasses discovered through
 * `MJGlobal.Instance.ClassFactory`.
 */
export class ConversationDetailWritePermissionRegistry extends BaseSingleton<ConversationDetailWritePermissionRegistry> {
    private readonly explicitProviders = new Map<string, RegisteredProviderEntry>();

    protected constructor() {
        super();
    }

    public static get Instance(): ConversationDetailWritePermissionRegistry {
        return super.getInstance<ConversationDetailWritePermissionRegistry>(
            'ConversationDetailWritePermissionRegistry'
        );
    }

    /** Registers (or replaces) a named provider instance. */
    public Register(
        key: string,
        provider: ConversationDetailWritePermissionProvider,
        priority?: number
    ): void {
        const normalizedKey = key.trim().toLowerCase();
        if (!normalizedKey) {
            throw new Error('ConversationDetailWritePermissionRegistry.Register requires a non-empty key.');
        }
        this.explicitProviders.set(normalizedKey, {
            Key: normalizedKey,
            Provider: provider,
            OrderPriority: priority ?? provider.Priority,
        });
    }

    /** Unregisters a previously registered provider by key. */
    public Unregister(key: string): boolean {
        return this.explicitProviders.delete(key.trim().toLowerCase());
    }

    /** Clears all explicitly registered providers (primarily for unit test isolation). */
    public Clear(): void {
        this.explicitProviders.clear();
    }

    /**
     * Returns `true` when at least one explicit or ClassFactory-registered custom provider exists.
     * Lets the default save path short-circuit in O(1) with zero overhead when no custom provider is active.
     */
    public HasRegisteredProviders(): boolean {
        if (this.explicitProviders.size > 0) {
            return true;
        }
        const classFactoryRegs = MJGlobal.Instance.ClassFactory.GetAllRegistrations(
            ConversationDetailWritePermissionProvider
        );
        return Array.isArray(classFactoryRegs) && classFactoryRegs.length > 0;
    }

    /**
     * Resolves all active providers ordered by descending priority (explicit registrations + highest-priority
     * ClassFactory winner per key).
     */
    public ResolveProviders(): ConversationDetailWritePermissionProvider[] {
        const entriesByKey = new Map<string, RegisteredProviderEntry>();

        const registrations =
            MJGlobal.Instance.ClassFactory.GetAllRegistrations(ConversationDetailWritePermissionProvider) ?? [];
        const uniqueKeys = new Set(
            registrations
                .map((r) => r.Key?.trim().toLowerCase())
                .filter((k): k is string => Boolean(k && k.length > 0))
        );

        for (const key of uniqueKeys) {
            const winner = MJGlobal.Instance.ClassFactory.GetRegistration(
                ConversationDetailWritePermissionProvider,
                key
            );
            if (!winner) {
                continue;
            }
            const ProviderCtor = winner.SubClass as new () => ConversationDetailWritePermissionProvider;
            const instance = new ProviderCtor();
            entriesByKey.set(key, {
                Key: key,
                Provider: instance,
                OrderPriority: winner.Priority || instance.Priority,
            });
        }

        // Handle unkeyed ClassFactory registrations if any were added with key=null
        for (const reg of registrations) {
            if (reg.Key != null && reg.Key.trim().length > 0) {
                continue;
            }
            const ProviderCtor = reg.SubClass as new () => ConversationDetailWritePermissionProvider;
            const instance = new ProviderCtor();
            const syntheticKey = `__unkeyed__${reg.SubClass?.name ?? 'provider'}_${reg.Priority}`;
            entriesByKey.set(syntheticKey, {
                Key: syntheticKey,
                Provider: instance,
                OrderPriority: reg.Priority || instance.Priority,
            });
        }

        // Explicit registrations override ClassFactory registrations for the same key.
        for (const [key, entry] of this.explicitProviders.entries()) {
            entriesByKey.set(key, entry);
        }

        return Array.from(entriesByKey.values())
            .sort((a, b) => b.OrderPriority - a.OrderPriority)
            .map((entry) => entry.Provider);
    }

    /**
     * Evaluates registered providers in priority order.
     * - First `'Deny'` or `'Allow'` short-circuits and returns immediately.
     * - Errors thrown by a provider fail closed (`Decision: 'Deny'`).
     * - If all providers abstain (or none are registered), returns `{ Decision: 'Abstain' }`.
     */
    public async Evaluate(
        context: ConversationDetailWritePermissionContext
    ): Promise<ConversationDetailWritePermissionVerdict> {
        const providers = this.ResolveProviders();
        if (providers.length === 0) {
            return { Decision: 'Abstain' };
        }

        for (const provider of providers) {
            try {
                const verdict = await provider.EvaluateWritePermission(context);
                if (verdict.Decision === 'Allow' || verdict.Decision === 'Deny') {
                    return verdict;
                }
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                LogError(
                    `ConversationDetailWritePermissionRegistry.Evaluate failed on conversation ${context.ConversationID} for user ${context.ContextUser.ID}: ${msg}`
                );
                return {
                    Decision: 'Deny',
                    Reason: 'Unable to verify conversation write permissions.',
                };
            }
        }

        return { Decision: 'Abstain' };
    }
}

/**
 * Resolves {@link ConversationSummaryForWritePermission} from an already-preloaded summary when available,
 * or performs a single narrow `ResultType: 'simple'` lookup as the system user.
 */
export async function ResolveConversationSummaryForWritePermission(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    conversationId: string,
    preloaded?: ConversationSummaryForWritePermission | null
): Promise<ConversationSummaryForWritePermission | null> {
    if (preloaded && UUIDsEqual(preloaded.ID, conversationId)) {
        return preloaded;
    }
    if (!provider || provider.ProviderType !== 'Database' || !conversationId) {
        return null;
    }
    try {
        const systemUser = (await WellKnownUserSource.Instance.GetSystemUser(provider)) ?? contextUser;
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<ConversationSummaryForWritePermission>(
            {
                EntityName: 'MJ: Conversations',
                ExtraFilter: `ID='${EscapeSQLString(conversationId)}'`,
                Fields: [
                    'ID',
                    'UserID',
                    'TypeID',
                    'ProjectID',
                    'LinkedEntityID',
                    'LinkedRecordID',
                    'AnchorType',
                    'ExternalID',
                    'AdditionalData',
                ],
                MaxRows: 1,
                SkipTotalRowCount: true,
                ResultType: 'simple',
            },
            systemUser
        );
        if (result.Success && Array.isArray(result.Results) && result.Results.length > 0) {
            return result.Results[0];
        }
        return null;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        LogError(
            `ResolveConversationSummaryForWritePermission failed for conversation ${conversationId}: ${msg}`
        );
        return null;
    }
}
